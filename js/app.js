// Estúdio Genesis: liga mundo + dados + rede + interface.
import { ORDEM_PESSOAS, COR_PESSOA, tituloDe } from './config.js';
import { T, MW, MH, SALAS, ORDEM_BAIAS, tileDe } from './mapa.js';
import { criarMundo } from './mundo.js';
import { montarPersonagem, retrato } from './arte.js';
import { visualDe } from './personagens.js';
import { frase, passo, iconePasso } from './humano.js';
import * as D from './dados.js';
import * as R from './rede.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO = new URLSearchParams(location.search).has('demo');

let EU = null, mundo = null, membros = [], estados = new Map(), recados = [], presentes = new Map();
let conversas = [], conversaAtual = null, mensagens = [], aprovacoes = [], jornais = [], temSql2 = false;
let aba = guardado('aba', 'equipe'), filtroEquipe = 'todos', selecionado = null, missaoAberta = null, chatOcupado = false;
const pilha = []; // para o botão "voltar" da gaveta

// ======================= markdown simples (seguro: escapa tudo antes) =======================
function md(texto) {
  const blocos = String(texto ?? '').split(/```/);
  return blocos.map((b, i) => {
    if (i % 2) return `<pre><code>${esc(b.replace(/^\w*\n/, ''))}</code></pre>`;
    const linhas = esc(b).split('\n');
    let html = '', lista = null;
    for (const l of linhas) {
      const item = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(l);
      if (item) { if (!lista) { lista = /^\s*\d/.test(l) ? 'ol' : 'ul'; html += `<${lista}>`; } html += `<li>${inline(item[1])}</li>`; continue; }
      if (lista) { html += `</${lista}>`; lista = null; }
      if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    if (lista) html += `</${lista}>`;
    return html;
  }).join('');
}
const inline = (s) => s
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|\s)\*([^*]+)\*/g, '$1<i>$2</i>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
  .replace(/^#{1,4}\s*(.*)$/, '<b>$1</b>');

// ======================= login =======================
async function iniciar() {
  if (DEMO) return iniciarDemo();
  const s = await R.sessao();
  if (!s) { $('#carregando').hidden = true; mostrarLogin(); return; }
  try {
    $('#textoCarregando').textContent = 'Entrando…';
    EU = await R.quemSouEu();
    if (!EU?.pessoa) { $('#carregando').hidden = true; mostrarLogin(`Você entrou como ${EU?.email}, mas ainda não foi convidado. Peça para o outro te convidar (Ajustes › Convidar).`); return; }
    $('#textoCarregando').textContent = 'Carregando o escritório…';
    const tudo = await R.carregarTudo();
    membros = tudo.membros; recados = tudo.recados; temSql2 = tudo.temSql2;
    conversas = tudo.conversas || []; aprovacoes = tudo.aprovacoes || []; jornais = tudo.jornal || [];
    for (const e of tudo.estado) estados.set(e.pessoa, e);
    D.adicionar(tudo.eventos.map(D.deLinha));
    mundo = await criarMundo();
    const minhaSala = SALAS[Math.max(0, pessoas().indexOf(EU.pessoa))];
    await mundo.criarEu(EU.pessoa, [minhaSala.dono[0], minhaSala.dono[1] + 0.8]);
    await sincronizarMundo();
    R.conectar({ x: mundo.eu.x, y: mundo.eu.y, status: estados.get(EU.pessoa)?.status || 'disponivel' });
    ligarRede();
    conversaAtual = Number(guardado('conversa', '0')) || conversas[0]?.id || null;
    if (conversaAtual && !conversas.some((c) => c.id === conversaAtual)) conversaAtual = conversas[0]?.id || null;
    montarInterface();
    $('#carregando').hidden = true;
    mostrarResumo();
    desenharManchete();
    requestAnimationFrame(laco);
  } catch (e) {
    console.error(e);
    $('#textoCarregando').textContent = `Deu erro ao abrir: ${e.message}. O banco foi configurado (supabase/escritorio.sql)?`;
  }
}
function mostrarLogin(msg) {
  $('#login').hidden = false;
  if (msg) { $('#erroLogin').textContent = msg; $('#erroLogin').hidden = false; }
  $('#formEmail').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    try { await R.pedirCodigo(email); guarda('email', email); $('#formEmail').hidden = true; $('#avisoLink').hidden = false; $('#emailEnviado').textContent = email; $('#erroLogin').hidden = true; }
    catch (err) { $('#erroLogin').textContent = `Não consegui mandar: ${err.message}`; $('#erroLogin').hidden = false; }
  };
  $('#reenviar').onclick = () => { $('#formEmail').hidden = false; $('#avisoLink').hidden = true; };
  $('#email').value = guardado('email', '');
}

// ======================= quem está onde =======================
function pessoas() {
  const ps = new Set(membros.map((m) => m.pessoa)); if (EU?.pessoa) ps.add(EU.pessoa);
  for (const p of ORDEM_PESSOAS) ps.add(p);
  return [...ps].sort((a, b) => ((ORDEM_PESSOAS.indexOf(a) + 1) || 9) - ((ORDEM_PESSOAS.indexOf(b) + 1) || 9)).slice(0, 2);
}
const corPessoa = (p) => COR_PESSOA[p] || '#9a90a8';
const agentesInfo = (p) => estados.get(p)?.info?.agentes || [];
const modelo = (nome, p) => D.modeloDe(nome, agentesInfo(p));
const tagModelo = (nome, p) => { const m = modelo(nome, p); return `<span class="modelo ${m.familia}" title="${esc(m.descricao || '')}">${esc(m.rotulo)}</span>`; };
const vazioMesa = (p, nome) => ({ k: `${p}|${nome}`, pessoa: p, nome, titulo: tituloDe(nome), hist: [], miniaturas: [], nomes: [] });
const CONHECIDOS = new Set(ORDEM_BAIAS.flat().concat('Orquestrador', 'Codex'));
function mesasDoMundo() {
  const ps = pessoas(), eq = D.equipes(), lista = [];
  const extras = new Map(ps.map((p) => [p, [...(eq.get(p) || new Map()).values()].filter((x) => !CONHECIDOS.has(x.nome)).sort((a, b) => b.ult.t - a.ult.t)]));
  for (const l of mundo.planta.lugares) {
    const p = ps[l.equipe]; if (!p) continue;
    const mesas = eq.get(p) || new Map();
    let m = l.nome === '*' ? extras.get(p).shift() : mesas.get(l.nome);
    m ||= vazioMesa(p, l.nome === '*' ? 'agente' : l.nome);
    let st = D.estadoDe(m).cls;
    if (l.assistente && p === EU.pessoa && chatOcupado && alvoAtual() === 'claude') st = 'trab';
    if (l.codex && p === EU.pessoa && chatOcupado && alvoAtual() === 'codex') st = 'trab';
    lista.push({ id: `${l.equipe}|${l.nome}|${lista.length}`, nome: m.nome === 'agente' ? '*' : m.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: p, m });
  }
  return lista;
}
let versaoMundo = -1;
async function sincronizarMundo() {
  if (versaoMundo === D.versaoAtual()) return;
  versaoMundo = D.versaoAtual();
  await mundo.sincronizarAgentes(mesasDoMundo());
}
setInterval(() => { if (mundo) { versaoMundo = -1; sincronizarMundo(); } }, 20e3);

// ======================= rede =======================
const contagemErros = new Map();
function ligarRede() {
  R.on('evento', (linha) => { const e = D.deLinha(linha); D.adicionar([e]); sincronizarMundo(); avisarEvento(e); agendarInterface(); });
  R.on('recado', (p) => {
    if (p.eventType === 'INSERT') { recados.unshift(p.new); if (p.new.pessoa !== EU.pessoa) { toast({ titulo: `${p.new.pessoa} deixou um recado`, texto: p.new.texto, cor: corPessoa(p.new.pessoa), acao: () => abrirAba('mural') }); som('recado'); } }
    if (p.eventType === 'DELETE') recados = recados.filter((r) => r.id !== p.old.id);
    agendarInterface();
  });
  R.on('estado', (e) => { estados.set(e.pessoa, { ...estados.get(e.pessoa), ...e }); agendarInterface(); });
  R.on('chat', (c) => {
    if ((c.conversa_id ?? null) === conversaAtual && !(c.de === 'eu' && mensagens.some((m) => m.de === 'eu' && m.texto === c.texto && !m.id))) { mensagens.push(c); desenharChat(); }
    else if (c.de === 'eu') { const m = mensagens.find((x) => x.de === 'eu' && x.texto === c.texto && !x.id); if (m) m.id = c.id; }
    if (c.de === 'assistente' && (aba !== 'chat' || c.conversa_id !== conversaAtual)) { const cv = conversas.find((x) => x.id === c.conversa_id); toast({ titulo: `${cv?.alvo === 'codex' ? 'O Codex' : 'Sua assistente'} respondeu${cv ? ' · ' + cv.titulo : ''}`, texto: c.texto.slice(0, 140), cor: cv?.alvo === 'codex' ? '#3fb37f' : '#a785f0', acao: () => abrirConversa(c.conversa_id) }); som('fim'); notificar('Resposta da assistente', c.texto); }
  });
  R.on('comando', (c) => { chatOcupado = c.status === 'rodando'; versaoMundo = -1; sincronizarMundo(); desenharChat(); });
  R.on('conversa', (p) => {
    if (p.eventType === 'DELETE') conversas = conversas.filter((c) => c.id !== p.old.id);
    else conversas = [p.new, ...conversas.filter((c) => c.id !== p.new.id)].sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado));
    desenharSeletorConversas();
  });
  R.on('aprovacao', (a) => {
    aprovacoes = [...aprovacoes.filter((x) => x.id !== a.id), a].filter((x) => x.status === 'pendente');
    if (a.status === 'pendente') { som('alerta'); const f = passo(a.ferramenta, null, lerJson(a.detalhe)); notificar('A assistente pede permissão', f); toast({ titulo: 'Pedido de permissão', texto: f, cor: '#ffd23f', acao: () => abrirAba('atencao') }); }
    agendarInterface(); desenharChat();
  });
  R.on('jornal', (j) => { if (!j?.dia) return; jornais = [j, ...jornais.filter((x) => x.dia !== j.dia)].sort((a, b) => b.dia.localeCompare(a.dia)); desenharManchete(); if (!$('#jornal').hidden) abrirJornal(j.dia); });
  R.on('presenca', (st) => { presentes = new Map(Object.entries(st).map(([k, v]) => [k, v[0]])); for (const p of mundo.pessoas.keys()) if (!presentes.has(p)) mundo.pessoas.delete(p); agendarInterface(); });
  R.on('chegou', (p) => { if (p !== EU.pessoa) { toast({ titulo: `${p} entrou no escritório`, cor: corPessoa(p) }); som('chegou'); } });
  R.on('pos', (d) => { if (d.pessoa && d.pessoa !== EU.pessoa) mundo.atualizarPessoa(d.pessoa, d); });
  R.on('pediuPosicao', () => R.enviarPos(posAtual(), true));
  R.on('emote', ({ pessoa, e }) => mostrarEmote(pessoa, e));
  R.on('aceno', ({ de, para }) => {
    if (para !== EU.pessoa) return;
    som('aceno'); mostrarEmote(de, '👋');
    toast({ titulo: `${de} acenou para você 👋`, texto: 'Clique para ir até ele.', cor: corPessoa(de), acao: () => irAtePessoa(de) });
    notificar(`${de} acenou para você`, 'Abra o escritório para ir até ele.');
  });
}
const lerJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const posAtual = () => ({ x: Math.round(mundo.eu.x), y: Math.round(mundo.eu.y), dir: mundo.eu.dir, skate: mundo.eu.skate, andando: mundo.eu.modo === 'andando' });

// Avisos em três níveis: interromper (som + notificação), marcar (toast), só registrar.
function avisarEvento(e) {
  const meu = e.pessoa === EU.pessoa, titulo = tituloDe(e.agente);
  if (e.tipo === 'alerta' && meu) {
    toast({ titulo: `${titulo} precisa de você`, texto: frase(e), cor: '#ffd23f', agente: e.agente, acao: () => abrirAba('atencao') });
    som('alerta'); notificar(`${titulo} precisa de você`, frase(e));
  } else if (e.tipo === 'erro' && meu) {
    const n = (contagemErros.get(e.agente) || 0) + 1; contagemErros.set(e.agente, n);
    if ([1, 3, 9, 27].includes(n)) { toast({ titulo: `${titulo} deu erro`, texto: frase(e), cor: '#ef6a55', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) }); som('erro'); }
  } else if (e.tipo === 'fim' && e.agente !== 'Orquestrador' && meu) {
    contagemErros.delete(e.agente);
    toast({ titulo: `${titulo} terminou`, texto: frase(e), cor: '#4fbf82', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) });
    som('fim'); if (document.hidden) notificar(`${titulo} terminou`, frase(e));
  } else if (!meu && e.tipo === 'fim' && e.agente !== 'Orquestrador' && (e.miniaturas || []).length) {
    toast({ titulo: `${e.pessoa}: ${titulo} entregou`, texto: frase(e), cor: corPessoa(e.pessoa), acao: () => abrirAba('galeria') });
  }
}

// ======================= som, notificação, toast =======================
let audio = null;
function som(tipo) {
  if (guardado('som', '1') !== '1') return;
  try {
    audio ||= new AudioContext();
    const notas = { alerta: [880, 660, 880], erro: [220, 180], fim: [660, 990], aceno: [523, 659, 784], recado: [740, 988], chegou: [392, 523] }[tipo] || [600];
    notas.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.09;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.14);
    });
  } catch {}
}
function notificar(titulo, corpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(titulo, { body: String(corpo || '').slice(0, 140), tag: titulo, icon: 'icones/icone-180.png' }); } catch {}
}
const retratos = new Map();
async function retratoDe(nome) {
  if (!retratos.has(nome)) retratos.set(nome, montarPersonagem(visualDe(nome)).then((f) => retrato(f, 48).toDataURL()));
  return retratos.get(nome);
}
async function toast({ titulo, texto, cor, agente, acao }) {
  const el = document.createElement('div');
  el.className = 'toast'; el.style.setProperty('--cor', cor || 'var(--borda)');
  el.innerHTML = `${agente ? `<img src="${await retratoDe(agente)}" alt="">` : ''}<div><b>${esc(titulo)}</b>${texto ? `<span>${esc(String(texto).slice(0, 160))}</span>` : ''}</div>`;
  el.onclick = () => { acao?.(); el.remove(); };
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
  setTimeout(() => el.remove(), 7000);
}

// ======================= mundo: câmera, entrada, laço =======================
const tela = $('#tela'), g = tela.getContext('2d');
let zoom = Number(guardado('zoom', '0')) || 0, VW = 480, VH = 270;
const cam = { x: 0, y: 0, alvo: null };
function dimensionar() {
  const p = $('#palco'), w = p.clientWidth, h = p.clientHeight;
  if (!w || !h) return;
  if (!zoom) zoom = w >= 1500 ? 3 : 2;
  zoom = Math.max(1, Math.min(5, zoom));
  VW = Math.ceil(w / zoom); VH = Math.ceil(h / zoom);
  tela.width = VW; tela.height = VH;
  tela.style.width = `${VW * zoom}px`; tela.style.height = `${VH * zoom}px`;
}
addEventListener('resize', dimensionar);
const mudarZoom = (d) => { zoom += d; guarda('zoom', zoom); dimensionar(); };

const teclas = new Set();
const digitando = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (digitando()) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (!$('#login').hidden || !mundo) return;
  if (!$('#jornal').hidden) { if (e.key === 'Escape') $('#jornal').hidden = true; return; }
  if (!$('#ajuda').hidden) { if (e.key === 'Escape' || e.key === '?') $('#ajuda').hidden = true; return; }
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { teclas.add(k); cam.alvo = null; if (k.startsWith('arrow')) e.preventDefault(); }
  else if (k === 'e' || k === 'enter') interagir();
  else if (k === 'tab') { e.preventDefault(); alternarAba('equipe'); }
  else if (k === 'c') { e.preventDefault(); abrirAba('chat'); setTimeout(() => $('#entrada').focus(), 0); }
  else if (k === 'h') alternarAba('missoes');
  else if (k === 'g') alternarAba('galeria');
  else if (k === 'm') alternarAba('mural');
  else if (k === 'j') abrirJornal();
  else if (k === '?' || k === '/') abrirAjuda();
  else if (k === 'q') acenarParaOutro();
  else if (k === 'k') irAtePessoa(outraPessoa());
  else if (k === '+' || k === '=') mudarZoom(1);
  else if (k === '-') mudarZoom(-1);
  else if (k === 'escape') fecharGaveta();
  else if (/^[1-6]$/.test(k)) fazerEmote(['👋', '✅', '❓', '☕', '🎉', '🔥'][Number(k) - 1]);
});
addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

function telaParaMundo(ev) { const r = tela.getBoundingClientRect(); return [(ev.clientX - r.left) / zoom + cam.x, (ev.clientY - r.top) / zoom + cam.y]; }
const boneconoPonto = (x, y) => [...mundo.agentes.values()].filter((b) => Math.abs(b.x - x) < 9 && y > b.y - 30 && y < b.y + 4).sort((a, b) => b.y - a.y)[0];
// Pontos de interesse do mapa: mural (lousa) e jornal (mesa do salão).
const PONTOS = [
  { id: 'mural', x: 15 * T, y: 2.4 * T, raio: 26, texto: 'ler o mural de recados', acao: () => abrirAba('mural') },
  { id: 'jornal', x: 19 * T, y: 5.2 * T, raio: 30, texto: 'ler o Diário do Estúdio', acao: () => abrirJornal() },
];
tela.addEventListener('pointerdown', (ev) => {
  if (!mundo) return;
  tela.focus();
  const [x, y] = telaParaMundo(ev);
  const b = boneconoPonto(x, y);
  if (b) { abrirAgente(b); return; }
  const ponto = PONTOS.find((p) => Math.hypot(p.x - x, p.y - y) < 18);
  if (ponto) { ponto.acao(); return; }
  const outro = [...mundo.pessoas.values()].find((p) => Math.abs(p.x - x) < 9 && y > p.y - 30 && y < p.y + 3);
  if (outro) { toast({ titulo: outro.pessoa, texto: 'Aperte Q para acenar.', cor: corPessoa(outro.pessoa) }); return; }
  cam.alvo = null;
  mundo.irAte(x, y);
});
$('#miniTela').addEventListener('pointerdown', (ev) => {
  if (!mundo) return;
  const r = ev.target.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * MW * T, y = (ev.clientY - r.top) / r.height * MH * T;
  cam.alvo = null;
  if (!mundo.irAte(x, y)) cam.alvo = [x, y];
});
$('#zoomMais').onclick = () => mudarZoom(1);
$('#zoomMenos').onclick = () => mudarZoom(-1);

let perto = null, pontoPerto = null;
function maisPerto() {
  let melhor = null, dmin = 26;
  for (const b of mundo.agentes.values()) { const d = Math.hypot(b.x - mundo.eu.x, (b.y - mundo.eu.y) * 1.2); if (d < dmin) { dmin = d; melhor = b; } }
  return melhor;
}
function interagir() {
  if (perto) {
    if (perto.pessoa === EU.pessoa && (perto.lugar.assistente || perto.lugar.codex)) { abrirChatCom(perto.lugar.codex ? 'codex' : 'claude'); return; }
    abrirAgente(perto); return;
  }
  pontoPerto?.acao();
}

let antes = performance.now(), ultimaPosEnviada = '';
function laco(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
  if (!document.hidden && mundo) {
    if (!tela.width || tela.width !== VW) dimensionar();
    let dx = 0, dy = 0;
    if (teclas.has('a') || teclas.has('arrowleft')) dx -= 1;
    if (teclas.has('d') || teclas.has('arrowright')) dx += 1;
    if (teclas.has('w') || teclas.has('arrowup')) dy -= 1;
    if (teclas.has('s') || teclas.has('arrowdown')) dy += 1;
    mundo.atualizar(dt, { dx, dy, skate: teclas.has('shift') });
    const p = posAtual(), assinatura = `${p.x},${p.y},${p.dir},${p.skate},${p.andando}`;
    if (assinatura !== ultimaPosEnviada) { ultimaPosEnviada = assinatura; R.enviarPos(p); }
    const [ax, ay] = cam.alvo || [mundo.eu.x, mundo.eu.y - 10];
    const meioX = (MW * T - VW) / 2, meioY = (MH * T - VH) / 2;
    const tx = Math.max(Math.min(0, meioX), Math.min(Math.max(MW * T - VW, meioX), ax - VW / 2));
    const ty = Math.max(Math.min(0, meioY), Math.min(Math.max(MH * T - VH, meioY), ay - VH / 2));
    cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
    const c = { x: Math.round(cam.x), y: Math.round(cam.y) };
    mundo.desenhar(g, c, VW, VH);
    // o jornal em cima da mesa do salão (pisca quando há edição nova)
    const jx = 19 * T - c.x - 5, jy = 4.6 * T - c.y;
    g.fillStyle = '#1b1a26'; g.fillRect(jx - 1, jy - 1, 12, 9); g.fillStyle = '#f4ecd8'; g.fillRect(jx, jy, 10, 7); g.fillStyle = '#2a2318'; g.fillRect(jx + 1, jy + 1, 8, 1); g.fillRect(jx + 1, jy + 3, 4, 1); g.fillRect(jx + 6, jy + 3, 3, 3);
    if (jornalNovo() && Math.floor(agora / 500) % 2) { g.fillStyle = '#ffd23f'; g.fillRect(jx + 4, jy - 7, 2, 4); g.fillRect(jx + 4, jy - 2, 2, 1); }
    mundo.desenharMinimapa($('#miniTela').getContext('2d'), 160, 112, c, VW, VH);
    perto = maisPerto();
    pontoPerto = perto ? null : PONTOS.find((pt) => Math.hypot(pt.x - mundo.eu.x, pt.y - mundo.eu.y) < pt.raio) || null;
    rotulos(c);
  }
  requestAnimationFrame(laco);
}

// Nomes, balões e emojis por cima do canvas (reaproveitando elementos).
const camada = $('#camada'), poolRotulos = new Map();
const CURTO = { 'editor-de-video': 'Editor', 'criador-de-conteudo': 'Criadora', 'revisor-godot': 'Revisor', 'artista-3d': 'Artista 3D' };
let hoverId = null;
tela.addEventListener('pointermove', (ev) => { if (!mundo) return; const [x, y] = telaParaMundo(ev); hoverId = boneconoPonto(x, y)?.id || null; tela.style.cursor = hoverId || PONTOS.some((p) => Math.hypot(p.x - x, p.y - y) < 18) ? 'pointer' : 'crosshair'; });
function rotulo(id, cls) { let el = poolRotulos.get(id); if (!el) { el = document.createElement('div'); camada.appendChild(el); poolRotulos.set(id, el); } if (el.className !== cls) el.className = cls; el.dataset.v = '1'; return el; }
const colocar = (el, x, y, c, cima = false) => { el.style.transform = `translate(calc(${Math.round((x - c.x) * zoom)}px - 50%), calc(${Math.round((y - c.y) * zoom)}px - ${cima ? '100%' : '0px'}))`; };
function nomeNoMapa(b) {
  if (b.lugar.assistente) return b.pessoa === EU.pessoa ? 'Sua assistente · Claude' : `Assistente de ${b.pessoa}`;
  if (b.lugar.codex) return b.pessoa === EU.pessoa ? 'Codex · GPT' : `Codex de ${b.pessoa}`;
  return CURTO[b.nome] || tituloDe(b.nome === '*' ? 'agente' : b.nome);
}
function rotulos(c) {
  for (const el of poolRotulos.values()) el.dataset.v = '';
  const visivel = (x, y) => x > c.x - 30 && x < c.x + VW + 30 && y > c.y - 10 && y < c.y + VH + 50;
  for (const b of mundo.agentes.values()) {
    if (!visivel(b.x, b.y)) continue;
    const sel = b.m?.k === selecionado, foco = sel || b === perto || hoverId === b.id;
    const fixo = b.lugar.assistente || b.lugar.codex;
    if (!(foco || b.status === 'alerta' || b.status === 'erro' || fixo) && zoom < 3) continue;
    const fam = modelo(b.m?.nome || b.nome, b.pessoa).familia;
    const el = rotulo(b.id + 'n', `nome${b === perto || hoverId === b.id ? ' perto' : ''}${sel ? ' sel' : ''}${fam === 'gpt' ? ' gpt' : ''}${b.lugar.assistente ? ' claude-assist' : ''}`);
    const nome = nomeNoMapa(b);
    if (el.textContent !== nome) el.textContent = nome;
    colocar(el, b.x, b.y + 2, c);
    const recente = b.m?.ult && Date.now() - b.m.ult.t < 8 * 60e3;
    let fala = '';
    if ((b.lugar.assistente || b.lugar.codex) && b.pessoa === EU.pessoa && chatOcupado && alvoAtual() === (b.lugar.codex ? 'codex' : 'claude')) fala = 'pensando…';
    else if (b.m?.ult && (b.status === 'alerta' || foco || (zoom >= 3 && (b.status === 'trab' || b.status === 'fim') && recente))) fala = frase(b.m.ult).slice(0, 80);
    if (fala) {
      const f = rotulo(b.id + 'f', `fala ${b.status}`);
      if (f.textContent !== fala) f.textContent = fala;
      colocar(f, b.x, (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar.dir === 'cima' ? 30 : 14), c, true);
    }
  }
  const gente = [...mundo.pessoas.values()]; if (mundo.eu) gente.push(mundo.eu);
  for (const p of gente) {
    const el = rotulo('g' + p.pessoa, 'nome gente'); el.style.setProperty('--cor', corPessoa(p.pessoa));
    const n = p === mundo.eu ? `${p.pessoa} (você)` : p.pessoa;
    if (el.textContent !== n) el.textContent = n;
    colocar(el, p.x, p.y + 2, c);
    const em = emotes.get(p.pessoa);
    if (em && em.ate > Date.now()) { const e = rotulo('e' + p.pessoa, 'emoji'); if (e.textContent !== em.e) e.textContent = em.e; e.style.left = `${Math.round((p.x - c.x) * zoom)}px`; e.style.top = `${Math.round((p.y - 36 - c.y) * zoom)}px`; }
  }
  for (const [id, el] of poolRotulos) if (!el.dataset.v) { el.remove(); poolRotulos.delete(id); }
  const dica = $('#dica');
  let html = '';
  if (perto && !digitando()) {
    if (perto.pessoa === EU.pessoa && perto.lugar.assistente) html = '<b>E</b> conversar com a sua assistente (Claude)';
    else if (perto.pessoa === EU.pessoa && perto.lugar.codex) html = '<b>E</b> conversar com o Codex (GPT)';
    else html = `<b>E</b> ver o trabalho de ${esc(nomeNoMapa(perto))}`;
  } else if (pontoPerto && !digitando()) html = `<b>E</b> ${esc(pontoPerto.texto)}`;
  dica.hidden = !html;
  if (html && dica.innerHTML !== html) dica.innerHTML = html;
}

// ======================= emotes, acenos, ir até =======================
const emotes = new Map();
function mostrarEmote(pessoa, e) { emotes.set(pessoa, { e, ate: Date.now() + 2600 }); const el = poolRotulos.get('e' + pessoa); if (el) { el.remove(); poolRotulos.delete('e' + pessoa); } }
function fazerEmote(e) { mostrarEmote(EU.pessoa, e); R.emote(e); }
const outraPessoa = () => pessoas().find((p) => p !== EU.pessoa);
function acenarParaOutro() {
  const o = outraPessoa(); if (!o) return;
  if (!presentes.has(o)) { toast({ titulo: `${o} não está no escritório agora`, texto: 'Deixe um recado no mural.', cor: corPessoa(o), acao: () => abrirAba('mural') }); return; }
  R.acenar(o); fazerEmote('👋'); toast({ titulo: `Você acenou para ${o}`, cor: corPessoa(o) });
}
function teleportar(px, py) {
  for (let i = 0; i < 14; i++) mundo.particulas.push({ x: mundo.eu.x + Math.random() * 16 - 8, y: mundo.eu.y - Math.random() * 20, v: 1 });
  const [tx, ty] = tileDe(px, py);
  for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x > 0 && y > 0 && x < MW && y < MH && !mundo.planta.solido[y][x]) { mundo.eu.x = x * T + 8; mundo.eu.y = y * T + 12; mundo.eu.caminho = null; cam.alvo = null; R.enviarPos(posAtual(), true); return; }
  }
}
function irAtePessoa(p) {
  if (!p) return;
  const outro = mundo.pessoas.get(p);
  if (outro) teleportar(outro.x + 14, outro.y);
  else { const s = SALAS[pessoas().indexOf(p)]; if (s) teleportar(s.dono[0] * T, (s.dono[1] + 1.5) * T); }
}

// ======================= gaveta =======================
const TITULO_ABA = { equipe: 'Equipe', agente: 'Agente', atencao: 'Precisa de você', missoes: 'Missões', missao: 'Missão', galeria: 'Galeria', chat: 'Chat', mural: 'Mural de recados', ajustes: 'Ajustes' };
function abrirAba(nome, empilhar = false) {
  if (empilhar && aba !== nome && !$('#gaveta').classList.contains('fechada')) pilha.push(aba); else if (!empilhar) pilha.length = 0;
  aba = nome; if (!['agente', 'missao'].includes(nome)) guarda('aba', nome);
  $('#gaveta').classList.remove('fechada');
  $$('[data-painel]').forEach((s) => { s.hidden = s.dataset.painel !== nome; });
  const raiz = { agente: 'equipe', missao: 'missoes' }[nome] || nome;
  $$('#botoesTopo button, #abasCelular button').forEach((b) => b.classList.toggle('on', b.dataset.aba === raiz));
  $('#tituloAba').textContent = TITULO_ABA[nome];
  $('#voltarGaveta').hidden = !pilha.length;
  desenharAba();
  setTimeout(dimensionar, 0);
}
function alternarAba(nome) { if (aba === nome && !$('#gaveta').classList.contains('fechada')) fecharGaveta(); else abrirAba(nome); }
function fecharGaveta() { $('#gaveta').classList.add('fechada'); $$('#botoesTopo button, #abasCelular button').forEach((b) => b.classList.toggle('on', b.dataset.acao === 'mapa')); setTimeout(dimensionar, 0); }
$('#fecharGaveta').onclick = fecharGaveta;
$('#voltarGaveta').onclick = () => { const a = pilha.pop(); if (a) { const resto = [...pilha]; abrirAba(a); pilha.push(...resto); $('#voltarGaveta').hidden = !pilha.length; } };
$('#botoesTopo').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.acao === 'jornal') abrirJornal(); else alternarAba(b.dataset.aba); };

let pendenteUI = false;
function agendarInterface() { if (pendenteUI) return; pendenteUI = true; setTimeout(() => { pendenteUI = false; desenharTopo(); if (aba !== 'chat') desenharAba(); }, 150); }
setInterval(agendarInterface, 15e3);

function montarInterface() {
  $('#barra').onclick = (e) => { const b = e.target.closest('[data-emote]'); if (b) fazerEmote(b.dataset.emote); };
  $('#btnAcenar').onclick = acenarParaOutro;
  $('#btnIrAte').onclick = () => irAtePessoa(outraPessoa());
  $('#formChat').onsubmit = (e) => { e.preventDefault(); enviarChat(); };
  $('#entrada').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(); } };
  $('#btnParar').onclick = () => R.parar();
  $('#btnNovaConversa').onclick = () => mostrarNovaConversa();
  $('#cancelarConversa').onclick = () => { $('#formNovaConversa').hidden = true; };
  $('#formNovaConversa').onsubmit = (e) => { e.preventDefault(); criarConversa(); };
  $('#selConversa').onchange = (e) => abrirConversa(Number(e.target.value) || null);
  $('#btnMaisConversa').onclick = menuConversa;
  const CORES = { amarelo: '#ffe58a', rosa: '#ffc2d4', azul: '#bfe0ff', verde: '#c8f0c4' };
  let corRecado = 'amarelo';
  $('#coresRecado').innerHTML = Object.entries(CORES).map(([n, c]) => `<button type="button" data-cor="${n}" style="--cor:${c}" class="${n === corRecado ? 'on' : ''}"></button>`).join('');
  $('#coresRecado').onclick = (e) => { const b = e.target.closest('[data-cor]'); if (!b) return; corRecado = b.dataset.cor; $$('#coresRecado button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#formRecado').onsubmit = async (e) => { e.preventDefault(); const t = $('#textoRecado').value.trim(); if (!t) return; try { await R.recado(t, corRecado); $('#textoRecado').value = ''; } catch (err) { toast({ titulo: 'Não colou', texto: err.message, cor: '#ef6a55' }); } };
  $('#listaRecados').onclick = async (e) => { const b = e.target.closest('[data-tirar]'); if (b) await R.tirarRecado(Number(b.dataset.tirar)); };
  $('#fecharResumo').onclick = () => { $('#resumo').hidden = true; };
  $('#fecharLightbox').onclick = () => { $('#lightbox').hidden = true; $('#conteudoLightbox').innerHTML = ''; };
  $('#fecharJornal').onclick = () => { $('#jornal').hidden = true; };
  $('#manchete').onclick = () => abrirJornal();
  $('#edicoesJornal').onchange = (e) => abrirJornal(e.target.value);
  $('#gerarJornal').onclick = async () => { try { await R.pedirJornal(); toast({ titulo: 'Pedi a edição de hoje', texto: 'A ponte escreve em ~1 min (precisa estar ligada).', cor: '#f4ecd8' }); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#buscaMissoes').oninput = () => desenharMissoes();
  $('#abasCelular').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.acao === 'mapa') fecharGaveta(); else abrirAba(b.dataset.aba); };
  $('#btnAjuda').onclick = abrirAjuda;
  $('#fecharAjuda').onclick = () => { $('#ajuda').hidden = true; };
  if (!guardado('boasVindas', '')) {
    if (matchMedia('(pointer: coarse)').matches) $('#boasVindas span').innerHTML = '<b>Toque no chão</b> para andar · toque num boneco para ver o trabalho dele · <b>Chat</b> embaixo fala com a sua assistente';
    $('#boasVindas').hidden = false; $('#fecharBoasVindas').onclick = () => { $('#boasVindas').hidden = true; guarda('boasVindas', '1'); }; }
  window.CORES_RECADO = CORES;
  dimensionar();
  if (innerWidth < 900) fecharGaveta(); else abrirAba(['agente', 'missao'].includes(aba) ? 'equipe' : aba);
  desenharTopo();
  setInterval(() => { if (!document.hidden) guarda('visto', Date.now()); }, 30e3);
}

// ---------- topo ----------
async function desenharTopo() {
  const html = [];
  for (const p of pessoas()) {
    const st = estados.get(p) || {};
    const on = presentes.has(p) || p === EU.pessoa;
    const ponte = st.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3;
    const status = presentes.get(p)?.status || st.status || 'disponivel';
    const det = [on ? (status === 'focado' ? 'focado' : 'online') : 'fora', st.branch ? `⎇ ${st.branch}` : '', ponte ? '' : 'ponte off'].filter(Boolean).join(' · ');
    html.push(`<div class="pessoa ${on ? 'on' : ''} ${status === 'focado' ? 'focado' : ''}" data-ir="${esc(p)}" title="${esc(st.commit ? 'Último commit: ' + st.commit : '')}"><img src="${await retratoDe(p)}" alt=""><span class="ponto"></span>${esc(p)}<span class="det">${esc(det)}</span></div>`);
  }
  $('#gente').innerHTML = html.join('');
  $('#gente').onclick = (e) => { const d = e.target.closest('[data-ir]'); if (d && d.dataset.ir !== EU.pessoa) irAtePessoa(d.dataset.ir); };
  const todos = todosAgentes();
  const n = (cls) => todos.filter((a) => a.st.cls === cls).length;
  const meusAlertas = todos.filter((a) => a.m.pessoa === EU.pessoa && (a.st.cls === 'alerta' || a.st.cls === 'erro')).length + aprovacoes.length;
  $('#resumoTopo').innerHTML = [['alerta', 'precisam de você'], ['trab', 'trabalhando'], ['fim', 'prontos']].map(([c, t]) => `<span class="chip-estado" data-ver="${c}" title="${t}" style="--cor:${D.ESTADOS[c].cor}"><i>${D.ESTADOS[c].glifo}</i>${n(c) + (c === 'alerta' ? n('erro') + aprovacoes.length : 0)}</span>`).join('');
  $('#resumoTopo').onclick = (e) => { const c = e.target.closest('[data-ver]'); if (c) abrirAba(c.dataset.ver === 'alerta' ? 'atencao' : 'equipe'); };
  $('#badgeAtencao').hidden = !meusAlertas; $('#badgeAtencao').textContent = meusAlertas;
  $('#badgeAtencaoCel').hidden = !meusAlertas; $('#badgeAtencaoCel').textContent = meusAlertas;
  const novosRecados = recados.filter((r) => new Date(r.criado).getTime() > Number(guardado('recadosVistos', '0')) && r.pessoa !== EU.pessoa).length;
  $('#badgeMural').hidden = !novosRecados || aba === 'mural'; $('#badgeMural').textContent = novosRecados;
  document.title = meusAlertas ? `(${meusAlertas}) Estúdio Genesis` : 'Estúdio Genesis';
}
function todosAgentes() {
  const out = [];
  for (const [, mesas] of D.equipes()) for (const m of mesas.values()) out.push({ m, st: D.estadoDe(m) });
  for (const p of pessoas()) for (const nome of [...ORDEM_BAIAS.flat(), 'Orquestrador', 'Codex']) if (nome !== '*' && !D.mesa(p, nome)) out.push({ m: vazioMesa(p, nome), st: D.estadoDe(null) });
  return out;
}

// ---------- abas ----------
function desenharAba() {
  if (!mundo || $('#gaveta').classList.contains('fechada')) return;
  ({ equipe: desenharEquipe, agente: desenharAgente, atencao: desenharAtencao, missoes: desenharMissoes, missao: desenharMissao, galeria: desenharGaleria, chat: desenharChatCompleto, mural: desenharMural, ajustes: desenharAjustes })[aba]?.();
}
function filtros(el, atual, opcoes, fn) {
  el.innerHTML = opcoes.map(([v, t]) => `<button data-f="${esc(v)}" class="${v === atual ? 'on' : ''}">${esc(t)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) fn(b.dataset.f); };
}
const tituloAgente = (m) => m.nome === 'Orquestrador' ? (m.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${m.pessoa}`) : m.nome === 'Codex' ? (m.pessoa === EU.pessoa ? 'Codex' : `Codex de ${m.pessoa}`) : m.titulo || tituloDe(m.nome);
async function linhaAgente({ m, st }) {
  const texto = m.ult ? (st.cls === 'trab' && m.pedido && m.ult.tipo === 'atividade' ? `${frase(m.ult)} · ${frase(m.pedido)}` : frase(m.ult)) : modelo(m.nome, m.pessoa).descricao || 'ainda não trabalhou';
  return `<div class="ag ${selecionado === m.k ? 'sel' : ''}" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}">
    <img src="${await retratoDe(m.nome)}" alt="">
    <div><div class="n">${esc(tituloAgente(m))} ${tagModelo(m.nome, m.pessoa)} <small>${esc(m.pessoa)}</small></div><div class="t">${esc(texto)}</div></div>
    <div class="q" style="--cor:${st.cor}"><i>${st.glifo}</i><br>${m.ult ? D.ha(m.ult.t) : ''}</div></div>`;
}
async function desenharEquipe() {
  filtros($('#filtroEquipe'), filtroEquipe, [['todos', 'Todos'], ...pessoas().map((p) => [p, p]), ['claude', 'Claude'], ['gpt', 'GPT']], (f) => { filtroEquipe = f; desenharEquipe(); });
  const lista = todosAgentes().filter((a) => filtroEquipe === 'todos' || a.m.pessoa === filtroEquipe || modelo(a.m.nome, a.m.pessoa).familia === filtroEquipe);
  const grupos = [['Precisa de você', ['alerta', 'erro'], 'alerta'], ['Trabalhando', ['trab'], 'trab'], ['Pronto', ['fim'], 'fim'], ['Livre', ['espera', 'livre'], 'livre']];
  let html = '';
  for (const [nome, cls, chave] of grupos) {
    const itens = lista.filter((a) => cls.includes(a.st.cls)).sort((a, b) => (b.m.pessoa === EU.pessoa) - (a.m.pessoa === EU.pessoa) || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
    if (!itens.length) continue;
    html += `<div class="grupo" style="--cor:${D.ESTADOS[chave].cor}"><i>${D.ESTADOS[chave].glifo}</i>${nome} · ${itens.length}</div>`;
    html += (await Promise.all(itens.map(linhaAgente))).join('');
  }
  $('#listaEquipe').innerHTML = html || '<div class="vazio">Ninguém por aqui ainda.</div>';
  $('#listaEquipe').onclick = (e) => { const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k); };
}

// ---------- atenção: aprovações + agentes parados ----------
async function desenharAtencao() {
  $('#listaAprovacoes').innerHTML = aprovacoes.map(cartaoAprovacao).join('');
  ligarAprovacoes($('#listaAprovacoes'));
  const itens = todosAgentes().filter((a) => ['alerta', 'erro'].includes(a.st.cls)).sort((a, b) => (b.m.pessoa === EU.pessoa) - (a.m.pessoa === EU.pessoa) || a.st.ordem - b.st.ordem);
  $('#listaAtencao').innerHTML = itens.length ? (await Promise.all(itens.map(linhaAgente))).join('') : aprovacoes.length ? '' : '<div class="vazio">Nada precisa de você agora. ✓</div>';
  $('#listaAtencao').onclick = (e) => { const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k); };
}
function cartaoAprovacao(a) {
  const entrada = lerJson(a.detalhe);
  const cv = conversas.find((c) => c.id === a.conversa_id);
  return `<div class="aprovacao" data-ap="${a.id}"><b>Posso? ${esc(passo(a.ferramenta, null, entrada))}</b>
    <div class="det">${esc(Object.values(entrada).join(' · ') || a.ferramenta)}</div>
    <div class="sub" style="text-align:left">${cv ? 'Conversa: ' + esc(cv.titulo) + ' · ' : ''}${D.ha(new Date(a.criado).getTime())}</div>
    <div class="linha"><button class="btn verde" data-decide="permitido">Permitir</button><button class="btn perigo" data-decide="negado">Negar</button></div></div>`;
}
function ligarAprovacoes(el) {
  el.onclick = async (e) => {
    const b = e.target.closest('[data-decide]'); if (!b) return;
    const id = Number(b.closest('[data-ap]').dataset.ap);
    try { await R.decidir(id, b.dataset.decide); aprovacoes = aprovacoes.filter((a) => a.id !== id); agendarInterface(); desenharChat(); if (aba === 'atencao') desenharAtencao(); }
    catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  };
}

// ---------- localizar e detalhe do agente ----------
function localizar(k) {
  const [p, nome] = k.split('|');
  const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome));
  selecionado = k;
  if (b) cam.alvo = [b.x, b.y - 10];
  abrirAba('agente', true);
}
function abrirAgente(b) { selecionado = b.m?.k || `${b.pessoa}|${b.nome}`; cam.alvo = null; abrirAba('agente', aba !== 'agente'); }
async function desenharAgente() {
  const [p, nome] = (selecionado || '').split('|');
  const m = D.mesa(p, nome) || vazioMesa(p, nome);
  const st = D.estadoDe(m.ult ? m : null), mod = modelo(nome, p), meu = p === EU.pessoa;
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const linhas = m.hist.filter((e) => e.texto !== 'esperando você').slice(-40).reverse();
  $('#detalheAgente').innerHTML = `
    <div class="det-topo"><img src="${await retratoDe(nome)}" alt=""><div><h3>${esc(tituloAgente(m))}</h3>
      <div>${tagModelo(nome, p)} <span class="sub">equipe de ${esc(p)}</span></div>
      <div class="estado" style="--cor:${st.cor}"><i>${st.glifo}</i>${st.rot}${m.ult ? ' · ' + D.ha(m.ult.t) : ''}</div></div></div>
    ${mod.descricao ? `<div class="bloco"><h4>O que faz</h4>${esc(mod.descricao)}</div>` : ''}
    ${m.pedido && nome !== 'Orquestrador' ? `<div class="bloco"><h4>Pedido</h4>${esc(frase(m.pedido))}</div>` : ''}
    ${m.ult ? `<div class="bloco"><h4>${st.cls === 'fim' ? 'Entregou' : 'Agora'}</h4>${esc(frase(m.ult))}</div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : ''}
    <div class="linha"><button class="btn" id="irAoAgente">Ir até a mesa</button>${meu ? `<button class="btn forte" id="pedirAgente">${nome === 'Orquestrador' ? 'Conversar' : nome === 'Codex' ? 'Conversar com o Codex' : 'Pedir algo a este agente'}</button>` : ''}</div>
    ${linhas.length ? `<div class="bloco"><h4>Linha do tempo</h4>${linhas.map((e) => `<div class="etapa ${e.tipo}"><span class="h">${D.hora(e.t)}</span><span>${iconePasso(e.ferramenta, e.modo)}</span><span>${esc(frase(e))}</span></div>`).join('')}</div>` : ''}`;
  $('#irAoAgente').onclick = () => { const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome)); if (b) teleportar(b.lugar.x + 24, b.lugar.y); };
  $('#pedirAgente')?.addEventListener('click', () => { if (nome === 'Codex') abrirChatCom('codex'); else { abrirChatCom('claude'); if (nome !== 'Orquestrador') { $('#entrada').value = `Use o sub-agente ${nome} para: `; $('#entrada').focus(); } } });
  $$('#detalheAgente [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
}

// ---------- missões ----------
let filtroMissoes = 'todos';
async function desenharMissoes() {
  filtros($('#filtroMissoes'), filtroMissoes, [['todos', 'Todas'], ...pessoas().map((p) => [p, p]), ['claude', 'Claude'], ['codex', 'Codex'], ['abertas', 'Em andamento']], (f) => { filtroMissoes = f; desenharMissoes(); });
  const busca = $('#buscaMissoes').value.trim().toLowerCase();
  const lista = D.missoes().filter((m) => {
    if (filtroMissoes === 'claude' || filtroMissoes === 'codex') { if (m.alvo !== filtroMissoes) return false; }
    else if (filtroMissoes === 'abertas') { if (m.fim) return false; }
    else if (filtroMissoes !== 'todos' && m.pessoa !== filtroMissoes) return false;
    if (!busca) return true;
    return [m.pedido, m.resposta, m.projeto, ...m.agentes, ...m.nomes, ...m.passos.map((e) => frase(e))].join(' ').toLowerCase().includes(busca);
  }).slice(0, 80);
  if (!lista.length) { $('#listaMissoes').innerHTML = '<div class="vazio">Nenhuma missão ainda. Cada pedido à assistente (no VS Code ou aqui) vira uma missão.</div>'; return; }
  const html = await Promise.all(lista.map(async (m) => {
    const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
    const rostos = await Promise.all([...m.agentes].slice(0, 7).map(async (a) => `<img src="${await retratoDe(a)}" title="${esc(tituloDe(a))}" alt="">`));
    return `<div class="missao" data-mi="${esc(m.id)}" style="--cor:${st.cor}">
      <div class="cab"><span style="color:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT</span>' : '<span class="modelo claude">Claude</span>'}<span>${esc(m.projeto || '')}</span><span class="espaco"></span><span>${D.ha(m.inicio)} · ${D.duracao(m.duracao)}</span></div>
      <div class="ped">${esc(m.pedido)}</div>
      ${m.resposta ? `<div class="res">↳ ${esc(m.resposta)}</div>` : `<div class="res" style="color:${st.cor}">${st.glifo} ${st.rot}${m.passos.length ? ' · ' + esc(frase(m.passos.at(-1))) : ''}</div>`}
      ${rostos.length || m.passos.length ? `<div class="rostos">${rostos.join('')}<span>${m.passos.length} passo(s)${m.miniaturas.length ? ` · ${m.miniaturas.length} resultado(s)` : ''}${m.alertas ? ` · ${m.alertas} permissão(ões)` : ''}</span></div>` : ''}
    </div>`;
  }));
  $('#listaMissoes').innerHTML = html.join('');
  $('#listaMissoes').onclick = (e) => { const d = e.target.closest('[data-mi]'); if (d) { missaoAberta = d.dataset.mi; abrirAba('missao', true); } };
}
async function desenharMissao() {
  const m = D.missoes().find((x) => x.id === missaoAberta);
  if (!m) { $('#detalheMissao').innerHTML = '<div class="vazio">Missão não encontrada.</div>'; return; }
  const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const etapas = await Promise.all(m.passos.map(async (e) => `<div class="etapa ${e.tipo}"><span class="h">${D.hora(e.t)}</span><img src="${await retratoDe(e.agente)}" title="${esc(tituloDe(e.agente))}" alt=""><span><b>${esc(e.agente === 'Orquestrador' ? 'Assistente' : tituloDe(e.agente))}</b> <span class="sub2">${esc(frase(e))}</span></span></div>`));
  $('#detalheMissao').innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;font:14px var(--px);color:var(--fraco);flex-wrap:wrap"><span style="color:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT · Codex</span>' : '<span class="modelo claude">Claude</span>'}<span>${esc(m.projeto || '')}</span>${m.origem ? `<span>· ${m.origem === 'vscode' ? 'VS Code' : 'site'}</span>` : ''}</div>
    <div class="bloco"><h4>Pedido · ${new Date(m.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</h4>${esc(m.pedido)}</div>
    <div class="estado" style="--cor:${st.cor};margin-top:8px"><i>${st.glifo}</i>${st.rot} · ${D.duracao(m.duracao)}${m.agentes.size ? ' · com ' + [...m.agentes].map(tituloDe).join(', ') : ''}</div>
    ${m.resposta ? `<div class="bloco"><h4>Resposta</h4><div class="msg assistente" style="box-shadow:none;background:none;padding:0;max-width:100%">${md(m.resposta)}</div></div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : m.nomes.length ? `<div class="bloco"><h4>Arquivos citados</h4>${m.nomes.map(esc).join(' · ')}</div>` : ''}
    <div class="bloco"><h4>Passo a passo (${m.passos.length})</h4>${etapas.join('') || '<div class="sub" style="text-align:left">Sem passos registrados.</div>'}</div>`;
  $$('#detalheMissao [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
}

// ---------- galeria ----------
let filtroGaleria = 'todos';
async function desenharGaleria() {
  filtros($('#filtroGaleria'), filtroGaleria, [['todos', 'Todos'], ...pessoas().map((p) => [p, p])], (f) => { filtroGaleria = f; desenharGaleria(); });
  const itens = D.galeria().filter((x) => filtroGaleria === 'todos' || x.pessoa === filtroGaleria).slice(0, 60);
  if (!itens.length) { $('#gradeGaleria').innerHTML = '<div class="vazio" style="grid-column:1/-1">Os vídeos e imagens que os agentes entregarem aparecem aqui (a ponte faz as miniaturas).</div>'; return; }
  const urls = await R.urlsMiniaturas(itens.map((x) => x.caminho)).catch(() => []);
  $('#gradeGaleria').innerHTML = itens.map((x, i) => urls[i] ? `<div class="mini-card" data-i="${i}"><div class="${x.video ? 'play' : ''}"><img src="${urls[i]}" alt="" loading="lazy"></div><div>${esc(tituloDe(x.agente))} · ${esc(x.pessoa)} · ${D.ha(x.t)}</div></div>` : '').join('');
  $('#gradeGaleria').onclick = (e) => { const c = e.target.closest('[data-i]'); if (c) abrirMidia(itens[Number(c.dataset.i)], urls[Number(c.dataset.i)], itens[Number(c.dataset.i)].pessoa); };
}
async function abrirMidia(mi, url, pessoa) {
  let original = '';
  if (LOCAL && pessoa === EU.pessoa) {
    try { const lista = await (await fetch('/local/arquivos')).json(); const p = lista.reverse().find((c) => c.split(/[\\/]/).pop() === mi.nome); if (p) original = `/local/arquivo?p=${encodeURIComponent(p)}`; } catch {}
  }
  $('#conteudoLightbox').innerHTML = original && mi.video ? `<video class="lightbox-midia" src="${original}" controls autoplay></video>` : `<img class="lightbox-midia" src="${original || url}" alt=""><p class="sub">${esc(mi.nome)}${!original && mi.video ? ' · miniatura (o vídeo fica no PC de quem fez)' : ''}</p>`;
  $('#lightbox').hidden = false;
}

// ---------- chat: conversas (Claude ou Codex) ----------
const alvoAtual = () => conversas.find((c) => c.id === conversaAtual)?.alvo || 'claude';
function desenharSeletorConversas() {
  const sel = $('#selConversa');
  if (!temSql2) { sel.innerHTML = '<option>Conversa única (rode o SQL 2 para ter várias)</option>'; sel.disabled = true; $('#btnNovaConversa').disabled = true; $('#btnMaisConversa').disabled = true; return; }
  sel.innerHTML = conversas.length ? conversas.map((c) => `<option value="${c.id}" ${c.id === conversaAtual ? 'selected' : ''}>${c.alvo === 'codex' ? '◆ GPT' : '● Claude'} · ${esc(c.titulo)}</option>`).join('') : '<option value="">Nenhuma conversa ainda</option>';
}
async function abrirConversa(id) {
  conversaAtual = id; guarda('conversa', id || 0);
  mensagens = [];
  if (aba !== 'chat') abrirAba('chat');
  try { mensagens = DEMO ? mensagens : await R.carregarChat(id); } catch { mensagens = []; }
  desenharSeletorConversas(); desenharChat();
}
async function abrirChatCom(alvo) {
  abrirAba('chat');
  const recente = conversas.find((c) => c.alvo === alvo);
  if (recente) await abrirConversa(recente.id); else if (temSql2) mostrarNovaConversa(alvo);
  setTimeout(() => $('#entrada').focus(), 0);
}
function mostrarNovaConversa(alvo = 'claude') {
  if (!temSql2) { toast({ titulo: 'Falta o SQL 2', texto: 'Rode supabase/escritorio-2.sql para ter várias conversas.', cor: '#ffd23f' }); return; }
  $('#formNovaConversa').hidden = false;
  $$('#formNovaConversa input[name=alvo]').forEach((r) => { r.checked = r.value === alvo; });
  const projs = estados.get(EU.pessoa)?.info?.projetos || [];
  $('#projetoConversa').innerHTML = (projs.length ? projs : [{ nome: 'genesis-game' }]).map((p) => `<option>${esc(p.nome)}</option>`).join('');
  $('#tituloConversa').value = ''; $('#tituloConversa').focus();
}
async function criarConversa() {
  const titulo = $('#tituloConversa').value.trim() || 'Conversa nova';
  const alvo = $('#formNovaConversa input[name=alvo]:checked')?.value || 'claude';
  try {
    const c = await R.novaConversa({ titulo, alvo, projeto: $('#projetoConversa').value });
    conversas = [c, ...conversas.filter((x) => x.id !== c.id)];
    $('#formNovaConversa').hidden = true;
    await abrirConversa(c.id);
    $('#entrada').focus();
  } catch (e) { toast({ titulo: 'Não criei a conversa', texto: e.message, cor: '#ef6a55' }); }
}
async function menuConversa() {
  const c = conversas.find((x) => x.id === conversaAtual); if (!c) return;
  const novo = prompt('Novo nome da conversa (apague tudo e confirme para APAGAR a conversa):', c.titulo);
  if (novo === null) return;
  if (!novo.trim()) { if (confirm(`Apagar a conversa “${c.titulo}” e as mensagens dela?`)) { await R.apagarConversa(c.id); conversas = conversas.filter((x) => x.id !== c.id); abrirConversa(conversas[0]?.id || null); } return; }
  await R.renomearConversa(c.id, novo.trim()); c.titulo = novo.trim(); desenharSeletorConversas();
}
let chatCarregadoDe = undefined;
async function desenharChatCompleto() {
  desenharSeletorConversas();
  if (!DEMO && chatCarregadoDe !== conversaAtual) { chatCarregadoDe = conversaAtual; try { mensagens = await R.carregarChat(temSql2 ? conversaAtual : null); } catch {} }
  desenharChat();
}
function desenharChat() {
  if (aba !== 'chat' || !EU) return;
  const st = estados.get(EU.pessoa) || {};
  const conv = conversas.find((c) => c.id === conversaAtual);
  const gpt = (conv?.alvo || 'claude') === 'codex';
  $('#alvoAtual').className = `alvo ${gpt ? 'gpt' : 'claude'}`; $('#alvoAtual').textContent = gpt ? 'Codex · GPT' : 'Claude';
  const ponte = st.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3;
  const [cor, txt] = st.pausado ? ['#ef6a55', 'Pausada (Ajustes › tirar a pausa)'] : !ponte ? ['#6f6788', 'Sua ponte está desligada: o pedido roda quando ela ligar (até 3 min)'] : chatOcupado || st.ocupada ? ['#f0973d', 'Trabalhando…'] : ['#4fbf82', `Pronta · ${conv?.projeto || st.projeto || 'genesis-game'}${st.branch ? ' · ⎇ ' + st.branch : ''}`];
  $('#estadoPonte').innerHTML = `<i style="--cor:${cor}"></i>${esc(txt)}`;
  const msgs = $('#msgs'), noFim = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
  // Os passos (ferramentas) entre uma fala e outra viram um bloco recolhível.
  let html = '', passos = [];
  const fecharPassos = () => { if (!passos.length) return; html += `<details class="passos"><summary>› ${passos.length} passo(s): ${esc(passos.at(-1))}</summary>${passos.map((p) => `<div>${esc(p)}</div>`).join('')}</details>`; passos = []; };
  for (const c of mensagens) {
    if (c.de === 'ferramenta') { const j = lerJson(c.texto); passos.push(j.ferramenta ? passo(j.ferramenta, null, j.entrada || {}) : c.texto); continue; }
    fecharPassos();
    if (c.de === 'assistente') html += `<div class="msg assistente ${gpt ? 'gpt' : ''}"><span class="quem">${gpt ? 'Codex' : 'Assistente'}</span>${md(c.texto)}</div>`;
    else html += `<div class="msg ${c.de}">${esc(c.texto)}</div>`;
  }
  fecharPassos();
  const pend = aprovacoes.filter((a) => !conv || a.conversa_id === conv.id || !a.conversa_id);
  html += pend.map(cartaoAprovacao).join('');
  msgs.innerHTML = html || `<div class="vazio">${conv ? `Conversa “${esc(conv.titulo)}” com ${gpt ? 'o Codex (GPT)' : 'a sua assistente (Claude)'}. Peça algo!` : `Oi, ${esc(EU.pessoa)}! Crie uma conversa (+ Nova) para cada tarefa: com a assistente (Claude) ou com o Codex (GPT).`}</div>`;
  ligarAprovacoes(msgs);
  if (noFim) msgs.scrollTop = msgs.scrollHeight;
  $('#btnEnviar').textContent = chatOcupado ? 'Pôr na fila' : 'Enviar';
}
async function enviarChat() {
  const t = $('#entrada').value.trim();
  if (!t) return;
  if (temSql2 && !conversaAtual && !DEMO) {
    const c = await R.novaConversa({ titulo: t.slice(0, 60), alvo: 'claude', projeto: estados.get(EU.pessoa)?.info?.projetos?.[0]?.nome }).catch(() => null);
    if (c) { conversas = [c, ...conversas]; conversaAtual = c.id; chatCarregadoDe = c.id; guarda('conversa', c.id); desenharSeletorConversas(); }
  }
  $('#entrada').value = '';
  mensagens.push({ de: 'eu', texto: t, conversa_id: conversaAtual });
  desenharChat();
  if (DEMO) return;
  try { await R.pedir(t, temSql2 ? conversaAtual : null); chatOcupado = true; versaoMundo = -1; sincronizarMundo(); desenharChat(); }
  catch (e) { toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); $('#entrada').value = t; mensagens.pop(); desenharChat(); }
}

// ---------- mural ----------
function desenharMural() {
  guarda('recadosVistos', Date.now()); $('#badgeMural').hidden = true;
  const cores = window.CORES_RECADO || {};
  $('#listaRecados').innerHTML = recados.map((r, i) => `<div class="recado" style="--cor:${cores[r.cor] || '#ffe58a'};--r:${((i * 37) % 5) - 2}deg"><button data-tirar="${r.id}" title="Tirar do mural">×</button>${esc(r.texto)}<small>${esc(r.pessoa)} · ${D.ha(new Date(r.criado).getTime())}</small></div>`).join('') || '<div class="vazio">Mural vazio. Deixe o primeiro recado!</div>';
}

// ---------- jornal ----------
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const jornalNovo = () => { const j = jornais[0]; return !!j?.conteudo && j.dia === hoje() && guardado('jornalLido', '') !== j.dia; };
function desenharManchete() {
  const j = jornais.find((x) => x.conteudo);
  const el = $('#manchete');
  if (!j) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<small>${j.dia === hoje() ? 'Hoje' : new Date(j.dia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small>${esc(j.conteudo.manchete)}`;
}
function abrirJornal(dia) {
  const j = (dia ? jornais.find((x) => x.dia === dia) : jornais.find((x) => x.conteudo)) || null;
  $('#edicoesJornal').innerHTML = jornais.filter((x) => x.conteudo).map((x) => `<option value="${x.dia}" ${x === j ? 'selected' : ''}>${new Date(x.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</option>`).join('') || '<option>sem edições</option>';
  const c = j?.conteudo;
  if (!c) {
    $('#conteudoJornal').innerHTML = `<div class="cabeca-jornal"><div class="titulo">Diário do Estúdio</div></div><div class="vazio-j">${temSql2 ? 'A primeira edição sai amanhã cedo (depois das 7h), escrita pela ponte de quem estiver ligado. Ou peça agora no botão abaixo.' : 'Rode o supabase/escritorio-2.sql para ligar o jornal.'}</div>`;
  } else {
    if (j.dia === hoje()) guarda('jornalLido', j.dia);
    const data = new Date(j.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#conteudoJornal').innerHTML = `
      <div class="cabeca-jornal"><div class="titulo">Diário do Estúdio</div><div class="edicao"><span>${esc(data)}</span><span>Edição de ${esc(j.gerado_por || 'alguém')}</span><span>Genesis S/A (fictícia)</span></div></div>
      <h1>${esc(c.manchete)}</h1>${c.linha_fina ? `<p class="fina">${esc(c.linha_fina)}</p>` : ''}
      ${c.numeros?.length ? `<div class="numeros">${c.numeros.map((n) => `<div><b>${esc(n.valor)}</b><span>${esc(n.rotulo)}</span></div>`).join('')}</div>` : ''}
      <div class="colunas">${(c.secoes || []).map((s) => `<section><h3>${esc(s.titulo)}</h3>${(s.itens || []).map((i) => `<h4>${esc(i.titulo)}</h4><p>${esc(i.texto)}</p>`).join('')}</section>`).join('')}
      ${c.fofoca ? `<div class="fofoca"><b>Fofocas da firma</b><p>${esc(c.fofoca)}</p></div>` : ''}
      ${c.previsao ? `<section><h3>Previsão do tempo da empresa</h3><p><i>${esc(c.previsao)}</i></p></section>` : ''}</div>`;
  }
  $('#jornal').hidden = false;
  desenharManchete();
}

// ---------- ajuda e legenda ----------
function abrirAjuda() {
  const est = (c) => `<i style="--cor:${D.ESTADOS[c].cor}">${D.ESTADOS[c].glifo}</i><span><b>${D.ESTADOS[c].rot}</b></span>`;
  $('#conteudoAjuda').innerHTML = `
    <div class="ajuda-col">
      <h3>Quem é quem</h3>
      <p><span class="modelo claude">Claude</span> sua assistente e os sub-agentes (Editor, Artista 3D, Revisor…). A etiqueta diz o modelo: Haiku, Sonnet…</p>
      <p><span class="modelo gpt">GPT · Codex</span> o Codex da OpenAI. Tem mesa própria, no tapete verde da sua sala.</p>
      <p><span class="modelo ferramenta">Ferramenta</span> PixelLab, Blender, Render, Godot: aparecem quando alguém usa.</p>
      <p>Cada um tem uma sala de vidro com a assistente na recepção. As baias da sua equipe ficam do lado da sua sala.</p>
      <h3>Estados</h3>
      <div class="legenda">${est('alerta')}${est('erro')}${est('trab')}${est('fim')}${est('livre')}</div>
      <p>Trabalhando, o boneco digita e a tela do PC anima. Livre, às vezes levanta para tomar café.</p>
      <h3>Onde ver as coisas</h3>
      <p><b>Equipe</b>: todo mundo agrupado por atenção. Clique para a câmera ir até a pessoa.</p>
      <p><b>Missões</b>: cada pedido com o passo a passo, quem ajudou, a resposta e os resultados. Tem busca.</p>
      <p><b>Chat</b>: uma conversa por tarefa, com a assistente (Claude) ou com o Codex (GPT). Pedidos de permissão aparecem com Permitir/Negar.</p>
      <p><b>Diário</b>: o jornal do dia (manchete no topo; o jornal fica na mesa do salão).</p>
      <h3>Atalhos</h3>
      <p><kbd>WASD</kbd> anda · <kbd>Shift</kbd> skate · clique no chão para ir · <kbd>E</kbd> fala com quem está perto</p>
      <p><kbd>Tab</kbd> equipe · <kbd>H</kbd> missões · <kbd>C</kbd> chat · <kbd>G</kbd> galeria · <kbd>M</kbd> mural · <kbd>J</kbd> diário · <kbd>?</kbd> esta ajuda</p>
      <p><kbd>Q</kbd> acena · <kbd>K</kbd> vai até o outro · <kbd>1</kbd>–<kbd>6</kbd> emotes · <kbd>+</kbd>/<kbd>−</kbd> zoom · <kbd>Esc</kbd> fecha</p>
    </div>`;
  $('#ajuda').hidden = false;
}

// ---------- ajustes ----------
function desenharAjustes() {
  const st = estados.get(EU.pessoa) || {};
  const notif = 'Notification' in window ? Notification.permission : 'indisponível';
  const info = st.info || {};
  $('#ajustes').innerHTML = `
    <div class="campo"><span>Você</span>${esc(EU.pessoa)} · ${esc(EU.email)}</div>
    <div class="campo"><span>Seu status</span><select id="selStatus"><option value="disponivel">Disponível</option><option value="focado">Focado (não perturbe)</option><option value="ausente">Ausente</option></select></div>
    <div class="campo"><span>Avisos</span>
      <label class="chk"><input type="checkbox" id="chkSom" ${guardado('som', '1') === '1' ? 'checked' : ''}> som quando alguém precisa de você ou termina</label>
      <button class="btn" id="btnNotif" ${notif !== 'default' ? 'disabled' : ''}>${notif === 'granted' ? 'Notificações ligadas ✓' : notif === 'denied' ? 'Notificações bloqueadas no navegador' : 'Ligar notificações do navegador'}</button></div>
    <div class="campo"><span>Emergência</span><button class="btn ${st.pausado ? 'forte' : 'perigo'}" id="btnPausa">${st.pausado ? 'Tirar a pausa da assistente' : 'Pausar a assistente (ninguém manda pedidos)'}</button></div>
    <div class="campo"><span>Sua ponte</span><div class="sub" style="text-align:left">${st.ponte_visto ? `Vista ${D.ha(new Date(st.ponte_visto).getTime())} · projetos: ${esc((info.projetos || []).map((p) => p.nome).join(', ') || '—')} · ffmpeg: ${info.ffmpeg ? 'sim' : 'não'}` : 'Nunca ligada neste login.'}</div></div>
    ${info.agentes?.length ? `<div class="campo"><span>Seus agentes</span>${info.agentes.map((a) => `<div class="sub" style="text-align:left;margin:3px 0">${tagModelo(a.nome, EU.pessoa)} <b>${esc(tituloDe(a.nome))}</b></div>`).join('')}</div>` : ''}
    <div class="campo"><span>Convidar</span><form id="formConvite" class="linha" style="margin:0"><input id="emailConvite" type="email" placeholder="email do Kenny" required style="flex:2;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><input id="nomeConvite" placeholder="Nome" value="Kenny" required style="flex:1;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><button class="btn">Convidar</button></form></div>
    <div class="campo"><span>No iPhone</span><div class="sub" style="text-align:left">Abra o site no Safari › Compartilhar › <b>Adicionar à Tela de Início</b>. Vira um app.</div></div>
    <div class="campo"><span>Atalhos</span><div class="sub" style="text-align:left">WASD/setas anda · Shift skate · clique no chão anda até lá · E fala · Tab equipe · H missões · C chat · G galeria · M mural · J diário · Q acena · K vai até o outro · 1–6 emotes · +/− zoom · Esc fecha</div></div>
    <div class="campo"><span>Créditos</span><div class="sub" style="text-align:left">Arte: <a href="https://github.com/pablodelucca/pixel-agents" target="_blank" rel="noopener" style="color:var(--laranja)">Pixel Agents</a> (MIT), personagens baseados em Metro City (JIK-A-4).</div></div>
    <div class="campo"><button class="btn" id="btnSair">Sair</button></div>`;
  $('#selStatus').value = st.status || 'disponivel';
  $('#selStatus').onchange = (e) => R.mudarStatus(e.target.value);
  $('#chkSom').onchange = (e) => guarda('som', e.target.checked ? '1' : '0');
  $('#btnNotif').onclick = async () => { await Notification.requestPermission(); desenharAjustes(); };
  $('#btnPausa').onclick = async () => { try { await R.pausar(!st.pausado); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#formConvite').onsubmit = async (e) => { e.preventDefault(); try { await R.convidar($('#emailConvite').value, $('#nomeConvite').value.trim()); toast({ titulo: 'Convite feito', texto: 'Quando a pessoa entrar com esse e-mail, já vira membro.', cor: '#4fbf82' }); } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); } };
  $('#btnSair').onclick = async () => { await R.sair(); location.reload(); };
}

// ======================= "enquanto você estava fora" =======================
function mostrarResumo() {
  const visto = Number(guardado('visto', '0'));
  guarda('visto', Date.now());
  if (!visto || Date.now() - visto < 20 * 60e3) return;
  const r = D.resumoDesde(visto);
  if (!r.total) return;
  const ms = D.missoes().filter((m) => m.inicio > visto);
  let html = `<p class="sub" style="text-align:left">Desde ${new Date(visto).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}:</p>`;
  for (const [p, x] of r.porPessoa) {
    const itens = [];
    const doP = ms.filter((m) => m.pessoa === p);
    if (doP.length) itens.push(`<li>${doP.length} missão(ões): ${doP.slice(0, 3).map((m) => `“${esc(m.pedido.slice(0, 60))}”`).join(', ')}</li>`);
    if (x.alertas.length) itens.push(`<li>⚠ ${x.alertas.length} pedido(s) de atenção</li>`);
    for (const [ag, e] of x.prontos) itens.push(`<li>✓ <b>${esc(tituloDe(ag))}</b>: ${esc(frase(e).slice(0, 90))}</li>`);
    if (x.erros.length) itens.push(`<li>× ${x.erros.length} erro(s), o último em ${esc(tituloDe(x.erros.at(-1).agente))}</li>`);
    if (x.arquivos) itens.push(`<li>${x.arquivos} resultado(s) novo(s) na galeria</li>`);
    if (itens.length) html += `<div class="res-pessoa" style="--cor:${corPessoa(p)}"><h3>${esc(p === EU.pessoa ? 'Sua equipe' : 'Equipe de ' + p)}</h3><ul>${itens.slice(0, 9).join('')}</ul></div>`;
  }
  if (jornalNovo()) html += '<p><button class="btn" id="resumoJornal">Ler o Diário de hoje</button></p>';
  $('#textoResumo').innerHTML = html;
  $('#resumo').hidden = false;
  $('#resumoJornal')?.addEventListener('click', () => { $('#resumo').hidden = true; abrirJornal(); });
}

// ======================= modo demonstração (?demo) =======================
async function iniciarDemo() {
  EU = { pessoa: 'Rafael', email: 'demo' };
  membros = [{ pessoa: 'Rafael' }, { pessoa: 'Kenny' }];
  temSql2 = true;
  const ag = Date.now(), ev = (min, pessoa, agente, tipo, texto, extra = {}) => ({ id: Math.random(), t: ag - min * 60e3, pessoa, agente, tipo, texto, sessao: pessoa === 'Rafael' ? 's1' : 's2', projeto: 'genesis-game', ...extra });
  D.adicionar([
    ev(50, 'Rafael', 'Orquestrador', 'inicio', 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex'),
    ev(49, 'Rafael', 'Orquestrador', 'atividade', '', { ferramenta: 'Read', alvo: 'shots.json' }),
    ev(48, 'Rafael', 'editor-de-video', 'pedido', 'Orquestrador pediu: montar Short Raio + Fogo'),
    ev(40, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Bash', alvo: 'Medir cortes ::: node tools/video/beatgrid.mjs', modo: 'executar' }),
    ev(12, 'Rafael', 'Codex', 'fim', 'Nota 8/10: o corte do compasso 3 atrasa; resto limpo.'),
    ev(4, 'Rafael', 'Render', 'inicio', 'Orquestrador: npx remotion render ShortRaioFogo', { ferramenta: 'Bash', alvo: 'npx remotion render ShortRaioFogo' }),
    ev(3, 'Rafael', 'artista-3d', 'alerta', 'pediu permissão: generate_3d', { ferramenta: 'mcp__blender__generate_3d' }),
    ev(2, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Edit', alvo: 'ShortRaioFogo.tsx', modo: 'escrever' }),
    ev(30, 'Rafael', 'balanceador', 'fim', 'Dragão do Inverno: vida -10%, recarga do sopro 6 s'),
    ev(9, 'Kenny', 'Orquestrador', 'inicio', 'Revise o dash do player e rode o teste'),
    ev(8, 'Kenny', 'revisor-godot', 'pedido', 'Orquestrador pediu: revisar player.gd'),
    ev(6, 'Kenny', 'Godot', 'erro', 'SCRIPT ERROR: Invalid call. Nonexistent function "dash" in base "Nil".'),
    ev(1, 'Kenny', 'revisor-godot', 'atividade', '', { ferramenta: 'Read', alvo: 'player.gd', modo: 'ler' }),
    ev(20, 'Kenny', 'explorador', 'fim', 'O dano é calculado em player.gd:strike() e enemy.gd:take_hit()'),
    ev(30, 'Kenny', 'Codex', 'pedido', 'Refatora o sistema de inventário do jogo novo', { origem: 'vscode', sessao: 'cx1' }),
    ev(22, 'Kenny', 'Codex', 'fim', 'Separei Inventory em InventoryModel e InventoryView; 14 arquivos mudaram.', { origem: 'vscode', sessao: 'cx1' }),
  ]);
  estados.set('Rafael', { pessoa: 'Rafael', ponte_visto: new Date().toISOString(), branch: 'gen-186-trailer-v2', projeto: 'genesis-game', info: { projetos: [{ nome: 'genesis-game' }], agentes: [{ nome: 'balanceador', modelo: 'haiku', descricao: 'Ajusta números de gameplay em data/.' }, { nome: 'explorador', modelo: 'haiku' }, { nome: 'revisor-godot', modelo: 'sonnet' }] } });
  estados.set('Kenny', { pessoa: 'Kenny', ponte_visto: new Date().toISOString(), branch: 'v0.2-loja-classes', projeto: 'genesis-game' });
  recados = [{ id: 1, pessoa: 'Kenny', texto: 'Subi o fix do dash na main, pode puxar 🙏', cor: 'azul', criado: new Date(ag - 40 * 60e3).toISOString() }];
  conversas = [{ id: 1, titulo: 'Short Raio + Fogo', alvo: 'claude', projeto: 'genesis-game', atualizado: new Date().toISOString() }, { id: 2, titulo: 'Revisar o inventário', alvo: 'codex', projeto: 'genesis-game', atualizado: new Date().toISOString() }];
  conversaAtual = 1; chatCarregadoDe = 1;
  mensagens = [{ de: 'eu', texto: 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex' }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Read', entrada: { file_path: 'shots.json' } }) }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Agent', entrada: { subagent_type: 'editor-de-video', description: 'montar Short' } }) }, { de: 'assistente', texto: 'Mandei o **Editor** montar o Short (~19 s, corte no compasso). Quando sair o render, peço a nota ao `Codex`.\n- trilha: menu 129 BPM\n- 5 cortes' }];
  aprovacoes = [{ id: 9, ferramenta: 'mcp__blender__generate_3d', detalhe: JSON.stringify({ prompt: 'espada do Gatuno, low poly' }), conversa_id: 1, criado: new Date(ag - 60e3).toISOString(), status: 'pendente' }];
  jornais = [{ dia: hoje(), gerado_por: 'Rafael', conteudo: { manchete: 'Short do Raio + Fogo leva 8/10 do Codex e sai do forno hoje', linha_fina: 'Editor de vídeo vira a madrugada; Revisor encontra um "dash" que não existe', numeros: [{ rotulo: 'commits', valor: '12' }, { rotulo: 'missões', valor: '7' }, { rotulo: 'renders', valor: '3' }], secoes: [{ titulo: 'Genesis', itens: [{ titulo: 'Dragão do Inverno mais justo', texto: 'O Balanceador cortou 10% da vida e a recarga do sopro caiu para 6 s.' }, { titulo: 'Dash fantasma', texto: 'O teste do Godot achou uma chamada a "dash" num objeto vazio. Kenny já subiu a correção.' }] }, { titulo: 'Marketing e YouTube', itens: [{ titulo: 'Raio + Fogo = ?', texto: 'O Short de 19 s com 5 cortes no compasso teve nota 8 do Codex. Falta ajustar o corte 3.' }] }, { titulo: 'Jogo novo', itens: [{ titulo: 'Inventário de cara nova', texto: 'O Codex separou modelo e tela do inventário em 14 arquivos.' }] }], fofoca: 'Fontes não confirmadas dizem que o Explorador passou mais tempo no café do que nas baias. Ele nega: “estava explorando o salão”.', previsao: 'Céu limpo com chance de merge à tarde.' } }];
  mundo = await criarMundo();
  await mundo.criarEu('Rafael', [8.5, 12.6]);
  await sincronizarMundo();
  presentes.set('Kenny', { status: 'disponivel' });
  await mundo.atualizarPessoa('Kenny', { x: 33.5 * T, y: 6.4 * T, dir: 'baixo' });
  montarInterface();
  desenharManchete();
  $('#carregando').hidden = true;
  requestAnimationFrame(laco);
}

const mostrarErro = (e) => { console.error(e); const el = document.querySelector('#textoCarregando'); if (el && !document.querySelector('#carregando').hidden) el.textContent = `Deu erro ao abrir: ${e?.message || e}`; };
addEventListener('error', (e) => mostrarErro(e.error || e.message));
addEventListener('unhandledrejection', (e) => mostrarErro(e.reason));
iniciar().catch(mostrarErro);
