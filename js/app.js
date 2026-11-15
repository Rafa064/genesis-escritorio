// Estúdio Genesis: liga mundo + dados + rede + interface.
import { ORDEM_PESSOAS, COR_PESSOA, tituloDe } from './config.js';
import { T, MW, MH, SALAS, ORDEM_BAIAS, tileDe } from './mapa.js';
import { criarMundo } from './mundo.js';
import { montarPersonagem, retrato } from './arte.js';
import { visualDe } from './personagens.js';
import * as D from './dados.js';
import * as R from './rede.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let EU = null, mundo = null, membros = [], estados = new Map(), recados = [], chat = [], presentes = new Map();
let aba = guardado('aba', 'equipe'), filtroEquipe = 'todos', selecionado = null, chatOcupado = false;

// ======================= login =======================
// Modo demonstração (?demo): dados de exemplo, sem login nem rede.
async function iniciarDemo() {
  EU = { pessoa: 'Rafael', email: 'demo' };
  membros = [{ pessoa: 'Rafael' }, { pessoa: 'Kenny' }];
  const ag = Date.now(), ev = (min, pessoa, agente, tipo, texto, extra = {}) => ({ id: Math.random(), t: ag - min * 60e3, pessoa, agente, tipo, texto, ...extra });
  D.adicionar([
    ev(50, 'Rafael', 'Orquestrador', 'inicio', 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex'),
    ev(48, 'Rafael', 'editor-de-video', 'pedido', 'Orquestrador pediu: montar Short Raio + Fogo'),
    ev(2, 'Rafael', 'editor-de-video', 'atividade', 'editando ShortRaioFogo.tsx', { modo: 'escrever' }),
    ev(12, 'Rafael', 'Codex', 'fim', 'Nota 8/10: o corte do compasso 3 atrasa; resto limpo.'),
    ev(4, 'Rafael', 'Render', 'inicio', 'remotion render ShortRaioFogo'),
    ev(3, 'Rafael', 'artista-3d', 'alerta', 'pediu permissão: generate_3d (Tripo)'),
    ev(30, 'Rafael', 'balanceador', 'fim', 'Dragão do Inverno: vida -10%, recarga do sopro 6 s'),
    ev(9, 'Kenny', 'revisor-godot', 'inicio', 'revisando player.gd'),
    ev(1, 'Kenny', 'revisor-godot', 'atividade', 'lendo player.gd', { modo: 'ler' }),
    ev(20, 'Kenny', 'explorador', 'fim', 'O dano é calculado em player.gd:strike() e enemy.gd:take_hit()'),
    ev(6, 'Kenny', 'Godot', 'erro', 'SCRIPT ERROR: Invalid call. Nonexistent function "dash" in base "Nil".'),
    ev(5, 'Kenny', 'Orquestrador', 'inicio', 'novo pedido'),
  ]);
  estados.set('Rafael', { pessoa: 'Rafael', ponte_visto: new Date().toISOString(), branch: 'gen-186-trailer-v2', projeto: 'genesis-game' });
  estados.set('Kenny', { pessoa: 'Kenny', ponte_visto: new Date().toISOString(), branch: 'v0.2-loja-classes', projeto: 'genesis-game' });
  recados = [{ id: 1, pessoa: 'Kenny', texto: 'Subi o fix do dash na main, pode puxar 🙏', cor: 'azul', criado: new Date(ag - 40 * 60e3).toISOString() }];
  chat = [{ de: 'eu', texto: 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex' }, { de: 'ferramenta', texto: 'chamou editor-de-video: montar Short' }, { de: 'assistente', texto: 'Mandei o Editor montar o Short (~19 s, corte no compasso). Quando sair o render, peço a nota ao Codex.' }];
  mundo = await criarMundo();
  await mundo.criarEu('Rafael', [8.5, 12.6]);
  await sincronizarMundo();
  presentes.set('Kenny', { status: 'disponivel' });
  await mundo.atualizarPessoa('Kenny', { x: 36.5 * T, y: 8.4 * T, dir: 'baixo' });
  montarInterface();
  $('#carregando').hidden = true;
  requestAnimationFrame(laco);
}

async function iniciar() {
  if (new URLSearchParams(location.search).has('demo')) return iniciarDemo();
  let s = await R.sessao();
  if (!s) { $('#carregando').hidden = true; mostrarLogin(); return; }
  try {
    $('#textoCarregando').textContent = 'Entrando…';
    EU = await R.quemSouEu();
    if (!EU?.pessoa) { $('#carregando').hidden = true; mostrarLogin(`Você entrou como ${EU?.email}, mas ainda não foi convidado. Peça para o outro te convidar (Ajustes › Convidar).`); return; }
    $('#textoCarregando').textContent = 'Carregando o escritório…';
    const tudo = await R.carregarTudo();
    membros = tudo.membros; recados = tudo.recados; chat = tudo.chat;
    for (const e of tudo.estado) estados.set(e.pessoa, e);
    D.adicionar(tudo.eventos.map(D.deLinha));
    mundo = await criarMundo();
    const minhaSala = SALAS[Math.max(0, pessoas().indexOf(EU.pessoa))];
    await mundo.criarEu(EU.pessoa, [minhaSala.dono[0], minhaSala.dono[1] + 1.2]);
    await sincronizarMundo();
    R.conectar({ x: mundo.eu.x, y: mundo.eu.y, status: estados.get(EU.pessoa)?.status || 'disponivel' });
    ligarRede();
    montarInterface();
    $('#carregando').hidden = true;
    mostrarResumo();
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
    try { await R.pedirCodigo(email); guarda('email', email); $('#formEmail').hidden = true; $('#formCodigo').hidden = false; $('#codigo').focus(); $('#erroLogin').hidden = true; }
    catch (err) { $('#erroLogin').textContent = `Não consegui mandar: ${err.message}`; $('#erroLogin').hidden = false; }
  };
  $('#formCodigo').onsubmit = async (e) => {
    e.preventDefault();
    try { await R.confirmarCodigo($('#email').value.trim(), $('#codigo').value.trim()); location.reload(); }
    catch (err) { $('#erroLogin').textContent = `Código não aceito: ${err.message}`; $('#erroLogin').hidden = false; }
  };
  $('#voltarEmail').onclick = () => { $('#formEmail').hidden = false; $('#formCodigo').hidden = true; };
  $('#email').value = guardado('email', '');
}

// ======================= quem está onde =======================
function pessoas() {
  const ps = new Set(membros.map((m) => m.pessoa)); if (EU?.pessoa) ps.add(EU.pessoa);
  for (const p of ORDEM_PESSOAS) ps.add(p);
  return [...ps].sort((a, b) => ((ORDEM_PESSOAS.indexOf(a) + 1) || 9) - ((ORDEM_PESSOAS.indexOf(b) + 1) || 9)).slice(0, 2);
}
const corPessoa = (p) => COR_PESSOA[p] || '#9a90a8';
function mesasDoMundo() {
  const ps = pessoas(), eq = D.equipes(), lista = [];
  for (const l of mundo.planta.lugares) {
    const p = ps[l.equipe]; if (!p) continue;
    const mesas = eq.get(p) || new Map();
    let m;
    if (l.nome === '*') {
      const conhecidos = new Set(ORDEM_BAIAS.flat().concat('Orquestrador'));
      m = [...mesas.values()].filter((x) => !conhecidos.has(x.nome)).sort((a, b) => b.ult.t - a.ult.t)[0];
    } else m = mesas.get(l.nome);
    const nome = m?.nome || (l.nome === '*' ? 'agente' : l.nome);
    m ||= { k: `${p}|${nome}`, pessoa: p, nome, titulo: tituloDe(nome), hist: [], miniaturas: [], nomes: [] };
    let st = D.estadoDe(m).cls;
    if (l.assistente && p === EU.pessoa && chatOcupado) st = 'trab';
    lista.push({ id: `${l.equipe}|${l.nome}`, nome: m.nome === 'agente' ? '*' : m.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: p, m });
  }
  return lista;
}
let versaoMundo = -1;
async function sincronizarMundo() {
  if (versaoMundo === D.versaoAtual()) return;
  versaoMundo = D.versaoAtual();
  await mundo.sincronizarAgentes(mesasDoMundo());
}
setInterval(() => { if (mundo) { versaoMundo = -1; sincronizarMundo(); } }, 20e3); // estados envelhecem com o tempo

// ======================= rede =======================
const contagemErros = new Map();
function ligarRede() {
  R.on('evento', (linha) => {
    const e = D.deLinha(linha);
    D.adicionar([e]);
    sincronizarMundo();
    avisarEvento(e);
    agendarInterface();
  });
  R.on('recado', (p) => {
    if (p.eventType === 'INSERT') { recados.unshift(p.new); if (p.new.pessoa !== EU.pessoa) { toast({ titulo: `${p.new.pessoa} deixou um recado`, texto: p.new.texto, cor: corPessoa(p.new.pessoa), acao: () => abrirAba('mural') }); som('recado'); } }
    if (p.eventType === 'DELETE') recados = recados.filter((r) => r.id !== p.old.id);
    agendarInterface();
  });
  R.on('estado', (e) => { estados.set(e.pessoa, e); agendarInterface(); });
  R.on('chat', (c) => { chat.push(c); desenharChat(); if (c.de === 'assistente' && aba !== 'chat') { toast({ titulo: 'Sua assistente respondeu', texto: c.texto.slice(0, 120), cor: '#a785f0', acao: () => abrirAba('chat') }); som('fim'); } });
  R.on('comando', (c) => { chatOcupado = c.status === 'rodando'; versaoMundo = -1; sincronizarMundo(); desenharChat(); });
  R.on('presenca', (st) => {
    presentes = new Map(Object.entries(st).map(([k, v]) => [k, v[0]]));
    for (const p of mundo.pessoas.keys()) if (!presentes.has(p)) mundo.pessoas.delete(p);
    agendarInterface();
  });
  R.on('chegou', (p) => { if (p !== EU.pessoa) { toast({ titulo: `${p} entrou no escritório`, cor: corPessoa(p) }); som('chegou'); } });
  R.on('pos', (d) => { if (d.pessoa && d.pessoa !== EU.pessoa) mundo.atualizarPessoa(d.pessoa, d); });
  R.on('pediuPosicao', () => R.enviarPos(posAtual(), true));
  R.on('emote', ({ pessoa, e }) => mostrarEmote(pessoa, e));
  R.on('aceno', ({ de, para }) => {
    if (para !== EU.pessoa) return;
    som('aceno');
    toast({ titulo: `${de} acenou para você 👋`, texto: 'Clique para ir até ele.', cor: corPessoa(de), acao: () => irAtePessoa(de) });
    notificar(`${de} acenou para você`, 'Abra o escritório para ir até ele.');
    mostrarEmote(de, '👋');
  });
  R.on('conexao', (s) => { $('#area').dataset.conexao = s; });
}
const posAtual = () => ({ x: Math.round(mundo.eu.x), y: Math.round(mundo.eu.y), dir: mundo.eu.dir, skate: mundo.eu.skate, andando: mundo.eu.modo === 'andando' });

// Avisos em três níveis: interromper (som + notificação), marcar (toast), só registrar (feed).
function avisarEvento(e) {
  const meu = e.pessoa === EU.pessoa;
  const titulo = tituloDe(e.agente);
  if (e.tipo === 'alerta' && meu) {
    toast({ titulo: `${titulo} precisa de você`, texto: e.texto, cor: '#ffd23f', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) });
    som('alerta'); notificar(`${titulo} precisa de você`, e.texto);
  } else if (e.tipo === 'erro' && meu) {
    const n = (contagemErros.get(e.agente) || 0) + 1; contagemErros.set(e.agente, n);
    if ([1, 3, 9, 27].includes(n)) { toast({ titulo: `${titulo} deu erro`, texto: e.texto, cor: '#ef6a55', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) }); som('erro'); }
  } else if (e.tipo === 'fim' && e.agente !== 'Orquestrador' && meu) {
    contagemErros.delete(e.agente);
    toast({ titulo: `${titulo} terminou`, texto: e.texto, cor: '#4fbf82', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) });
    som('fim'); if (document.hidden) notificar(`${titulo} terminou`, e.texto);
  } else if (!meu && e.tipo === 'fim' && e.agente !== 'Orquestrador' && (e.miniaturas || []).length) {
    toast({ titulo: `${e.pessoa}: ${titulo} entregou`, texto: e.texto, cor: corPessoa(e.pessoa), acao: () => abrirAba('galeria') });
  }
}

// ======================= som e notificação =======================
let audio = null;
function som(tipo) {
  if (guardado('som', '1') !== '1') return;
  try {
    audio ||= new AudioContext();
    const notas = { alerta: [880, 660, 880], erro: [220, 180], fim: [660, 990], aceno: [523, 659, 784], recado: [740, 988], chegou: [392, 523] }[tipo] || [600];
    notas.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.09); g.gain.exponentialRampToValueAtTime(0.06, audio.currentTime + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.09 + 0.12);
      o.connect(g).connect(audio.destination); o.start(audio.currentTime + i * 0.09); o.stop(audio.currentTime + i * 0.09 + 0.14);
    });
  } catch {}
}
function notificar(titulo, corpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(titulo, { body: String(corpo || '').slice(0, 140), tag: titulo }); } catch {}
}
const retratos = new Map();
async function retratoDe(nome) {
  if (!retratos.has(nome)) retratos.set(nome, montarPersonagem(visualDe(nome)).then((f) => retrato(f, 48).toDataURL()));
  return retratos.get(nome);
}
async function toast({ titulo, texto, cor, agente, acao }) {
  const el = document.createElement('div');
  el.className = 'toast'; el.style.setProperty('--cor', cor || 'var(--borda)');
  el.innerHTML = `${agente ? `<img src="${await retratoDe(agente)}" alt="">` : ''}<div><b>${esc(titulo)}</b>${texto ? `<span>${esc(String(texto).slice(0, 140))}</span>` : ''}</div>`;
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
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { teclas.add(k); cam.alvo = null; if (k.startsWith('arrow')) e.preventDefault(); }
  else if (k === 'e' || k === 'enter') interagir();
  else if (k === 'tab') { e.preventDefault(); alternarAba('equipe'); }
  else if (k === 'c') { e.preventDefault(); abrirAba('chat'); setTimeout(() => $('#entrada').focus(), 0); }
  else if (k === 'g') alternarAba('galeria');
  else if (k === 'm') alternarAba('mural');
  else if (k === 'f') alternarAba('atividade');
  else if (k === 'q') acenarParaOutro();
  else if (k === 'k') irAtePessoa(outraPessoa());
  else if (k === '+' || k === '=') mudarZoom(1);
  else if (k === '-') mudarZoom(-1);
  else if (k === 'escape') fecharGaveta();
  else if (/^[1-6]$/.test(k)) fazerEmote(['👋', '✅', '❓', '☕', '🎉', '🔥'][Number(k) - 1]);
});
addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

function telaParaMundo(ev) {
  const r = tela.getBoundingClientRect();
  return [(ev.clientX - r.left) / zoom + cam.x, (ev.clientY - r.top) / zoom + cam.y];
}
tela.addEventListener('pointerdown', (ev) => {
  tela.focus();
  const [x, y] = telaParaMundo(ev);
  const b = boneconoPonto(x, y);
  if (b) { abrirAgente(b); return; }
  const outro = [...mundo.pessoas.values()].find((p) => Math.abs(p.x - x) < 9 && y > p.y - 30 && y < p.y + 3);
  if (outro) { toast({ titulo: outro.pessoa, texto: 'Aperte Q para acenar.', cor: corPessoa(outro.pessoa) }); return; }
  cam.alvo = null;
  mundo.irAte(x, y);
});
function boneconoPonto(x, y) {
  return [...mundo.agentes.values()].filter((b) => Math.abs(b.x - x) < 9 && y > b.y - 30 && y < b.y + 4).sort((a, b) => b.y - a.y)[0];
}
$('#miniTela').addEventListener('pointerdown', (ev) => {
  const r = ev.target.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * MW * T, y = (ev.clientY - r.top) / r.height * MH * T;
  cam.alvo = null;
  if (!mundo.irAte(x, y)) { cam.alvo = [x, y]; }
});
$('#zoomMais').onclick = () => mudarZoom(1);
$('#zoomMenos').onclick = () => mudarZoom(-1);

let perto = null;
function maisPerto() {
  let melhor = null, dmin = 26;
  for (const b of mundo.agentes.values()) { const d = Math.hypot(b.x - mundo.eu.x, (b.y - mundo.eu.y) * 1.2); if (d < dmin) { dmin = d; melhor = b; } }
  return melhor;
}
function interagir() {
  if (!perto) return;
  if (perto.lugar.assistente && perto.pessoa === EU.pessoa) { abrirAba('chat'); setTimeout(() => $('#entrada').focus(), 0); }
  else abrirAgente(perto);
}

let antes = performance.now(), ultimaPosEnviada = '';
function laco(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
  if (!document.hidden && mundo) {
    if (tela.width !== VW || !tela.width) dimensionar();
    let dx = 0, dy = 0;
    if (teclas.has('a') || teclas.has('arrowleft')) dx -= 1;
    if (teclas.has('d') || teclas.has('arrowright')) dx += 1;
    if (teclas.has('w') || teclas.has('arrowup')) dy -= 1;
    if (teclas.has('s') || teclas.has('arrowdown')) dy += 1;
    mundo.atualizar(dt, { dx, dy, skate: teclas.has('shift') });
    const p = posAtual(), assinatura = `${p.x},${p.y},${p.dir},${p.skate},${p.andando}`;
    if (assinatura !== ultimaPosEnviada) { ultimaPosEnviada = assinatura; R.enviarPos(p); }
    // câmera: segue você (ou o que foi localizado), suave, presa ao mapa
    const [ax, ay] = cam.alvo || [mundo.eu.x, mundo.eu.y - 10];
    const tx = Math.max(Math.min(0, (MW * T - VW) / 2), Math.min(Math.max(MW * T - VW, (MW * T - VW) / 2), ax - VW / 2));
    const ty = Math.max(Math.min(0, (MH * T - VH) / 2), Math.min(Math.max(MH * T - VH, (MH * T - VH) / 2), ay - VH / 2));
    cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
    const c = { x: Math.round(cam.x), y: Math.round(cam.y) };
    mundo.desenhar(g, c, VW, VH);
    const mt = $('#miniTela').getContext('2d'); mundo.desenharMinimapa(mt, 160, 112, c, VW, VH);
    const novo = maisPerto();
    if (novo !== perto) { perto = novo; }
    rotulos(c);
  }
  requestAnimationFrame(laco);
}

// Nomes, balões e emojis por cima do canvas (reaproveitando elementos).
const camada = $('#camada'), poolRotulos = new Map();
function rotulo(id, cls) { let el = poolRotulos.get(id); if (!el) { el = document.createElement('div'); camada.appendChild(el); poolRotulos.set(id, el); } if (el.className !== cls) el.className = cls; el.dataset.v = '1'; return el; }
function pos(el, x, y, c) { el.style.transform = `translate(calc(${Math.round((x - c.x) * zoom)}px - 50%), ${Math.round((y - c.y) * zoom)}px)`; }
const CURTO = { "editor-de-video": "Editor", "criador-de-conteudo": "Criadora", "revisor-godot": "Revisor", "artista-3d": "Artista 3D" };
let hoverId = null;
tela.addEventListener("pointermove", (ev) => { if (!mundo) return; const [x, y] = telaParaMundo(ev); hoverId = boneconoPonto(x, y)?.id || null; tela.style.cursor = hoverId ? "pointer" : "crosshair"; });
function rotulos(c) {
  for (const el of poolRotulos.values()) el.dataset.v = '';
  const visivel = (x, y) => x > c.x - 30 && x < c.x + VW + 30 && y > c.y - 10 && y < c.y + VH + 50;
  for (const b of mundo.agentes.values()) {
    if (!visivel(b.x, b.y)) continue;
    const ehAssist = b.lugar.assistente;
    const sel = b.m?.k === selecionado, foco = sel || b === perto || hoverId === b.id;
    const importante = foco || b.status === 'alerta' || b.status === 'erro' || ehAssist;
    if (!importante && zoom < 3) continue;
    const nome = ehAssist ? (b.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${b.pessoa}`) : CURTO[b.nome] || tituloDe(b.nome === '*' ? 'agente' : b.nome);
    const el = rotulo(b.id + 'n', `nome${b === perto || hoverId === b.id ? ' perto' : ''}${sel ? ' sel' : ''}`);
    if (el.textContent !== nome) el.textContent = nome;
    el.style.left = '0'; el.style.top = '0'; pos(el, b.x, b.y + 2, c);
    const recente = b.m?.ult && Date.now() - b.m.ult.t < 8 * 60e3;
    let fala = '';
    if (ehAssist && b.pessoa === EU.pessoa && chatOcupado) fala = 'pensando…';
    else if (b.m?.ult && (b.status === 'alerta' || foco || (zoom >= 3 && (b.status === 'trab' || b.status === 'fim') && recente))) fala = (b.m.pedido && b.status === 'trab' && b.m.ult.tipo === 'atividade' ? b.m.ult.texto : b.m.ult.texto).slice(0, 72);
    if (fala) {
      const f = rotulo(b.id + 'f', `fala ${b.status}`);
      if (f.textContent !== fala) f.textContent = fala;
      f.style.left = '0'; f.style.top = '0';
      const topo = (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar.dir === 'cima' ? 30 : 14);
      f.style.transform = `translate(calc(${Math.round((b.x - c.x) * zoom)}px - 50%), calc(${Math.round((topo - c.y) * zoom)}px - 100%))`;
    }
  }
  const gente = [...mundo.pessoas.values()];
  if (mundo.eu) gente.push(mundo.eu);
  for (const p of gente) {
    const el = rotulo('g' + p.pessoa, 'nome gente'); el.style.setProperty('--cor', corPessoa(p.pessoa));
    const n = p === mundo.eu ? `${p.pessoa} (você)` : p.pessoa;
    if (el.textContent !== n) el.textContent = n;
    el.style.left = '0'; el.style.top = '0'; pos(el, p.x, p.y + 2, c);
    const em = emotes.get(p.pessoa);
    if (em && em.ate > Date.now()) { const e = rotulo('e' + p.pessoa, 'emoji'); if (e.textContent !== em.e) e.textContent = em.e; e.style.left = `${Math.round((p.x - c.x) * zoom)}px`; e.style.top = `${Math.round((p.y - 36 - c.y) * zoom)}px`; }
  }
  for (const [id, el] of poolRotulos) if (!el.dataset.v) { el.remove(); poolRotulos.delete(id); }
  const dica = $('#dica');
  if (perto && !digitando()) {
    dica.hidden = false;
    const html = perto.lugar.assistente && perto.pessoa === EU.pessoa ? '<b>E</b> conversar com a sua assistente' : `<b>E</b> ver o trabalho de ${esc(perto.lugar.assistente ? 'Assistente de ' + perto.pessoa : tituloDe(perto.nome))}`;
    if (dica.innerHTML !== html) dica.innerHTML = html;
  } else dica.hidden = true;
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
  // procura um tile livre perto do alvo
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
const TITULO_ABA = { equipe: 'Equipe', agente: 'Agente', atencao: 'Precisa de você', galeria: 'Galeria', atividade: 'Atividade', chat: 'Sua assistente', mural: 'Mural de recados', ajustes: 'Ajustes' };
function abrirAba(nome) {
  aba = nome; if (nome !== 'agente') guarda('aba', nome);
  $('#gaveta').classList.remove('fechada');
  $$('[data-painel]').forEach((s) => { s.hidden = s.dataset.painel !== nome; });
  $$('#botoesTopo button').forEach((b) => b.classList.toggle('on', b.dataset.aba === nome || (nome === 'agente' && b.dataset.aba === 'equipe')));
  $('#tituloAba').textContent = TITULO_ABA[nome];
  desenharAba();
  setTimeout(dimensionar, 0);
}
function alternarAba(nome) { if (aba === nome && !$('#gaveta').classList.contains('fechada')) fecharGaveta(); else abrirAba(nome); }
function fecharGaveta() { $('#gaveta').classList.add('fechada'); $$('#botoesTopo button').forEach((b) => b.classList.remove('on')); setTimeout(dimensionar, 0); }
$('#fecharGaveta').onclick = fecharGaveta;
$('#botoesTopo').onclick = (e) => { const b = e.target.closest('button'); if (b) alternarAba(b.dataset.aba); };

let pendenteUI = false;
function agendarInterface() { if (pendenteUI) return; pendenteUI = true; setTimeout(() => { pendenteUI = false; desenharTopo(); desenharAba(); }, 120); }
setInterval(agendarInterface, 15e3);

function montarInterface() {
  $('#barra').onclick = (e) => { const b = e.target.closest('[data-emote]'); if (b) fazerEmote(b.dataset.emote); };
  $('#btnAcenar').onclick = acenarParaOutro;
  $('#btnIrAte').onclick = () => irAtePessoa(outraPessoa());
  $('#formChat').onsubmit = (e) => { e.preventDefault(); enviarChat(); };
  $('#entrada').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(); } };
  $('#btnParar').onclick = () => R.parar();
  $('#btnNova').onclick = async () => { await R.conversaNova(); chat = []; desenharChat(); };
  const CORES = { amarelo: '#ffe58a', rosa: '#ffc2d4', azul: '#bfe0ff', verde: '#c8f0c4' };
  let corRecado = 'amarelo';
  $('#coresRecado').innerHTML = Object.entries(CORES).map(([n, c]) => `<button type="button" data-cor="${n}" style="--cor:${c}" class="${n === corRecado ? 'on' : ''}"></button>`).join('');
  $('#coresRecado').onclick = (e) => { const b = e.target.closest('[data-cor]'); if (!b) return; corRecado = b.dataset.cor; $$('#coresRecado button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#formRecado').onsubmit = async (e) => { e.preventDefault(); const t = $('#textoRecado').value.trim(); if (!t) return; try { await R.recado(t, corRecado); $('#textoRecado').value = ''; } catch (err) { toast({ titulo: 'Não colou', texto: err.message, cor: '#ef6a55' }); } };
  $('#listaRecados').onclick = async (e) => { const b = e.target.closest('[data-tirar]'); if (b) await R.tirarRecado(Number(b.dataset.tirar)); };
  $('#fecharResumo').onclick = () => { $('#resumo').hidden = true; };
  $('#fecharLightbox').onclick = () => { $('#lightbox').hidden = true; $('#conteudoLightbox').innerHTML = ''; };
  window.CORES_RECADO = CORES;
  dimensionar();
  if (innerWidth < 900) fecharGaveta(); else abrirAba(aba === 'agente' ? 'equipe' : aba);
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
    html.push(`<div class="pessoa ${on ? 'on' : ''} ${status === 'focado' ? 'focado' : ''}" data-ir="${esc(p)}" title="${esc(st.commit || '')}"><img src="${await retratoDe(p)}" alt=""><span class="ponto"></span>${esc(p)}<span class="det">${esc(det)}</span></div>`);
  }
  $('#gente').innerHTML = html.join('');
  $('#gente').onclick = (e) => { const d = e.target.closest('[data-ir]'); if (d && d.dataset.ir !== EU.pessoa) irAtePessoa(d.dataset.ir); };
  // contagem por estado (meu time e geral)
  const todos = todosAgentes();
  const n = (cls) => todos.filter((a) => a.st.cls === cls).length;
  const meusAlertas = todos.filter((a) => a.m.pessoa === EU.pessoa && (a.st.cls === 'alerta' || a.st.cls === 'erro')).length;
  $('#resumoTopo').innerHTML = [['alerta', 'precisam de você'], ['trab', 'trabalhando'], ['fim', 'prontos']].map(([c, t]) => `<span class="chip-estado" data-ver="${c}" title="${t}" style="--cor:${D.ESTADOS[c].cor}"><i>${D.ESTADOS[c].glifo}</i>${n(c) + (c === 'alerta' ? n('erro') : 0)}</span>`).join('');
  $('#resumoTopo').onclick = (e) => { const c = e.target.closest('[data-ver]'); if (c) abrirAba(c.dataset.ver === 'alerta' ? 'atencao' : 'equipe'); };
  $('#badgeAtencao').hidden = !meusAlertas; $('#badgeAtencao').textContent = meusAlertas;
  const novosRecados = recados.filter((r) => new Date(r.criado).getTime() > Number(guardado('recadosVistos', '0')) && r.pessoa !== EU.pessoa).length;
  $('#badgeMural').hidden = !novosRecados || aba === 'mural'; $('#badgeMural').textContent = novosRecados;
  document.title = meusAlertas ? `(${meusAlertas}) Estúdio Genesis` : 'Estúdio Genesis';
}

function todosAgentes() {
  const out = [];
  for (const [p, mesas] of D.equipes()) for (const m of mesas.values()) out.push({ m, st: D.estadoDe(m) });
  // agentes que nunca trabalharam também aparecem (como livres)
  for (const p of pessoas()) for (const nome of ORDEM_BAIAS.flat().concat('Orquestrador')) if (nome !== '*' && !D.mesa(p, nome)) out.push({ m: { k: `${p}|${nome}`, pessoa: p, nome, titulo: tituloDe(nome), hist: [], miniaturas: [], nomes: [] }, st: D.estadoDe(null) });
  return out;
}

// ---------- abas ----------
function desenharAba() {
  if (!mundo || $('#gaveta').classList.contains('fechada')) return;
  if (aba === 'equipe') desenharEquipe();
  else if (aba === 'agente') desenharAgente();
  else if (aba === 'atencao') desenharAtencao();
  else if (aba === 'galeria') desenharGaleria();
  else if (aba === 'atividade') desenharAtividade();
  else if (aba === 'chat') desenharChat();
  else if (aba === 'mural') desenharMural();
  else if (aba === 'ajustes') desenharAjustes();
}
async function linhaAgente({ m, st }) {
  const img = await retratoDe(m.nome);
  const titulo = m.nome === 'Orquestrador' ? `Assistente${m.pessoa === EU.pessoa ? '' : ''}` : m.titulo || tituloDe(m.nome);
  const texto = m.ult ? (st.cls === 'trab' && m.pedido && m.ult.tipo === 'atividade' ? `${m.pedido.texto} · ${m.ult.texto}` : m.ult.texto) : 'ainda não trabalhou';
  return `<div class="ag ${selecionado === m.k ? 'sel' : ''}" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}">
    <img src="${img}" alt="">
    <div><div class="n">${esc(titulo)} <small>${esc(m.pessoa)}</small></div><div class="t">${esc(texto)}</div></div>
    <div class="q" style="--cor:${st.cor}"><i>${st.glifo}</i><br>${m.ult ? D.ha(m.ult.t) : ''}</div></div>`;
}
async function desenharEquipe() {
  const fs = ['todos', ...pessoas()];
  $('#filtroEquipe').innerHTML = fs.map((f) => `<button data-f="${esc(f)}" class="${f === filtroEquipe ? 'on' : ''}">${f === 'todos' ? 'Todos' : esc(f)}</button>`).join('');
  $('#filtroEquipe').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filtroEquipe = b.dataset.f; desenharEquipe(); } };
  const lista = todosAgentes().filter((a) => filtroEquipe === 'todos' || a.m.pessoa === filtroEquipe);
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
async function desenharAtencao() {
  const itens = todosAgentes().filter((a) => ['alerta', 'erro'].includes(a.st.cls)).sort((a, b) => (b.m.pessoa === EU.pessoa) - (a.m.pessoa === EU.pessoa) || a.st.ordem - b.st.ordem);
  $('#listaAtencao').innerHTML = itens.length ? (await Promise.all(itens.map(linhaAgente))).join('') : '<div class="vazio">Nada precisa de você agora. ✓</div>';
  $('#listaAtencao').onclick = (e) => { const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k); };
}

// Localizar: a câmera vai até o agente e o painel abre o detalhe.
function localizar(k) {
  const [p, nome] = k.split('|');
  const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.nome === nome || x.m?.nome === nome));
  selecionado = k;
  if (b) cam.alvo = [b.x, b.y - 10];
  abrirAba('agente');
}
function abrirAgente(b) { selecionado = b.m?.k || `${b.pessoa}|${b.nome}`; cam.alvo = null; abrirAba('agente'); }
async function desenharAgente() {
  const [p, nome] = (selecionado || '').split('|');
  const m = D.mesa(p, nome) || { k: selecionado, pessoa: p, nome, titulo: tituloDe(nome), hist: [], miniaturas: [], nomes: [] };
  const st = D.estadoDe(m.ult ? m : null);
  const ehAssist = nome === 'Orquestrador';
  const titulo = ehAssist ? (p === EU.pessoa ? 'Sua assistente' : `Assistente de ${p}`) : m.titulo || tituloDe(nome);
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho));
  const meu = p === EU.pessoa;
  $('#detalheAgente').innerHTML = `
    <div class="linha" style="margin:0 0 10px"><button class="btn" id="voltarEquipe">‹ Equipe</button><span class="espaco"></span><button class="btn" id="irAoAgente">Ir até a mesa</button></div>
    <div class="det-topo"><img src="${await retratoDe(nome)}" alt=""><div><h3>${esc(titulo)}</h3><div class="sub" style="text-align:left">Equipe de ${esc(p)}</div><div class="estado" style="--cor:${st.cor}"><i>${st.glifo}</i>${st.rot}${m.ult ? ' · ' + D.ha(m.ult.t) : ''}</div></div></div>
    ${m.pedido && !ehAssist ? `<div class="bloco"><h4>Pedido</h4>${esc(m.pedido.texto)}</div>` : ''}
    ${m.ult ? `<div class="bloco"><h4>${st.cls === 'fim' ? 'Entregou' : 'Agora'}</h4>${esc(m.ult.texto)}</div>` : '<div class="bloco">Ainda não trabalhou.</div>'}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : m.nomes.length ? `<div class="bloco"><h4>Arquivos</h4>${m.nomes.map(esc).join('<br>')}</div>` : ''}
    ${meu ? `<div class="linha"><button class="btn forte" id="pedirAgente">${ehAssist ? 'Conversar' : 'Pedir algo a este agente'}</button></div>` : ''}
    ${m.hist.length ? `<div class="bloco hist"><h4>Histórico</h4>${m.hist.slice(-25).reverse().map((e) => `<div>${D.hora(e.t)} <b>${esc(e.tipo)}</b> ${esc(e.texto)}</div>`).join('')}</div>` : ''}`;
  $('#voltarEquipe').onclick = () => { selecionado = null; abrirAba('equipe'); };
  $('#irAoAgente').onclick = () => { const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome)); if (b) teleportar(b.lugar.x + 24, b.lugar.y); };
  $('#pedirAgente')?.addEventListener('click', () => { abrirAba('chat'); const e = $('#entrada'); if (!ehAssist) e.value = `Use o sub-agente ${nome} para: `; e.focus(); });
  $$('#detalheAgente [data-mini]').forEach((el) => el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa));
}

let filtroGaleria = 'todos';
async function desenharGaleria() {
  $('#filtroGaleria').innerHTML = ['todos', ...pessoas()].map((f) => `<button data-f="${esc(f)}" class="${f === filtroGaleria ? 'on' : ''}">${f === 'todos' ? 'Todos' : esc(f)}</button>`).join('');
  $('#filtroGaleria').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filtroGaleria = b.dataset.f; desenharGaleria(); } };
  const itens = D.galeria().filter((x) => filtroGaleria === 'todos' || x.pessoa === filtroGaleria).slice(0, 60);
  if (!itens.length) { $('#gradeGaleria').innerHTML = '<div class="vazio" style="grid-column:1/-1">Os vídeos e imagens que os agentes entregarem aparecem aqui (a ponte faz as miniaturas).</div>'; return; }
  const urls = await R.urlsMiniaturas(itens.map((x) => x.caminho));
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

let filtroAtividade = 'todos';
function desenharAtividade() {
  $('#filtroAtividade').innerHTML = ['todos', ...pessoas()].map((f) => `<button data-f="${esc(f)}" class="${f === filtroAtividade ? 'on' : ''}">${f === 'todos' ? 'Todos' : esc(f)}</button>`).join('');
  $('#filtroAtividade').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { filtroAtividade = b.dataset.f; desenharAtividade(); } };
  $('#mostrarMiudos').onchange = desenharAtividade;
  const miudos = $('#mostrarMiudos').checked;
  const itens = D.eventos.filter((e) => (filtroAtividade === 'todos' || e.pessoa === filtroAtividade) && (miudos || e.tipo !== 'atividade')).slice(-150).reverse();
  $('#listaAtividade').innerHTML = itens.map((e) => `<div class="item" style="--cor:${corPessoa(e.pessoa)}"><span class="h">${D.hora(e.t)}</span><span class="q">${esc(e.pessoa)} › ${esc(tituloDe(e.agente))}</span> ${esc(e.texto)}</div>`).join('') || '<div class="vazio">Sem atividade ainda.</div>';
}

// ---------- chat ----------
function desenharChat() {
  if (aba !== 'chat') return;
  const st = estados.get(EU.pessoa) || {};
  const ponte = st.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3;
  const [cor, txt] = st.pausado ? ['#ef6a55', 'Pausada (Ajustes › tirar a pausa)'] : !ponte ? ['#6f6788', 'Sua ponte está desligada: o pedido roda quando ela ligar (até 3 min)'] : chatOcupado || st.ocupada ? ['#f0973d', 'Trabalhando no seu pedido…'] : ['#4fbf82', `Pronta · ${st.projeto || 'genesis-game'}${st.branch ? ' · ⎇ ' + st.branch : ''}`];
  $('#estadoPonte').innerHTML = `<i style="--cor:${cor}"></i>${esc(txt)}`;
  const msgs = $('#msgs'), noFim = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40;
  msgs.innerHTML = chat.length ? chat.map((c) => `<div class="msg ${c.de}">${c.de === 'ferramenta' ? '› ' : ''}${esc(c.texto)}</div>`).join('') : `<div class="vazio">Oi, ${esc(EU.pessoa)}! Peça algo e eu distribuo para a equipe.<br>Você acompanha cada um nas baias.</div>`;
  if (noFim) msgs.scrollTop = msgs.scrollHeight;
  $('#btnEnviar').disabled = chatOcupado;
}
async function enviarChat() {
  const t = $('#entrada').value.trim();
  if (!t || chatOcupado) return;
  $('#entrada').value = '';
  try { await R.pedir(t); chatOcupado = true; versaoMundo = -1; sincronizarMundo(); desenharChat(); }
  catch (e) { toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); $('#entrada').value = t; }
}

// ---------- mural ----------
function desenharMural() {
  guarda('recadosVistos', Date.now()); $('#badgeMural').hidden = true;
  const cores = window.CORES_RECADO || {};
  $('#listaRecados').innerHTML = recados.map((r, i) => `<div class="recado" style="--cor:${cores[r.cor] || '#ffe58a'};--r:${((i * 37) % 5) - 2}deg"><button data-tirar="${r.id}" title="Tirar do mural">×</button>${esc(r.texto)}<small>${esc(r.pessoa)} · ${D.ha(new Date(r.criado).getTime())}</small></div>`).join('') || '<div class="vazio">Mural vazio. Deixe o primeiro recado!</div>';
}

// ---------- ajustes ----------
function desenharAjustes() {
  const st = estados.get(EU.pessoa) || {};
  const notif = 'Notification' in window ? Notification.permission : 'indisponível';
  $('#ajustes').innerHTML = `
    <div class="campo"><span>Você</span>${esc(EU.pessoa)} · ${esc(EU.email)}</div>
    <div class="campo"><span>Seu status</span><select id="selStatus"><option value="disponivel">Disponível</option><option value="focado">Focado (não perturbe)</option><option value="ausente">Ausente</option></select></div>
    <div class="campo"><span>Avisos</span>
      <label class="chk"><input type="checkbox" id="chkSom" ${guardado('som', '1') === '1' ? 'checked' : ''}> som quando alguém precisa de você ou termina</label>
      <button class="btn" id="btnNotif" ${notif !== 'default' ? 'disabled' : ''}>${notif === 'granted' ? 'Notificações ligadas ✓' : notif === 'denied' ? 'Notificações bloqueadas no navegador' : 'Ligar notificações do navegador'}</button></div>
    <div class="campo"><span>Emergência</span><button class="btn ${st.pausado ? 'forte' : 'perigo'}" id="btnPausa">${st.pausado ? 'Tirar a pausa da assistente' : 'Pausar a assistente (ninguém manda pedidos)'}</button></div>
    <div class="campo"><span>Convidar</span><form id="formConvite" class="linha" style="margin:0"><input id="emailConvite" type="email" placeholder="email do Kenny" required style="flex:2;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><input id="nomeConvite" placeholder="Nome" value="Kenny" required style="flex:1;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><button class="btn">Convidar</button></form></div>
    <div class="campo"><span>Atalhos</span><div class="sub" style="text-align:left">WASD/setas anda · Shift skate · clique no chão anda até lá · E fala · Tab equipe · C chat · G galeria · M mural · F atividade · Q acena · K vai até o outro · 1–6 emotes · +/− zoom · Esc fecha</div></div>
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
  let html = `<p class="sub" style="text-align:left">Desde ${new Date(visto).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}:</p>`;
  for (const [p, x] of r.porPessoa) {
    const itens = [];
    if (x.alertas.length) itens.push(`<li>⚠ ${x.alertas.length} pedido(s) de atenção: ${esc(tituloDe(x.alertas.at(-1).agente))}: “${esc(x.alertas.at(-1).texto.slice(0, 80))}”</li>`);
    for (const [ag, e] of x.prontos) itens.push(`<li>✓ <b>${esc(tituloDe(ag))}</b> terminou: ${esc(e.texto.slice(0, 90))}</li>`);
    if (x.erros.length) itens.push(`<li>× ${x.erros.length} erro(s), o último em ${esc(tituloDe(x.erros.at(-1).agente))}</li>`);
    if (x.pedidos) itens.push(`<li>${x.pedidos} pedido(s) à assistente</li>`);
    if (x.arquivos) itens.push(`<li>${x.arquivos} resultado(s) novo(s) na galeria</li>`);
    if (itens.length) html += `<div class="res-pessoa" style="--cor:${corPessoa(p)}"><h3>${esc(p === EU.pessoa ? 'Sua equipe' : 'Equipe de ' + p)}</h3><ul>${itens.slice(0, 8).join('')}</ul></div>`;
  }
  $('#textoResumo').innerHTML = html;
  $('#resumo').hidden = false;
}

iniciar();
