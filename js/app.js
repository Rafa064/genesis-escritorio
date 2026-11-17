// Estúdio Genesis: liga mundo + dados + rede + interface.
import { ORDEM_PESSOAS, COR_PESSOA, tituloDe } from './config.js';
import { T, MW, MH, SALAS, AGENTES_CONHECIDOS, tileDe } from './mapa.js';
import { criarMundo } from './mundo.js';
import { montarPersonagem, retrato } from './arte.js';
import { visualDe } from './personagens.js';
import { frase, passo, iconePasso, resumo, fases, primeiraFrase, categoria } from './humano.js';
import { JOGOS, SETORES, jogoPorId, setorPorId, todosJogos, frente, frentePorId, definirPastas } from './frentes.js';
import { TIPOS, tipoDe, etiquetaTipo, descricaoHumana, conectorDe, nomeConector } from './tipos.js';
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
// Filtros globais (valem para mapa, equipe, missões, histórico e quadro): '' = todos.
let filtroJogo = guardado('fJogo', ''), filtroSetor = guardado('fSetor', '');
const temFiltro = () => !!(filtroJogo || filtroSetor);
const passa = (fr) => (!filtroJogo || fr?.jogo === filtroJogo) && (!filtroSetor || fr?.setor === filtroSetor);
const nomeFiltro = () => [filtroJogo && `${jogoPorId(filtroJogo).icone} ${jogoPorId(filtroJogo).nome}`, filtroSetor && `${setorPorId(filtroSetor).icone} ${setorPorId(filtroSetor).nome}`].filter(Boolean).join(' · ');
function mudarFiltro(jogo, setor) { filtroJogo = jogo; filtroSetor = setor; guarda('fJogo', jogo); guarda('fSetor', setor); desenharHud(); desenharAba(); if (!$('#quadro').hidden) desenharQuadro(); }
if (aba === 'mural') aba = 'dupla';

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
    temQuadro = tudo.temQuadro; marcos = tudo.marcos || []; comentarios = tudo.comentarios || [];
    vinculos = new Map((tudo.vinculos || []).map((v) => [v.missao, v.marco_id]));
    for (const e of tudo.estado) { estados.set(e.pessoa, e); definirPastas(e.pessoa, e.info?.pastas); }
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
    try { await R.pedirCodigo(email); guarda('email', email); $('#formEmail').hidden = true; $('#avisoLink').hidden = false; $('#formCodigo').hidden = false; $('#codigo').value = ''; $('#codigo').focus(); $('#emailEnviado').textContent = email; $('#erroLogin').hidden = true; }
    catch (err) { $('#erroLogin').textContent = `Não consegui mandar: ${err.message}`; $('#erroLogin').hidden = false; }
  };
  $('#reenviar').onclick = () => { $('#formEmail').hidden = false; $('#avisoLink').hidden = true; $('#formCodigo').hidden = true; };
  $('#formCodigo').onsubmit = async (e) => {
    e.preventDefault();
    const cod = $('#codigo').value.replace(/\D/g, '');
    if (cod.length < 6) { $('#erroLogin').textContent = 'O código tem 6 dígitos (ou mais).'; $('#erroLogin').hidden = false; return; }
    try { await R.confirmarCodigo($('#email').value.trim() || guardado('email', ''), cod); location.replace(location.href.split('#')[0]); }
    catch (err) { $('#erroLogin').textContent = /expired|invalid/i.test(err.message) ? 'Código errado ou vencido. Confira o e-mail mais novo ou peça outro.' : 'Não consegui entrar: ' + err.message; $('#erroLogin').hidden = false; }
  };
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
// Onde cada agente fica: assistente e Codex na recepção da sala do dono; quem está trabalhando
// senta numa mesa livre da ala (setor) e da fileira (jogo) da tarefa; quem está livre vai para a copa.
const ocupacao = new Map(); // agente -> id do lugar (para ninguém trocar de mesa à toa)
const TRABALHANDO = ['trab', 'alerta', 'erro'];
function mesasDoMundo() {
  const ps = pessoas(), eq = D.equipes(), lista = [], usados = new Set();
  for (const l of mundo.planta.lugares) {
    const p = ps[l.equipe]; if (!p) continue;
    const m = (l.nome === 'Orquestrador' ? D.abas().find((a) => a.pessoa === p) : null) || eq.get(p)?.get(l.nome) || vazioMesa(p, l.nome);
    let st = D.estadoDe(m.ult ? m : null).cls;
    if (l.assistente && p === EU.pessoa && chatOcupado && alvoAtual() === 'claude') st = 'trab';
    if (l.codex && p === EU.pessoa && chatOcupado && alvoAtual() === 'codex') st = 'trab';
    const fr = TRABALHANDO.includes(st) ? D.frenteDaMesa(m) : null;
    lista.push({ id: m.k, nome: l.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: p, m, anel: fr?.cor });
  }
  const pega = (k, niveis) => {
    for (const nivel of niveis) {
      const livres = nivel.filter((x) => !usados.has(x.id));
      const l = livres.find((x) => x.id === ocupacao.get(k)) || livres[0];
      if (l) { usados.add(l.id); ocupacao.set(k, l.id); return l; }
    }
    return null;
  };
  // as outras abas do Claude (além da que está na recepção) entram como se fossem agentes
  const outrasAbas = ps.flatMap((p) => D.abas().filter((a) => a.pessoa === p).slice(1));
  const outros = [...ps.flatMap((p) => [...(eq.get(p) || new Map()).values()].filter((m) => m.nome !== 'Orquestrador' && m.nome !== 'Codex')), ...outrasAbas];
  const comEstado = outros.map((m) => ({ m, st: D.estadoDe(m).cls })).sort((a, b) => b.m.ult.t - a.m.ult.t);
  const A = mundo.planta.assentos;
  for (const { m, st } of comEstado.filter((x) => TRABALHANDO.includes(x.st))) {
    const fr = D.frenteDaMesa(m) || frente('genesis', 'criacao');
    const l = pega(m.k, [A.filter((a) => a.setor === fr.setor && a.jogo === fr.jogo), A.filter((a) => a.setor === fr.setor), A]);
    if (l) lista.push({ id: m.k, nome: m.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: m.pessoa, m, anel: fr.cor });
  }
  // Na copa: quem trabalhou nas últimas 24 h (os outros nem aparecem no mapa).
  for (const { m, st } of comEstado.filter((x) => !TRABALHANDO.includes(x.st) && Date.now() - x.m.ult.t < 24 * 3600e3)) {
    const l = pega(m.k, [mundo.planta.copa]);
    if (l) lista.push({ id: m.k, nome: m.nome, lugar: l, status: st === 'fim' ? 'fim' : 'livre', ferramenta: null, pessoa: m.pessoa, m });
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
    if (p.eventType === 'INSERT' && !recados.some((r) => r.id === p.new.id)) {
      recados.unshift(p.new);
      if (p.new.cor !== 'reacao') balaoPessoa(p.new.pessoa, p.new.cor === 'missao' ? '📎 ' + (lerJson(p.new.texto).titulo || 'missão') : p.new.texto);
      if (p.new.pessoa !== EU.pessoa) {
        const r = p.new, txt = r.cor === 'reacao' ? `reagiu ${r.texto.split(' ')[0]}` : r.cor === 'missao' ? `compartilhou: ${lerJson(r.texto).titulo || 'uma missão'}` : r.texto;
        toast({ titulo: r.cor === 'reacao' ? `${r.pessoa} ${txt}` : `${r.pessoa} na conversa da dupla`, texto: r.cor === 'reacao' ? '' : txt, cor: corPessoa(r.pessoa), acao: () => abrirAba('dupla') });
        if (r.cor !== 'reacao') { som('recado'); notificar(`${r.pessoa} mandou mensagem`, txt); }
      }
    }
    if (p.eventType === 'DELETE') recados = recados.filter((r) => r.id !== p.old.id);
    if (aba === 'dupla') desenharDupla(); else agendarInterface();
  });
  R.on('estado', (e) => { estados.set(e.pessoa, { ...estados.get(e.pessoa), ...e }); if (e.info?.pastas) { definirPastas(e.pessoa, e.info.pastas); D.mudou(); } agendarInterface(); if (aba === 'atencao') desenharAtencao(); });
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
  R.on('marco', (p) => {
    if (p.eventType === 'DELETE') marcos = marcos.filter((x) => x.id !== p.old.id);
    else { const i = marcos.findIndex((x) => x.id === p.new.id); if (i >= 0) marcos[i] = p.new; else marcos.push(p.new); if (p.eventType === 'UPDATE' && p.new.coluna === 'feito' && p.old?.coluna !== 'feito') toast({ titulo: `🏁 Marco concluído: ${p.new.titulo}`, cor: '#4fbf82' }); }
    mudouMarcos(); desenharQuadro(); if (aba === 'marco') desenharMarco(); agendarInterface();
  });
  R.on('vinculo', (p) => { if (p.eventType === 'DELETE') vinculos.delete(p.old.missao); else vinculos.set(p.new.missao, p.new.marco_id); mudouMarcos(); desenharQuadro(); if (aba === 'marco') desenharMarco(); if (aba === 'missao') desenharMissao(); agendarInterface(); });
  R.on('comentario', (p) => {
    if (p.eventType === 'DELETE') comentarios = comentarios.filter((c) => c.id !== p.old.id);
    else if (!comentarios.some((c) => c.id === p.new.id)) { comentarios.push(p.new); if (p.new.pessoa !== EU.pessoa) { const mc = marcos.find((x) => x.id === p.new.marco_id); toast({ titulo: `${p.new.pessoa} comentou em 🏁 ${mc?.titulo || 'um marco'}`, texto: p.new.texto, cor: corPessoa(p.new.pessoa), acao: () => abrirMarco(p.new.marco_id) }); som('recado'); } }
    if (aba === 'marco') desenharMarco();
  });
  R.on('jornal', (j) => { if (!j?.dia) return; jornais = [j, ...jornais.filter((x) => x.dia !== j.dia)].sort((a, b) => b.dia.localeCompare(a.dia)); desenharManchete(); if (!$('#jornal').hidden) abrirJornal(j.dia); });
  R.on('presenca', (st) => { presentes = new Map(Object.entries(st).map(([k, v]) => [k, v[0]])); for (const p of mundo.pessoas.keys()) if (!presentes.has(p)) mundo.pessoas.delete(p); agendarInterface(); });
  R.on('conexao', (s) => { if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) setTimeout(ressincronizar, 4000); });
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
  // no celular (em pé), o mapa preenche a altura da tela; dá para arrastar para os lados
  if (!zoom) zoom = w >= 1500 ? 3 : w <= 760 ? Math.max(1, h / (MH * T)) : 2;
  zoom = Math.max(1, Math.min(5, zoom));
  VW = Math.ceil(w / zoom); VH = Math.ceil(h / zoom);
  tela.width = VW; tela.height = VH;
  tela.style.width = `${VW * zoom}px`; tela.style.height = `${VH * zoom}px`;
  $('#camada').style.setProperty('--z', zoom);
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
  else if (k === 'm') { alternarAba('dupla'); setTimeout(() => aba === 'dupla' && $('#textoRecado').focus(), 0); }
  else if (k === 'l') alternarAba('historico');
  else if (k === 'i') alternarAba('catalogo');
  else if (k === 'b') { if ($('#quadro').hidden) abrirQuadro(); else fecharQuadro(); }
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
const boneconoPonto = (x, y) => [...mundo.agentes.values()].filter((b) => Math.abs(b.x - x) < (zoom < 2 ? 13 : 9) && y > b.y - 32 && y < b.y + 6).sort((a, b) => b.y - a.y)[0];
// Pontos de interesse do mapa: mural (lousa) e jornal (mesa do salão).
const PONTOS = [
  { id: 'mural', x: 15 * T, y: 2.4 * T, raio: 26, texto: 'abrir a conversa da dupla (mural)', acao: () => abrirAba('dupla') },
  { id: 'jornal', x: 19 * T, y: 5.2 * T, raio: 30, texto: 'ler o Diário do Estúdio', acao: () => abrirJornal() },
];
const dedos = new Map(); let gesto = null;
tela.addEventListener('pointerdown', (ev) => {
  if (!mundo) return;
  tela.focus();
  dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (dedos.size === 2) { const [a, b] = [...dedos.values()]; gesto = { pinca: Math.hypot(a.x - b.x, a.y - b.y), zoom }; return; }
  gesto = { x0: ev.clientX, y0: ev.clientY, cx: cam.x + VW / 2, cy: cam.y + VH / 2, moveu: false, ev };
  try { tela.setPointerCapture(ev.pointerId); } catch {}
});
tela.addEventListener('pointermove', (ev) => {
  if (!dedos.has(ev.pointerId) || !gesto) return;
  dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (gesto.pinca && dedos.size === 2) {
    const [a, b] = [...dedos.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const alvo = Math.max(1, Math.min(4, Math.round(gesto.zoom * d / gesto.pinca * 4) / 4));
    if (alvo !== zoom) { const centro = [cam.x + VW / 2, cam.y + VH / 2]; zoom = alvo; guarda('zoom', zoom); dimensionar(); cam.alvo = centro; }
    return;
  }
  const dx = ev.clientX - gesto.x0, dy = ev.clientY - gesto.y0;
  if (!gesto.moveu && Math.hypot(dx, dy) < 10) return;
  gesto.moveu = true;
  cam.alvo = [gesto.cx - dx / zoom, gesto.cy - dy / zoom];
});
const soltar = (ev) => {
  dedos.delete(ev.pointerId);
  const g = gesto; if (!dedos.size) gesto = null;
  if (!g || g.pinca || g.moveu || ev.type === 'pointercancel') return;
  tocarMapa(g.ev);
};
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);
function tocarMapa(ev) {
  const [x, y] = telaParaMundo(ev);
  const b = boneconoPonto(x, y);
  if (b) { abrirAgente(b); return; }
  const ponto = PONTOS.find((p) => Math.hypot(p.x - x, p.y - y) < 18);
  if (ponto) { ponto.acao(); return; }
  const outro = [...mundo.pessoas.values()].find((p) => Math.abs(p.x - x) < 9 && y > p.y - 30 && y < p.y + 3);
  if (outro) { toast({ titulo: outro.pessoa, texto: 'Aperte Q para acenar.', cor: corPessoa(outro.pessoa) }); return; }
  cam.alvo = null;
  mundo.irAte(x, y);
}
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
function nomeBase(b) {
  if (b.m?.aba && !b.lugar.assistente) return tituloAgente(b.m);
  if (b.lugar.assistente) return b.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${b.pessoa}`;
  if (b.lugar.codex) return b.pessoa === EU.pessoa ? 'Codex · GPT' : `Codex de ${b.pessoa}`;
  return CURTO[b.nome] || tituloDe(b.nome === '*' ? 'agente' : b.nome);
}
// No mapa: ícone do tipo (👑 assistente, 🤖 agente, 🧠 GPT, 🔌 conector, 🛠️ programa) + ícone da frente quando está trabalhando.
function nomeNoMapa(b) {
  const nome = b.m?.nome || b.nome, tipo = b.lugar.assistente ? 'assistente' : b.lugar.codex ? 'ia' : tipoDe(nome);
  const fr = ['trab', 'alerta', 'erro'].includes(b.status) ? D.frenteDaMesa(b.m) : null;
  return `${TIPOS[tipo].icone} ${nomeBase(b)}${fr ? ' · ' + fr.icone : ''}`;
}
const foraDoFiltro = (b) => temFiltro() && !passa(D.frenteDaMesa(b.m));
function rotulos(c) {
  for (const el of poolRotulos.values()) el.dataset.v = '';
  const visivel = (x, y) => x > c.x - 30 && x < c.x + VW + 30 && y > c.y - 10 && y < c.y + VH + 50;
  for (const b of mundo.agentes.values()) {
    if (!visivel(b.x, b.y)) continue;
    const sel = b.m?.k === selecionado, foco = sel || b === perto || hoverId === b.id;
    const fixo = b.lugar.assistente || b.lugar.codex;
    const ativo = TRABALHANDO.includes(b.status) && !b.lugar.copa, cel = innerWidth <= 760;
    if (!(foco || (ativo && !cel) || b.status === 'alerta' || (fixo && !cel)) && zoom < 3) continue;
    const fam = modelo(b.m?.nome || b.nome, b.pessoa).familia;
    const el = rotulo(b.id + 'n', `nome${b === perto || hoverId === b.id ? ' perto' : ''}${sel ? ' sel' : ''}${fam === 'gpt' ? ' gpt' : ''}${b.lugar.assistente ? ' claude-assist' : ''}${foraDoFiltro(b) && !foco ? ' fora' : ''}`);
    const nome = nomeNoMapa(b);
    if (el.textContent !== nome) el.textContent = nome;
    colocar(el, b.x, b.y + 2, c);
    const recente = b.m?.ult && Date.now() - b.m.ult.t < 8 * 60e3;
    let fala = '', curta = false;
    if ((b.lugar.assistente || b.lugar.codex) && b.pessoa === EU.pessoa && chatOcupado && alvoAtual() === (b.lugar.codex ? 'codex' : 'claude')) fala = 'pensando…';
    else if (b.m?.ult && (foco || b.status === 'alerta')) fala = primeiraFrase(frase(b.m.ult), 80);
    else if (b.m?.ult && ativo && !cel && !foraDoFiltro(b) && b.modo === 'sentado') { const t = D.emSegundoPlano(b.m) ? 'segundo plano…' : primeiraFrase(frase(b.m.ult), 34); fala = `${b.status === 'erro' ? '❌' : ICONE_CAT[categoria(b.m.ult)] || '⚙️'} ${t}`; curta = true; }
    if (fala) {
      const f = rotulo(b.id + 'f', `fala ${b.status}${curta ? ' curta' : ''}`);
      if (f.textContent !== fala) f.textContent = fala;
      colocar(f, b.x, (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar.dir === 'cima' ? 30 : 14), c, true);
    }
  }
  // placas das alas, das fileiras (jogo) e da copa
  for (const [i, p] of mundo.planta.placas.entries()) {
    if (!visivel(p.x, p.y) || (innerWidth <= 760 && p.jogo)) continue;
    const apagada = (p.setor && filtroSetor && p.setor !== filtroSetor) || (p.jogo && filtroJogo && p.jogo !== filtroJogo);
    const el = rotulo('placa' + i, `placa${p.setor ? ' ' + p.setor : ''}${p.jogo ? ' jogo' : ''}${p.copa ? ' copa' : ''}${apagada ? ' fora' : ''}`);
    const txt = p.jogo ? `${jogoPorId(p.jogo).icone}` : p.texto;
    if (el.textContent !== txt) { el.textContent = txt; el.title = p.jogo ? jogoPorId(p.jogo).nome : ''; }
    if (p.jogo) el.style.setProperty('--cor', jogoPorId(p.jogo).cor);
    colocar(el, p.x, p.y, c);
  }
  const gente = [...mundo.pessoas.values()]; if (mundo.eu) gente.push(mundo.eu);
  for (const p of gente) {
    const el = rotulo('g' + p.pessoa, 'nome gente'); el.style.setProperty('--cor', corPessoa(p.pessoa));
    const n = p === mundo.eu ? `${p.pessoa} (você)` : p.pessoa;
    if (el.textContent !== n) el.textContent = n;
    colocar(el, p.x, p.y + 2, c);
    const fl = falasPessoa.get(p.pessoa);
    if (fl && fl.ate > Date.now()) {
      const b = rotulo('fp' + p.pessoa, 'fala-pessoa'); b.style.setProperty('--cor', corPessoa(p.pessoa));
      if (b.textContent !== fl.texto) b.textContent = fl.texto;
      colocar(b, p.x, p.y - 36, c, true);
    }
    const em = emotes.get(p.pessoa);
    if (em && em.ate > Date.now()) { const e = rotulo('e' + p.pessoa, 'emoji'); if (e.textContent !== em.e) e.textContent = em.e; e.style.left = `${Math.round((p.x - c.x) * zoom)}px`; e.style.top = `${Math.round((p.y - 36 - c.y) * zoom)}px`; }
  }
  for (const [id, el] of poolRotulos) if (!el.dataset.v) { el.remove(); poolRotulos.delete(id); }
  const dica = $('#dica');
  let html = '';
  if (perto && !digitando()) {
    if (perto.pessoa === EU.pessoa && perto.lugar.assistente) html = '<b>E</b> conversar com a sua assistente (Claude)';
    else if (perto.pessoa === EU.pessoa && perto.lugar.codex) html = '<b>E</b> conversar com o Codex (GPT)';
    else html = `<b>E</b> ver o trabalho de ${esc(nomeBase(perto))}`;
  } else if (pontoPerto && !digitando()) html = `<b>E</b> ${esc(pontoPerto.texto)}`;
  dica.hidden = !html;
  if (html && dica.innerHTML !== html) dica.innerHTML = html;
}

// ======================= emotes, acenos, ir até =======================
const emotes = new Map(), falasPessoa = new Map();
function balaoPessoa(pessoa, texto) { const t = String(texto || '').replace(/\s+/g, ' ').trim(); if (!t) return; falasPessoa.set(pessoa, { texto: t.length > 90 ? t.slice(0, 88) + '…' : t, ate: Date.now() + Math.min(12000, 4000 + t.length * 90) }); }
function mostrarEmote(pessoa, e) { emotes.set(pessoa, { e, ate: Date.now() + 2600 }); const el = poolRotulos.get('e' + pessoa); if (el) { el.remove(); poolRotulos.delete('e' + pessoa); } }
function fazerEmote(e) { mostrarEmote(EU.pessoa, e); R.emote(e); }
const outraPessoa = () => pessoas().find((p) => p !== EU.pessoa);
function acenarParaOutro() {
  const o = outraPessoa(); if (!o) return;
  if (!presentes.has(o)) { toast({ titulo: `${o} não está no escritório agora`, texto: 'Mande uma mensagem na conversa da dupla.', cor: corPessoa(o), acao: () => abrirAba('dupla') }); return; }
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
const TITULO_ABA = { equipe: 'Equipe', agente: 'Agente', atencao: 'Resumo', missoes: 'Missões por frente', missao: 'Missão', historico: 'Histórico', galeria: 'Galeria', chat: 'Sua assistente', dupla: 'Conversa da dupla', catalogo: 'Quem é quem', mais: 'Mais', ajustes: 'Ajustes', marco: 'Marco' };
function abrirAba(nome, empilhar = false) {
  if (nome === 'mural') nome = 'dupla';
  if (empilhar && aba !== nome && !$('#gaveta').classList.contains('fechada')) pilha.push(aba); else if (!empilhar) pilha.length = 0;
  aba = nome; if (!['agente', 'missao'].includes(nome)) guarda('aba', nome);
  $('#gaveta').classList.remove('fechada');
  $$('[data-painel]').forEach((s) => { s.hidden = s.dataset.painel !== nome; });
  const raiz = { agente: 'equipe', missao: 'missoes' }[nome] || nome;
  const raizCel = ['chat', 'dupla'].includes(nome) ? 'conversas' : nome === 'atencao' ? 'atencao' : '';
  if (['chat', 'dupla'].includes(nome)) guarda('abaConversa', nome);
  $$('[data-seg]').forEach((b) => b.classList.toggle('on', b.dataset.seg === nome));
  $$('#botoesTopo button').forEach((b) => b.classList.toggle('on', b.dataset.aba === raiz || (b.dataset.acao === 'quadro' && !$('#quadro').hidden)));
  $$('#abasCelular button').forEach((b) => b.classList.toggle('on', b.dataset.aba === raizCel));
  $('#tituloAba').textContent = TITULO_ABA[nome];
  $('#voltarGaveta').hidden = !pilha.length;
  $('#gaveta').classList.toggle('folha', nome === 'agente');
  $('#gaveta').classList.toggle('conversa', ['chat', 'dupla'].includes(nome));                         // no celular: ficha na metade de baixo
  $('#gaveta').classList.toggle('raiz', !pilha.length && !['agente', 'missao', 'marco'].includes(nome));
  desenharAba();
  setTimeout(dimensionar, 0);
}
function alternarAba(nome) { if (aba === nome && !$('#gaveta').classList.contains('fechada')) fecharGaveta(); else abrirAba(nome); }
function fecharGaveta() {
  if (innerWidth > 760 && EU) { const c = guardado('abaConversa', 'dupla'); if (aba !== c) { abrirAba(c); return; } } $('#gaveta').classList.add('fechada'); const q = !$('#quadro').hidden; $$('#botoesTopo button, #abasCelular button').forEach((b) => b.classList.toggle('on', q ? b.dataset.acao === 'quadro' : b.dataset.acao === 'mapa')); setTimeout(dimensionar, 0); }
$('#fecharGaveta').onclick = fecharGaveta;
$('#voltarGaveta').onclick = () => { const a = pilha.pop(); if (a) { const resto = [...pilha]; abrirAba(a); pilha.push(...resto); $('#voltarGaveta').hidden = !pilha.length; } };
$('#botoesTopo').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.acao === 'jornal') abrirJornal(); else if (b.dataset.acao === 'quadro') { if ($('#quadro').hidden) abrirQuadro(); else fecharQuadro(); } else alternarAba(b.dataset.aba); };

let pendenteUI = false;
function agendarInterface() { if (pendenteUI) return; pendenteUI = true; setTimeout(() => { pendenteUI = false; desenharTopo(); desenharHud(); if (!['chat', 'dupla'].includes(aba)) desenharAba(); }, 150); }
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
  $('#formRecado').onsubmit = (e) => { e.preventDefault(); enviarDupla(); };
  $('#textoRecado').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarDupla(); } };
  $('#rapidasDupla').innerHTML = RAPIDAS.map((r) => `<button type="button" data-rapida="${esc(r)}">${esc(r)}</button>`).join('');
  $('#rapidasDupla').onclick = (e) => { const b = e.target.closest('[data-rapida]'); if (b) enviarDupla(b.dataset.rapida); };
  $('#fecharResumo').onclick = () => { $('#resumo').hidden = true; };
  $('#fecharLightbox').onclick = () => { $('#lightbox').hidden = true; $('#conteudoLightbox').innerHTML = ''; };
  $('#fecharJornal').onclick = () => { $('#jornal').hidden = true; };
  $('#manchete').onclick = () => abrirJornal();
  $('#edicoesJornal').onchange = (e) => abrirJornal(e.target.value);
  $('#gerarJornal').onclick = async () => { try { await R.pedirJornal(); toast({ titulo: 'Pedi a edição de hoje', texto: 'A ponte escreve em ~1 min (precisa estar ligada).', cor: '#f4ecd8' }); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#buscaMissoes').oninput = () => desenharMissoes();
  $('#abasCelular').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.acao === 'mapa') { fecharGaveta(); fecharQuadro(); } else if (b.dataset.acao === 'quadro') { fecharGaveta(); abrirQuadro(); } else if (b.dataset.aba === 'conversas') abrirAba(guardado('abaConversa', 'dupla')); else { fecharQuadro(); abrirAba(b.dataset.aba); } };
  document.addEventListener('click', (e) => { const sg = e.target.closest('[data-seg]'); if (sg) abrirAba(sg.dataset.seg); });
  $('#sinoCel').onclick = () => abrirAba('atencao');
  $('#menuCel').onclick = () => abrirAba('mais');
  $('#filtrosQuadroCel').onclick = () => $('#quadroFiltros').classList.toggle('abertos');
  $('#pedidosCel').onclick = () => abrirAba('missoes');
  ligarHud(); ligarQuadro();
  if (guardado('quadro', '')) abrirQuadro();
  $('#btnAjuda').onclick = abrirAjuda;
  $('#fecharAjuda').onclick = () => { $('#ajuda').hidden = true; };
  if (!guardado('boasVindas', '')) {
    if (matchMedia('(pointer: coarse)').matches || innerWidth <= 760) $('#boasVindas span').innerHTML = 'Quem está <b>sentado</b> está trabalhando · <b>toque</b> num boneco para ver o que faz · <b>arraste</b> para mover · <b>pinça</b> para zoom';
    $('#boasVindas').hidden = false; $('#fecharBoasVindas').onclick = () => { $('#boasVindas').hidden = true; guarda('boasVindas', '1'); }; }
  dimensionar();
  if (innerWidth <= 760) abrirAba('atencao'); else abrirAba(guardado('abaConversa', 'dupla'));
  registrarSw();
  abrirDeUrl(new URL(location.href));
  $('#vistas').onclick = (e) => { const b = e.target.closest('[data-acao]'); if (!b) return; if (b.dataset.acao === 'quadro') abrirQuadro(); else fecharQuadro(); };
  desenharTopo(); desenharHud();
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
    const det = [on ? (status === 'focado' ? 'focado' : 'no site') : 'fora do site', st.branch ? `⎇ ${st.branch}` : '', ponte ? (st.info?.ausente ? 'PC parado' : 'PC ligado') : 'PC desligado (as IAs dele não estão rodando)'].filter(Boolean).join(' · ');
    html.push(`<div class="pessoa ${on ? 'on' : ''} ${status === 'focado' ? 'focado' : ''} ${ponte ? '' : 'pc-off'}" data-ir="${esc(p)}" title="${esc(det + (st.commit ? ' · último commit: ' + st.commit : ''))}"><img src="${await retratoDe(p)}" alt=""><span class="ponto"></span>${esc(p)}${ponte ? '' : '<span class="zz" title="PC desligado">💤</span>'}</div>`);
  }
  $('#gente').innerHTML = html.join('');
  $('#gente').onclick = (e) => { const d = e.target.closest('[data-ir]'); if (d && d.dataset.ir !== EU.pessoa) irAtePessoa(d.dataset.ir); };
  const todos = todosAgentes();
  const n = (cls) => todos.filter((a) => a.st.cls === cls).length;
  const meusAlertas = todos.filter((a) => a.m.pessoa === EU.pessoa && (a.st.cls === 'alerta' || a.st.cls === 'erro')).length + aprovacoes.length;
  $('#resumoTopo').innerHTML = [['alerta', 'precisam de você'], ['trab', 'trabalhando'], ['fim', 'prontos']].map(([c, t]) => `<span class="chip-estado" data-ver="${c}" title="${t}" style="--cor:${D.ESTADOS[c].cor}"><i>${D.ESTADOS[c].glifo}</i>${n(c) + (c === 'alerta' ? n('erro') + aprovacoes.length : 0)}</span>`).join('');
  $('#resumoTopo').onclick = (e) => { const c = e.target.closest('[data-ver]'); if (c) abrirAba(c.dataset.ver === 'alerta' ? 'atencao' : 'equipe'); };
  $('#badgeAtencao').hidden = !meusAlertas; $('#badgeAtencao').textContent = meusAlertas;
  for (const b of [$('#badgeAtencaoCel'), $('#badgeResumoCel')]) { if (b) { b.hidden = !meusAlertas; b.textContent = meusAlertas; } }
  const novosRecados = recados.filter((r) => r.cor !== 'reacao' && new Date(r.criado).getTime() > Number(guardado('recadosVistos', '0')) && r.pessoa !== EU.pessoa).length;
  for (const el of [$('#badgeMural'), $('#badgeDuplaCel'), ...$$('[data-badge-dupla]')]) { el.hidden = !novosRecados || aba === 'dupla'; el.textContent = novosRecados; }
  document.title = meusAlertas ? `(${meusAlertas}) Estúdio Genesis` : 'Estúdio Genesis';
}
function todosAgentes() {
  const out = [];
  for (const [p, mesas] of D.equipes()) for (const m of mesas.values()) if (m.nome !== 'Orquestrador' || !D.abas().some((a) => a.pessoa === p)) out.push({ m, st: D.estadoDe(m) });
  for (const a of D.abas()) out.push({ m: a, st: D.estadoDe(a) });
  for (const p of pessoas()) for (const nome of [...AGENTES_CONHECIDOS, 'Orquestrador', 'Codex']) if (nome !== '*' && !D.mesa(p, nome)) out.push({ m: vazioMesa(p, nome), st: D.estadoDe(null) });
  return out;
}

// ---------- abas ----------
function desenharAba() {
  if (!mundo || $('#gaveta').classList.contains('fechada')) return;
  ({ equipe: desenharEquipe, agente: desenharAgente, atencao: desenharAtencao, missoes: desenharMissoes, missao: desenharMissao, historico: desenharHistorico, galeria: desenharGaleria, chat: desenharChatCompleto, dupla: desenharDupla, catalogo: desenharCatalogo, mais: desenharMais, ajustes: desenharAjustes, marco: desenharMarco })[aba]?.();
}
function filtros(el, atual, opcoes, fn) {
  el.innerHTML = opcoes.map(([v, t]) => `<button data-f="${esc(v)}" class="${v === atual ? 'on' : ''}">${esc(t)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) fn(b.dataset.f); };
}
const pastaCurta = (a) => String(a.pasta || a.projeto || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'outra aba';
const ehRecepcao = (m) => !m.aba || D.abas().find((a) => a.pessoa === m.pessoa) === m;
const tituloAgente = (m) => m.nome === 'Orquestrador' ? (!ehRecepcao(m) ? `Assistente · ${pastaCurta(m)}` : m.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${m.pessoa}`) : m.nome === 'Codex' ? (m.pessoa === EU.pessoa ? 'Codex' : `Codex de ${m.pessoa}`) : m.titulo || tituloDe(m.nome);
// Etiquetas: tipo (👑 🤖 🧠 🔌 🛠️) + modelo só para quem pensa (Claude Haiku, GPT) + frente atual.
function etiquetasDe(m) {
  const tipo = tipoDe(m.nome), mod = modelo(m.nome, m.pessoa);
  const fr = ['trab', 'alerta', 'erro', 'fim'].includes(D.estadoDe(m.ult ? m : null).cls) ? D.frenteDaMesa(m) : null;
  return `${etiquetaTipo(tipo)}${['agente', 'assistente'].includes(tipo) && mod.rotulo !== 'Claude' ? ` <span class="modelo claude" title="Modelo de IA">${esc(mod.rotulo.replace('Claude ', ''))}</span>` : ''}${fr ? ` ${chipFrente(fr)}` : ''}`;
}
const chipFrente = (f, extra = '') => `<span class="chip-frente" style="--cor:${f.cor}" title="${esc(f.descricao)}">${f.icone} ${esc(f.nome)}${extra}</span>`;
async function linhaAgente({ m, st }) {
  let texto = D.emSegundoPlano(m) ? '⏳ Rodando uma tarefa em segundo plano' : m.ult ? primeiraFrase(frase(m.ult), 120) : modelo(m.nome, m.pessoa).descricao || TIPOS[tipoDe(m.nome)].curta;
  const sobre = m.ult && m.nome !== 'Orquestrador' && m.pedido && st.cls !== 'livre' ? primeiraFrase(frase(m.pedido).replace(/^.*? pediu: /, ''), 90) : '';
  return `<div class="ag ${selecionado === m.k ? 'sel' : ''}" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}">
    <img src="${await retratoDe(m.nome)}" alt="">
    <div><div class="n">${esc(tituloAgente(m))} <small>${esc(m.pessoa)}</small></div><div class="etqs">${etiquetasDe(m)}</div><div class="t">${esc(texto)}</div>${sobre ? `<div class="t sobre">Missão: ${esc(sobre)}</div>` : ''}</div>
    <div class="q" style="--cor:${st.cor}"><i>${st.glifo}</i><br>${m.ult ? D.ha(m.ult.t) : ''}</div></div>`;
}
async function desenharEquipe() {
  filtros($('#filtroEquipe'), filtroEquipe, [['todos', 'Todos'], ...pessoas().map((p) => [p, p]), ['t:agente', '🤖 Agentes'], ['t:fora', '🔌 Conectores e programas'], ['t:ia', '🧠 GPT']], (f) => { filtroEquipe = f; desenharEquipe(); });
  const lista = todosAgentes().filter((a) => {
    const t = tipoDe(a.m.nome);
    if (filtroEquipe === 't:agente' && !['agente', 'assistente'].includes(t)) return false;
    if (filtroEquipe === 't:fora' && !['plugin', 'programa'].includes(t)) return false;
    if (filtroEquipe === 't:ia' && t !== 'ia') return false;
    if (!filtroEquipe.startsWith('t:') && filtroEquipe !== 'todos' && a.m.pessoa !== filtroEquipe) return false;
    if (temFiltro() && !passa(D.frenteDaMesa(a.m))) return false;
    return true;
  });
  const grupos = [['Precisa de você', ['alerta', 'erro'], 'alerta'], ['Trabalhando', ['trab'], 'trab'], ['Pronto', ['fim'], 'fim'], ['Livre', ['espera', 'livre'], 'livre']];
  let html = '';
  for (const [nome, cls, chave] of grupos) {
    const itens = lista.filter((a) => cls.includes(a.st.cls)).sort((a, b) => (b.m.pessoa === EU.pessoa) - (a.m.pessoa === EU.pessoa) || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
    if (!itens.length) continue;
    html += `<div class="grupo" style="--cor:${D.ESTADOS[chave].cor}"><i>${D.ESTADOS[chave].glifo}</i>${nome} · ${itens.length}</div>`;
    html += (await Promise.all(itens.map(linhaAgente))).join('');
  }
  $('#listaEquipe').innerHTML = avisoFiltro() + (html || `<div class="vazio">${temFiltro() ? 'Ninguém trabalhando aqui agora.' : 'Ninguém por aqui ainda.'}</div>`);
  $('#listaEquipe').onclick = (e) => { if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro(); const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k); };
}
const avisoFiltro = () => temFiltro() ? `<div class="aviso-filtro" style="--cor:${filtroJogo ? jogoPorId(filtroJogo).cor : setorPorId(filtroSetor).cor}">Só <b>${esc(nomeFiltro())}</b><button data-tirar-filtro title="Ver tudo">× ver tudo</button></div>` : '';
function tirarFiltro() { mudarFiltro('', ''); }

// ---------- Resumo (caixa de entrada): precisa de você › travou › rodando › pronto ----------
// É a primeira tela no celular: responde "alguém precisa de mim? o que ficou pronto? o que travou?".
const pcLigado = (p) => { const st = estados.get(p); return !!st?.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3; };
const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIphoneSemApp = () => /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
async function cartaoAvisos() {
  const st = estados.get(EU.pessoa) || {}, info = st.info || {};
  const ligado = pcLigado(EU.pessoa);
  const linhaPc = ligado
    ? `<span class="pc on">🖥️ Seu PC está ligado${info.ausente ? ' · parado há mais de 5 min' : ''}</span>`
    : `<span class="pc off">💤 Seu PC está desligado ou sem a ponte${st.ponte_visto ? ' (visto ' + D.ha(new Date(st.ponte_visto).getTime()) + ')' : ''}: pedidos pelo chat ficam esperando</span>`;
  let notif = '';
  const minhaInscricao = await inscricaoAtual();
  const temNoPc = (info.push || []).some((x) => x.endpoint === minhaInscricao?.endpoint);
  if (!pushSuportado()) notif = ehIphoneSemApp() ? '<p class="dica-av">Para receber avisos no iPhone: Safari › Compartilhar › <b>Adicionar à Tela de Início</b> e abra pelo ícone.</p>' : '';
  else if (Notification.permission === 'denied') notif = '<p class="dica-av">As notificações estão bloqueadas nos ajustes deste aparelho.</p>';
  else if (!info.vapid) notif = `<p class="dica-av">${ligado ? 'Sua ponte ainda é a versão antiga (sem avisos). Ela atualiza ao reiniciar.' : 'Ligue a ponte no PC para ativar os avisos.'}</p>`;
  else if (!temNoPc) notif = '<button class="btn forte" id="ativarPush">🔔 Avisar neste aparelho</button>';
  else notif = '<span class="ok-av">🔔 Avisos ligados neste aparelho <button class="link" id="testarPush">testar</button> · <button class="link" id="desligarPush">desligar</button></span>';
  return `<div class="cartao-av">${linhaPc}
    <label class="chave-longe"><input type="checkbox" id="chkLonge" ${info.longe ? 'checked' : ''} ${ligado ? '' : 'disabled'}><span><b>Estou longe do PC</b><small>avisa tudo no celular e deixa aprovar daqui${info.longe ? '' : ' (liga sozinho com o PC parado 5 min)'}</small></span></label>
    ${notif}</div>`;
}
async function desenharAtencao() {
  const el = $('#listaAtencao');
  $('#listaAprovacoes').innerHTML = '';
  const meus = (a) => a.m.pessoa === EU.pessoa;
  const todos = todosAgentes();
  const alerta = todos.filter((a) => a.st.cls === 'alerta' && meus(a));
  const travou = todos.filter((a) => a.st.cls === 'erro').sort((a, b) => meus(b) - meus(a));
  const rodando = todos.filter((a) => a.st.cls === 'trab').sort((a, b) => meus(b) - meus(a) || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
  const doze = Date.now() - 12 * 3600e3;
  const prontos = D.missoes().filter((m) => m.fim && m.fim > doze && m.status === 'fim' && (m.resposta || m.miniaturas.length)).slice(0, 12);
  const sec = (ic, t, n, corpo, cls = '') => `<section class="cx ${cls}"><h3>${ic} ${t}${n != null ? ` <small>${n}</small>` : ''}</h3>${corpo}</section>`;
  let html = await cartaoAvisos();
  if (aprovacoes.length || alerta.length) html += sec('🔐', 'Precisa de você', aprovacoes.length + alerta.length, aprovacoes.map(cartaoAprovacao).join('') + (await Promise.all(alerta.map(linhaAgente))).join(''), 'urgente');
  if (travou.length) html += sec('❌', 'Travou', travou.length, (await Promise.all(travou.map(linhaAgente))).join(''));
  html += sec('⚙️', 'Rodando agora', rodando.length, rodando.length ? (await Promise.all(rodando.slice(0, 8).map(linhaCompacta))).join('') + (rodando.length > 8 ? `<button class="link" data-ir-aba="equipe">ver os ${rodando.length}</button>` : '') : '<div class="vazio">Ninguém trabalhando agora.</div>');
  html += sec('✅', 'Pronto nas últimas 12 h', prontos.length, prontos.length ? (await Promise.all(prontos.map(cartaoPronto))).join('') : '<div class="vazio">Nada entregue ainda.</div>');
  el.innerHTML = html;
  ligarAprovacoes(el);
  const antes = el.onclick;
  el.onclick = (e) => {
    if (e.target.closest('[data-decide]')) return antes?.(e);
    const ia = e.target.closest('[data-ir-aba]'); if (ia) return abrirAba(ia.dataset.irAba, true);
    const mi = e.target.closest('[data-missao]'); if (mi) return abrirMissao(mi.dataset.missao);
    const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k);
  };
  $('#ativarPush')?.addEventListener('click', ativarPush);
  $('#desligarPush')?.addEventListener('click', desligarPush);
  $('#testarPush')?.addEventListener('click', () => { const r = navigator.serviceWorker?.ready; r?.then((reg) => reg.showNotification('Estúdio Genesis', { body: 'Assim chegam os avisos. Os de verdade vêm da sua ponte, mesmo com o app fechado.', icon: 'icones/icone-180.png' })); });
  $('#chkLonge')?.addEventListener('change', async (e) => {
    const quer = e.target.checked, gravar = () => R.mudarCampoInfo('longe', quer);
    try { await gravar(); conferirGravado((info) => !!info.longe === quer, gravar); toast({ titulo: e.target.checked ? 'Modo longe ligado' : 'Modo longe desligado', texto: e.target.checked ? 'Avisos e aprovações vêm para cá.' : 'Volta ao normal (liga sozinho com o PC parado).', cor: '#4fbf82' }); }
    catch (err) { e.target.checked = !e.target.checked; toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  });
}
async function linhaCompacta({ m, st }) {
  const fr = D.frenteDaMesa(m);
  const texto = D.emSegundoPlano(m) ? '⏳ tarefa em segundo plano' : m.ult ? primeiraFrase(frase(m.ult), 90) : '';
  const n = D.ativos(m);
  return `<div class="ag-c" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}"><img src="${await retratoDe(m.nome)}" alt=""><div><b>${esc(tituloAgente(m))}${n > 1 ? ` <small class="x2">×${n}</small>` : ''}</b> <small>${esc(m.pessoa)}${fr ? ' · ' + fr.icone + ' ' + esc(fr.nome) : ''}</small><span>${esc(texto)}</span></div><i style="--cor:${st.cor}">${m.ult ? D.ha(m.ult.t) : ''}</i></div>`;
}
async function cartaoPronto(m) {
  const fr = m.frente;
  const urls = m.miniaturas.length ? await R.urlsMiniaturas(m.miniaturas.slice(0, 3).map((x) => x.caminho)).catch(() => []) : [];
  return `<button class="pronto" data-missao="${esc(m.id)}" style="--cor:${fr.cor}">
    <span class="p-top">${fr.icone} ${esc(fr.nome)} · ${esc(m.pessoa)} · ${D.ha(m.fim)}</span>
    <b>${esc(m.titulo)}</b>
    ${m.resposta ? `<span class="p-txt">${esc(primeiraFrase(m.resposta, 160))}</span>` : ''}
    ${urls.filter(Boolean).length ? `<span class="p-minis">${urls.filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</span>` : ''}</button>`;
}
function cartaoAprovacao(a) {
  const entrada = lerJson(a.detalhe);
  const { origem, cortado, ...campos } = entrada;
  const cv = conversas.find((c) => c.id === a.conversa_id);
  const de = origem?.terminal ? `Terminal${origem.projeto ? ' · ' + esc(origem.projeto) : ''}${origem.agente && origem.agente !== 'Orquestrador' ? ' · ' + esc(tituloDe(origem.agente)) : ''}` : cv ? 'Conversa: ' + esc(cv.titulo) : 'Assistente';
  const completo = Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `<div class="aprovacao" data-ap="${a.id}"><b>Posso? ${esc(passo(a.ferramenta, null, campos))}</b>
    <pre class="det">${esc(completo || a.ferramenta)}</pre>${entrada.cortado ? '<div class="cortado">⚠ O pedido é grande demais e foi cortado aqui. Confira no PC antes de permitir.</div>' : ''}
    <div class="sub" style="text-align:left">${de} · ${D.ha(new Date(a.criado).getTime())}</div>
    <div class="linha"><button class="btn verde" data-decide="permitido">Permitir</button><button class="btn perigo" data-decide="negado">Negar</button></div></div>`;
}

// ---------- notificações no aparelho (Web Push mandado pela ponte do PC) ----------
let registroSw = null;
async function registrarSw() {
  if (!('serviceWorker' in navigator) || DEMO) return null;
  try { registroSw = await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { console.warn('sw:', e); }
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.abrir) { abrirDeUrl(new URL(e.data.abrir)); ressincronizar(); } });
  return registroSw;
}
async function inscricaoAtual() { try { const r = registroSw || await navigator.serviceWorker?.getRegistration(); return await r?.pushManager?.getSubscription(); } catch { return null; } }
const b64paraBytes = (b) => { const s = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function ativarPush() {
  try {
    const chave = estados.get(EU.pessoa)?.info?.vapid;
    if (!chave) throw new Error('A ponte do PC ainda não mandou a chave de avisos. Deixe ela ligada e tente de novo.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão negada neste aparelho.');
    if (!registroSw) await registrarSw();
    const reg = await navigator.serviceWorker.ready; // inscrever só com o service worker ativo
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) { await sub.unsubscribe(); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64paraBytes(chave) });
    const j = sub.toJSON(), aparelho = /iphone/i.test(navigator.userAgent) ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computador';
    const gravar = async () => { const i = await R.lerMeuInfo(); await R.mudarCampoInfo('push', [...(i.push || []).filter((x) => x.endpoint !== j.endpoint), { endpoint: j.endpoint, keys: j.keys, aparelho, desde: new Date().toISOString() }].slice(-5)); };
    await gravar();
    conferirGravado((info) => (info.push || []).some((x) => x.endpoint === j.endpoint), gravar);
    toast({ titulo: '🔔 Avisos ligados', texto: 'Quando você estiver longe do PC, os avisos chegam aqui mesmo com o app fechado.', cor: '#4fbf82' });
  } catch (e) { toast({ titulo: 'Não consegui ligar os avisos', texto: e.message, cor: '#ef6a55' }); }
  desenharAtencao();
}
// A ponte regrava o estado.info a cada minuto (lendo antes o que é do site). Se as duas gravações
// cruzarem, a do site pode se perder: confere depois de alguns segundos e grava de novo se sumiu.
function conferirGravado(ok, gravar, tentativas = 3) {
  setTimeout(async () => {
    try {
      const info = await R.lerMeuInfo();
      if (!ok(info) && tentativas > 0) { await gravar(); conferirGravado(ok, gravar, tentativas - 1); }
    } catch {}
  }, 8000);
}
async function desligarPush() {
  const sub = await inscricaoAtual();
  if (sub) { const i = await R.lerMeuInfo().catch(() => ({})); await R.mudarCampoInfo('push', (i.push || []).filter((x) => x.endpoint !== sub.endpoint)).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  desenharAtencao();
}
function abrirDeUrl(u) {
  const a = u.searchParams.get('aba');
  if (!a) return;
  if (a === 'quadro') return abrirQuadro();
  fecharQuadro(); abrirAba(a);
}

// ---------- volta do celular: busca o que chegou enquanto o app dormia ----------
let escondidoDesde = 0, ressincronizando = false, ultimaReconexao = 0;
async function ressincronizar() {
  if (DEMO || ressincronizando || !EU) return;
  ressincronizando = true;
  try {
    const ultimo = D.eventos.at(-1)?.t || Date.now() - 3600e3;
    const idMax = D.eventos.reduce((mx, e) => (typeof e.id === 'number' && e.id > mx ? e.id : mx), 0);
    const n = await R.novidadesDesde(ultimo, idMax);
    D.adicionar(n.eventos.map(D.deLinha));
    if (n.recados) recados = n.recados;
    for (const e of n.estado) { estados.set(e.pessoa, e); definirPastas(e.pessoa, e.info?.pastas); }
    if (n.aprovacoes) aprovacoes = n.aprovacoes;
    if (n.conversas) conversas = n.conversas;
    if (n.jornal) jornais = n.jornal;
    if (n.marcos) { marcos = n.marcos; vinculos = new Map((n.vinculos || []).map((v) => [v.missao, v.marco_id])); comentarios = n.comentarios || comentarios; mudouMarcos(); if (!$('#quadro').hidden) desenharQuadro(); }
    desenharSeletorConversas();
    if (!['joined', 'joining'].includes(R.estadoCanal()) && Date.now() - ultimaReconexao > 30e3) { ultimaReconexao = Date.now(); R.reconectarTabelas(); }
    versaoMundo = -1; sincronizarMundo(); agendarInterface();
    if (['chat', 'dupla', 'atencao'].includes(aba)) desenharAba();
    if (conversaAtual != null && aba === 'chat') abrirConversa(conversaAtual);
  } catch (e) { console.warn('ressincronizar:', e); }
  ressincronizando = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) escondidoDesde = Date.now();
  else if (escondidoDesde && Date.now() - escondidoDesde > 2e3) ressincronizar();
});
addEventListener('online', () => ressincronizar());
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
  const b = [...mundo.agentes.values()].find((x) => x.m?.k === k) || [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome));
  selecionado = k;
  if (b) cam.alvo = [b.x, b.y - 10];
  abrirAba('agente', true);
}
function abrirAgente(b) { selecionado = b.m?.k || `${b.pessoa}|${b.nome}`; cam.alvo = null; abrirAba('agente', aba !== 'agente'); }
async function desenharAgente() {
  let [p, nome] = (selecionado || '').split('|');
  const m = (nome === 'aba' ? D.abas().find((a) => a.k === selecionado) : null) || D.mesa(p, nome) || vazioMesa(p, nome);
  if (nome === 'aba') nome = 'Orquestrador';
  const st = D.estadoDe(m.ult ? m : null), mod = modelo(nome, p), meu = p === EU.pessoa;
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const linhas = m.hist.filter((e) => e.texto !== 'esperando você').slice(-40).reverse();
  $('#detalheAgente').innerHTML = `
    <div class="det-topo"><img src="${await retratoDe(nome)}" alt=""><div><h3>${esc(tituloAgente(m))}</h3>
      <div class="etqs">${etiquetasDe(m)} <span class="sub">equipe de ${esc(p)}</span></div>
      <div class="estado" style="--cor:${st.cor}"><i>${st.glifo}</i>${st.rot}${m.ult ? ' · ' + D.ha(m.ult.t) : ''}</div></div></div>
    <div class="bloco explica" style="--cor:${TIPOS[tipoDe(nome)].cor}"><h4>${TIPOS[tipoDe(nome)].icone} O que é</h4>${esc(mod.descricao ? descricaoHumana(mod.descricao) : TIPOS[tipoDe(nome)].explica)}</div>
    ${m.ult?._m ? `<div class="bloco"><h4>Missão atual</h4><a href="#" class="link-missao" data-abrir-missao="${esc(m.ult._m.id)}">${chipFrente(m.ult._m.frente)} ${esc(m.ult._m.titulo)}</a></div>` : m.pedido && nome !== 'Orquestrador' ? `<div class="bloco"><h4>Pedido</h4>${esc(frase(m.pedido))}</div>` : ''}
    ${m.ult ? `<div class="bloco"><h4>${st.cls === 'fim' ? 'Entregou' : 'Agora'}</h4>${st.cls === 'fim' && m.ult.texto?.length > 160 ? md(m.ult.texto) : esc(frase(m.ult))}</div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : ''}
    <div class="linha"><button class="btn" id="irAoAgente">Ir até a mesa</button>${meu ? `<button class="btn forte" id="pedirAgente">${nome === 'Orquestrador' ? 'Conversar' : nome === 'Codex' ? 'Conversar com o Codex' : 'Pedir algo a este agente'}</button>` : ''}</div>
    ${linhas.length ? `<div class="bloco"><h4>O que andou fazendo</h4>${fases([...linhas].reverse()).reverse().slice(0, 25).map((f) => `<div class="etapa ${esc(f.tipo)}"><span class="h">${D.hora(f.t)}</span><span>${ICONE_CAT[f.cat] || '•'}</span><span>${esc(f.texto)}</span></div>`).join('')}</div>` : ''}`;
  $('#detalheAgente [data-abrir-missao]')?.addEventListener('click', (e) => { e.preventDefault(); abrirMissao(e.currentTarget.dataset.abrirMissao); });
  $('#irAoAgente').onclick = () => { const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome)); if (b) teleportar(b.lugar.x + 24, b.lugar.y); };
  $('#pedirAgente')?.addEventListener('click', () => { if (nome === 'Codex') abrirChatCom('codex'); else { abrirChatCom('claude'); if (nome !== 'Orquestrador') { $('#entrada').value = `Use o sub-agente ${nome} para: `; $('#entrada').focus(); } } });
  $$('#detalheAgente [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
}

// ---------- missões (agrupadas por frente) ----------
const ICONE_CAT = { ler: '📖', escrever: '✏️', cmd: '▶️', web: '🌐', chamar: '🤖', skill: '📘', mcp: '🔌', organizar: '🗒️', alerta: '⚠️', erro: '❌', entrega: '✅', outro: '•' };
let filtroMissoes = 'todos';
const frentesFechadas = new Set(lerJson(guardado('frentesFechadas', '[]')) || []);
function missoesFiltradas() {
  const busca = ($('#buscaMissoes')?.value || '').trim().toLowerCase();
  return D.missoes().filter((m) => {
    if (!passa(m.frente)) return false;
    if (filtroMissoes === 'abertas') { if (m.fim) return false; }
    else if (filtroMissoes !== 'todos' && m.pessoa !== filtroMissoes) return false;
    if (!busca) return true;
    return [m.pedido, m.resposta, m.projeto, m.frente.nome, ...m.agentes, ...m.skills, ...m.conectores, ...m.nomes, ...m.passos.map((e) => frase(e))].join(' ').toLowerCase().includes(busca);
  });
}
async function cartaoMissao(m) {
  const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
  const rostos = await Promise.all([...m.agentes].slice(0, 6).map(async (a) => `<img src="${await retratoDe(a)}" title="${esc(TIPOS[tipoDe(a)].icone + ' ' + tituloDe(a))}" alt="">`));
  const linhas = resumo(m.passos).slice(0, 3);
  return `<div class="missao" data-mi="${esc(m.id)}" style="--cor:${st.cor}">
    <div class="cab"><span class="dono" style="--cor:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT</span>' : ''}<span class="st" style="color:${st.cor}">${st.glifo} ${st.rot}</span><span class="espaco"></span><span>${D.ha(m.inicio)} · ${D.duracao(m.duracao)}</span></div>
    <div class="ped">${esc(m.titulo)}</div>
    ${linhas.length ? `<div class="resumo-linhas">${linhas.map((l) => `<div>${l.icone} ${esc(l.texto)}</div>`).join('')}</div>` : ''}
    ${m.resposta ? `<div class="res">↳ ${esc(primeiraFrase(m.resposta, 180))}</div>` : ''}
    ${rostos.length || m.skills.length || m.conectores.length || m.miniaturas.length ? `<div class="rostos">${rostos.join('')}${m.skills.slice(0, 2).map((s) => `<span class="tipo mini" style="--cor:${TIPOS.skill.cor}">📘 ${esc(s)}</span>`).join('')}${m.conectores.slice(0, 2).map((c) => `<span class="tipo mini" style="--cor:${TIPOS.plugin.cor}">🔌 ${esc(c)}</span>`).join('')}${m.miniaturas.length ? `<span>▣ ${m.miniaturas.length}</span>` : ''}</div>` : ''}
  </div>`;
}
async function desenharMissoes() {
  filtros($('#filtroMissoes'), filtroMissoes, [['todos', 'Todas'], ...pessoas().map((p) => [p, p]), ['abertas', 'Em andamento']], (f) => { filtroMissoes = f; desenharMissoes(); });
  const lista = missoesFiltradas();
  const fr = temFiltro();
  if (!lista.length) { $('#listaMissoes').innerHTML = avisoFiltro() + '<div class="vazio">Nenhuma missão aqui. Cada pedido à assistente (no VS Code ou aqui) vira uma missão e cai sozinho na frente certa.</div>'; return; }
  // Um bloco por frente; a frente com atividade mais recente vem primeiro.
  const grupos = new Map();
  for (const m of lista) { if (!grupos.has(m.frente.id)) grupos.set(m.frente.id, { f: m.frente, ms: [] }); grupos.get(m.frente.id).ms.push(m); }
  let html = avisoFiltro();
  for (const { f, ms } of grupos.values()) {
    const ativas = ms.filter((m) => !m.fim && m.status !== 'espera').length, fechado = !fr && frentesFechadas.has(f.id);
    html += `<div class="bloco-frente" style="--cor:${f.cor}"><button class="cab-frente" data-dobrar="${esc(f.id)}"><span class="ic">${f.icone}</span><b>${esc(f.nome)}</b><span class="cont">${ms.length} missão(ões)${ativas ? ` · <i>${ativas} em andamento</i>` : ''}</span><span class="espaco"></span>${fechado ? '▸' : '▾'}</button>`;
    if (!fechado) html += (await Promise.all(ms.slice(0, fr ? 60 : 6).map((m) => cartaoMissao(m)))).join('') + (!fr && ms.length > 6 ? `<button class="btn ver-mais" data-so-frente="${esc(f.id)}">Ver as ${ms.length} missões de ${esc(f.nome)}</button>` : '');
    html += '</div>';
  }
  $('#listaMissoes').innerHTML = html;
  $('#listaMissoes').onclick = (e) => {
    if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro();
    const dob = e.target.closest('[data-dobrar]');
    if (dob) { const id = dob.dataset.dobrar; if (frentesFechadas.has(id)) frentesFechadas.delete(id); else frentesFechadas.add(id); guarda('frentesFechadas', JSON.stringify([...frentesFechadas])); desenharMissoes(); return; }
    const so = e.target.closest('[data-so-frente]');
    if (so) { const f = frentePorId(so.dataset.soFrente); mudarFiltro(f.jogo, f.setor); return; }
    const d = e.target.closest('[data-mi]'); if (d) abrirMissao(d.dataset.mi);
  };
}
function abrirMissao(id) { missaoAberta = id; abrirAba('missao', true); }
async function desenharMissao() {
  const m = D.missoes().find((x) => x.id === missaoAberta);
  if (!m) { $('#detalheMissao').innerHTML = '<div class="vazio">Missão não encontrada (talvez seja antiga demais: carregue mais no Histórico).</div>'; return; }
  const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const fs = fases(m.passos);
  const linhasFases = await Promise.all(fs.map(async (f) => `<div class="etapa ${esc(f.tipo)}"><span class="h">${D.hora(f.t)}</span><img src="${await retratoDe(f.agente)}" title="${esc(tituloDe(f.agente))}" alt=""><span><b>${esc(f.agente === 'Orquestrador' ? 'Assistente' : tituloDe(f.agente))}</b> <span class="sub2">${ICONE_CAT[f.cat] || ''} ${esc(f.texto)}</span></span></div>`));
  const quem = await Promise.all([...m.agentes].map(async (a) => `<div class="quem-linha"><img src="${await retratoDe(a)}" alt=""><b>${esc(tituloDe(a))}</b>${etiquetaTipo(tipoDe(a))}</div>`));
  const res = resumo(m.passos);
  $('#detalheMissao').innerHTML = `
    <div class="etqs">${chipFrente(m.frente)}<span class="dono" style="--cor:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT · Codex</span>' : ''}<span class="sub">${esc(m.projeto || '')}${m.origem ? ` · pelo ${m.origem === 'vscode' ? 'VS Code' : 'site'}` : ''}</span></div>
    <h3 class="titulo-missao">${esc(m.titulo)}</h3>
    <div class="estado" style="--cor:${st.cor}"><i>${st.glifo}</i>${st.rot} · ${D.duracao(m.duracao)} · ${new Date(m.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
    ${temQuadro ? (() => { const mc = marcoDaMissao(m); const op = marcos.filter((x) => x.coluna !== 'feito' || x === mc); return `<div class="linha-marco">🏁 <select id="marcoDaMissao"><option value="">${mc ? '' : 'sem marco'}</option>${op.map((x) => `<option value="${x.id}" ${x === mc ? 'selected' : ''}>${jogoPorId(x.jogo).icone} ${esc(x.titulo)}</option>`).join('')}<option value="nenhum">não é de marco nenhum</option></select>${mc ? `<a href="#" id="verMarco">ver marco ›</a><span class="sub">${comoPendurou(m)}</span>` : ''}</div>`; })() : ''}
    ${m.resposta ? `<div class="bloco destaque"><h4>✅ Resultado</h4><div class="msg assistente" style="box-shadow:none;background:none;padding:0;max-width:100%">${md(m.resposta)}</div></div>` : ''}
    ${res.length ? `<div class="bloco"><h4>Em resumo</h4><div class="resumo-linhas grande">${res.map((l) => `<div>${l.icone} ${esc(l.texto)}</div>`).join('')}</div></div>` : ''}
    ${quem.length || m.skills.length || m.conectores.length ? `<div class="bloco"><h4>Quem e o quê ajudou</h4>${quem.join('')}
      ${m.skills.map((s) => `<div class="quem-linha"><span class="ic-grande">📘</span><b>${esc(s)}</b>${etiquetaTipo('skill')}</div>`).join('')}
      ${m.conectores.map((c) => `<div class="quem-linha"><span class="ic-grande">🔌</span><b>${esc(c)}</b>${etiquetaTipo('plugin')}</div>`).join('')}</div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : m.nomes.length ? `<div class="bloco"><h4>Arquivos citados</h4>${m.nomes.map(esc).join(' · ')}</div>` : ''}
    <div class="bloco"><h4>Pedido completo</h4>${esc(m.pedido)}</div>
    <div class="linha"><button class="btn" id="compartilharMissao">✉ Mandar para a dupla</button>${m.pessoa === EU.pessoa && m.alvo === 'claude' ? '<button class="btn" id="continuarMissao">✦ Continuar com a assistente</button>' : ''}</div>
    <details class="bloco tecnico"><summary>Passo a passo (${fs.length} fases, ${m.passos.length} passos)</summary>${linhasFases.join('') || '<div class="sub" style="text-align:left">Sem passos registrados.</div>'}</details>`;
  $$('#detalheMissao [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
  $('#compartilharMissao').onclick = () => compartilharMissao(m);
  $('#verMarco')?.addEventListener('click', (e) => { e.preventDefault(); abrirMarco(marcoDaMissao(m).id); });
  $('#marcoDaMissao')?.addEventListener('change', async (e) => {
    const v = e.target.value, id = v === 'nenhum' ? null : Number(v) || null;
    try { if (DEMO) { vinculos.set(m.id, id); mudouMarcos(); desenharMissao(); } else if (!v) await R.desvincular(m.id); else await R.vincular(m.id, id); }
    catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#continuarMissao')?.addEventListener('click', () => { abrirChatCom('claude'); setTimeout(() => { $('#entrada').value = `Sobre "${m.titulo}": `; $('#entrada').focus(); }, 50); });
}

// ---------- histórico: por dia e por frente ----------
let periodoHist = guardado('periodoHist', '7'), pessoaHist = 'todos', carregandoMais = false;
async function desenharHistorico() {
  const el = $('#filtroHistorico');
  el.innerHTML = [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['0', 'Tudo']].map(([v, t]) => `<button data-p="${v}" class="${v === periodoHist ? 'on' : ''}">${t}</button>`).join('') + '<span class="sep-f"></span>' + [['todos', 'Os dois'], ...pessoas().map((p) => [p, p])].map(([v, t]) => `<button data-pe="${esc(v)}" class="${v === pessoaHist ? 'on' : ''}">${esc(t)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.p) { periodoHist = b.dataset.p; guarda('periodoHist', periodoHist); } if (b.dataset.pe) pessoaHist = b.dataset.pe; desenharHistorico(); };
  const desde = periodoHist === '0' ? 0 : periodoHist === '1' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(periodoHist) * 86400e3;
  const lista = D.missoes().filter((m) => m.inicio >= desde && (pessoaHist === 'todos' || m.pessoa === pessoaHist) && passa(m.frente));
  const placar = new Map();
  for (const m of lista) { const p = placar.get(m.frente.id) || { f: m.frente, n: 0, ms: 0 }; p.n++; p.ms += m.duracao; placar.set(m.frente.id, p); }
  let html = avisoFiltro();
  html += `<div class="placar">${[...placar.values()].sort((a, b) => b.n - a.n).map((p) => `<button class="placar-item" data-frente-h="${esc(p.f.id)}" style="--cor:${p.f.cor}"><span>${p.f.icone}</span><b>${p.n}</b><small>${esc(p.f.nome)}<br>${D.duracao(p.ms)} de trabalho</small></button>`).join('') || '<div class="vazio">Nada neste período.</div>'}</div>`;
  const dias = new Map();
  for (const m of lista) { const d = new Date(m.inicio).toDateString(); if (!dias.has(d)) dias.set(d, []); dias.get(d).push(m); }
  const hojeS = new Date().toDateString(), ontem = new Date(Date.now() - 86400e3).toDateString();
  for (const [d, ms] of dias) {
    const nomeDia = d === hojeS ? 'Hoje' : d === ontem ? 'Ontem' : new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    const entregas = ms.reduce((s, m) => s + m.miniaturas.length, 0), erros = ms.filter((m) => m.status === 'erro').length;
    html += `<div class="dia"><div class="cab-dia"><b>${esc(nomeDia)}</b><span>${ms.length} missão(ões)${entregas ? ` · ${entregas} resultado(s)` : ''}${erros ? ` · ${erros} com erro` : ''}</span></div>`;
    const porFrente = new Map(); for (const m of ms) { if (!porFrente.has(m.frente.id)) porFrente.set(m.frente.id, []); porFrente.get(m.frente.id).push(m); }
    for (const [, mf] of porFrente) {
      const f = mf[0].frente;
      html += `<div class="hist-frente" style="--cor:${f.cor}"><div class="hf-nome">${f.icone} ${esc(f.nome)}</div>${mf.map((m) => { const st = D.ESTADOS[m.status] || D.ESTADOS.espera; return `<button class="hist-item" data-mi="${esc(m.id)}"><span class="h">${D.hora(m.inicio)}</span><span class="g" style="--cor:${st.cor}">${st.glifo}</span><span class="tx"><b style="color:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</b> ${esc(m.titulo)}${m.resposta ? `<small>↳ ${esc(primeiraFrase(m.resposta, 110))}</small>` : ''}</span></button>`; }).join('')}</div>`;
    }
    html += '</div>';
  }
  if (!DEMO) html += `<div class="linha" style="justify-content:center"><button class="btn" id="maisAntigo">${carregandoMais ? 'Carregando…' : 'Carregar dias mais antigos'}</button></div>`;
  $('#listaHistorico').innerHTML = html;
  $('#listaHistorico').onclick = async (e) => {
    if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro();
    const pf = e.target.closest('[data-frente-h]');
    if (pf) { const f = frentePorId(pf.dataset.frenteH); if (filtroJogo === f.jogo && filtroSetor === f.setor) mudarFiltro('', ''); else mudarFiltro(f.jogo, f.setor); return; }
    const d = e.target.closest('[data-mi]'); if (d) { abrirMissao(d.dataset.mi); return; }
    if (e.target.id === 'maisAntigo' && !carregandoMais) {
      carregandoMais = true; desenharHistorico();
      try {
        const n = await R.eventosAntes(D.eventos[0]?.t || Date.now());
        D.adicionar(n.map(D.deLinha));
        if (!n.length) toast({ titulo: 'Não há nada mais antigo', cor: '#9a90a8' }); else { periodoHist = '0'; guarda('periodoHist', '0'); }
      } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
      carregandoMais = false; desenharHistorico();
    }
  };
}

// ---------- HUD em cima do mapa: filtros (jogo/setor) + faixa "Agora" (quem está trabalhando) ----------
function quemTrabalha() {
  const out = [];
  for (const a of todosAgentes()) {
    let cls = a.st.cls;
    if (a.m.nome === 'Orquestrador' && a.m.pessoa === EU.pessoa && chatOcupado) cls = 'trab';
    if (!TRABALHANDO.includes(cls)) continue;
    const fr = D.frenteDaMesa(a.m);
    if (temFiltro() && !passa(fr)) continue;
    out.push({ ...a, cls, fr });
  }
  return out.sort((a, b) => (b.cls === 'alerta') - (a.cls === 'alerta') || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
}
function htmlFiltros() {
  const jogos = todosJogos().filter((j) => j.id !== 'estudio' || D.missoes().some((m) => m.frente.jogo === 'estudio'));
  const chip = (tipo, id, icone, nome, cor, on) => `<button class="fh ${on ? 'on' : ''}" data-f${tipo}="${esc(id)}" style="--cor:${cor}"><span class="ic">${icone}</span><span class="nm">${esc(nome)}</span></button>`;
  return `<div class="filtros-hud">${chip('j', '', '◎', 'Tudo', '#9a90a8', !temFiltro())}${jogos.map((j) => chip('j', j.id, j.icone, j.curto || j.nome, j.cor, filtroJogo === j.id)).join('')}<span class="sep-h"></span>${SETORES.map((x) => chip('s', x.id, x.icone, x.nome, x.cor, filtroSetor === x.id)).join('')}</div>`;
}
function cliqueFiltro(e) {
  const j = e.target.closest('[data-fj]'), s = e.target.closest('[data-fs]');
  if (j) { mudarFiltro(j.dataset.fj === filtroJogo ? '' : j.dataset.fj, j.dataset.fj === '' ? '' : filtroSetor); return true; }
  if (s) { mudarFiltro(filtroJogo, s.dataset.fs === filtroSetor ? '' : s.dataset.fs); return true; }
  return false;
}
async function desenharHud() {
  if (!EU) return;
  const ativos = quemTrabalha();
  const cartoes = await Promise.all(ativos.slice(0, 12).map(async ({ m, cls, fr }) => {
    const acao = D.emSegundoPlano(m) ? 'Rodando uma tarefa em segundo plano' : m.ult ? primeiraFrase(frase(m.ult), 70) : 'pensando…';
    const marco = marcoDaMissao(m.ult?._m);
    const desde = m.pedido?.t || m.ult?.t;
    const icone = cls === 'alerta' ? '⚠️' : cls === 'erro' ? '❌' : ICONE_CAT[categoria(m.ult || {})] || '⚙️';
    return `<button class="agora-card ${cls}" data-k="${esc(m.k)}" style="--cor:${fr?.cor || '#9a90a8'};--pessoa:${corPessoa(m.pessoa)}">
      <img src="${await retratoDe(m.nome)}" alt="">
      <span class="ac-txt"><span class="ac-nome"><b>${esc(tituloAgente(m))}</b><span class="ac-pes">${esc(m.pessoa)}</span></span>
        <span class="ac-fr">${fr ? `${fr.icone}${fr.iconeSetor} ${esc(fr.nome)}` : ''}${marco ? ` · 🏁 ${esc(marco.titulo)}` : ''}</span>
        <span class="ac-acao">${icone} ${esc(acao)}</span></span>
      <span class="ac-t">${desde ? D.ha(desde) : ''}</span></button>`;
  }));
  $('#frentes').innerHTML = htmlFiltros() + `<div class="agora ${guardado('agoraCompacto', '') ? 'compacto' : ''}"><span class="agora-tit" title="Encolher/abrir">${ativos.length ? `⚙ ${ativos.length} trabalhando${ativos.filter((a) => a.cls === 'alerta').length ? ` · ⚠ ${ativos.filter((a) => a.cls === 'alerta').length}` : ''}` : 'ninguém trabalhando'}</span>${cartoes.join('')}${ativos.length > 12 ? `<span class="agora-mais">+${ativos.length - 12}</span>` : ''}</div>`;
}
function ligarHud() {
  $('#frentes').onclick = (e) => { if (cliqueFiltro(e)) return; if (e.target.closest('.agora-tit')) { guarda('agoraCompacto', guardado('agoraCompacto', '') ? '' : '1'); desenharHud(); return; } const c = e.target.closest('.agora-card'); if (c) localizar(c.dataset.k); };
}

// ======================= QUADRO DE MARCOS (kanban que substitui o Notion) =======================
// Cartão = um grande marco (ex.: "Trailer de lançamento", "Loja de classes").
// Os pedidos do dia a dia (missões) se penduram sozinhos no marco certo; dá para corrigir na mão.
const COLUNAS = [
  { id: 'ideias', nome: 'Ideias', icone: '💡' },
  { id: 'afazer', nome: 'A fazer', icone: '📋' },
  { id: 'fazendo', nome: 'Fazendo', icone: '⚙️' },
  { id: 'revisar', nome: 'Revisar', icone: '👀' },
  { id: 'feito', nome: 'Feito', icone: '✅' },
];
let marcos = [], vinculos = new Map(), comentarios = [], temQuadro = false, versaoMarcos = 0, marcoAberto = null, agruparPor = guardado('agrupar', ''), pessoaQuadro = '';
const mudouMarcos = () => { versaoMarcos++; cacheVinculo.v = -1; };

// ---------- pendurar pedidos nos marcos ----------
const PARADAS = new Set('para como isso esse essa este esta mais fazer quero agora deixa coloca colocar pode voce você tudo todo toda cada depois antes entao então melhor melhora melhorar ainda tambem também porque sobre dele dela pelo pela pelos pelas numa num uma umas uns dos das nos nas com sem que qual quais quando onde aqui jogo genesis cook'.split(' '));
const palavrasDe = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PARADAS.has(w)).map((w) => w.replace(/(oes|aes|s)$/, '')));
let cacheVinculo = { v: -1, mapa: new Map() };
function marcoDaMissao(m) {
  if (!m || !temQuadro) return null;
  const chave = `${D.versaoAtual()}|${versaoMarcos}`;
  if (cacheVinculo.v !== chave) cacheVinculo = { v: chave, mapa: new Map() };
  if (cacheVinculo.mapa.has(m.id)) return cacheVinculo.mapa.get(m.id);
  let achado = null;
  if (vinculos.has(m.id)) achado = marcos.find((x) => x.id === vinculos.get(m.id)) || null;           // na mão (null = nenhum)
  else {
    const cv = conversas.find((c) => c.marco_id && c.sessao && m.sessao && String(c.sessao).startsWith(m.sessao));
    if (cv) achado = marcos.find((x) => x.id === cv.marco_id) || null;                                 // conversa aberta pelo cartão
    else {                                                                                               // automático: palavras em comum
      const pm = palavrasDe(m.pedido), recente = Date.now() - 3 * 86400e3;
      // Só marcos que já existiam quando o pedido rodou (criar um cartão novo não reescreve o passado)
      // e que não estavam encerrados antes dele começar.
      const notas = marcos.filter((x) => x.coluna !== 'ideias' && x.jogo === m.frente.jogo
          && new Date(x.criado || 0).getTime() <= m.inicio + 60e3
          && (x.coluna !== 'feito' || (new Date(x.concluido || x.atualizado).getTime() > Math.max(recente, m.inicio))))
        .map((x) => {
          let n = x.setor === m.frente.setor ? 1 : 0;
          const chaves = palavrasDe(x.palavras), titulo = palavrasDe(`${x.titulo} ${x.descricao} ${(x.etapas || []).map((e) => e.t).join(' ')}`);
          for (const w of pm) { if (chaves.has(w)) n += 3; else if (titulo.has(w)) n += 1.5; }
          if (x.coluna === 'fazendo') n += 0.5;
          return { x, n };
        }).sort((a, b) => b.n - a.n);
      if (notas[0] && notas[0].n >= 3 && (!notas[1] || notas[0].n - notas[1].n >= 1)) achado = notas[0].x;
    }
  }
  cacheVinculo.mapa.set(m.id, achado);
  return achado;
}
const comoPendurou = (m) => vinculos.has(m.id) ? 'na mão' : conversas.some((c) => c.marco_id && c.sessao && String(c.sessao).startsWith(m.sessao)) ? 'pela conversa do cartão' : 'automático';
function resumoMarco(mc) {
  const ms = D.missoes().filter((m) => marcoDaMissao(m)?.id === mc.id);
  const hoje = new Date().setHours(0, 0, 0, 0);
  const agentes = quemTrabalhaTodos().filter((a) => a.m.ult?._m && marcoDaMissao(a.m.ult._m)?.id === mc.id);
  return { ms, hoje: ms.filter((m) => m.inicio >= hoje).length, agentes, alertas: ms.filter((m) => m.status === 'alerta').length, ult: ms[0]?.ultimo, minis: ms.flatMap((m) => m.miniaturas.map((mi) => ({ ...mi, pessoa: m.pessoa }))) };
}
function quemTrabalhaTodos() { return todosAgentes().filter((a) => TRABALHANDO.includes(a.st.cls)); }

// ---------- tela do quadro ----------
function marcarVista() {
  const q = !$('#quadro').hidden, gav = !$('#gaveta').classList.contains('fechada') && innerWidth <= 760;
  $$('#vistas button').forEach((b) => b.classList.toggle('on', (b.dataset.acao === 'quadro') === q));
  if (!gav) $$('#abasCelular button').forEach((b) => b.classList.toggle('on', q ? b.dataset.acao === 'quadro' : b.dataset.acao === 'mapa'));
}
function abrirQuadro() {
  $('#quadro').hidden = false; guarda('quadro', '1'); marcarVista();
  $$('#botoesTopo [data-acao=quadro], #abasCelular [data-acao=quadro]').forEach((b) => b.classList.add('on'));
  desenharQuadro();
}
function fecharQuadro() {
  $('#quadro').hidden = true; guarda('quadro', ''); marcarVista();
  $$('#botoesTopo [data-acao=quadro], #abasCelular [data-acao=quadro]').forEach((b) => b.classList.remove('on'));
}
const passaMarco = (mc) => (!filtroJogo || mc.jogo === filtroJogo) && (!filtroSetor || mc.setor === filtroSetor) && (!pessoaQuadro || mc.responsavel === pessoaQuadro);
async function cartaoMarco(mc) {
  const r = resumoMarco(mc), j = jogoPorId(mc.jogo), s = setorPorId(mc.setor);
  const et = mc.etapas || [], feitas = et.filter((e) => e.feito).length;
  const atrasado = mc.prazo && mc.coluna !== 'feito' && new Date(mc.prazo + 'T23:59') < new Date();
  const rostos = await Promise.all(r.agentes.slice(0, 5).map(async (a) => `<img src="${await retratoDe(a.m.nome)}" title="${esc(tituloAgente(a.m))}: ${esc(primeiraFrase(frase(a.m.ult), 60))}" alt="">`));
  return `<div class="cartao ${r.agentes.length ? 'vivo' : ''} ${r.alertas ? 'atencao' : ''}" draggable="true" data-marco="${mc.id}" style="--cor:${j.cor};--setor:${s.cor}">
    <div class="ct-topo"><span class="ct-jogo">${j.icone} ${esc(j.curto || j.nome)}</span><span class="ct-setor">${s.icone} ${esc(s.nome)}</span>${mc.prioridade === 1 ? '<span class="ct-pri">🔥 alta</span>' : ''}</div>
    <div class="ct-tit">${esc(mc.titulo)}</div>
    ${et.length ? `<div class="ct-prog"><i style="width:${Math.round(feitas / et.length * 100)}%"></i><span>☑ ${feitas}/${et.length}</span></div>` : ''}
    ${r.agentes.length ? `<div class="ct-vivo">${rostos.join('')}<span>trabalhando agora</span></div>` : ''}
    ${r.alertas ? '<div class="ct-alerta">⚠️ precisa de você</div>' : ''}
    <div class="ct-rodape">${mc.responsavel ? `<span class="ct-resp" style="--pessoa:${corPessoa(mc.responsavel)}">${esc(mc.responsavel)}</span>` : '<span class="ct-resp vazio">sem dono</span>'}${mc.prazo ? `<span class="ct-prazo ${atrasado ? 'atrasado' : ''}">📅 ${new Date(mc.prazo + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>` : ''}<span class="espaco"></span>${r.ms.length ? `<span class="ct-ped" title="pedidos pendurados neste marco">▸ ${r.ms.length}${r.hoje ? ` · ${r.hoje} hoje` : ''}</span>` : ''}</div>
  </div>`;
}
async function desenharQuadro() {
  if ($('#quadro').hidden) return;
  if (!temQuadro) {
    $('#quadroCorpo').innerHTML = `<div class="quadro-vazio"><h3>Falta ligar o quadro</h3><p>Rode o arquivo <code>supabase/escritorio-3.sql</code> no Supabase (SQL Editor › New query › colar › Run). É uma vez só.</p></div>`;
    return;
  }
  $('#quadroFiltros').innerHTML = htmlFiltros() + '<div class="filtros">' + [['', 'Os dois'], ...pessoas().map((p) => [p, p])].map(([v, t]) => `<button data-pq="${esc(v)}" class="${pessoaQuadro === v ? 'on' : ''}">${esc(t)}</button>`).join('')
    + '<span class="sep-f"></span>' + [['', 'Sem faixas'], ['jogo', 'Faixas por jogo'], ['setor', 'Faixas por setor']].map(([v, t]) => `<button data-ag="${v}" class="${agruparPor === v ? 'on' : ''}">${t}</button>`).join('') + '</div>';
  const lista = marcos.filter(passaMarco);
  const faixas = agruparPor === 'jogo' ? todosJogos().filter((j) => lista.some((m) => m.jogo === j.id)).map((j) => ({ id: j.id, nome: `${j.icone} ${j.nome}`, cor: j.cor, f: (m) => m.jogo === j.id }))
    : agruparPor === 'setor' ? SETORES.map((s) => ({ id: s.id, nome: `${s.icone} ${s.nome}`, cor: s.cor, f: (m) => m.setor === s.id }))
    : [{ id: '', nome: '', f: () => true }];
  let html = '';
  for (const fx of faixas) {
    if (fx.nome) html += `<div class="faixa-nome" style="--cor:${fx.cor}">${esc(fx.nome)}</div>`;
    if (!fx.nome || fx === faixas[0]) html += `<div class="nav-colunas">${COLUNAS.map((c) => `<button data-ir-coluna="${c.id}">${c.icone} ${lista.filter((m) => m.coluna === c.id).length}</button>`).join('')}</div>`;
    html += '<div class="colunas-quadro">';
    for (const c of COLUNAS) {
      const doC = lista.filter((m) => m.coluna === c.id && fx.f(m)).sort((a, b) => (c.id === 'feito' ? new Date(b.concluido || b.atualizado) - new Date(a.concluido || a.atualizado) : a.prioridade - b.prioridade || a.ordem - b.ordem));
      const mostrar = c.id === 'feito' ? doC.slice(0, 8) : doC;
      html += `<div class="coluna" data-coluna="${c.id}" data-faixa="${esc(fx.id)}"><div class="col-cab"><span>${c.icone} ${c.nome}</span><b>${doC.length}</b>${c.id !== 'feito' ? `<button class="col-novo" data-novo="${c.id}" title="Novo marco em ${c.nome}">+</button>` : ''}</div>
        <div class="col-cartoes">${(await Promise.all(mostrar.map(cartaoMarco))).join('')}${doC.length > mostrar.length ? `<div class="sub">+${doC.length - mostrar.length} mais antigos</div>` : ''}${!doC.length ? '<div class="col-vazia">—</div>' : ''}</div></div>`;
    }
    html += '</div>';
  }
  // pedidos de hoje que não acharam marco (para pendurar na mão)
  const soltos = D.missoes().filter((m) => m.inicio > Date.now() - 2 * 86400e3 && passa(m.frente) && !marcoDaMissao(m) && !(vinculos.has(m.id) && vinculos.get(m.id) === null));
  if (soltos.length) html += `<details class="soltos"><summary>🧷 ${soltos.length} pedido(s) dos últimos 2 dias sem marco <span class="sub">(tudo bem: só pendure o que fizer parte de um marco)</span></summary>${soltos.slice(0, 30).map((m) => `<div class="solto"><span class="chip-frente" style="--cor:${m.frente.cor}">${m.frente.icone}${m.frente.iconeSetor}</span><a href="#" data-abrir-missao="${esc(m.id)}">${esc(m.titulo)}</a><span class="sub">${esc(m.pessoa)} · ${D.ha(m.inicio)}</span><select data-pendurar="${esc(m.id)}"><option value="">pendurar em…</option>${marcos.filter((x) => x.coluna !== 'feito' && x.jogo === m.frente.jogo).map((x) => `<option value="${x.id}">${esc(x.titulo)}</option>`).join('')}<option value="nenhum">não é de marco nenhum</option></select></div>`).join('')}</details>`;
  $('#quadroCorpo').innerHTML = html || '';
  if (!marcos.length) $('#quadroCorpo').insertAdjacentHTML('afterbegin', '<div class="quadro-dica">Crie o primeiro marco no <b>+</b> de uma coluna. Só os grandes: “Trailer de lançamento”, “Loja de classes”, “Página da Steam”. Os pedidos do dia a dia se penduram sozinhos.</div>');
}
function ligarQuadro() {
  $('#fecharQuadro').onclick = fecharQuadro;
  $('#novoMarco').onclick = () => abrirMarco(null, 'afazer');
  $('#quadroFiltros').onclick = (e) => {
    if (cliqueFiltro(e)) return;
    const p = e.target.closest('[data-pq]'), a = e.target.closest('[data-ag]');
    if (p) { pessoaQuadro = p.dataset.pq; desenharQuadro(); }
    if (a) { agruparPor = a.dataset.ag; guarda('agrupar', agruparPor); desenharQuadro(); }
  };
  const corpo = $('#quadroCorpo');
  corpo.onclick = (e) => {
    const n = e.target.closest('[data-novo]'); if (n) return abrirMarco(null, n.dataset.novo);
    const ic = e.target.closest('[data-ir-coluna]'); if (ic) { corpo.querySelector(`.coluna[data-coluna="${ic.dataset.irColuna}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); return; }
    const am = e.target.closest('[data-abrir-missao]'); if (am) { e.preventDefault(); return abrirMissao(am.dataset.abrirMissao); }
    const c = e.target.closest('[data-marco]'); if (c) abrirMarco(Number(c.dataset.marco));
  };
  corpo.onchange = async (e) => {
    const s = e.target.closest('[data-pendurar]'); if (!s || !s.value) return;
    try { await R.vincular(s.dataset.pendurar, s.value === 'nenhum' ? null : Number(s.value)); } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  };
  // arrastar cartões entre colunas (no PC)
  corpo.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-marco]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.marco); c.classList.add('arrastando'); } });
  corpo.addEventListener('dragend', (e) => e.target.closest?.('[data-marco]')?.classList.remove('arrastando'));
  corpo.addEventListener('dragover', (e) => { const col = e.target.closest('[data-coluna]'); if (col) { e.preventDefault(); $$('.coluna.sobre').forEach((x) => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); } });
  corpo.addEventListener('drop', async (e) => {
    const col = e.target.closest('[data-coluna]'); $$('.coluna.sobre').forEach((x) => x.classList.remove('sobre'));
    const id = Number(e.dataTransfer.getData('text/plain')); if (!col || !id) return;
    e.preventDefault();
    const mc = marcos.find((x) => x.id === id); if (!mc) return;
    const mud = { id, coluna: col.dataset.coluna };
    if (agruparPor && col.dataset.faixa) mud[agruparPor] = col.dataset.faixa;
    await moverMarco(mc, mud);
  });
}
async function moverMarco(mc, mud) {
  if (mud.coluna === 'feito' && mc.coluna !== 'feito') mud.concluido = new Date().toISOString();
  if (mud.coluna && mud.coluna !== 'feito') mud.concluido = null;
  Object.assign(mc, mud); mudouMarcos(); desenharQuadro();
  try { await salvar(mud); if (mud.coluna === 'feito') { toast({ titulo: `🏁 Marco concluído: ${mc.titulo}`, cor: '#4fbf82' }); fazerEmote('🎉'); } }
  catch (err) { toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }); }
}
async function salvar(campos) {
  if (DEMO) { const mc = marcos.find((x) => x.id === campos.id); if (mc) Object.assign(mc, campos); else marcos.push({ ...campos, id: Date.now(), ordem: Date.now() / 1000, etapas: campos.etapas || [] }); mudouMarcos(); return marcos.find((x) => x.id === campos.id) || marcos.at(-1); }
  const d = await R.salvarMarco(campos);
  const i = marcos.findIndex((x) => x.id === d.id); if (i >= 0) marcos[i] = d; else marcos.push(d);
  mudouMarcos();
  return d;
}

// ---------- detalhe do marco (na gaveta) ----------
let rascunho = null;
function abrirMarco(id, coluna = 'afazer') {
  marcoAberto = id;
  rascunho = id ? null : { titulo: '', descricao: '', jogo: filtroJogo || 'genesis', setor: filtroSetor || 'criacao', coluna, responsavel: EU.pessoa, prioridade: 2, prazo: null, etapas: [], palavras: '', area: '', arquivos: '', branch: '' };
  abrirAba('marco', aba !== 'marco');
}
async function desenharMarco() {
  const mc = marcoAberto ? marcos.find((x) => x.id === marcoAberto) : rascunho;
  if (!mc) { $('#detalheMarco').innerHTML = '<div class="vazio">Marco não encontrado (foi apagado?).</div>'; return; }
  const novo = !mc.id, r = novo ? null : resumoMarco(mc), j = jogoPorId(mc.jogo);
  const opt = (lista, atual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const et = mc.etapas || [];
  const cms = novo ? [] : comentarios.filter((c) => c.marco_id === mc.id);
  const pend = novo ? [] : await Promise.all(r.ms.slice(0, 25).map(async (m) => { const st = D.ESTADOS[m.status] || D.ESTADOS.espera; return `<div class="pend"><span class="g" style="--cor:${st.cor}">${st.glifo}</span><a href="#" data-abrir-missao="${esc(m.id)}">${esc(m.titulo)}</a><span class="sub">${esc(m.pessoa)} · ${D.ha(m.inicio)} · ${comoPendurou(m)}</span><button class="mini-x" data-despendurar="${esc(m.id)}" title="Não é deste marco">×</button></div>`; }));
  const urls = novo || !r.minis.length ? [] : await R.urlsMiniaturas(r.minis.slice(0, 8).map((x) => x.caminho)).catch(() => []);
  const vivos = novo ? [] : await Promise.all(r.agentes.map(async (a) => `<div class="quem-linha"><img src="${await retratoDe(a.m.nome)}" alt=""><b>${esc(tituloAgente(a.m))}</b><span class="sub2">${esc(primeiraFrase(frase(a.m.ult), 80))}</span></div>`));
  $('#detalheMarco').innerHTML = `
    <div class="marco-form" style="--cor:${j.cor}">
      <input id="mTitulo" class="m-titulo" maxlength="200" placeholder="Nome do marco (ex.: Trailer de lançamento)" value="${esc(mc.titulo)}">
      <div class="m-grade">
        <label>Coluna<select id="mColuna">${opt(COLUNAS.map((c) => [c.id, `${c.icone} ${c.nome}`]), mc.coluna)}</select></label>
        <label>Jogo<select id="mJogo">${opt(todosJogos().map((x) => [x.id, `${x.icone} ${x.nome}`]), mc.jogo)}</select></label>
        <label>Setor<select id="mSetor">${opt(SETORES.map((x) => [x.id, `${x.icone} ${x.nome}`]), mc.setor)}</select></label>
        <label>Dono<select id="mResp">${opt([['', '—'], ...pessoas().map((p) => [p, p])], mc.responsavel)}</select></label>
        <label>Prioridade<select id="mPri">${opt([[1, '🔥 Alta'], [2, 'Normal'], [3, 'Baixa']], mc.prioridade)}</select></label>
        <label>Prazo<input id="mPrazo" type="date" value="${esc(mc.prazo || '')}"></label>
      </div>
      <textarea id="mDesc" rows="3" maxlength="4000" placeholder="O que é este marco? Quando ele está pronto?">${esc(mc.descricao)}</textarea>
      <div class="bloco"><h4>Etapas ${et.length ? `(${et.filter((e) => e.feito).length}/${et.length})` : ''}</h4>
        ${et.map((e, i) => `<label class="etapa-m ${e.feito ? 'feita' : ''}"><input type="checkbox" data-etapa="${i}" ${e.feito ? 'checked' : ''}><span>${esc(e.t)}</span>${e.por ? `<small>${esc(e.por)}</small>` : ''}<button type="button" class="mini-x" data-tirar-etapa="${i}">×</button></label>`).join('')}
        <form id="formEtapa" class="linha"><input id="novaEtapa" maxlength="200" placeholder="+ etapa (ex.: roteiro, gravação, edição…)"><button class="btn mini">+</button></form></div>
      <details class="bloco"><summary><h4 style="display:inline">Para pendurar sozinho e para as IAs</h4></summary>
        <label class="m-lin">Palavras-chave <input id="mPalavras" maxlength="300" placeholder="ex.: trailer, lançamento, steam" value="${esc(mc.palavras)}"></label>
        <p class="sub" style="text-align:left">Pedidos com estas palavras (no mesmo jogo) se penduram neste marco.</p>
        <label class="m-lin">Área <input id="mArea" maxlength="200" placeholder="ex.: HUD, inimigos, vídeo" value="${esc(mc.area)}"></label>
        <label class="m-lin">Arquivos <input id="mArquivos" maxlength="500" placeholder="ex.: scripts/ui/*, data/classes.json" value="${esc(mc.arquivos)}"></label>
        <label class="m-lin">Branch <input id="mBranch" maxlength="120" placeholder="ex.: gen-190-loja" value="${esc(mc.branch)}"></label>
        <p class="sub" style="text-align:left">As IAs olham Área/Arquivos/Branch para você e o Kenny não mexerem no mesmo lugar ao mesmo tempo.</p></details>
      <div class="linha">${novo ? '<button class="btn forte" id="criarMarco">Criar marco</button>' : `<button class="btn forte" id="mandarMarco">▶ Mandar para a assistente</button>`}</div>
    </div>
    ${novo ? '' : `
    ${vivos.length ? `<div class="bloco destaque"><h4>⚙️ Trabalhando nele agora</h4>${vivos.join('')}</div>` : ''}
    <div class="bloco"><h4>Pedidos pendurados (${r.ms.length})</h4>${pend.join('') || '<p class="sub" style="text-align:left">Nenhum ainda. Mande pelo botão acima, ou peça algo com as palavras-chave do marco.</p>'}</div>
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${r.minis.slice(0, 8).map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : ''}
    <div class="bloco"><h4>Comentários</h4>${cms.map((c) => `<div class="coment" style="--cor:${corPessoa(c.pessoa)}"><b>${esc(c.pessoa)}</b> <span class="sub2">${D.ha(new Date(c.criado).getTime())}</span><div>${esc(c.texto)}</div></div>`).join('')}
      <form id="formComent" class="linha"><input id="novoComent" maxlength="2000" placeholder="Comentar…"><button class="btn mini">Enviar</button></form></div>
    <p class="sub" style="text-align:left">Criado por ${esc(mc.criado_por || '?')} · ${D.ha(new Date(mc.criado).getTime())}${mc.concluido ? ` · concluído ${D.ha(new Date(mc.concluido).getTime())}` : ''} · <a href="#" id="apagarMarco" class="link-perigo">apagar marco</a></p>`}`;
  const el = $('#detalheMarco');
  const campo = { mTitulo: 'titulo', mColuna: 'coluna', mJogo: 'jogo', mSetor: 'setor', mResp: 'responsavel', mPri: 'prioridade', mPrazo: 'prazo', mDesc: 'descricao', mPalavras: 'palavras', mArea: 'area', mArquivos: 'arquivos', mBranch: 'branch' };
  el.onchange = async (e) => {
    const k = campo[e.target.id];
    if (k) {
      let v = e.target.value; if (k === 'prioridade') v = Number(v); if ((k === 'prazo' || k === 'responsavel') && !v) v = null;
      if (novo) { rascunho[k] = v; return; }
      if (k === 'titulo' && !v.trim()) return;
      if (k === 'coluna') return moverMarco(mc, { id: mc.id, coluna: v });
      mc[k] = v; try { await salvar({ id: mc.id, [k]: v }); desenharQuadro(); } catch (err) { toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }); }
      return;
    }
    const ch = e.target.closest('[data-etapa]');
    if (ch) { const lista = [...(mc.etapas || [])]; lista[Number(ch.dataset.etapa)] = { ...lista[Number(ch.dataset.etapa)], feito: ch.checked, por: ch.checked ? EU.pessoa : undefined }; mc.etapas = lista; if (!novo) await salvar({ id: mc.id, etapas: lista }).catch(() => {}); desenharMarco(); desenharQuadro(); }
  };
  el.onclick = async (e) => {
    const am = e.target.closest('[data-abrir-missao]'); if (am) { e.preventDefault(); return abrirMissao(am.dataset.abrirMissao); }
    const te = e.target.closest('[data-tirar-etapa]'); if (te) { e.preventDefault(); const lista = (mc.etapas || []).filter((_, i) => i !== Number(te.dataset.tirarEtapa)); mc.etapas = lista; if (!novo) await salvar({ id: mc.id, etapas: lista }).catch(() => {}); desenharMarco(); return; }
    const dp = e.target.closest('[data-despendurar]'); if (dp) { if (DEMO) { vinculos.set(dp.dataset.despendurar, null); mudouMarcos(); desenharMarco(); } else R.vincular(dp.dataset.despendurar, null).catch((err) => toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' })); return; }
    const mi = e.target.closest('[data-mini]'); if (mi) { const i = Number(mi.dataset.mini); abrirMidia(r.minis[i], urls[i], r.minis[i].pessoa); }
  };
  $('#formEtapa').onsubmit = async (e) => {
    e.preventDefault(); const t = $('#novaEtapa').value.trim(); if (!t) return;
    mc.etapas = [...(mc.etapas || []), { t, feito: false }];
    if (!novo) await salvar({ id: mc.id, etapas: mc.etapas }).catch((err) => toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }));
    desenharMarco(); setTimeout(() => $('#novaEtapa')?.focus(), 0); desenharQuadro();
  };
  $('#criarMarco')?.addEventListener('click', async () => {
    rascunho.titulo = $('#mTitulo').value.trim(); rascunho.descricao = $('#mDesc').value;
    if (!rascunho.titulo) { $('#mTitulo').focus(); return; }
    try { const d = await salvar(rascunho); marcoAberto = d.id; rascunho = null; desenharMarco(); desenharQuadro(); toast({ titulo: 'Marco criado', texto: d.titulo, cor: jogoPorId(d.jogo).cor }); }
    catch (err) { toast({ titulo: 'Não criei', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#apagarMarco')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!confirm(`Apagar o marco “${mc.titulo}”? Os pedidos continuam no histórico.`)) return;
    try { if (DEMO) marcos = marcos.filter((x) => x !== mc); else await R.apagarMarco(mc.id); marcos = marcos.filter((x) => x.id !== mc.id); mudouMarcos(); fecharGaveta(); desenharQuadro(); } catch (err) { toast({ titulo: 'Não apaguei', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#mandarMarco')?.addEventListener('click', () => mandarMarco(mc));
  $('#formComent')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('#novoComent').value.trim(); if (!t) return;
    try { if (DEMO) comentarios.push({ id: Date.now(), marco_id: mc.id, pessoa: EU.pessoa, texto: t, criado: new Date().toISOString() }); else await R.comentar(mc.id, t); $('#novoComent').value = ''; if (DEMO) desenharMarco(); } catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
  });
}
// Abre (ou reaproveita) uma conversa com a assistente presa a este marco.
async function mandarMarco(mc) {
  let cv = conversas.find((c) => c.marco_id === mc.id && c.alvo === 'claude');
  if (!cv && !DEMO) {
    const projs = estados.get(EU.pessoa)?.info?.projetos || [];
    const proj = projs.find((p) => jogoPorId(mc.jogo).id === 'cook' ? /cook/i.test(p.nome) : /genesis/i.test(p.nome))?.nome || projs[0]?.nome;
    try { cv = await R.novaConversa({ titulo: `🏁 ${mc.titulo}`, alvo: 'claude', projeto: proj, marco_id: mc.id }); conversas = [cv, ...conversas]; }
    catch (err) { toast({ titulo: 'Não abri a conversa', texto: err.message, cor: '#ef6a55' }); return; }
  }
  if (mc.coluna === 'afazer' || mc.coluna === 'ideias') moverMarco(mc, { id: mc.id, coluna: 'fazendo' });
  if (cv) await abrirConversa(cv.id); else abrirAba('chat');
  setTimeout(() => { $('#entrada').focus(); }, 50);
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

// ---------- conversa da dupla (usa a tabela de recados: msg, recado fixado, missão compartilhada, reação) ----------
const RAPIDAS = ['👀 Pode revisar?', '🚀 Subi na main', '📞 Bora call?', '🎧 Tô focado', '☕ Pausa', '✅ Feito!'];
const CORES_FIXADO = { amarelo: '#ffe58a', rosa: '#ffc2d4', azul: '#bfe0ff', verde: '#c8f0c4' };
const REACOES = ['👍', '❤️', '😂', '🔥', '✅', '👀'];
let reagindo = null;
async function mandarRecado(texto, cor) {
  if (DEMO) { recados.unshift({ id: Date.now(), pessoa: EU.pessoa, texto, cor, criado: new Date().toISOString() }); if (cor !== 'reacao') balaoPessoa(EU.pessoa, cor === 'missao' ? '📎 ' + (lerJson(texto).titulo || '') : texto); desenharDupla(); return; }
  await R.recado(texto, cor);
}
async function enviarDupla(rapida) {
  const t = (rapida || $('#textoRecado').value).trim();
  if (!t) return;
  try { await mandarRecado(t.slice(0, 500), $('#chkFixar').checked && !rapida ? 'amarelo' : 'msg'); if (!rapida) { $('#textoRecado').value = ''; $('#chkFixar').checked = false; } }
  catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
}
async function compartilharMissao(m) {
  const card = JSON.stringify({ id: m.id, titulo: m.titulo.slice(0, 200), frente: m.frente.id, pessoa: m.pessoa, status: m.status });
  try { await mandarRecado(card, 'missao'); abrirAba('dupla'); toast({ titulo: 'Missão enviada para a dupla', texto: 'Escreva um comentário se quiser.', cor: '#4fbf82' }); setTimeout(() => $('#textoRecado').focus(), 50); }
  catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
}
async function reagir(id, emoji) {
  const minha = recados.find((r) => r.cor === 'reacao' && r.pessoa === EU.pessoa && r.texto === `${emoji} ${id}`);
  try {
    if (minha) { if (DEMO) recados = recados.filter((r) => r !== minha); else await R.tirarRecado(minha.id); desenharDupla(); }
    else await mandarRecado(`${emoji} ${id}`, 'reacao');
  } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
}
const comMencao = (s) => esc(s).replace(/@(\p{L}+)/gu, '<b class="mencao">@$1</b>');
function desenharDupla() {
  if (aba !== 'dupla' || !EU) return;
  guarda('recadosVistos', Date.now()); for (const el of [$('#badgeMural'), $('#badgeDuplaCel'), ...$$('[data-badge-dupla]')]) el.hidden = true;
  const fixados = recados.filter((r) => CORES_FIXADO[r.cor]);
  $('#fixados').innerHTML = fixados.length ? `<details class="fixados" ${fixados.length <= 3 ? 'open' : ''}><summary>📌 Recados fixados (${fixados.length})</summary><div class="recados">${fixados.map((r, i) => `<div class="recado" style="--cor:${CORES_FIXADO[r.cor]};--r:${((i * 37) % 5) - 2}deg"><button data-tirar="${r.id}" title="Tirar do mural">×</button>${comMencao(r.texto)}<small>${esc(r.pessoa)} · ${D.ha(new Date(r.criado).getTime())}</small></div>`).join('')}</div></details>` : '';
  const reacoes = new Map();
  for (const r of recados.filter((x) => x.cor === 'reacao')) { const [e, id] = r.texto.split(' '); const k = `${id}`; if (!reacoes.has(k)) reacoes.set(k, new Map()); const m = reacoes.get(k); if (!m.has(e)) m.set(e, []); m.get(e).push(r.pessoa); }
  const msgs = recados.filter((r) => r.cor === 'msg' || r.cor === 'missao').slice().sort((a, b) => new Date(a.criado) - new Date(b.criado));
  const el = $('#msgsDupla'), noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  let html = '', diaAnt = '';
  for (const r of msgs) {
    const dia = new Date(r.criado).toDateString();
    if (dia !== diaAnt) { diaAnt = dia; html += `<div class="sep-dia">${dia === new Date().toDateString() ? 'Hoje' : new Date(r.criado).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>`; }
    const eu = r.pessoa === EU.pessoa;
    let corpo;
    if (r.cor === 'missao') {
      const c = lerJson(r.texto), f = frentePorId(c.frente) || frente('genesis', 'criacao'), existe = D.missoes().some((m) => m.id === c.id);
      corpo = `<button class="card-missao" data-abrir-missao="${esc(c.id || '')}" ${existe ? '' : 'disabled'} style="--cor:${f.cor}"><span class="cm-f">${f.icone} ${esc(f.nome)} · missão de ${esc(c.pessoa || '?')}</span><b>${esc(c.titulo || 'Missão')}</b><span class="cm-a">${existe ? 'Abrir a missão ›' : 'missão antiga (carregue no Histórico)'}</span></button>`;
    } else corpo = `<span class="txt">${comMencao(r.texto)}</span>`;
    const rs = reacoes.get(String(r.id));
    html += `<div class="bolha ${eu ? 'eu' : ''}" data-id="${r.id}" style="--cor:${corPessoa(r.pessoa)}">${eu ? '' : `<span class="quem">${esc(r.pessoa)}</span>`}${corpo}<span class="hora">${D.hora(new Date(r.criado).getTime())}</span>${rs ? `<div class="reacoes">${[...rs].map(([e, ps]) => `<button data-reagir="${esc(e)}" class="${ps.includes(EU.pessoa) ? 'minha' : ''}" title="${esc(ps.join(', '))}">${esc(e)} ${ps.length}</button>`).join('')}</div>` : ''}${reagindo === r.id ? `<div class="reacoes escolher">${REACOES.map((e) => `<button data-reagir="${e}">${e}</button>`).join('')}</div>` : ''}</div>`;}
  el.innerHTML = html || `<div class="vazio">Aqui é a conversa entre você e ${esc(outraPessoa() || 'a dupla')}. Mande um oi, use as respostas rápidas ou compartilhe uma missão (botão "Mandar para a dupla" dentro de cada missão).</div>`;
  if (noFim || !el.dataset.rolou) { el.scrollTop = el.scrollHeight; el.dataset.rolou = '1'; }
  el.onclick = (e) => {
    const am = e.target.closest('[data-abrir-missao]'); if (am) { abrirMissao(am.dataset.abrirMissao); return; }
    const rb = e.target.closest('[data-reagir]'); if (rb) { reagindo = null; reagir(Number(rb.closest('[data-id]').dataset.id), rb.dataset.reagir); return; }
    const b = e.target.closest('.bolha'); if (b) { const id = Number(b.dataset.id); reagindo = reagindo === id ? null : id; desenharDupla(); }
  };
  $('#fixados').onclick = async (e) => { const b = e.target.closest('[data-tirar]'); if (b) { if (DEMO) { recados = recados.filter((r) => r.id !== Number(b.dataset.tirar)); desenharDupla(); } else await R.tirarRecado(Number(b.dataset.tirar)); } };
}

// ---------- quem é quem: o catálogo de agentes, skills, conectores e plugins ----------
let pessoaCatalogo = null;
function desenharCatalogo() {
  pessoaCatalogo ||= EU.pessoa;
  const info = estados.get(pessoaCatalogo)?.info || {};
  const desde = Date.now() - 30 * 86400e3;
  const ev = D.eventos.filter((e) => e.pessoa === pessoaCatalogo && e.t > desde);
  const conta = (fn) => { const c = new Map(); for (const e of ev) { const k = fn(e); if (k) c.set(k, (c.get(k) || 0) + 1); } return c; };
  const usoSkill = conta((e) => e.ferramenta === 'Skill' ? String(e.alvo || '').split(':').pop() : null);
  const usoCon = conta((e) => conectorDe(e.ferramenta) || (['PixelLab', 'Blender', 'HuggingFace'].includes(e.agente) && e.tipo === 'inicio' ? nomeConector(e.agente === 'HuggingFace' ? 'hf' : e.agente.toLowerCase()) : null));
  const usoAg = conta((e) => (e.tipo === 'pedido' || e.tipo === 'inicio') && e.agente !== 'Orquestrador' ? e.agente : null);
  const uso = (n) => n ? `<span class="uso">usado ${n}× no mês</span>` : '<span class="uso nunca">não usado no mês</span>';
  const sec = (tipo, conteudo, extra = '') => `<div class="sec-cat" style="--cor:${TIPOS[tipo].cor}"><div class="sec-cab"><span class="ic">${TIPOS[tipo].icone}</span><div><b>${TIPOS[tipo].plural}${extra}</b><p>${esc(TIPOS[tipo].explica)}</p></div></div>${conteudo}</div>`;
  const item = (nome, desc, extra = '') => `<div class="item-cat"><div><b>${esc(nome)}</b>${extra}</div>${desc ? `<p>${esc(desc)}</p>` : ''}</div>`;
  const conectores = new Map((info.mcp || []).map((m) => [nomeConector(m.nome), m]));
  for (const k of usoCon.keys()) if (!conectores.has(k)) conectores.set(k, { nome: k, origem: 'conta Claude' });
  const velha = !info.skills;
  let html = `<div class="filtros">${pessoas().map((p) => `<button data-pc="${esc(p)}" class="${p === pessoaCatalogo ? 'on' : ''}">Equipe de ${esc(p)}</button>`).join('')}</div>
    <div class="legenda-tipos">${Object.entries(TIPOS).map(([k, t]) => `<div style="--cor:${t.cor}"><span>${t.icone}</span><b>${t.rot}</b><small>${t.curta}</small></div>`).join('')}</div>
    <p class="sub dica-cat">Personagens com mesa: 👑 🤖 🧠 🔌 🛠️. Skills 📘 e plugins 📦 não são pessoas: são receitas e pacotes que os personagens usam.</p>`;
  html += sec('assistente', item(`Assistente de ${pessoaCatalogo}`, 'Recebe seus pedidos (aqui ou no VS Code) e coordena todo mundo.'));
  html += sec('agente', (info.agentes || []).map((a) => item(tituloDe(a.nome), descricaoHumana(a.descricao), ` <span class="modelo claude">${esc(/haiku|sonnet|opus|fable/i.exec(a.modelo || '')?.[0] || a.modelo || 'Claude')}</span> ${uso(usoAg.get(a.nome))}`)).join('') || '<p class="sub">Nenhum agente listado ainda (a ponte manda a lista quando liga).</p>');
  html += sec('ia', item('Codex (GPT, da OpenAI)', 'Revisa, dá nota e faz tarefas separadas. Converse com ele no chat da assistente escolhendo "Codex".', uso(usoAg.get('Codex'))));
  html += sec('skill', velha ? '<p class="sub">Atualize a ponte deste PC para listar as skills.</p>' : (info.skills || []).sort((a, b) => (usoSkill.get(b.nome) || 0) - (usoSkill.get(a.nome) || 0)).map((s) => item(s.nome, descricaoHumana(s.descricao), ` <span class="origem">${esc(s.origem)}</span> ${uso(usoSkill.get(s.nome))}`)).join(''), ` (${(info.skills || []).length})`);
  html += sec('plugin', [...conectores.values()].map((c) => item(nomeConector(c.nome), '', ` <span class="origem">${esc(c.origem)}</span> ${uso(usoCon.get(nomeConector(c.nome)))}`)).join('') || '<p class="sub">Nenhum conector.</p>');
  html += sec('programa', item('Godot', 'Abre e testa o jogo.', uso(usoAg.get('Godot'))) + item('Render (Remotion)', 'Monta e exporta os vídeos.', uso(usoAg.get('Render'))) + item('ffmpeg', 'Corta e converte vídeo e imagem; faz as miniaturas.', info.ffmpeg ? ' <span class="uso">instalado</span>' : ' <span class="uso nunca">não instalado</span>'));
  if (info.plugins?.length) html += sec('pacote', info.plugins.map((p) => item(p.nome, '', ` <span class="origem">${esc(p.origem)}</span>`)).join(''));
  $('#listaCatalogo').innerHTML = html;
  $('#listaCatalogo').onclick = (e) => { const b = e.target.closest('[data-pc]'); if (b) { pessoaCatalogo = b.dataset.pc; desenharCatalogo(); } };
}

// ---------- "Mais" (celular) ----------
function desenharMais() {
  const itens = [['missoes', '◆', 'Missões', 'Cada pedido, com resumo'], ['equipe', '☰', 'Equipe', 'Quem está fazendo o quê agora'], ['historico', '◷', 'Histórico', 'O que fizemos, por dia e por frente'], ['galeria', '▣', 'Galeria', 'Vídeos e imagens entregues'], ['jornal', '▤', 'Diário do Estúdio', 'O jornal do dia'], ['ajuda', '?', 'Ajuda', 'Como ler o escritório'], ['ajustes', '⚙', 'Ajustes', 'Status, avisos, convite, pausa']];
  $('#listaMais').innerHTML = itens.map(([id, ic, t, d]) => `<button data-ir-aba="${id}"><span class="ic">${ic}</span><b>${t}</b><small>${d}</small></button>`).join('');
  $('#listaMais').onclick = (e) => { const b = e.target.closest('[data-ir-aba]'); if (!b) return; const id = b.dataset.irAba; if (id === 'jornal') abrirJornal(); else if (id === 'ajuda') abrirAjuda(); else abrirAba(id, true); };
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
      ${Object.keys(TIPOS).map((k) => `<p>${etiquetaTipo(k)} ${esc(TIPOS[k].curta)}</p>`).join('')}
      <h3>Frentes</h3>
      <p>Dois setores: ${SETORES.map((x) => `${x.icone} <b>${x.nome}</b> (${esc(x.descricao.toLowerCase())})`).join(' e ')}. Dois jogos: ${JOGOS.slice(0, 2).map((j) => `${j.icone} <b>${esc(j.nome)}</b>`).join(' e ')}. Cada missão cai sozinha no jogo e no setor certos.</p><p>No mapa, a ala da esquerda é Criação e a da direita é Marketing; cada fileira é um jogo. <b>Quem está sentado está trabalhando</b>; quem está livre fica na copa. A faixa <b>Agora</b> lista todo mundo que está trabalhando.</p>
      <p>Cada um tem uma sala de vidro com a assistente na recepção. As baias da sua equipe ficam do lado da sua sala.</p>
      <h3>Estados</h3>
      <div class="legenda">${est('alerta')}${est('erro')}${est('trab')}${est('fim')}${est('livre')}</div>
      <p>Trabalhando, o boneco digita e a tela do PC anima. Livre, às vezes levanta para tomar café.</p>
      <h3>Onde ver as coisas</h3>
      <p><b>Resumo</b> (🔔): precisa de você, travou, rodando agora e pronto nas últimas 12 h. É onde ligar os avisos no celular e o modo <b>Estou longe do PC</b>.</p>
      <p><b>Equipe</b>: todo mundo agrupado por atenção. Clique para a câmera ir até a pessoa.</p>
      <p><b>Missões</b>: cada pedido, agrupado por frente, com um resumo em português, quem ajudou e o resultado. O passo a passo técnico fica recolhido.</p>
      <p><b>Histórico</b>: o que vocês fizeram por dia, com o placar de cada frente.</p>
      <p><b>Dupla</b>: a conversa entre vocês dois, com reações, recados fixados e missões compartilhadas.</p>
      <p><b>Assistente</b>: uma conversa por tarefa, com a assistente (Claude) ou com o Codex (GPT). Pedidos de permissão aparecem com Permitir/Negar.</p>
      <p><b>Diário</b>: o jornal do dia (manchete no topo; o jornal fica na mesa do salão).</p>
      <h3>Atalhos</h3>
      <p>Clique no chão para andar · <kbd>WASD</kbd> também anda</p>
      <p><kbd>Tab</kbd> equipe · <kbd>H</kbd> missões · <kbd>L</kbd> histórico · <kbd>C</kbd> assistente · <kbd>M</kbd> dupla · <kbd>G</kbd> galeria · <kbd>I</kbd> quem é quem · <kbd>J</kbd> diário · <kbd>?</kbd> esta ajuda</p>
      <p><kbd>+</kbd>/<kbd>−</kbd> zoom · <kbd>Esc</kbd> fecha</p>
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
    <div class="campo"><span>Atalhos</span><div class="sub" style="text-align:left">WASD/setas anda · Shift skate · clique no chão anda até lá · E fala · Tab equipe · H missões · L histórico · C assistente · M dupla · G galeria · I quem é quem · J diário · Q acena · K vai até o outro · 1–6 emotes · +/− zoom · Esc fecha</div></div>
    <div class="campo"><span>Créditos</span><div class="sub" style="text-align:left">Arte: <a href="https://github.com/pablodelucca/pixel-agents" target="_blank" rel="noopener" style="color:var(--laranja)">Pixel Agents</a> (MIT), personagens baseados em Metro City (JIK-A-4).</div></div>
    <div class="campo"><button class="btn" id="btnSair">Sair</button></div>`;
  $('#selStatus').value = st.status || 'disponivel';
  $('#selStatus').onchange = (e) => R.mudarStatus(e.target.value);
  $('#chkSom').onchange = (e) => guarda('som', e.target.checked ? '1' : '0');
  $('#btnNotif').onclick = async () => { await Notification.requestPermission(); desenharAjustes(); };
  $('#btnPausa').onclick = async () => { try { await R.pausar(!st.pausado); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#formConvite').onsubmit = async (e) => { e.preventDefault(); try { await R.convidar($('#emailConvite').value, $('#nomeConvite').value.trim()); toast({ titulo: 'Convite feito', texto: 'Nenhum e-mail é enviado agora. Mande o link do site para a pessoa: ela entra com esse e-mail, recebe o código e já vira membro.', cor: '#4fbf82' }); } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); } };
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
    ev(30, 'Kenny', 'Codex', 'pedido', 'Refatora o sistema de inventário do jogo novo', { origem: 'vscode', sessao: 'cx1', projeto: 'jogo-novo' }),
    ev(22, 'Kenny', 'Codex', 'fim', 'Separei Inventory em InventoryModel e InventoryView; 14 arquivos mudaram.', { origem: 'vscode', sessao: 'cx1', projeto: 'jogo-novo' }),
    ev(47, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Skill', alvo: 'video-do-jogo' }),
    ev(44, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Read', alvo: 'beats.json', modo: 'ler' }),
    ev(43, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Read', alvo: 'ShortRaioFogo.tsx', modo: 'ler' }),
    ev(15, 'Kenny', 'Orquestrador', 'inicio', 'Desenha o baú do inventário no PixelLab e coloca na tela', { sessao: 's3', projeto: 'jogo-novo' }),
    ev(14, 'Kenny', 'Orquestrador', 'atividade', '', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'Skill', alvo: 'hud-em-jogo' }),
    ev(13, 'Kenny', 'PixelLab', 'inicio', 'Orquestrador: create_image_pixflux', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'mcp__pixellab__create_image_pixflux', alvo: 'baú de madeira' }),
    ev(11, 'Kenny', 'PixelLab', 'fim', 'Imagem pronta: bau_128.png', { sessao: 's3', projeto: 'jogo-novo' }),
    ev(10, 'Kenny', 'Orquestrador', 'atividade', '', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'Edit', alvo: 'inventario.tscn', modo: 'escrever' }),
    ev(9.5, 'Kenny', 'Orquestrador', 'espera', 'esperando você', { sessao: 's3', projeto: 'jogo-novo', resposta: 'Baú desenhado (128 px) e colocado no canto da tela de inventário. Abre com a tecla I.' }),
    ev(200, 'Rafael', 'Orquestrador', 'inicio', 'Melhora o escritório: frentes, histórico e conversa da dupla', { sessao: 's4', projeto: 'genesis-estudio' }),
    ev(195, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'WebSearch', alvo: 'agent dashboard workstreams' }),
    ev(180, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'Edit', alvo: 'app.js', modo: 'escrever' }),
    ev(178, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'Edit', alvo: 'frentes.js', modo: 'escrever' }),
    ev(170, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's4', projeto: 'genesis-estudio', resposta: 'Pronto: faixa de frentes no mapa, missões agrupadas, histórico por dia e a conversa da dupla.' }),
    ev(1500, 'Rafael', 'Orquestrador', 'inicio', 'Balanceia o Dragão do Inverno no Veterano com os bots', { sessao: 's5' }),
    ev(1490, 'Rafael', 'balanceador', 'pedido', 'Orquestrador pediu: rodar 30 partidas no Veterano', { sessao: 's5' }),
    ev(1480, 'Rafael', 'balanceador', 'atividade', '', { sessao: 's5', ferramenta: 'Bash', alvo: 'Bots jogando ::: godot --headless -s playtest_rodada.gd', modo: 'executar' }),
    ev(1440, 'Rafael', 'balanceador', 'fim', 'Taxa de vitória 38% → 52% com vida -10% e sopro a cada 6 s.', { sessao: 's5' }),
    ev(1438, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's5', resposta: 'Dragão do Inverno ajustado: vitória dos bots subiu de 38% para 52% no Veterano.' }),
  ]);
  estados.set('Rafael', { pessoa: 'Rafael', ponte_visto: new Date().toISOString(), branch: 'gen-186-trailer-v2', projeto: 'genesis-game', info: { projetos: [{ nome: 'genesis-game' }], ffmpeg: true, vapid: 'demo', push: [], longe: false, agentes: [{ nome: 'balanceador', modelo: 'haiku', descricao: 'Ajusta números de gameplay em data/.' }, { nome: 'explorador', modelo: 'haiku', descricao: 'Lê o projeto e responde perguntas sem mexer em nada.' }, { nome: 'revisor-godot', modelo: 'sonnet', descricao: 'Revisa código GDScript antes do commit.' }, { nome: 'editor-de-video', modelo: 'sonnet', descricao: 'Monta Shorts e trailers no Remotion com cortes no compasso.' }],
    skills: [{ nome: 'video-do-jogo', descricao: 'Use quando for gravar, montar ou renderizar um vídeo do Genesis', origem: 'projeto' }, { nome: 'balanceamento-com-bots', descricao: 'Use quando for balancear uma dificuldade com bots jogando', origem: 'projeto' }, { nome: 'hud-em-jogo', descricao: 'Use quando for desenhar ou mudar a HUD dentro da partida', origem: 'projeto' }],
    mcp: [{ nome: 'pixellab', origem: 'pessoal' }, { nome: 'blender', origem: 'pessoal' }, { nome: 'notion', origem: 'projeto' }], plugins: [{ nome: 'claude-code-setup', origem: 'claude-plugins-official' }] } });
  estados.set('Kenny', { pessoa: 'Kenny', ponte_visto: new Date().toISOString(), branch: 'v0.2-loja-classes', projeto: 'genesis-game' });
  const quando = (min) => new Date(ag - min * 60e3).toISOString();
  recados = [
    { id: 1, pessoa: 'Kenny', texto: 'Reunião de sexta: decidir a loja de classes', cor: 'azul', criado: quando(900) },
    { id: 2, pessoa: 'Kenny', texto: 'Subi o fix do dash na main, pode puxar 🙏', cor: 'msg', criado: quando(40) },
    { id: 3, pessoa: 'Rafael', texto: 'Boa! Vou puxar depois do render do Short', cor: 'msg', criado: quando(38) },
    { id: 4, pessoa: 'Kenny', texto: JSON.stringify({ id: `Kenny|s3|${ag - 15 * 60e3}`, titulo: 'Desenha o baú do inventário no PixelLab e coloca na tela', frente: 'cook:criacao', pessoa: 'Kenny' }), cor: 'missao', criado: quando(9) },
    { id: 5, pessoa: 'Kenny', texto: 'Olha o baú do jogo novo @Rafael 👀', cor: 'msg', criado: quando(9) },
    { id: 6, pessoa: 'Rafael', texto: '🔥 4', cor: 'reacao', criado: quando(8) },
  ].reverse();
  const dia = (d) => new Date(ag + d * 86400e3).toISOString().slice(0, 10);
  temQuadro = true;
  marcos = [
    { id: 1, titulo: 'Short "Raio + Fogo = ?"', descricao: 'Short de 20 s para o YouTube mostrando o combo.', jogo: 'genesis', setor: 'marketing', coluna: 'fazendo', responsavel: 'Rafael', prioridade: 1, prazo: dia(2), etapas: [{ t: 'Roteiro', feito: true, por: 'Rafael' }, { t: 'Gravação', feito: true }, { t: 'Edição no compasso', feito: false }, { t: 'Nota do Codex', feito: false }], palavras: 'short, raio, fogo', area: 'vídeo', arquivos: 'tools/video/*', branch: 'gen-186-trailer-v2', ordem: 1, criado_por: 'Rafael', criado: quando(3000) },
    { id: 2, titulo: 'Dash do player', descricao: 'Dash com invencibilidade curta.', jogo: 'genesis', setor: 'criacao', coluna: 'fazendo', responsavel: 'Kenny', prioridade: 2, prazo: dia(-1), etapas: [{ t: 'Mecânica', feito: true }, { t: 'Teste automático', feito: false }], palavras: 'dash, player', area: 'player', arquivos: 'scripts/player/*', branch: 'v0.2-loja-classes', ordem: 2, criado_por: 'Kenny', criado: quando(5000) },
    { id: 3, titulo: 'Inventário do Cook', descricao: 'Baú, slots e arrastar ingredientes.', jogo: 'cook', setor: 'criacao', coluna: 'fazendo', responsavel: 'Kenny', prioridade: 1, prazo: dia(5), etapas: [{ t: 'Modelo e tela separados', feito: true }, { t: 'Baú', feito: false }, { t: 'Arrastar itens', feito: false }], palavras: 'inventário, baú', area: 'UI', arquivos: '', branch: '', ordem: 3, criado_por: 'Kenny', criado: quando(4000) },
    { id: 4, titulo: 'Trailer de lançamento', descricao: '60 s, para a página da Steam.', jogo: 'genesis', setor: 'marketing', coluna: 'afazer', responsavel: 'Rafael', prioridade: 1, prazo: dia(14), etapas: [], palavras: 'trailer, lançamento', area: '', arquivos: '', branch: '', ordem: 4, criado_por: 'Rafael', criado: quando(6000) },
    { id: 5, titulo: 'Página da Steam do Cook', descricao: '', jogo: 'cook', setor: 'marketing', coluna: 'ideias', responsavel: null, prioridade: 2, prazo: null, etapas: [], palavras: 'steam', area: '', arquivos: '', branch: '', ordem: 5, criado_por: 'Kenny', criado: quando(7000) },
    { id: 6, titulo: 'Balanceamento do Veterano', descricao: 'Taxa de vitória dos bots entre 45% e 55%.', jogo: 'genesis', setor: 'criacao', coluna: 'revisar', responsavel: 'Rafael', prioridade: 2, prazo: null, etapas: [{ t: 'Dragão do Inverno', feito: true }, { t: 'Morvane', feito: true }], palavras: 'balanceia, veterano, dragão', area: 'data/enemies.json', arquivos: '', branch: '', ordem: 6, criado_por: 'Rafael', criado: quando(9000) },
    { id: 7, titulo: 'Escritório virtual 2.0', descricao: '', jogo: 'estudio', setor: 'criacao', coluna: 'feito', responsavel: 'Rafael', prioridade: 2, prazo: null, etapas: [], palavras: '', area: '', arquivos: '', branch: '', ordem: 7, criado_por: 'Rafael', criado: quando(9000), concluido: quando(160) },
  ];
  comentarios = [{ id: 1, marco_id: 1, pessoa: 'Kenny', texto: 'O corte do compasso 2 ficou top!', criado: quando(30) }];
  D.adicionar([
    ev(3, 'Kenny', 'Orquestrador', 'inicio', 'Faz o baú do inventário abrir com animação', { sessao: 's6', projeto: 'jogo-novo' }),
    ev(2.5, 'Kenny', 'explorador', 'pedido', 'Orquestrador pediu: achar onde o baú abre', { sessao: 's6', projeto: 'jogo-novo' }),
    ev(0.4, 'Kenny', 'explorador', 'atividade', '', { sessao: 's6', projeto: 'jogo-novo', ferramenta: 'Grep', alvo: 'abrir_bau em scripts' }),
    ev(25, 'Rafael', 'Orquestrador', 'inicio', 'Refaz a voz do devlog com um filtro mais suave', { sessao: 's7', projeto: 'devlog_1mes', pasta: 'C:/Users/rafon/projetos/genesis-game/_video/devlog_1mes' }),
    ev(6, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's7', projeto: 'devlog_1mes', pasta: 'C:/Users/rafon/projetos/genesis-game/_video/devlog_1mes', resposta: 'A rotina está rodando em segundo plano. Te aviso quando terminar.' }),
  ]);
  conversas = [{ id: 1, titulo: 'Short Raio + Fogo', alvo: 'claude', projeto: 'genesis-game', atualizado: new Date().toISOString() }, { id: 2, titulo: 'Revisar o inventário', alvo: 'codex', projeto: 'genesis-game', atualizado: new Date().toISOString() }];
  conversaAtual = 1; chatCarregadoDe = 1;
  mensagens = [{ de: 'eu', texto: 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex' }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Read', entrada: { file_path: 'shots.json' } }) }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Agent', entrada: { subagent_type: 'editor-de-video', description: 'montar Short' } }) }, { de: 'assistente', texto: 'Mandei o **Editor** montar o Short (~19 s, corte no compasso). Quando sair o render, peço a nota ao `Codex`.\n- trilha: menu 129 BPM\n- 5 cortes' }];
  aprovacoes = [{ id: 9, ferramenta: 'mcp__blender__generate_3d', detalhe: JSON.stringify({ prompt: 'espada do Gatuno, low poly' }), conversa_id: 1, criado: new Date(ag - 60e3).toISOString(), status: 'pendente' },
    { id: 10, ferramenta: 'Bash', detalhe: JSON.stringify({ command: 'npx remotion render ShortRaioFogo out/short-raio-fogo.mp4 --concurrency=4', description: 'Renderiza o Short', origem: { terminal: true, projeto: 'genesis-game', agente: 'editor-de-video' } }), conversa_id: null, criado: new Date(ag - 30e3).toISOString(), status: 'pendente' }];
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
