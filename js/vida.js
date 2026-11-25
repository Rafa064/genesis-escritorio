// Vida no mapa: rotina de quem está livre (café, sofá, janela, conversa), cenas de delegação
// com balões, ferramentas como ITENS animados que voam até a mesa de quem usa, luz do dia pelo
// relógio real (janelas com céu, luminárias à noite). Tudo chamado pelo mundo.js.
import { T, MW, MH, tileDe } from './mapa.js';
import { tituloDe } from './config.js';
import { ARANDELAS } from './ambientes.js';

const URLP = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const DEMO = URLP.has('demo');
const HORA = parseFloat(URLP.get('hora'));
export function horaAgora() { if (Number.isFinite(HORA)) return HORA; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
const diaHash = () => { const d = new Date(); return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 2654435761 >>> 0; };

export function iniciar(w) {
  w.baloes = []; w.idBalao = 0; w.reservas = new Map();
  w.chuva = URLP.has('chuva') || (!URLP.has('semchuva') && diaHash() % 3 === 0);
  w.itens = new Map(Object.keys(ITENS).map((k, i) => { const c = w.planta.casasItens[i]; return [k, { k, x: c.x, y: c.y, casa: c, quem: null, rastro: [] }]; }));
  w.usosReais = new Map(); w.usosDemo = new Map();
  w.relogioDemo = { item: 2, cena: 3, papo: 6 };
  if (DEMO && typeof window !== 'undefined') window.mundoDemo = w; // só no ?demo: facilita testar no console
}

// ======================= balões =======================
export function falar(w, b, texto, seg = 3) {
  if (!b || !texto) return;
  // um balão por vez no mapa inteiro: a fala nova apaga a anterior (o mapa não vira um mural)
  w.baloes = [];
  w.baloes.push({ id: ++w.idBalao, b, texto: texto.length > 60 ? texto.slice(0, 58) + '…' : texto, ate: w.t + seg });
}
const elBaloes = new Map();
export function desenharBaloes(w, g, cam) {
  const camada = typeof document !== 'undefined' && document.getElementById('camada'); if (!camada) return;
  const z = (g.canvas.clientWidth || g.canvas.width) / g.canvas.width || 1;
  w.baloes = w.baloes.filter((x) => x.ate > w.t);
  const vivos = new Set();
  for (const bl of w.baloes) {
    vivos.add(bl.id);
    let el = elBaloes.get(bl.id);
    if (!el) { el = document.createElement('div'); el.className = 'balao-vida'; el.textContent = bl.texto; camada.appendChild(el); elBaloes.set(bl.id, el); }
    const topo = bl.b.topo ?? bl.b.y - 31;
    el.style.transform = `translate(calc(${Math.round((bl.b.x - cam.x) * z)}px - 50%), calc(${Math.round((topo - 4 - cam.y) * z)}px - 100%))`;
    // se a pessoa abriu o balão de um boneco (seleção/mouse), a conversa de corredor some até ele fechar
    el.classList.toggle('some', bl.ate - w.t < 0.3 || !!w.calado);
  }
  for (const [id, el] of elBaloes) if (!vivos.has(id)) { el.remove(); elBaloes.delete(id); }
  // cartão do item tocado
  if (w.cartao) {
    const it = w.itens.get(w.cartao.k);
    if (!it || w.cartao.ate < w.t) { w.cartao.el.remove(); w.cartao = null; }
    else w.cartao.el.style.transform = `translate(calc(${Math.round((it.x - cam.x) * z)}px - 50%), calc(${Math.round((it.y - 10 - cam.y) * z)}px - 100%))`;
  }
}

// ======================= vizinhos e caminhos =======================
function vizinhoLivre(w, [tx, ty], de) {
  let melhor = null, dm = Infinity;
  for (let r = 1; r <= 2 && !melhor; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || w.planta.solido[y][x]) continue;
    const d = Math.abs(x - de[0]) + Math.abs(y - de[1]) + (Math.abs(dx) + Math.abs(dy) > 1 ? 3 : 0);
    if (d < dm) { dm = d; melhor = [x, y]; }
  }
  return melhor;
}
const virarPara = (b, o) => { const dx = o.x - b.x, dy = o.y - b.y; b.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esq' : 'dir') : (dy < 0 ? 'cima' : 'baixo'); };

// ======================= rotina de quem está livre =======================
const PESOS = [['ficar', 22], ['cafe', 28], ['sofa', 24], ['conversa', 18], ['janela', 8]];
const PAPOS = [['Bora um café? ☕', 'Bora! ☕'], ['Viu o build novo?', 'Rodou liso 🚀'], ['Esse bug de novo… 🐛', 'Clássico 😅'], ['Qual a meta hoje?', 'Fechar o marco 🏁'], ['Gostei do Short 🎬', 'Ficou top!'], ['Alguém trouxe bolo? 🍰', 'Tomara!'], ['Tá rendendo hoje?', 'Muito! 💪'], ['Que chuva, hein 🌧️', 'Ótimo pra codar']];

export function liberar(w, b) {
  const r = b.rot; if (!r) return;
  if (r.ponto) w.reservas.delete(r.ponto.id);
  if (b.modo === 'sentado' && r.ponto?.tipo === 'sofa') { b.x = r.ponto.aprox[0] * T + 8; b.y = r.ponto.aprox[1] * T + 12; }
  if (b.modo === 'sentado' || b.modo === 'parado') b.modo = 'parado';
  b.rot = null; b.acao = null; b.ordemY = null;
}

// Devolve true quando a rotina está no comando do boneco neste quadro.
export function rotina(w, b, dt) {
  const l = b.lugar, r = b.rot;
  if (r) {
    if (r.fase === 'indo') {
      if (b.caminho) return true;
      const [tx, ty] = tileDe(b.x, b.y);
      if (tx !== r.ponto.aprox[0] || ty !== r.ponto.aprox[1]) { liberar(w, b); b.noLugar = null; return false; }
      const p = r.ponto.pose;
      b.x = p.x; b.y = p.y; b.dir = p.dir || b.dir; b.modo = p.modo || 'parado'; b.ordemY = p.ordem ?? null;
      b.acao = r.ponto.tipo; r.fase = 'la'; r.t = 9 + b.sorte() * 14;
      if (r.par) { virarPara(b, r.par); virarPara(r.par, b); falar(w, b, r.papo[0], 3); r.resp = 1.6; }
      return true;
    }
    if (r.fase === 'la') {
      r.t -= dt;
      if (r.resp != null) { r.resp -= dt; if (r.resp <= 0) { falar(w, r.par, r.papo[1], 2.6); r.resp = null; } }
      if (r.par && (r.par.noLugar !== r.par.lugar?.id || r.par.caminho)) r.t = Math.min(r.t, 0.5);
      if (r.t <= 0) { liberar(w, b); b.noLugar = null; b.espera = 0.2; return false; }
      return true;
    }
  }
  if (b.noLugar !== l.id || b.modo !== 'parado' || b.caminho) return false;
  b.esperaRot = (b.esperaRot ?? 2 + b.sorte() * 12) - dt;
  if (b.esperaRot > 0) return false;
  b.esperaRot = 4 + b.sorte() * 9;
  let s = b.sorte() * 100, tipo = 'ficar';
  for (const [t, p] of PESOS) { if (s < p) { tipo = t; break; } s -= p; }
  // ficar no lugar: às vezes com a caneca na mão (bebendo café de pé)
  if (tipo === 'ficar') { b.acao = b.sorte() < 0.45 ? 'cafe' : null; return false; }
  b.acao = null;
  const de = tileDe(b.x, b.y);
  if (tipo === 'conversa') {
    const papos = PAPOS.filter((p) => w.chuva || !/chuva/.test(p[0]));
    const par = [...w.agentes.values()].filter((o) => o !== b && o.lugar?.copa && o.noLugar === o.lugar.id && !o.rot && !o.caminho && !o.cena && o.modo === 'parado')
      .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
    if (!par) return false;
    const alvo = vizinhoLivre(w, tileDe(par.x, par.y), de); if (!alvo) return false;
    const ponto = { id: 'papo|' + b.id, tipo: 'conversa', aprox: alvo, pose: { x: alvo[0] * T + 8, y: alvo[1] * T + 12 } };
    if (!w.andarPara(b, ...alvo)) return false;
    b.rot = { fase: 'indo', ponto, par, papo: papos[Math.floor(b.sorte() * papos.length)] };
    par.esperaRot = 30;
    return true;
  }
  const livres = w.planta.rotina.filter((p) => p.tipo === tipo && !w.reservas.has(p.id))
    .sort((a, c) => Math.hypot(a.aprox[0] - de[0], a.aprox[1] - de[1]) - Math.hypot(c.aprox[0] - de[0], c.aprox[1] - de[1]));
  const ponto = livres[Math.floor(b.sorte() * Math.min(3, livres.length))];
  if (!ponto || !w.andarPara(b, ...ponto.aprox)) return false;
  w.reservas.set(ponto.id, b.id);
  b.rot = { fase: 'indo', ponto };
  return true;
}

// ======================= cenas: passar trabalho de um para outro =======================
const RESPOSTA = { explorador: 'Deixa comigo! 🔍', balanceador: 'Vou fazer as contas 🧮', 'editor-de-video': 'Bora editar! 🎬', 'artista-3d': 'Já pego o pincel 🎨', critico: 'Vou ser sincero… 📋', 'revisor-godot': 'Reviso linha por linha ✔️', 'criador-de-conteudo': 'Já tô postando 📱', 'mixador-de-audio': 'Solta o som! 🎧' };
const apelido = (nome) => String(tituloDe(nome) || nome).split(' ')[0];
function pedidoCurto(e) {
  let s = String(e?.descricao || e?.texto || '').replace(/^.*?pediu:\s*/i, '').replace(/^começou$/i, '').trim();
  if (s.length > 40) s = s.slice(0, 38).replace(/\s+\S*$/, '') + '…';
  return s;
}
function frasePedido(nome, e) {
  const d = pedidoCurto(e);
  if (!d) return `${apelido(nome)}, tenho uma tarefa pra você!`;
  return /^\p{Ll}+r\b/u.test(d) ? `${apelido(nome)}, pode ${d}?` : `${apelido(nome)}, ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
}
function chefeDe(w, b) {
  const quem = b.m?.pedido?.chamou;
  const todos = [...w.agentes.values()];
  return (quem && quem !== 'Orquestrador' && todos.find((o) => o.pessoa === b.pessoa && (o.m?.nome || o.nome) === quem && o !== b))
    || todos.find((o) => o.pessoa === b.pessoa && o.lugar?.assistente);
}
export function iniciarCena(w, ator, alvo, fala1, fala2) {
  if (!ator || !alvo || ator === alvo || ator.cena) return false;
  if (ator.rot) liberar(w, ator);
  ator.cena = { alvo, fala1, fala2, fase: 'sair', t: 0, limite: w.t + 30 };
  return true;
}
// true: a cena está no comando
export function cena(w, b, dt) {
  const c = b.cena;
  const acabar = () => { b.cena = null; b.noLugar = null; b.espera = 0.2; };
  if (w.t > c.limite) { acabar(); return true; }
  if (c.fase === 'sair') {
    const a = c.alvo, rumoAoLugar = a.lugar && !a.rot && (a.noLugar === a.lugar.id || a.caminho);
    const alvoTile = rumoAoLugar ? a.lugar.tile : tileDe(a.x, a.y);
    // quem está sentado no lugar fixo (recepção) fica "dentro" da mesa: sai a partir do tile do lugar
    if (b.lugar && b.noLugar === b.lugar.id) { b.x = b.lugar.tile[0] * T + 8; b.y = b.lugar.tile[1] * T + 12; }
    const t = vizinhoLivre(w, alvoTile, tileDe(b.x, b.y));
    if (!t || !w.andarPara(b, ...t)) { acabar(); return true; }
    c.fase = 'andando';
  } else if (c.fase === 'andando') {
    if (b.caminho) return true;
    b.modo = 'parado'; virarPara(b, c.alvo); falar(w, b, c.fala1, 3.4); c.fase = 'falou'; c.t = 2.4;
  } else if (c.fase === 'falou') {
    c.t -= dt; if (c.t <= 0) { if (c.alvo.modo === 'parado') virarPara(c.alvo, b); falar(w, c.alvo, c.fala2, 2.8); c.fase = 'ouviu'; c.t = 2.4; }
  } else if (c.fase === 'ouviu') { c.t -= dt; if (c.t <= 0) acabar(); }
  return true;
}
// Chamado a cada sincronização: evento novo de pedido -> o chefe vai até a mesa; fim -> o agente volta e conta.
export function notarEventos(w, b, novo) {
  const e = b.m?.ult, k = e ? (e.eid || e.id || e.t) : null;
  if (novo) { b.ultK = k; return; }
  if (k === b.ultK) return;
  b.ultK = k;
  if (!e || Date.now() - e.t > 120e3 || b.lugar?.assistente || b.lugar?.codex) return;
  if ((e.tipo === 'pedido' || e.tipo === 'inicio') && (!b.ultCena || w.t - b.ultCena > 40)) {
    b.ultCena = w.t;
    const chefe = chefeDe(w, b);
    if (chefe) iniciarCena(w, chefe, b, frasePedido(b.m?.nome || b.nome, b.m?.pedido || e), RESPOSTA[b.m?.nome || b.nome] || 'Pode deixar! 👍');
  } else if (e.tipo === 'fim') {
    const chefe = chefeDe(w, b);
    const t = String(e.texto || '').trim();
    if (chefe) iniciarCena(w, b, chefe, t ? `Pronto! ${t.length > 40 ? t.slice(0, 38) + '…' : t}` : 'Pronto, entreguei! ✅', b.sorte() < 0.5 ? 'Valeu! 👏' : 'Show! 🎉');
  }
}

// ======================= ferramentas como itens =======================
export const ITENS = {
  pixellab: { titulo: 'PixelLab', icone: '🎨', faz: 'desenhando pixel art' },
  blender: { titulo: 'Blender', icone: '🧊', faz: 'modelando em 3D' },
  godot: { titulo: 'Godot', icone: '🤖', faz: 'rodando o jogo' },
  render: { titulo: 'Render (Remotion)', icone: '🎬', faz: 'renderizando o vídeo' },
  ffmpeg: { titulo: 'ffmpeg', icone: '✂️', faz: 'cortando e convertendo vídeo' },
  skill: { titulo: 'Skill (receita)', icone: '📘', faz: 'seguindo uma receita' },
  web: { titulo: 'Pesquisa na web', icone: '🌐', faz: 'pesquisando na internet' },
  conector: { titulo: 'Conector (MCP)', icone: '🔌', faz: 'usando um conector' },
};
const ITEM_DO_NOME = { PixelLab: 'pixellab', Blender: 'blender', Godot: 'godot', Render: 'render', ffmpeg: 'ffmpeg', Notion: 'conector', HuggingFace: 'conector' };
export const ehItem = (nome) => !!ITEM_DO_NOME[nome];
export function itemDoEvento(e) {
  const f = String(e?.ferramenta || ''), a = String(e?.alvo || '');
  if (/^mcp__pixellab/i.test(f)) return 'pixellab';
  if (/^mcp__blender/i.test(f)) return 'blender';
  if (/^mcp__/.test(f)) return 'conector';
  if (f === 'Skill') return 'skill';
  if (/^Web(Search|Fetch)$/.test(f)) return 'web';
  if (f === 'Bash') { if (/remotion/i.test(a)) return 'render'; if (/ffmpeg|ffprobe/i.test(a)) return 'ffmpeg'; if (/godot/i.test(a)) return 'godot'; }
  return null;
}
const OCUPADO = ['trab', 'alerta', 'semsinal'];
export function definirUsos(w, avatares, itens) {
  const usos = new Map();
  for (const a of avatares) {
    if (!OCUPADO.includes(a.status)) continue;
    const e = a.m?.ult, it = itemDoEvento(e);
    if (it && !usos.has(it) && Date.now() - e.t < 6 * 60e3) usos.set(it, { quem: a.id, texto: e.alvo ? String(e.alvo).split(':::')[0].trim() : '' });
  }
  for (const t of itens) {
    const it = ITEM_DO_NOME[t.nome];
    if (!it || usos.has(it) || !OCUPADO.includes(t.status)) continue;
    const quem = t.m?.pedido?.chamou || /^([\w-]+):/.exec(t.m?.ult?.texto || '')?.[1] || 'Orquestrador';
    const dono = avatares.find((a) => a.pessoa === t.pessoa && (a.m?.nome || a.nome) === quem && !a.lugar?.copa) || avatares.find((a) => a.pessoa === t.pessoa && a.lugar?.assistente);
    if (dono) usos.set(it, { quem: dono.id, texto: String(t.m?.ult?.texto || '').replace(/^[\w-]+:\s*/, '') });
  }
  w.usosReais = usos;
}
function usoDe(w, k) {
  const r = w.usosReais.get(k); if (r && w.agentes.has(r.quem)) return r;
  const d = w.usosDemo.get(k); if (d && d.ate > w.t && w.agentes.has(d.quem)) return d;
  return null;
}

export function atualizar(w, dt) {
  // itens: voam até quem usa e voltam para a estante
  for (const it of w.itens.values()) {
    const uso = usoDe(w, it.k), b = uso && w.agentes.get(uso.quem);
    it.quem = b || null; it.texto = uso?.texto || '';
    let tx = it.casa.x, ty = it.casa.y;
    if (b) { const lado = b.dir === 'esq' ? -1 : 1; tx = b.x + 12 * lado; ty = (b.topo ?? b.y - 31) + 4 + Math.sin(w.t * 3 + it.casa.x) * 1.5; }
    const dx = tx - it.x, dy = ty - it.y, d = Math.hypot(dx, dy);
    const v = Math.min(d, Math.max(30, d * 2.2) * dt);
    if (d > 0.3) { it.x += dx / d * v; it.y += dy / d * v - (d > 20 ? Math.sin(Math.min(1, d / 200) * Math.PI) * 18 * dt : 0); }
    it.voando = d > 6;
    if (it.voando && Math.random() < dt * 25) it.rastro.push({ x: it.x + Math.random() * 6 - 3, y: it.y + Math.random() * 6 - 3, v: 1 });
    for (const q of it.rastro) q.v -= dt * 1.8;
    it.rastro = it.rastro.filter((q) => q.v > 0);
  }
  if (!DEMO) return;
  // demo: vida garantida (ferramentas em uso, delegações e papos acontecendo)
  const R = w.relogioDemo; R.item -= dt; R.cena -= dt; R.papo -= dt;
  const todos = [...w.agentes.values()];
  const naMesa = todos.filter((b) => b.modo === 'sentado' && OCUPADO.includes(b.status) && !b.cena);
  if (R.item <= 0) {
    R.item = 5 + Math.random() * 4;
    const livres = Object.keys(ITENS).filter((k) => !w.usosReais.has(k) && !(w.usosDemo.get(k)?.ate > w.t));
    const k = livres[Math.floor(Math.random() * livres.length)], b = naMesa[Math.floor(Math.random() * naMesa.length)];
    if (k && b) w.usosDemo.set(k, { quem: b.id, ate: w.t + 9 + Math.random() * 6, texto: '' });
  }
  if (R.cena <= 0) {
    R.cena = 11 + Math.random() * 6;
    const subs = naMesa.filter((b) => !b.lugar?.assistente && !b.lugar?.codex);
    const sub = subs[Math.floor(Math.random() * subs.length)];
    const chefe = sub && chefeDe(w, sub);
    if (chefe && !chefe.cena) iniciarCena(w, chefe, sub, frasePedido(sub.m?.nome || sub.nome, sub.m?.pedido || sub.m?.ult), RESPOSTA[sub.m?.nome || sub.nome] || 'Pode deixar! 👍');
    else {
      const ocioso = todos.filter((b) => b.lugar?.copa && b.noLugar === b.lugar.id && !b.rot && !b.cena)[0];
      const ch = ocioso && chefeDe(w, ocioso);
      if (ch && !ch.cena) iniciarCena(w, ocioso, ch, 'Pronto, entreguei! ✅', 'Valeu! 👏');
    }
  }
  if (R.papo <= 0) { R.papo = 3 + Math.random() * 3; const o = todos.filter((b) => b.lugar?.copa && !b.rot && !b.cena)[Math.floor(Math.random() * 6)]; if (o) o.esperaRot = 0; }
}

export function tocarItem(w, x, y) {
  let melhor = null, dm = 9;
  for (const it of w.itens.values()) { const d = Math.hypot(it.x - x, it.y - y); if (d < dm) { dm = d; melhor = it; } }
  if (!melhor || typeof document === 'undefined') return false;
  const I = ITENS[melhor.k], camada = document.getElementById('camada');
  if (!camada) return false;
  if (w.cartao) w.cartao.el.remove();
  const el = document.createElement('div'); el.className = 'cartao-vida';
  const quem = melhor.quem ? (melhor.quem.lugar?.assistente ? `a assistente${melhor.quem.pessoa ? ' de ' + melhor.quem.pessoa : ''}` : melhor.quem.lugar?.codex ? 'o Codex' : tituloDe(melhor.quem.m?.nome || melhor.quem.nome)) : '';
  el.innerHTML = `<b>${I.icone} ${I.titulo}</b><span>${quem ? `Ajudando ${esc(quem)}: ${I.faz}${melhor.texto ? ' · ' + esc(melhor.texto.slice(0, 40)) : ''}` : 'Na estante, esperando alguém precisar.'}</span>`;
  camada.appendChild(el);
  w.cartao = { k: melhor.k, el, ate: w.t + 4.5 };
  return true;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- desenho dos itens (pixel art em código) ----------
function linha(g, x0, y0, x1, y1, c) {
  g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (let i = 0; i < 64; i++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function desenharItem(g, k, x, y, t, ativo) {
  const r = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx, y + dy, w, h); };
  if (k === 'pixellab') {
    r(-5, -4, 10, 8, '#1b1a26'); r(-4, -3, 8, 6, ativo ? '#2a2440' : '#3a3550');
    const cores = ['#e05a9a', '#3aa79a', '#ffd23f', '#5aa9e6'];
    for (let i = 0; i < 4; i++) r(-3 + (i % 2) * 3, -2 + Math.floor(i / 2) * 2, 2, 2, cores[(i + Math.floor(t * (ativo ? 6 : 1))) % 4]);
    r(3, -6, 1, 1, '#f4efe2'); r(4, -5, 1, 1, '#f4efe2'); r(5, -4, 1, 1, '#9a9aa6');
  } else if (k === 'blender') {
    const a = t * (ativo ? 3 : 0.8), s = 3.2, ca = Math.cos(a), sa = Math.sin(a);
    const P = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map(([px, py, pz]) => { const X = px * ca - pz * sa, Z = px * sa + pz * ca; return [x + X * s, y + py * s * 0.9 + Z * s * 0.35]; });
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) linha(g, P[i][0], P[i][1], P[j][0], P[j][1], '#f08a24');
    r(0, 0, 1, 1, '#5a8ad8');
  } else if (k === 'godot') {
    const b = ativo ? Math.round(Math.sin(t * 8)) : 0;
    r(-4, -3 + b, 9, 7, '#1b1a26'); r(-3, -2 + b, 7, 5, '#478cbf');
    r(-2, -1 + b, 2, 2, '#fff'); r(1, -1 + b, 2, 2, '#fff'); r(-1, 0 + b, 1, 1, '#1b1a26'); r(2, 0 + b, 1, 1, '#1b1a26');
    r(-1, 2 + b, 3, 1, '#2a4a6a'); r(0, -5 + b, 1, 2, '#1b1a26'); r(0, -6 + b, 1, 1, Math.floor(t * 2) % 2 ? '#ffd23f' : '#ef6a55');
  } else if (k === 'render') {
    const abre = ativo && (t * 1.6) % 1 < 0.5;
    r(-4, -1, 9, 6, '#1b1a26'); r(-3, 0, 7, 4, '#3a3550'); r(-2, 1, 4, 1, '#e8e4dc');
    if (abre) { r(-4, -5, 3, 2, '#e8e4dc'); r(-1, -6, 3, 2, '#1b1a26'); r(2, -7, 3, 2, '#e8e4dc'); }
    else { r(-4, -3, 9, 2, '#1b1a26'); r(-3, -3, 2, 2, '#e8e4dc'); r(1, -3, 2, 2, '#e8e4dc'); }
  } else if (k === 'ffmpeg') {
    const ab = ativo ? (Math.sin(t * 10) > 0 ? 3 : 0.5) : 1.5;
    linha(g, x, y, x + 5, y - 4 - ab * 0.4, '#c0c4cc'); linha(g, x, y, x + 5, y - 4 + ab, '#c0c4cc');
    r(-4, 1, 3, 3, '#3fb37f'); r(-3, 2, 1, 1, 'rgba(0,0,0,0)'); r(-2, -3, 3, 3, '#3fb37f'); r(0, 0, 1, 1, '#1b1a26');
  } else if (k === 'skill') {
    if (ativo) {
      r(-5, -3, 10, 6, '#1b1a26'); r(-4, -2, 4, 4, '#f4efe2'); r(1, -2, 4, 4, '#f4efe2');
      const p = Math.floor(t * 4) % 4; r(-3 + p * 2, -3, 1, 5, '#ffd23f');
      r(-3, -1, 2, 1, '#9a9aa6'); r(2, 0, 2, 1, '#9a9aa6');
    } else { r(-3, -4, 7, 8, '#1b1a26'); r(-2, -3, 5, 6, '#ffd23f'); r(-2, -3, 1, 6, '#c99a2e'); r(0, -1, 2, 1, '#7a5a10'); }
  } else if (k === 'web') {
    r(-3, -4, 6, 8, '#1b1a26'); r(-4, -3, 8, 6, '#1b1a26'); r(-2, -3, 4, 6, '#5aa9e6'); r(-3, -2, 6, 4, '#5aa9e6');
    const s = Math.floor(t * (ativo ? 5 : 1)) % 6; r(-3 + (s % 5), -1, 2, 2, '#4fbf82'); r(-2 + ((s + 3) % 5), 1, 2, 1, '#4fbf82');
  } else {
    r(-3, -2, 6, 5, '#1b1a26'); r(-2, -1, 4, 3, '#9aa3b4'); r(-2, -4, 1, 2, '#c0c4cc'); r(1, -4, 1, 2, '#c0c4cc'); r(0, 3, 1, 3, '#1b1a26');
    if (ativo && Math.floor(t * 6) % 2) { r(-4, -6, 1, 1, '#ffd23f'); r(3, -5, 1, 1, '#ffd23f'); }
  }
}
// Cacarecos de dev em cima de cada mesa das alas (cada mesa com o seu): papéis, caixinha de som,
// rascunho colorido, livros, bonequinho, post-its. Quebra a repetição das fileiras.
export function desenharCacareco(g, a, i) {
  const x = a.pc.x - 12, y = a.pc.y + 22; // canto esquerdo do tampo
  const r = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx, y + dy, w, h); };
  const tipo = (i * 5 + (a.setor === 'marketing' ? 2 : 0)) % 6;
  if (tipo === 0) { r(0, 1, 7, 5, '#2a1a10'); r(1, 0, 6, 5, '#fffaf0'); r(2, 1, 4, 1, '#9a9aa6'); r(2, 3, 3, 1, '#9a9aa6'); } // pilha de papel
  else if (tipo === 1) { r(0, 0, 5, 6, '#1b1a26'); r(1, 1, 3, 3, '#3a3f4a'); r(2, 2, 1, 1, '#c8ced8'); r(1, 5, 3, 1, '#3a3f4a'); } // caixinha de som
  else if (tipo === 2) { r(0, 1, 8, 5, '#2a1a10'); r(1, 1, 7, 4, '#f4ecd8'); r(2, 2, 2, 1, '#e05a9a'); r(4, 3, 2, 1, '#3aa79a'); r(3, 4, 3, 1, '#f0b040'); } // rascunho
  else if (tipo === 3) { r(0, 0, 2, 6, '#c0503a'); r(2, 1, 2, 5, '#3a86e0'); r(4, 0, 2, 6, '#5a9a5a'); r(0, 6, 6, 1, '#2a1a10'); } // livros
  else if (tipo === 4) { r(1, 0, 4, 4, '#1b1a26'); r(2, 1, 2, 2, '#478cbf'); r(2, 1, 1, 1, '#ffffff'); r(1, 4, 4, 2, '#1b1a26'); } // bonequinho
  else { r(0, 1, 3, 3, '#ffd23f'); r(3, 2, 3, 3, '#ff8ab0'); r(1, 4, 3, 2, '#8fe0a0'); } // post-its
}
// vapor subindo das xícaras de café espalhadas pelo escritório (cada uma no seu ritmo)
export function desenharVapor(g, w) {
  for (const m of w.planta.moveis) {
    if (m.img !== 'cafe') continue;
    const fase = (w.t * 0.8 + m.x * 0.13 + m.y * 0.07) % 3;
    if (fase > 2) continue; // pausa
    const x = Math.round(m.x) + 7, y = Math.round(m.y + (m.dy || 0) - (m.sobre ? 14 : 0)) + 3;
    const k = Math.floor(fase * 3);
    g.fillStyle = `rgba(255,255,255,${0.55 - k * 0.08})`;
    g.fillRect(x + (k % 2), y - k * 2, 1, 2);
    if (k > 1) g.fillRect(x + 1 - (k % 2), y - k * 2 - 3, 1, 1);
  }
}
export function desenharItens(g, w) {
  for (const it of w.itens.values()) {
    for (const q of it.rastro) { g.fillStyle = `rgba(255,226,140,${q.v * 0.8})`; g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
    const x = Math.round(it.x), y = Math.round(it.y), ativo = !!it.quem && !it.voando;
    if (it.quem) {
      // plaquinha de papel atrás do item (lê melhor em cima da mesa) + brilho
      g.fillStyle = 'rgba(255,230,150,.28)'; g.fillRect(x - 9, y - 8, 18, 16); g.fillRect(x - 8, y - 9, 16, 18);
      if (ativo) {
        g.fillStyle = '#2a1a10'; g.fillRect(x - 7, y - 7, 14, 14); g.fillRect(x - 6, y - 8, 12, 16); g.fillRect(x - 8, y - 6, 16, 12);
        g.fillStyle = '#f4ecd8'; g.fillRect(x - 6, y - 7, 12, 14); g.fillRect(x - 7, y - 6, 14, 12);
        g.fillStyle = '#2a1a10'; g.fillRect(x - 2, y + 7, 4, 2); g.fillRect(x - 1, y + 9, 2, 1);
        const s = Math.floor(w.t * 5 + x) % 4;
        g.fillStyle = '#fff6c8'; g.fillRect(x + 8 + (s % 2), y - 9 + s, 1, 1); g.fillRect(x - 10, y + 2 - s, 1, 1);
      }
    }
    desenharItem(g, it.k, x, y, w.t, ativo);
  }
}
// estante das ferramentas (fica no salão)
export function desenharEstante(g, w) {
  const e = w.planta.estante, x = e.x, y = e.y;
  g.fillStyle = 'rgba(10,8,20,.28)'; g.fillRect(x + 1, y + e.h, e.w, 3);
  g.fillStyle = '#2a1a10'; g.fillRect(x - 1, y - 1, e.w + 2, e.h + 2);
  g.fillStyle = '#8a5a30'; g.fillRect(x, y, e.w, e.h);
  g.fillStyle = '#b07a4a'; g.fillRect(x, y, e.w, 1);
  // 8 nichos (um por ferramenta): fundo escuro; quando a ferramenta sai, o nicho fica vazio
  w.planta.casasItens.forEach((c, i) => {
    const nx = Math.round(c.x) - 5, ny = Math.round(c.y) - 5;
    g.fillStyle = '#2a1810'; g.fillRect(nx, ny, 10, 10);
    g.fillStyle = '#4a2c18'; g.fillRect(nx + 1, ny + 1, 8, 8);
    g.fillStyle = '#d8a46a'; g.fillRect(nx, ny + 10, 10, 1);
    const it = [...w.itens.values()][i];
    if (it?.quem) { g.fillStyle = 'rgba(255,214,120,.35)'; g.fillRect(nx + 2, ny + 7, 6, 1); } // marca de "saiu para ajudar"
  });
  // plaquinha "FERRAMENTAS"
  g.fillStyle = '#2a1a10'; g.fillRect(x + e.w / 2 - 9, y - 6, 18, 6); g.fillStyle = '#f4ecd8'; g.fillRect(x + e.w / 2 - 8, y - 5, 16, 4);
  g.fillStyle = '#5a3418'; for (let k = 0; k < 6; k++) g.fillRect(x + e.w / 2 - 6 + k * 2, y - 4, 1, 2);
}

// ======================= luz do dia =======================
function fatores() {
  const h = horaAgora();
  const noite = h < 5 ? 1 : h < 7 ? 1 - (h - 5) / 2 : h < 17.5 ? 0 : h < 19.5 ? (h - 17.5) / 2 : 1;
  const ouro = h >= 15 && h < 19.5 ? Math.sin(((h - 15) / 4.5) * Math.PI) : 0;
  const manha = h >= 6 && h < 9 ? Math.sin(((h - 6) / 3) * Math.PI) : 0;
  return { h, noite, ouro, manha };
}
function ceu(f) {
  if (f.noite > 0.6) return ['#141a3a', '#26305a'];
  if (f.ouro > 0.5 && f.h > 17) return ['#e8804a', '#f6c070'];
  if (f.ouro > 0.3) return ['#f0b060', '#ffe0a0'];
  if (f.manha > 0.3) return ['#9fd0f0', '#ffe8c8'];
  return ['#6ab8ec', '#bfe4f8'];
}
export function desenharJanelas(g, w) {
  const f = fatores(), [c1, c2] = ceu(f);
  for (const j of w.planta.janelas) {
    const { x, y, w: L } = j, H = j.h || 20;
    g.fillStyle = '#2a1a10'; g.fillRect(x - 1, y - 1, L + 2, H + 2);
    g.fillStyle = c1; g.fillRect(x + 1, y + 1, L - 2, H - 2);
    g.fillStyle = c2; g.fillRect(x + 1, y + Math.round(H / 2) + 1, L - 2, Math.round(H / 2) - 2);
    if (f.noite > 0.6) { g.fillStyle = '#fff6c8'; for (let k = 0; k < 5; k++) { const sx = x + 3 + ((k * 7 + x) % (L - 6)), sy = y + 3 + ((k * 5) % 9); if ((Math.floor(w.t * 1.3) + k) % 4) g.fillRect(sx, sy, 1, 1); } g.fillStyle = '#f4efe2'; g.fillRect(x + L - 8, y + 3, 3, 3); }
    else { g.fillStyle = 'rgba(255,255,255,.85)'; const nx = x + 2 + ((w.t * 2 + x) % (L + 8)) - 8; g.save(); g.beginPath(); g.rect(x + 1, y + 1, L - 2, H - 2); g.clip(); g.fillRect(Math.round(nx), y + 5, 7, 2); g.fillRect(Math.round(nx) + 2, y + 4, 4, 1); g.restore(); }
    if (w.chuva) { g.fillStyle = 'rgba(200,225,255,.55)'; for (let k = 0; k < 6; k++) { const rx = x + 2 + ((k * 5 + Math.floor(w.t * 9) * 3) % (L - 4)), ry = y + 2 + ((Math.floor(w.t * 30) + k * 4) % (H - 6)); g.fillRect(rx, ry, 1, 3); } }
    g.fillStyle = '#6b4424'; g.fillRect(x + L / 2 - 1, y + 1, 2, H - 2); g.fillRect(x + 1, y + H / 2 - 1, L - 2, 2);
    g.fillStyle = '#b07a4a'; g.fillRect(x - 2, y + H, L + 4, 3); g.fillStyle = '#d8a46a'; g.fillRect(x - 2, y + H, L + 4, 1);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 2, y + 2, 1, 6); g.fillRect(x + 3, y + 2, 1, 3);
  }
}
export function desenharLuminaria(g, w, l) {
  const f = fatores(), acesa = f.noite > 0.25;
  const x = Math.round(l.x), y = Math.round(l.y);
  g.fillStyle = 'rgba(10,8,20,.25)'; g.fillRect(x - 3, y, 7, 2);
  g.fillStyle = '#2a1a10'; g.fillRect(x - 2, y - 1, 5, 2); g.fillRect(x, y - 18, 1, 18);
  g.fillStyle = '#2a1a10'; g.fillRect(x - 4, y - 24, 9, 7);
  g.fillStyle = acesa ? '#fff2c0' : '#e8d8b0'; g.fillRect(x - 3, y - 23, 7, 5);
  g.fillStyle = acesa ? '#ffd880' : '#c9b48a'; g.fillRect(x - 3, y - 19, 7, 1);
}
export function desenharLuz(g, w, cam, vw, vh) {
  const f = fatores();
  g.save();
  g.globalCompositeOperation = 'multiply';
  if (f.ouro > 0.02) { g.fillStyle = `rgba(255,190,110,${0.38 * f.ouro})`; g.fillRect(cam.x, cam.y, vw, vh); }
  if (f.noite > 0.02) { g.fillStyle = `rgba(38,50,122,${0.56 * f.noite})`; g.fillRect(cam.x, cam.y, vw, vh); }
  g.globalCompositeOperation = 'lighter';
  // de dia o escritório fica mais claro (de manhã, mais ainda)
  const claro = (1 - f.noite) * (0.05 + 0.05 * f.manha);
  if (claro > 0.01) { g.fillStyle = `rgba(255,248,225,${claro})`; g.fillRect(cam.x, cam.y, vw, vh); }
  if (f.noite < 0.6) for (const j of w.planta.janelas.filter((q) => !q.lado)) {
    // feixe de sol entrando pela janela
    const a = (f.ouro > 0.2 ? 0.1 : 0.06) * (1 - f.noite);
    g.fillStyle = f.ouro > 0.2 ? `rgba(255,200,120,${a})` : `rgba(255,250,220,${a})`;
    for (let k = 0; k < 4; k++) g.fillRect(j.x + 2 + k * 2, j.y + 24 + k * 8, j.w - 4, 8);
  }
  if (f.noite > 0.05) {
    const luz = (x, y, r, cor) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, cor); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const l of w.planta.luminarias) luz(l.x, l.y - 14, 64, `rgba(255,180,95,${0.55 * f.noite})`);
    for (const ax of ARANDELAS) luz(ax, 9, 34, `rgba(255,196,110,${0.5 * f.noite})`); // arandelas da parede do fundo
    for (const b of w.agentes.values()) luz(b.x, b.y - 14, 18, `rgba(255,232,196,${0.2 * f.noite})`); // os bonecos não somem no escuro
    for (const b of w.agentes.values()) if (b.modo === 'sentado' && OCUPADO.includes(b.status) && b.lugar?.pc) luz(b.lugar.pc.x + 8, b.lugar.pc.y + 10, 28, `rgba(120,180,255,${0.42 * f.noite})`);
    for (const m of w.planta.moveis) if (m.anima?.startsWith('dono')) luz(m.x + 8, m.y + 6, 22, `rgba(120,180,255,${0.3 * f.noite})`);
    for (const j of w.planta.janelas) luz(j.x + j.w / 2, j.y + (j.h || 20) / 2, 20, `rgba(140,160,255,${0.12 * f.noite})`);
    // brilho quente nas canecas da copa e na mesa de quem está tomando café
    for (const b of w.agentes.values()) if (b.acao === 'cafe') luz(b.x, b.y - 14, 14, `rgba(255,200,120,${0.18 * f.noite})`);
  }
  g.restore();
}
