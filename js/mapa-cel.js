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
import { etapaDe, ETAPAS } from './comando-progresso.js';

let ctx = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cel = () => innerWidth <= 760;

// Estado do boneco em 3 grupos simples (mesmas cores na legenda, nos números e no mapa).
const GRUPO = { alerta: 'esperando', erro: 'esperando', trab: 'fazendo', semsinal: 'fazendo' };
export const grupoDe = (b) => GRUPO[b?.status] || 'livre';
const ROT_GRUPO = { fazendo: 'Fazendo', esperando: 'Esperando você', livre: 'Livre' };

// Setores (salas): centro (em tiles), quantos tiles de largura cabem na tela e os limites da sala.
// Rodada 4: a câmera chega perto (≈ 12 tiles na largura = bonecos com uns 60 px, fáceis de tocar)
// e centraliza onde há gente na sala (quem espera você pesa mais). Arrastar mostra o resto.
function setores() {
  const eu = ctx.eu()?.pessoa, s = SALAS[Math.max(0, ctx.pessoas().indexOf(eu))] || SALAS[0];
  return {
    sala: { nome: 'Sala', cx: (s.x0 + s.x1 + 1) / 2, cy: 6.4, larg: 12, x0: s.x0 - 1, x1: s.x1 + 2, y0: 1, y1: 12, foco: s === SALAS[0] ? [1, 0, 12.8, 11.9] : [27.2, 0, 39, 11.9] },
    reuniao: { nome: 'Reunião', cx: 20, cy: 6.6, larg: 12.5, fixo: true, x0: 13, x1: 27, y0: 1, y1: 12, foco: [12.8, 0, 27.2, 11.9] },
    criacao: { nome: 'Criação', cx: 10.5, cy: 17.6, larg: 12, x0: 1, x1: 20, y0: 12, y1: 23, foco: [1, 13.4, 19, 22.2] },
    marketing: { nome: 'Marketing', cx: 30, cy: 17.6, larg: 12, x0: 20, x1: 39, y0: 12, y1: 23, foco: [21, 13.4, 39, 22.2] },
    copa: { nome: 'Copa', cx: 20, cy: 24.8, larg: 12, x0: 1, x1: 39, y0: 22, y1: 27, foco: [1, 22.6, 39, 27] },
  };
}
// Centro da câmera numa sala: a média de onde estão os bonecos (esperando você = peso 4, fazendo = 2,
// livre = 1), presa nos limites da sala para não mostrar parede à toa.
function centroDoSetor(s, larg) {
  const pts = [];
  for (const b of ctx.mundo()?.agentes.values() || []) {
    const tx = b.x / T, ty = b.y / T;
    if (tx < s.x0 || tx > s.x1 || ty < s.y0 || ty > s.y1) continue;
    const g = grupoDe(b);
    pts.push([tx, g === 'esperando' ? 4 : g === 'fazendo' ? 2 : 1]);
  }
  // janela da largura da tela que pega mais "peso" (assim a copa mostra a roda de conversa, não a mesa vazia do meio)
  let cx = s.cx, melhor = 0;
  if (s.fixo) return [cx * T, s.cy * T]; // sala pequena: enquadra o centro dela, não as pessoas
  for (const [x0] of pts) {
    const dentro = pts.filter(([x]) => x >= x0 - 0.5 && x <= x0 + larg - 1.5), p = dentro.reduce((a, [, w]) => a + w, 0);
    if (p > melhor) { melhor = p; const xs = dentro.map(([x]) => x); cx = (Math.min(...xs) + Math.max(...xs)) / 2; }
  }
  const meio = larg / 2;
  cx = s.x1 - s.x0 <= larg ? (s.x0 + s.x1) / 2 : Math.max(s.x0 + meio, Math.min(s.x1 - meio, cx));
  return [cx * T, s.cy * T];
}
const BARRA = 52, FAIXA = 46; // alturas da barra de setores e da faixa de números (px)
let setorAtual = 'geral', zoomDoSetor = 0;

export function ligar(c) {
  ctx = c;
  montarBarra(); montarPainel(); montarFicha(); montarZoom();
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
  const html = `<div class="sm-chips">${Object.entries(S).map(([id, s]) => chip(id, s.nome)).join('')}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
export function irSetor(id) {
  fecharFicha();
  const w = $('#palco').clientWidth;
  if (id === 'geral' || !setores()[id]) { setorAtual = 'geral'; ctx.vista(0, null); }
  else {
    // zoom: a sala enche a faixa útil (entre os números e o pedido) — pela largura ou pela altura, o que der bonecos maiores
    const s = setores()[id], h = $('#palco').clientHeight - BARRA - FAIXA - (margens().baixo || 0);
    const z = Math.max(1.5, Math.min(2.05, Math.max(w / (s.larg * T), h / ((s.foco[3] - s.foco[1] + 0.6) * T))));
    setorAtual = id; zoomDoSetor = z;
    ctx.vista(z, centroDoSetor(s, w / z / T));
  }
  desenharBarra(); desenharPainel();
}
// ======================= zoom (botões) e "Ver tudo" =======================
// Pinça e arraste já funcionam no mapa (app.js); estes botões são a mesma coisa para quem não usa gesto.
const NIVEIS = [1, 1.5, 2, 2.5, 3];
function montarZoom() {
  if ($('#zoomCel')) return;
  const el = document.createElement('div');
  el.id = 'zoomCel'; el.className = 'zoom-cel'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Zoom do mapa');
  el.innerHTML = `<button type="button" data-zc="mais" aria-label="Aproximar"><i class="zc-mais" aria-hidden="true"></i></button>
    <button type="button" data-zc="menos" aria-label="Afastar"><i class="zc-menos" aria-hidden="true"></i></button>
    <button type="button" data-zc="tudo" class="zc-tudo"><i class="zc-grade" aria-hidden="true"></i><span>Ver tudo</span></button>`;
  $('#palco').appendChild(el);
  el.onclick = (e) => { const b = e.target.closest('[data-zc]'); if (b) mudarZoomCel(b.dataset.zc); };
}
function mudarZoomCel(q) {
  fecharFicha();
  if (q === 'tudo') { irSetor('geral'); return; }
  const z = ctx.zoom(), w = $('#palco').clientWidth, h = $('#palco').clientHeight, c = ctx.cam(), mg = margens();
  // centro da faixa útil (o mesmo ponto que a câmera usa para centralizar)
  const centro = [c.x + w / (2 * z), c.y + (mg.topo + (h - mg.topo - mg.baixo) / 2) / z];
  let nz;
  if (q === 'mais') nz = z < 1 ? 1.5 : NIVEIS.find((n) => n > z + 0.01) ?? z;
  else { const abaixo = [...NIVEIS].reverse().find((n) => n < z - 0.01); if (!abaixo) { irSetor('geral'); return; } nz = abaixo; }
  if (nz === z) return;
  setorAtual = ''; ctx.vista(nz, centro); desenharBarra();
}
// Na visão geral, tocar num pedaço do chão aproxima o setor dele.
const setorDoPonto = (x, y) => { const tx = x / T, ty = y / T; return ty >= 22 ? 'copa' : ty >= 11.5 ? (tx < 20.5 ? 'criacao' : 'marketing') : tx >= 13 && tx < 27 ? 'reuniao' : (Math.abs(tx - setores().sala.cx) < 7 ? 'sala' : null); };
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
    const s = setorDoPonto(b.x, b.y); if (!s || s === 'copa' || s === 'reuniao') continue;
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
  const raio = 26 / z; let melhor = null, dmin = raio;
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
  const html = `<p class="pg-legenda" aria-label="Legenda do mapa"><span><i class="ind fazendo"></i>fazendo</span><span><i class="ind esperando"></i>espera você decidir</span><span>sem marcador = livre</span></p>
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
    if (q === 'pedido') { // o chip do pedido (no mapa) já sabe abrir o cartão; sem chip, os detalhes do agente mostram a missão
      const chip = [...document.querySelectorAll('[data-pedido-abrir]')].find((x) => x.dataset.pedidoAbrir === ac.dataset.mid);
      if (chip) chip.click(); else ctx.abrirAgente(b);
    } else if (q === 'detalhes') ctx.abrirAgente(b);
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
    ? { texto: b.status === 'erro' ? 'Deu erro e parou. Veja o que aconteceu e diga como seguir.' : 'Aprove para ele continuar. Se recusar, ele para e espera outra instrução.', botao: ['decidir', b.status === 'erro' ? 'Ver o erro' : 'Revisar autorização'] }
    : { texto: `Está esperando o ${b.pessoa} decidir. Nada para você aqui.`, botao: ['dupla', `Falar com o ${b.pessoa}`] };
  if (g === 'fazendo') return { texto: b.status === 'semsinal' ? 'Continua rodando, mas sem dar notícia há alguns minutos. Se demorar, confira os detalhes.' : 'Segue sozinho. Você só precisa agir se ele pedir.', botao: null };
  if (assist && meu) return { texto: 'Livre agora. Converse para pedir algo novo.', botao: ['conversar', 'Conversar'] };
  if (!meu) return { texto: `Livre. Faz parte da equipe do ${b.pessoa}.`, botao: null };
  return { texto: m.ult?.tipo === 'fim' ? 'Entregou e está livre para o próximo pedido.' : 'Livre, na copa. Faça um pedido e a assistente chama quem precisar.', botao: ['pedir', 'Novo pedido'] };
}
// "Editando beatgrid.mjs" → "Mexendo no código (beatgrid.mjs)": o que é o arquivo, em palavras de gente.
const TIPO_ARQ = [[/\.(m?js|ts|tsx|jsx|gd|py|cs|sh|ps1)$/i, 'código'], [/\.(tscn|tres|scn)$/i, 'uma cena do jogo'], [/\.(md|txt)$/i, 'um texto'],
  [/\.(json|ya?ml|toml|cfg|ini)$/i, 'uma configuração'], [/\.(png|jpe?g|gif|webp|svg|aseprite)$/i, 'uma imagem'], [/\.(mp4|mov|webm)$/i, 'um vídeo'],
  [/\.(wav|mp3|ogg)$/i, 'um áudio'], [/\.(html|css)$/i, 'uma página']];
function simples(t) {
  return String(t || '').replace(/^(Editando|Escrevendo|Alterando|Criando|Lendo|Abrindo)\s+(?:o arquivo\s+)?([\w.\-\/\\]+\.\w{1,9})\b/i, (x, v, arq) => {
    const nome = arq.split(/[\\/]/).pop(), tipo = TIPO_ARQ.find(([re]) => re.test(nome))?.[1];
    if (!tipo) return x;
    const verbo = /^lendo|^abrindo/i.test(v) ? 'Lendo' : /^criando|^escrevendo/i.test(v) ? 'Escrevendo' : 'Mexendo em';
    const obj = tipo === 'código' ? (verbo === 'Mexendo em' ? 'no código' : 'código') : tipo;
    return `${verbo === 'Mexendo em' && tipo === 'código' ? 'Mexendo' : verbo} ${obj} (${nome})`;
  });
}
export async function abrirFicha(b, centrar = false) {
  if (!b) return false;
  fichaDe = b;
  const g = grupoDe(b), m = b.m || {}, nome = ctx.nome(b), px = proximaAcao(b);
  let tarefa = g === 'livre' ? (m.ult?.tipo === 'fim' ? `Última entrega: ${primeiraFrase(m.ult.resposta || frase(m.ult), 90)}` : 'Nenhuma tarefa agora.') : D.emSegundoPlano(m) ? 'Rodando uma tarefa em segundo plano.' : m.ult ? primeiraFrase(frase(m.ult), 110) : 'Pensando…';
  // "Quer permissão para: gerando um modelo 3D" → "Autorizar: gerar um modelo 3D" (o que você vai decidir)
  if (b.status === 'alerta') tarefa = autorizar(tarefa);
  tarefa = simples(tarefa);
  const missao = m.ult?._m?.titulo && g !== 'livre' ? primeiraFrase(m.ult._m.titulo, 140) : '';
  const estado = b.status === 'alerta' ? 'Aguardando sua autorização' : b.status === 'erro' ? 'Parou com erro' : ROT_GRUPO[g];
  const quando = m.ult?.t ? D.ha(m.ult.t) : '';
  const el = $('#fichaMapa');
  // Rodada 4: o cartão responde às 3 perguntas de quem acompanha: qual pedido, em que etapa, o que fez por último.
  const mis = g !== 'livre' ? m.ult?._m || null : null;
  let etapaHtml = '';
  if (mis) {
    let n = 1; try { n = etapaDe(mis); } catch {}
    const alerta = b.status === 'alerta' || b.status === 'erro';
    etapaHtml = `<ol class="fm-trilha" aria-label="Etapa ${n} de 4">${ETAPAS.map((t, i) => `<li class="${i + 1 < n || n === 4 ? 'ok' : i + 1 === n ? (alerta ? 'atual alerta' : 'atual') : ''}"><i></i><span>${t}</span></li>`).join('')}</ol>`;
  }
  const quandoTxt = quando ? (quando === 'agora' ? 'agora' : 'há ' + quando) : '';
  const precisa = g === 'esperando' && b.pessoa === ctx.eu()?.pessoa; // a decisão pendente vem logo depois do nome
  const quem = b.pessoa === ctx.eu()?.pessoa || g !== 'esperando' ? estado : 'Esperando o ' + esc(b.pessoa);
  el.innerHTML = `<div class="fm-cab"><img src="${await ctx.retratoDe(b.m?.nome || b.nome)}" alt=""><div class="fm-nome"><b>${esc(nome.replace(/^\S+\s/, (x) => /\p{Extended_Pictographic}/u.test(x) ? '' : x))}</b><span class="fm-est ${g}"><i class="ind ${g}" aria-hidden="true"></i>${quem}${b.pessoa && b.pessoa !== ctx.eu()?.pessoa ? ` · do ${esc(b.pessoa)}` : ''}</span></div><button type="button" class="fm-x" data-ficha-fechar aria-label="Fechar">×</button></div>
    <dl class="fm-corpo r4">
      ${precisa ? `<div class="fm-precisa"><dt>Precisa de você</dt><dd><b>${esc(tarefa)}</b><span>${esc(px.texto)}</span></dd></div>` : ''}
      <div class="fm-pedido"><dt>Pedido</dt><dd class="${missao ? '' : 'fm-nada'}">${missao ? esc(missao) : g === 'livre' ? 'Nenhum agora' : 'Tarefa avulsa (sem pedido)'}${etapaHtml}</dd></div>
      ${precisa ? '' : `<div><dt>Última ação</dt><dd>${esc(tarefa)}</dd></div>`}
      ${quandoTxt ? `<div class="fm-quando"><dt>${precisa ? 'Esperando' : 'Quando'}</dt><dd>${quandoTxt}</dd></div>` : ''}
      ${precisa ? '' : `<div class="fm-prox ${g}"><dt>Para você</dt><dd>${esc(px.texto)}</dd></div>`}
    </dl>
    <div class="fm-acoes">${px.botao ? `<button type="button" class="btn forte" data-ficha="${px.botao[0]}">${esc(px.botao[1])}</button>` : ''}${mis && !px.botao ? `<button type="button" class="btn forte" data-ficha="pedido" data-mid="${esc(mis.id)}">Ver o pedido</button>` : ''}<button type="button" class="btn" data-ficha="detalhes">Ver detalhes</button></div>`;
  el.hidden = false; el.className = `ficha-mapa ${g}`;
  document.body.classList.add('ficha-aberta');
  cacheMg.t = 0;
  // a ficha cobre o pé da tela: a câmera leva o boneco para a faixa que sobra (da lista, aproxima também)
  if (centrar || ctx.zoom() >= 1) { const z = centrar ? Math.max(ctx.zoom(), 1.5) : ctx.zoom(); if (z !== ctx.zoom() || setorAtual === 'geral') setorAtual = ''; ctx.vista(z, [b.x, b.y - 24]); desenharBarra(); }
  return true;
}
export function fecharFicha() { if (!fichaDe) return; fichaDe = null; const el = $('#fichaMapa'); if (el) el.hidden = true; document.body.classList.remove('ficha-aberta'); }
export const fichaAberta = () => !!fichaDe;

// ======================= foco na sala (celular, aproximado) =======================
// A sala onde está o meio da tela fica em destaque: o resto do andar escurece um pouco e uma
// etiqueta diz o nome da sala e quem está nela ("Criação · 3 fazendo · 1 espera você").
// Arrastou para outra sala? O foco vai junto. No corredor, sem foco.
function desenharFoco(mundo, z, c, w) {
  let el = $('#focoSala');
  if (!el) { el = document.createElement('div'); el.id = 'focoSala'; el.className = 'foco-sala'; el.setAttribute('aria-hidden', 'true'); $('#camada')?.before(el); const n = document.createElement('b'); n.id = 'focoNome'; n.className = 'fs-nome'; $('#palco').appendChild(n); }
  const S = setores(), mg = margens(), h = $('#palco')?.clientHeight || innerHeight;
  const meio = [c.x + w / (2 * z), c.y + (mg.topo + (h - mg.topo - mg.baixo) / 2) / z];
  const id = !cel() || z < 1.4 || fichaDe ? null : S[setorAtual] ? setorAtual : Object.keys(S).find((k) => { const f = S[k].foco; return meio[0] >= f[0] * T && meio[0] <= f[2] * T && meio[1] >= f[1] * T && meio[1] <= f[3] * T; });
  const nome = $('#focoNome');
  if (!id) { if (!el.hidden) { el.hidden = true; nome.hidden = true; } return; }
  nome.hidden = false;
  const f = S[id].foco, x = Math.round((f[0] * T - c.x) * z), y = Math.round((f[1] * T - c.y) * z);
  el.hidden = false;
  el.style.transform = `translate(${x}px, ${y}px)`;
  el.style.width = `${Math.round((f[2] - f[0]) * T * z)}px`; el.style.height = `${Math.round((f[3] - f[1]) * T * z)}px`;
  // etiqueta fixa no pé da faixa útil (logo acima do pedido): nome da sala e quem está nela
  const conta = { fazendo: 0, esperando: 0, livre: 0 };
  for (const b of mundo.agentes.values()) if (b.x >= f[0] * T && b.x <= f[2] * T && b.y >= f[1] * T && b.y <= f[3] * T) conta[grupoDe(b)]++;
  const partes = [conta.esperando && `${conta.esperando} espera${conta.esperando > 1 ? 'm' : ''} você`, conta.fazendo && `${conta.fazendo} fazendo`, conta.livre && `${conta.livre} livre${conta.livre > 1 ? 's' : ''}`].filter(Boolean);
  const txt = `${S[id].nome === 'Sala' ? 'Sua sala' : S[id].nome}${partes.length ? ' · ' + partes.join(' · ') : ' · vazia'}`;
  if (nome.textContent !== txt) nome.textContent = txt;
  nome.classList.toggle('espera', conta.esperando > 0);
  nome.style.transform = `translate(8px, ${Math.round(h - mg.baixo - 42)}px)`;
}

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
  desenharFoco(mundo, z, c, w);
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
  cacheMg = { t: agora, v: { topo: BARRA + (ctx.zoom() >= 1 && $('#resumoSetor')?.offsetParent ? FAIXA : 0), baixo: palco ? Math.max(0, palco.bottom - topoCobre + 6) : 0 } };
  return cacheMg.v;
}
export const resumoAtual = () => ultResumo;
