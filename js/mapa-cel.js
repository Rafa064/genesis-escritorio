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
// Noite 2 · rodada 4: no topo, um alternador de duas posições, "Visão geral" (o andar inteiro, só os
// quadradinhos de estado, e a lista de quem está fazendo o quê) e "Aproximar" (uma sala de perto).
// Aproximado, a linha de baixo troca de sala; o último setor visto é lembrado.
let ultimoSetor = '';
function montarBarra() {
  if ($('#setoresMapa')) return;
  const el = document.createElement('nav');
  el.id = 'setoresMapa'; el.className = 'setores-mapa'; el.setAttribute('aria-label', 'Como ver o escritório');
  $('#palco').appendChild(el);
  el.onclick = (e) => { const b = e.target.closest('[data-modo]'); if (b) irSetor(b.dataset.modo === 'geral' ? 'geral' : ultimoSetor || setorInicial()); };
  // aproximado: as salas numa faixa logo abaixo do alternador
  const f = document.createElement('nav'); f.id = 'salasMapa'; f.className = 'salas-mapa'; f.setAttribute('aria-label', 'Escolher a sala');
  $('#palco').appendChild(f);
  f.onclick = (e) => { const b = e.target.closest('[data-setor]'); if (b) irSetor(b.dataset.setor); };
  desenharBarra();
}
// sala onde está o meio da tela (para marcar o chip quando a pessoa arrasta)
let salaNoMeio = '';
function desenharBarra() {
  const el = $('#setoresMapa'), f = $('#salasMapa'); if (!el || !ctx.eu()) return;
  const geral = setorAtual === 'geral' || ctx.zoom() < 1, S = setores();
  const modo = (id, rot, ico) => `<button type="button" data-modo="${id}" class="${(id === 'geral') === geral ? 'on' : ''}" aria-pressed="${(id === 'geral') === geral}"><i class="${ico}" aria-hidden="true"></i>${rot}</button>`;
  const html = `<div class="sm-modo" role="group" aria-label="Visão do mapa">${modo('geral', 'Visão geral', 'zc-grade')}${modo('perto', 'Aproximar', 'zc-lupa')}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  const marcado = S[setorAtual] ? setorAtual : salaNoMeio;
  const chip = (id, nome) => `<button type="button" data-setor="${id}" class="${marcado === id ? 'on' : ''}" aria-pressed="${marcado === id}">${esc(nome === 'Sala' ? 'Sua sala' : nome)}</button>`;
  const hf = `<div class="sm-chips">${Object.entries(S).map(([id, s]) => chip(id, s.nome)).join('')}</div>`;
  if (f && f.dataset.h !== hf) { f.innerHTML = hf; f.dataset.h = hf; }
}
export function irSetor(id) {
  fecharFicha();
  const w = $('#palco').clientWidth;
  if (id === 'geral' || !setores()[id]) { setorAtual = 'geral'; ctx.vista(0, null); }
  else {
    // zoom: a sala enche a faixa útil (entre os números e o pedido) — pela largura ou pela altura, o que der bonecos maiores
    const s = setores()[id], h = $('#palco').clientHeight - BARRA - FAIXA - (margens().baixo || 0);
    const z = Math.max(1.5, Math.min(2.05, Math.max(w / (s.larg * T), h / ((s.foco[3] - s.foco[1] + 0.6) * T))));
    setorAtual = id; zoomDoSetor = z; ultimoSetor = id;
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
  // Recolhido: um botão só (lupa). Tocar abre +, − e "Ver tudo"; fecha sozinho depois de uns segundos.
  el.innerHTML = `<button type="button" data-zc="abrir" class="zc-abrir" aria-expanded="false" aria-label="Zoom do mapa"><i class="zc-lupa" aria-hidden="true"></i></button>
    <button type="button" data-zc="mais" aria-label="Aproximar"><i class="zc-mais" aria-hidden="true"></i></button>
    <button type="button" data-zc="menos" aria-label="Afastar"><i class="zc-menos" aria-hidden="true"></i></button>
    <button type="button" data-zc="tudo" class="zc-tudo" aria-label="Ver o andar inteiro"><i class="zc-grade" aria-hidden="true"></i></button>`;
  $('#palco').appendChild(el);
  let tempo = 0;
  const recolher = () => { el.classList.remove('aberto'); el.querySelector('.zc-abrir').setAttribute('aria-expanded', 'false'); };
  el.onclick = (e) => {
    const b = e.target.closest('[data-zc]'); if (!b) return;
    clearTimeout(tempo);
    if (b.dataset.zc === 'abrir') { const ab = el.classList.toggle('aberto'); b.setAttribute('aria-expanded', String(ab)); }
    else mudarZoomCel(b.dataset.zc);
    if (el.classList.contains('aberto')) tempo = setTimeout(recolher, 5000);
  };
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
// O celular abre na VISÃO GERAL: quem abre o app quer saber "quem está fazendo o quê", e isso é o andar
// inteiro com o estado de cada um (quadradinhos) e, embaixo, a lista com o que cada um faz. "Aproximar"
// leva ao setor de quem espera você; se ninguém espera, onde há mais gente sua trabalhando.
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
  const el = $('#painelGeral'); if (!el) return;
  // cabem os que couberem inteiros entre os números e o pedido (o resto está em "Fazendo")
  const ativos = ctx.quemTrabalha().slice(0, 6);
  const linhas = await Promise.all(ativos.map(async ({ m, cls }) => {
    let acao = D.emSegundoPlano(m) ? 'rodando em segundo plano' : cls === 'semsinal' ? 'sem sinal há um tempo' : m.ult ? primeiraFrase(frase(m.ult), 60) : 'pensando…';
    if (cls === 'alerta') acao = autorizar(acao).replace(/^Autorizar:/, 'Espera você autorizar:');
    const g = cls === 'alerta' || cls === 'erro' ? 'esperando' : 'fazendo';
    return `<button type="button" class="pg-agora ${g}" data-agora="${esc(m.k)}"><img src="${await ctx.retratoDe(m.nome)}" alt=""><span><b>${esc(ctx.nomeAgente(m))}</b><small>${esc(acao)}</small></span><i class="ind ${g}" aria-hidden="true"></i></button>`;
  }));
  const html = `<p class="pg-legenda" aria-label="Legenda do mapa"><span><i class="ind fazendo"></i>fazendo</span><span><i class="ind esperando"></i>espera você</span><span>sem marcador = livre</span></p>
    ${Hoje.htmlNumerosDia(r, { custo: true })}
    <div class="pg-lista">${linhas.join('') || '<p class="pg-vazio">Ninguém trabalhando agora. A equipe está na copa.</p>'}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  // linha cortada no pé não aparece (melhor uma a menos que meia)
  const lista = el.querySelector('.pg-lista');
  if (lista?.clientHeight) for (const l of lista.children) { l.hidden = false; l.hidden = l.offsetTop - lista.offsetTop + l.offsetHeight > lista.clientHeight + 1; }
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
    else if (q === 'cargo' && b.cargo) ctx.abrirCargo?.(b.cargo.id);
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
  el.innerHTML = `<div class="fm-cab"><img src="${await ctx.retratoDe(b.m?.nome || b.nome)}" alt=""><div class="fm-nome"><b>${esc(nome.replace(/^\S+\s/, (x) => /\p{Extended_Pictographic}/u.test(x) ? '' : x))}</b><span class="fm-est ${g}"><i class="ind ${g}" aria-hidden="true"></i>${quem}${b.pessoa && b.pessoa !== ctx.eu()?.pessoa ? ` · do ${esc(b.pessoa)}` : ''}${b.visitante ? ' · visitante' : ''}</span>${b.cargo ? `<button type="button" class="fm-ficha" data-ficha="cargo">Ficha do ${esc(rotuloDe(b))} ›</button>` : ''}</div><button type="button" class="fm-x" data-ficha-fechar aria-label="Fechar">×</button></div>
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
  if (cel() && (centrar || ctx.zoom() >= 1)) { const z = centrar ? Math.max(ctx.zoom(), 1.5) : ctx.zoom(); if (z !== ctx.zoom() || setorAtual === 'geral') setorAtual = ''; ctx.vista(z, [b.x, b.y - 24]); desenharBarra(); }
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
  if ((id || '') !== salaNoMeio) { salaNoMeio = id || ''; desenharBarra(); }
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
  // Com o cartão do pedido aberto, a faixa da sala vira a "aba" em cima dele (um bloco só, sem roubar
  // uma linha do mapa); sem cartão, fica no pé da faixa útil.
  const hud = $('#hudMapa'), palco = $('#palco')?.getBoundingClientRect();
  const r = hud && !hud.hidden && hud.offsetParent ? hud.getBoundingClientRect() : null;
  const junto = !!(r && r.height && palco);
  document.body.classList.toggle('setor-no-pedido', junto);
  nome.style.transform = junto ? `translate(${Math.round(r.left - palco.left + 10)}px, ${Math.round(r.top - palco.top - 13)}px)` : `translate(8px, ${Math.round(h - mg.baixo - 42)}px)`;
}

// Etiqueta de cada boneco: nome curto do cargo + estado (trabalhando, precisa de você, pronto, na copa).
// Só quem precisa de VOCÊ ganha o destaque forte (amarelo, pulando); o resto fica discreto.
export function rotuloDe(b) {
  const eu = ctx.eu()?.pessoa;
  if (b.cargo) return b.cargo.curto || String(b.cargo.nome || b.cargo.id).split(' ')[0];
  if (b.lugar?.assistente) return b.pessoa === eu ? 'Sua assistente' : `Assistente · ${b.pessoa}`;
  if (b.visitante) return 'Visitante';
  return (ctx.nome(b) || '').replace(/^\S+\s/, (x) => /\p{Extended_Pictographic}/u.test(x) ? '' : x).split(' ').slice(0, 2).join(' ');
}
function estadoEtiqueta(b) {
  const s = b.status, meu = b.pessoa === ctx.eu()?.pessoa;
  if (s === 'alerta' || s === 'erro') return meu ? ['precisa', s === 'erro' ? 'deu erro' : 'precisa de você'] : ['outro', ''];
  if (s === 'trab' || s === 'semsinal') return ['trab', ''];
  if (s === 'fim') return ['pronto', ''];
  return [b.lugar?.copa ? 'copa' : 'livre', ''];
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
  // PC e celular: etiquetas em DOM (texto nítido em qualquer zoom); o canvas não desenha os ícones antigos.
  mundo.semIcones = true;
  if (!lay.dataset.ligado) { // tocar na etiqueta = tocar no boneco
    lay.dataset.ligado = '1';
    lay.addEventListener('click', (e) => { const t = e.target.closest('[data-etq]'); const b = t && ctx.mundo()?.agentes.get(t.dataset.etq); if (b) { e.stopPropagation(); abrirFicha(b); } });
  }
  const mini = z < 1; // visão geral do celular: só o quadradinho (sem texto), senão vira sopa de letras
  for (const el of pool.values()) el.dataset.v = '';
  const topoUtil = margens().topo + 4; // a etiqueta não foge para baixo da barra de salas
  const postas = [], obst = mini ? ((mundo.juntos = null), []) : obstaculos(mundo, lay, z, c);
  for (const b of mundo.agentes.values()) {
    const x = (b.x - c.x) * z, topo = (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar?.dir === 'cima' ? -2 : -7); // colada na cabeça (o quadro do boneco tem folga em cima)
    const y = (topo - c.y) * z;
    if (x < -60 || x > w + 60 || y < -20 || y > h + 20) continue;
    let el = pool.get(b.id); const sel = fichaDe === b;
    if (!el) { el = document.createElement('span'); el.dataset.etq = b.id; lay.appendChild(el); pool.set(b.id, el); }
    const [tipo, extra] = estadoEtiqueta(b), txt = mundo.juntos?.has(b.pessoa) && b.lugar?.assistente ? (b.pessoa === ctx.eu()?.pessoa ? 'Você + sua assistente' : `${b.pessoa} + assistente`) : rotuloDe(b);
    const cls = `etq e-${tipo}${sel ? ' sel' : ''}${mini ? ' mini' : ''}${b.cargo ? ' e-cargo' : ''}`;
    if (el.className !== cls) el.className = cls;
    const chave = `${txt}|${extra}`;
    if (el.dataset.k !== chave) { el.dataset.k = chave; el.innerHTML = `<i aria-hidden="true"></i><b>${esc(txt)}</b>${extra ? `<small>${esc(extra)}</small>` : ''}`; el.title = `${txt}${extra ? ' · ' + extra : ''}`; el._w = 0; }
    if (!el._w || el.className !== el._cls) { el._w = el.offsetWidth; el._h = el.offsetHeight; el._cls = el.className; }
    const hw = el._w / 2, eh = el._h || 16; let xe = mini ? x : Math.max(hw + 4, Math.min(w - hw - 4, x)); // perto da borda, a etiqueta entra na tela
    // duas etiquetas no mesmo lugar (roda de conversa na copa): a de baixo sobe uma linha.
    // Placa de sala, nome de pessoa ou cabeça de alguém embaixo: desvia para o lado mais perto (ou sobe).
    let ye = y;
    // Livre = não encosta em outra etiqueta (com 4 px de folga) nem em obstáculo, e fica dentro da tela.
    const livre = (nx, ny) => nx - hw >= 2 && nx + hw <= w - 2 && ny - 4 - eh >= topoUtil
      && !postas.some((p) => p.y0 < ny + 4 && p.y1 > ny - eh - 4 && p.x0 - 4 < nx + hw && p.x1 + 4 > nx - hw)
      && !obst.some((r) => r.x0 < nx + hw && r.x1 > nx - hw && r.y0 < ny - 4 && r.y1 > ny - 4 - eh);
    if (!mini && !livre(xe, ye)) {
      // Procura o lugar livre mais perto: ao lado de quem atrapalha (melhor que empilhar, como
      // Estrategista e Crítico lado a lado), em cima ou embaixo. Sem lugar livre, fica onde estava.
      const cand = [];
      for (const p of postas) cand.push([p.x0 - 6 - hw, ye], [p.x1 + 6 + hw, ye], [xe, p.y0 - 6], [xe, p.y1 + eh + 6]);
      for (const r of obst) cand.push([r.x0 - 2 - hw, ye], [r.x1 + 2 + hw, ye], [xe, r.y0 + 3], [xe, r.y1 + eh + 6]);
      const ok = cand.filter(([nx, ny]) => livre(nx, ny) && Math.abs(nx - x) < 140 && Math.abs(ny - y) < 70)
        .sort((a, b2) => Math.hypot(a[0] - xe, (a[1] - ye) * 1.5) - Math.hypot(b2[0] - xe, (b2[1] - ye) * 1.5))[0];
      if (ok) [xe, ye] = ok;
    }
    postas.push({ x0: xe - hw, x1: xe + hw, y0: ye - eh - 4, y1: ye });
    el.style.transform = `translate(${Math.round(xe)}px, ${Math.round(ye)}px) translate(-50%, -100%)`;
    el.dataset.v = '1';
  }
  for (const [id, el] of pool) if (!el.dataset.v) { el.remove(); pool.delete(id); }
  // a ficha segue o boneco: se ele sumir (mudou de estado e de lugar), fecha
  if (fichaDe && !mundo.agentes.has(fichaDe.id)) fecharFicha();
}
// O que as etiquetas não podem cobrir: placas das salas, nomes das pessoas e a cabeça de cada pessoa.
// Os nomes das pessoas também saem de cima das placas (pela propriedade "translate", que o app.js não mexe).
// Pessoa ao lado da própria assistente: uma etiqueta só ("Kenny + assistente"); o app.js esconde o nome dela.
function obstaculos(mundo, lay, z, c) {
  const base = lay.getBoundingClientRect(), gente = [...mundo.pessoas.values()]; if (mundo.eu) gente.push(mundo.eu);
  const juntos = new Set();
  for (const b of mundo.agentes.values()) if (b.lugar?.assistente && gente.some((p) => p.pessoa === b.pessoa && Math.abs(p.x - b.x) < 44 && Math.abs(p.y - b.y) < 60)) juntos.add(b.pessoa);
  mundo.juntos = juntos;
  const rel = (el) => { const r = el.getBoundingClientRect(); const dx = el._dx || 0, dy = el._dy || 0; return r.width ? { x0: r.left - base.left - dx, x1: r.right - base.left - dx, y0: r.top - base.top - dy, y1: r.bottom - base.top - dy } : null; };
  // placa da sala: com folga em volta (nada encosta nela, nem nome nem etiqueta)
  const M = 8, placas = [...document.querySelectorAll('#camada .placa:not(.jogo)')].map(rel).filter(Boolean).map((p) => ({ x0: p.x0 - M, x1: p.x1 + M, y0: p.y0 - M, y1: p.y1 + M }));
  const obst = [...placas], bate = (r) => placas.some((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0);
  for (const g of document.querySelectorAll('#camada .nome.gente')) {
    const r = rel(g); if (!r) continue;
    let dx = 0, dy = 0;
    if (bate(r)) {
      // o nome fica embaixo dos pés; se cai em cima da placa, sobe para cima da cabeça (junto da pessoa).
      // Sem espaço em cima: para o lado, e só por último para baixo da placa.
      const o = placas.find((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0);
      const pe = r.y0 - 2 * z, cabeca = pe - 36 * z; // topo do nome ≈ pés; a cabeça fica uns 36 px acima
      const op = [[0, cabeca - 3 - r.y1], [o.x0 - r.x1, 0], [o.x1 - r.x0, 0], [0, o.y1 - r.y0]];
      [dx, dy] = op.find(([ox, oy]) => !bate({ x0: r.x0 + ox, x1: r.x1 + ox, y0: r.y0 + oy, y1: r.y1 + oy }) && r.y0 + oy > 0) || op[3];
    }
    if (dx !== (g._dx || 0) || dy !== (g._dy || 0)) { g._dx = dx; g._dy = dy; g.style.translate = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : ''; }
    obst.push({ x0: r.x0 + dx - 3, x1: r.x1 + dx + 3, y0: r.y0 + dy - 3, y1: r.y1 + dy + 3 });
  }
  for (const p of gente) { const x = (p.x - c.x) * z, y = (p.y - c.y) * z; obst.push({ x0: x - 9 * z, x1: x + 9 * z, y0: y - 34 * z, y1: y - 18 * z }); }
  // controles por cima do mapa (lupa, ajuda, faixa da sala): etiqueta nenhuma fica embaixo deles
  for (const s of ['#zoomCel', '#focoNome', '#boasVindas', '#resumoPC']) {
    const el = $(s); if (!el || el.hidden || !el.offsetParent) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    obst.push({ x0: r.left - base.left - 8, x1: r.right - base.left + 8, y0: r.top - base.top - 6, y1: r.bottom - base.top + 6 });
  }
  return obst;
}
export const altBarra = BARRA;
// Faixa útil do mapa no celular: a barra de setores cobre o topo; o pedido (ou a ficha) cobre o pé.
let cacheMg = { t: 0, v: { topo: 0, baixo: 0 } };
export function margens() {
  if (!cel() || !ctx) return { topo: 0, baixo: 0 };
  const agora = performance.now(); if (agora - cacheMg.t < 250) return cacheMg.v;
  const palco = $('#palco')?.getBoundingClientRect(); let topoCobre = palco?.bottom || 0;
  for (const s of ['#hudMapa', '#bcAbrir', '#fichaMapa']) { const el = $(s); if (!el || el.hidden) continue; const r = el.getBoundingClientRect(); if (r.height && r.top < topoCobre && r.top > (palco?.top || 0) + 100) topoCobre = r.top; }
  cacheMg = { t: agora, v: { topo: BARRA + (ctx.zoom() >= 1 && $('#salasMapa')?.offsetParent ? FAIXA : 0), baixo: palco ? Math.max(0, palco.bottom - topoCobre + 6) : 0 } };
  return cacheMg.v;
}
export const resumoAtual = () => ultResumo;
