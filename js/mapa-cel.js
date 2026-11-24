// Escritório no celular (e um pouco no PC): o mapa pensado para a tela pequena.
//   · Visão geral: o andar inteiro cabe na largura; embaixo, os números do dia e quem está fazendo o quê.
//   · Setores: chips "Tudo · Criação · Marketing · Copa · Sua sala" aproximam e recentralizam.
//   · Indicadores pixel em cima de cada boneco: fazendo (laranja), esperando você (amarelo, !) e livre (verde).
//   · Ficha inferior: tocar em alguém mostra nome, tarefa e a próxima ação (sem abrir a tela inteira).
// O app.js só passa o contexto (câmera, zoom, ações) em ligar(); o resto mora aqui.
import { T, MW, MH, SALAS } from './mapa.js';
import { frase, primeiraFrase } from './humano.js';
import * as D from './dados.js';
import * as Hoje from './funcoes-hoje.js';

let ctx = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cel = () => innerWidth <= 760;

// Estado do boneco em 3 grupos simples (mesmas cores na legenda, nos números e no mapa).
const GRUPO = { alerta: 'esperando', erro: 'esperando', trab: 'fazendo', semsinal: 'fazendo' };
export const grupoDe = (b) => GRUPO[b?.status] || 'livre';
const ROT_GRUPO = { fazendo: 'Fazendo', esperando: 'Esperando você', livre: 'Livre' };

// Setores: centro (em tiles) e quantos tiles de largura devem caber na tela.
function setores() {
  const eu = ctx.eu()?.pessoa, s = SALAS[Math.max(0, ctx.pessoas().indexOf(eu))] || SALAS[0];
  return {
    criacao: { nome: 'Criação', cx: 10.5, cy: 16.5, larg: 20 },
    marketing: { nome: 'Marketing', cx: 30, cy: 16.5, larg: 20 },
    copa: { nome: 'Copa', cx: 20, cy: 24.8, larg: 18 },
    sala: { nome: 'Sala', cx: (s.x0 + s.x1 + 1) / 2, cy: 6.2, larg: 12 },
  };
}
const BARRA = 52, FAIXA = 46; // alturas da barra de setores e da faixa de números (px)
let setorAtual = 'geral', zoomDoSetor = 0;

export function ligar(c) {
  ctx = c;
  montarBarra(); montarPainel(); montarFicha();
  const ind = document.createElement('div'); ind.id = 'indMapa'; ind.className = 'ind-mapa'; ind.setAttribute('aria-hidden', 'true');
  $('#camada')?.after(ind);
  // tocar no mapa (ou arrastar) fecha a ficha; o toque num boneco reabre logo depois (pointerup)
  $('#tela')?.addEventListener('pointerdown', () => fecharFicha());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFicha(); });
  requestAnimationFrame(quadro);
  setInterval(desenharPainel, 6e3);
  for (const ms of [400, 1500, 3000]) setTimeout(desenharPainel, ms);
}

// ======================= barra de setores (chips) =======================
function montarBarra() {
  if ($('#setoresMapa')) return;
  const el = document.createElement('nav');
  el.id = 'setoresMapa'; el.className = 'setores-mapa'; el.setAttribute('aria-label', 'Aproximar um setor do escritório');
  $('#palco').appendChild(el);
  desenharBarra();
  el.onclick = (e) => { const b = e.target.closest('[data-setor]'); if (b) irSetor(b.dataset.setor); };
  // com o mapa aproximado, os números do dia ficam numa faixa fina logo abaixo dos setores
  const f = document.createElement('div'); f.id = 'resumoSetor'; f.className = 'resumo-setor';
  $('#palco').appendChild(f);
  f.onclick = (e) => { const rd = e.target.closest('[data-rd]'); if (rd) irResumo(rd.dataset.rd); };
}
function desenharBarra() {
  const el = $('#setoresMapa'); if (!el || !ctx.eu()) return;
  const S = setores();
  const chip = (id, nome) => `<button type="button" data-setor="${id}" class="${setorAtual === id ? 'on' : ''}" aria-pressed="${setorAtual === id}">${esc(nome)}</button>`;
  const html = `<div class="sm-chips">${chip('geral', 'Tudo')}${Object.entries(S).map(([id, s]) => chip(id, s.nome)).join('')}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
export function irSetor(id) {
  fecharFicha();
  const w = $('#palco').clientWidth;
  if (id === 'geral' || !setores()[id]) { setorAtual = 'geral'; ctx.vista(0, null); }
  else {
    const s = setores()[id], z = Math.max(1, Math.min(3, w / (s.larg * T)));
    setorAtual = id; zoomDoSetor = z;
    ctx.vista(z, [s.cx * T, s.cy * T]);
  }
  desenharBarra(); desenharPainel();
}
// Na visão geral, tocar num pedaço do chão aproxima o setor dele.
const setorDoPonto = (x, y) => { const tx = x / T, ty = y / T; return ty >= 22 ? 'copa' : ty >= 11 ? (tx < 20.5 ? 'criacao' : 'marketing') : (Math.abs(tx - setores().sala.cx) < 7 ? 'sala' : null); };
export function tocarGeral(x, y) {
  if (ctx.zoom() >= 1) return false;
  const id = setorDoPonto(x, y);
  if (!id) return false;
  irSetor(id); return true;
}
// Ao abrir no celular, a câmera já começa perto (bonecos em tamanho de toque): no setor de quem
// espera você; se ninguém espera, onde há mais gente sua trabalhando. "Tudo" fica a um toque.
let comecou = false;
function setorInicial() {
  const eu = ctx.eu()?.pessoa, conta = {};
  let espera = null;
  for (const b of ctx.mundo().agentes.values()) {
    const s = setorDoPonto(b.x, b.y); if (!s || s === 'copa') continue;
    if (b.status === 'alerta' && b.pessoa === eu && !espera) espera = s;
    if (grupoDe(b) === 'fazendo') conta[s] = (conta[s] || 0) + (b.pessoa === eu ? 2 : 1);
  }
  return espera || Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || 'criacao';
}
function talvezComecar() {
  if (comecou || !cel()) return;
  const m = ctx.mundo(); if (!ctx.eu() || !m || m.agentes.size < 2) return;
  comecou = true;
  if (setorAtual === 'geral' && ctx.zoom() < 1 && !fichaDe) irSetor(setorInicial());
}
// Na visão geral os bonecos são pequenos: o toque pega quem estiver mais perto (até ~24 px na tela).
// Vale do indicador (acima da cabeça) até os pés: tocar no quadradinho também abre a ficha.
export function agenteNoToque(x, y) {
  const z = ctx.zoom();
  const raio = 22 / z; let melhor = null, dmin = raio;
  for (const b of ctx.mundo().agentes.values()) {
    const cima = (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar?.dir === 'cima' ? 22 : 4) - 16, baixo = b.y;
    const dy = y < cima ? cima - y : y > baixo ? y - baixo : 0, d = Math.hypot((b.x - x) * 1.4, dy);
    if (d < dmin) { dmin = d; melhor = b; }
  }
  return melhor;
}

// ======================= painel da visão geral (embaixo do mapa) =======================
function montarPainel() {
  if ($('#painelGeral')) return;
  const el = document.createElement('section');
  el.id = 'painelGeral'; el.className = 'painel-geral'; el.setAttribute('aria-label', 'Resumo do escritório');
  $('#palco').appendChild(el);
  const dica = document.createElement('div'); // só uma etiqueta: o toque vai para o mapa embaixo
  dica.id = 'dicaGeral'; dica.className = 'dica-geral'; dica.textContent = 'Toque num setor para aproximar';
  $('#palco').appendChild(dica);
  el.onclick = (e) => {
    const rd = e.target.closest('[data-rd]'); if (rd) { irResumo(rd.dataset.rd); return; }
    if (e.target.closest('[data-custo]')) { Hoje.abrirEm('custo'); return; }
    const a = e.target.closest('[data-agora]'); if (a) { const b = [...ctx.mundo().agentes.values()].find((x) => x.m?.k === a.dataset.agora); if (b) abrirFicha(b, true); else ctx.localizar(a.dataset.agora); }
  };
}
// Para onde cada número leva (o mesmo no Escritório, na Atividade e no Hoje).
export function irResumo(qual) {
  fecharFicha();
  if (qual === 'fila') Hoje.abrirEm('fila');
  else if (qual === 'fazendo') ctx.abrirAba('equipe');
  else if (qual === 'esperando') ctx.abrirAba('atencao');
  else if (qual === 'custo') Hoje.abrirEm('custo');
}
let ultResumo = null;
export async function desenharPainel() {
  if (!ctx?.eu() || !ctx.mundo()) return;
  let r = null;
  try { r = await Hoje.resumoDoDia(); } catch (e) { console.warn('resumo do dia:', e); }
  if (!r) return;
  ultResumo = r;
  desenharResumoAtividade(r);
  // PC: os mesmos números numa faixa no canto do mapa (no lugar do contador antigo)
  let pc = $('#resumoPC');
  if (!pc) { pc = document.createElement('div'); pc.id = 'resumoPC'; pc.className = 'resumo-pc'; $('#palco').appendChild(pc); pc.onclick = (e) => { const rd = e.target.closest('[data-rd]'); if (rd) irResumo(rd.dataset.rd); }; }
  const hpc = Hoje.htmlNumerosDia(r, { custo: true });
  if (pc.dataset.h !== hpc) { pc.innerHTML = hpc; pc.dataset.h = hpc; }
  const fs = $('#resumoSetor'), hfs = Hoje.htmlNumerosDia(r, { curto: true });
  if (fs && fs.dataset.h !== hfs) { fs.innerHTML = hfs; fs.dataset.h = hfs; }
  talvezComecar();
  const el = $('#painelGeral'); if (!el) return;
  // quantos cabem inteiros entre os números e o pedido (celular baixo: 1; alto: até 3); o resto está em "Fazendo"
  const ativos = ctx.quemTrabalha().slice(0, Math.max(1, Math.min(3, Math.floor((innerHeight - 800) / 50) + 1)));
  const linhas = await Promise.all(ativos.map(async ({ m, cls }) => {
    let acao = D.emSegundoPlano(m) ? 'rodando em segundo plano' : cls === 'semsinal' ? 'sem sinal há um tempo' : m.ult ? primeiraFrase(frase(m.ult), 60) : 'pensando…';
    if (cls === 'alerta') acao = autorizar(acao).replace(/^Autorizar:/, 'Espera você autorizar:');
    const g = cls === 'alerta' || cls === 'erro' ? 'esperando' : 'fazendo';
    return `<button type="button" class="pg-agora ${g}" data-agora="${esc(m.k)}"><img src="${await ctx.retratoDe(m.nome)}" alt=""><span><b>${esc(ctx.nomeAgente(m))}</b><small>${esc(acao)}</small></span><i class="ind ${g}" aria-hidden="true"></i></button>`;
  }));
  const html = `<p class="pg-legenda" aria-label="Legenda do mapa"><span><i class="ind fazendo"></i>fazendo</span><span><i class="ind esperando"></i>espera você decidir</span><span><i class="ind livre"></i>livre</span></p>
    ${Hoje.htmlNumerosDia(r, { custo: true })}
    <div class="pg-lista">${linhas.join('') || '<p class="pg-vazio">Ninguém trabalhando agora. A equipe está na copa.</p>'}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
// Atividade › Resumo: os mesmos três números no topo (fica fora das listas que o app redesenha).
function desenharResumoAtividade(r) {
  const sec = document.querySelector('[data-painel="atencao"]'); if (!sec) return;
  let el = $('#resumoDiaAtiv');
  if (!el) { el = document.createElement('div'); el.id = 'resumoDiaAtiv'; el.className = 'resumo-dia-ativ'; sec.prepend(el); el.onclick = (e) => { const rd = e.target.closest('[data-rd]'); if (rd) irResumo(rd.dataset.rd); else if (e.target.closest('[data-custo]')) Hoje.abrirEm('custo'); }; }
  const html = Hoje.htmlNumerosDia(r, { custo: true });
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

// ======================= ficha inferior (quem você tocou) =======================
let fichaDe = null;
function montarFicha() {
  if ($('#fichaMapa')) return;
  const el = document.createElement('section');
  el.id = 'fichaMapa'; el.className = 'ficha-mapa'; el.hidden = true; el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  el.onclick = (e) => {
    const b = fichaDe; if (!b) return;
    if (e.target.closest('[data-ficha-fechar]')) { fecharFicha(); return; }
    const ac = e.target.closest('[data-ficha]'); if (!ac) return;
    const q = ac.dataset.ficha;
    fecharFicha();
    if (q === 'detalhes') ctx.abrirAgente(b);
    else if (q === 'decidir') ctx.abrirAba('atencao');
    else if (q === 'conversar') ctx.abrirChat(b.lugar?.codex ? 'codex' : 'claude');
    else if (q === 'pedir') ctx.pedir();
    else if (q === 'dupla') ctx.abrirAba('dupla');
  };
}
const autorizar = (t) => t.replace(/^Quer permissão para:?\s*/i, 'Autorizar: ').replace(/^Autorizar: (\S+)ndo\b/, (x, r) => `Autorizar: ${r}r`);
function proximaAcao(b) {
  const g = grupoDe(b), meu = b.pessoa === ctx.eu()?.pessoa, m = b.m || {};
  const assist = b.lugar?.assistente || b.lugar?.codex;
  if (g === 'esperando') return meu
    ? { texto: b.status === 'erro' ? 'Deu erro e parou. Veja o que aconteceu e diga como seguir.' : 'Parado até você autorizar ou recusar.', botao: ['decidir', b.status === 'erro' ? 'Ver o erro' : 'Revisar autorização'] }
    : { texto: `Está esperando o ${b.pessoa} decidir. Nada para você aqui.`, botao: ['dupla', `Falar com o ${b.pessoa}`] };
  if (g === 'fazendo') return { texto: b.status === 'semsinal' ? 'Continua rodando, mas sem dar notícia há alguns minutos. Se demorar, confira os detalhes.' : 'Segue sozinho. Você só precisa agir se ele pedir.', botao: null };
  if (assist && meu) return { texto: 'Livre agora. Converse para pedir algo novo.', botao: ['conversar', 'Conversar'] };
  if (!meu) return { texto: `Livre. Faz parte da equipe do ${b.pessoa}.`, botao: null };
  return { texto: m.ult?.tipo === 'fim' ? 'Entregou e está livre para o próximo pedido.' : 'Livre, na copa. Faça um pedido e a assistente chama quem precisar.', botao: ['pedir', 'Novo pedido'] };
}
export async function abrirFicha(b, centrar = false) {
  if (!b) return false;
  fichaDe = b;
  const g = grupoDe(b), m = b.m || {}, nome = ctx.nome(b), px = proximaAcao(b);
  let tarefa = g === 'livre' ? (m.ult?.tipo === 'fim' ? `Última entrega: ${primeiraFrase(m.ult.resposta || frase(m.ult), 90)}` : 'Nenhuma tarefa agora.') : D.emSegundoPlano(m) ? 'Rodando uma tarefa em segundo plano.' : m.ult ? primeiraFrase(frase(m.ult), 110) : 'Pensando…';
  // "Quer permissão para: gerando um modelo 3D" → "Autorizar: gerar um modelo 3D" (o que você vai decidir)
  if (b.status === 'alerta') tarefa = autorizar(tarefa);
  const missao = m.ult?._m?.titulo && g !== 'livre' ? primeiraFrase(m.ult._m.titulo, 140) : '';
  const estado = b.status === 'alerta' ? 'Aguardando sua autorização' : b.status === 'erro' ? 'Parou com erro' : ROT_GRUPO[g];
  const quando = m.ult?.t ? D.ha(m.ult.t) : '';
  const el = $('#fichaMapa');
  el.innerHTML = `<div class="fm-cab"><img src="${await ctx.retratoDe(b.m?.nome || b.nome)}" alt=""><div class="fm-nome"><b>${esc(nome.replace(/^\S+\s/, (x) => /\p{Extended_Pictographic}/u.test(x) ? '' : x))}</b><span class="fm-est ${g}"><i class="ind ${g}" aria-hidden="true"></i>${b.pessoa === ctx.eu()?.pessoa || g !== 'esperando' ? estado : 'Esperando o ' + esc(b.pessoa)}${b.pessoa && b.pessoa !== ctx.eu()?.pessoa ? ` · do ${esc(b.pessoa)}` : ''}</span></div><button type="button" class="fm-x" data-ficha-fechar aria-label="Fechar">×</button></div>
    <dl class="fm-corpo"><div><dt>Tarefa</dt><dd>${esc(tarefa)}${missao ? `<small>Pedido: ${esc(missao)}${quando ? ` · ${quando === 'agora' ? 'agora' : 'há ' + quando}` : ''}</small>` : ''}</dd></div><div><dt>Próximo</dt><dd>${esc(px.texto)}</dd></div></dl>
    <div class="fm-acoes">${px.botao ? `<button type="button" class="btn forte" data-ficha="${px.botao[0]}">${esc(px.botao[1])}</button>` : ''}<button type="button" class="btn" data-ficha="detalhes">Ver detalhes</button></div>`;
  el.hidden = false; el.className = `ficha-mapa ${g}`;
  document.body.classList.add('ficha-aberta');
  cacheMg.t = 0;
  // a ficha cobre o pé da tela: a câmera leva o boneco para a faixa que sobra (da lista, aproxima também)
  if (centrar || ctx.zoom() >= 1) { const z = centrar ? Math.max(ctx.zoom(), 1.5) : ctx.zoom(); if (z !== ctx.zoom() || setorAtual === 'geral') setorAtual = ''; ctx.vista(z, [b.x, b.y - 10]); desenharBarra(); }
  return true;
}
export function fecharFicha() { if (!fichaDe) return; fichaDe = null; const el = $('#fichaMapa'); if (el) el.hidden = true; document.body.classList.remove('ficha-aberta'); }
export const fichaAberta = () => !!fichaDe;

// ======================= indicadores pixel (por quadro) =======================
const pool = new Map();
function quadro() {
  requestAnimationFrame(quadro);
  const mundo = ctx.mundo(), lay = $('#indMapa'); if (!mundo || !lay || document.hidden) return;
  const z = ctx.zoom(), c = ctx.cam(), w = lay.clientWidth || innerWidth, h = lay.clientHeight || innerHeight;
  // o mapa pode ter mudado de zoom pela pinça: a barra deixa de marcar o setor
  if (setorAtual === 'geral' && z >= 1) { setorAtual = ''; desenharBarra(); }
  else if (setorAtual && setorAtual !== 'geral' && Math.abs(z - zoomDoSetor) > 0.01) { setorAtual = z < 1 ? 'geral' : ''; desenharBarra(); }
  else if (!setorAtual && z < 1) { setorAtual = 'geral'; desenharBarra(); }
  else if (setorAtual && setorAtual !== 'geral' && !c.alvo) { setorAtual = ''; desenharBarra(); } // andou/arrastou: a câmera saiu do setor
  document.body.classList.toggle('mapa-geral', z < 1);
  const usar = cel() || mundo.indicadoresDom;
  mundo.semIcones = !!usar;
  for (const el of pool.values()) el.dataset.v = '';
  if (usar) for (const b of mundo.agentes.values()) {
    const x = (b.x - c.x) * z, topo = (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar?.dir === 'cima' ? 22 : 4);
    const y = (topo - c.y) * z;
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
    let el = pool.get(b.id); const g = grupoDe(b), sel = fichaDe === b;
    if (!el) { el = document.createElement('i'); lay.appendChild(el); pool.set(b.id, el); }
    const cls = `ind ${g}${sel ? ' sel' : ''}`;
    if (el.className !== cls) el.className = cls;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.dataset.v = '1';
  }
  for (const [id, el] of pool) if (!el.dataset.v) { el.remove(); pool.delete(id); }
  // quem está na ficha ganha o nome em cima do indicador (fica claro de quem é a ficha)
  let tag = $('#indNome');
  if (!tag) { tag = document.createElement('b'); tag.id = 'indNome'; tag.className = 'ind-nome'; lay.appendChild(tag); }
  const selEl = fichaDe && usar ? pool.get(fichaDe.id) : null;
  if (selEl?.dataset.v) {
    const nm = (ctx.nome(fichaDe) || '').replace(/^\S+\s/, (x) => /\p{Extended_Pictographic}/u.test(x) ? '' : x);
    if (tag.textContent !== nm) tag.textContent = nm;
    tag.style.transform = selEl.style.transform; tag.hidden = false;
  } else tag.hidden = true;
  // a ficha segue o boneco: se ele sumir (mudou de estado e de lugar), fecha
  if (fichaDe && !mundo.agentes.has(fichaDe.id)) fecharFicha();
}
export const altBarra = BARRA;
// Faixa útil do mapa no celular: a barra de setores cobre o topo; o pedido (ou a ficha) cobre o pé.
let cacheMg = { t: 0, v: { topo: 0, baixo: 0 } };
export function margens() {
  if (!cel() || !ctx) return { topo: 0, baixo: 0 };
  const agora = performance.now(); if (agora - cacheMg.t < 250) return cacheMg.v;
  const palco = $('#palco')?.getBoundingClientRect(); let topoCobre = palco?.bottom || 0;
  for (const s of ['#hudMapa', '#bcAbrir', '#fichaMapa']) { const el = $(s); if (!el || el.hidden) continue; const r = el.getBoundingClientRect(); if (r.height && r.top < topoCobre && r.top > (palco?.top || 0) + 100) topoCobre = r.top; }
  cacheMg = { t: agora, v: { topo: BARRA + (ctx.zoom() >= 1 ? FAIXA : 0), baixo: palco ? Math.max(0, palco.bottom - topoCobre + 6) : 0 } };
  return cacheMg.v;
}
export const resumoAtual = () => ultResumo;
