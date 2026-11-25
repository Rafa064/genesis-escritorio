// Acompanhar um pedido em linguagem de gente: um cartão só, fixo no alto da conversa, com o percurso
// Recebido → Plano → Fazendo → Pronto, o que está fazendo agora, as autorizações pendentes e, no fim,
// "Ver resultado" + próximos passos com um toque.
import * as D from './dados.js';
import { frase, primeiraFrase } from './humano.js';
import { tituloDe } from './config.js';
import { ctx, esc, tempoDe, nomeArq } from './comando-ctx.js';
import { ico } from './comando-icones.js';

const EDITA = /^(Write|Edit|MultiEdit|NotebookEdit)$/;

// Arquivos que a missão escreveu ou editou (mais recentes primeiro, sem repetir).
export function arquivosMudados(m) {
  const vistos = new Set(), out = [];
  for (const e of [...(m?.passos || [])].reverse()) {
    if (!EDITA.test(e.ferramenta || '')) continue;
    const a = String(e.arq || e.alvo || '').trim(); if (!a) continue;
    const k = a.toLowerCase(); if (vistos.has(k)) continue;
    vistos.add(k); out.push(a);
  }
  return out;
}

// Próximos passos sugeridos pelo que aconteceu (texto pronto para mandar; você ainda pode editar).
export function proximosPassos(m) {
  const arqs = arquivosMudados(m), lista = [];
  const tem = (re) => arqs.some((a) => re.test(a)) || re.test(m.pedido || '');
  const video = tem(/\.(mp4|mov|tsx)$|remotion|short|trailer|v[ií]deo/i) || (m.miniaturas || []).some((x) => /\.(mp4|webm|gif)$/i.test(x.caminho || ''));
  if (tem(/\.(gd|tscn|tres)$|godot|player|inimigo|enemy/i)) lista.push({ rot: 'Testar no jogo', texto: 'Rode o jogo (Godot headless) e os testes do que você mudou. Me diga em 2 linhas se algo quebrou.' });
  if (video) lista.push({ rot: 'Pedir nota ao Codex', texto: 'Peça ao Codex uma nota de 0 a 10 do resultado, com críticas concretas, e corrija até passar de 8.' });
  lista.push({ rot: 'Como eu testo?', texto: 'Me explique em 3 linhas, para leigo, o que mudou e como eu testo.' });
  lista.push({ rot: 'Mostrar pro ' + (ctx.outra?.() || 'outro'), bola: true });
  if (arqs.length) lista.push({ rot: 'Salvar uma versão', texto: 'Revise o que mudou, faça um commit com mensagem clara em português e me diga em qual branch ficou.' });
  if (!ctx.marcoDaMissao?.(m)) lista.push({ rot: 'Adicionar a um marco do projeto', missao: true });
  return lista.slice(0, 4);
}
const resumoMudou = (arqs, minis) => [arqs.length && `${arqs.length} arquivo${arqs.length > 1 ? 's' : ''}`, minis && `${minis} imagem/vídeo`].filter(Boolean).join(' e ') || 'nenhum arquivo';

// ---------- o percurso do pedido: Recebido → Plano → Fazendo → Pronto ----------
export const ETAPAS = ['Recebido', 'Plano', 'Fazendo', 'Pronto'];
// Em que etapa está (1 a 4). Sem missão ainda = recebido (na fila ou começando).
export function etapaDe(m) {
  if (!m) return 1;
  if (m.fim) return 4;
  const ajud = D.escalacao(m).filter((x) => x.tipo === 'agente' || x.tipo === 'programa');
  const mexeu = ajud.some((x) => ['trabalhando', 'pronto', 'semsinal'].includes(x.estado)) || (m.passos || []).filter((e) => e.ferramenta).length >= 3;
  return mexeu ? 3 : 2;
}
const nomeEtapa = (n) => (n === 1 ? 'pedido recebido' : n === 2 ? 'montando o plano' : n === 3 ? 'fazendo' : 'pronto');
const trilha = (n, alerta) => `<ol class="cp-etapas" aria-label="Etapa ${n} de 4">${ETAPAS.map((t, i) => `<li class="${i + 1 < n || n === 4 ? 'ok' : i + 1 === n ? (alerta ? 'atual alerta' : 'atual') : ''}"><i></i><span>${t}</span></li>`).join('')}</ol>`;
const nomePedido = (m, pedido) => primeiraFrase(m?.titulo || pedido || 'Seu pedido', 70);

// Chip do pedido no mapa: toque leva ao cartão na conversa.
export function htmlChipMapa({ m, pend = 0, titulo = '', decisao = '' }) {
  const n = etapaDe(m);
  return `<button type="button" class="cp-chip-mapa${pend ? ' alerta' : ''}" data-pedido-abrir="${esc(m?.id || '')}" title="Abrir o seu pedido">
    <span class="cp-pulso"></span><span class="cpm-txt"><b>${esc(primeiraFrase(titulo || m?.titulo || 'Seu pedido', 40))}</b><small>${pend ? (decisao ? `${/^Responder/.test(decisao) ? 'Espera você' : 'Espera você autorizar'}: ${esc(primeiraFrase(decisao.charAt(0).toLowerCase() + decisao.slice(1), 48))}${pend > 1 ? ` · +${pend - 1} neste pedido` : ''}` : `Precisa de você · ${pend} decis${pend > 1 ? 'ões' : 'ão'} neste pedido`) : `Etapa ${n} de 4 · ${nomeEtapa(n)}`}</small></span><span class="cpm-seta">${ico('seta')}</span></button>`;
}

// O que vem depois de cada etapa, em uma frase (o cartão recolhido mostra "Agora" e "Próximo").
const PROXIMO = { 1: 'ela monta um plano e diz quem da equipe vai fazer cada parte.', 2: 'a equipe começa a fazer; você vê cada passo aqui.', 3: 'ela confere o resultado e entrega nesta conversa.', 4: 'nada: está pronto. Você recebe um aviso.' };
let menuAberto = false, escAberta = false;
// Cartão do pedido da conversa aberta (fica fixo no alto da conversa). Devolve '' quando não há nada.
// pend: [{ id, titulo }] autorizações desta conversa · fila: pedidos seus esperando a vez · pedido: o último texto que você mandou.
export function htmlAgora({ m, conv, ocupada, escalacaoHtml = '', pend = [], totalDec = 0, fila = 0, pedido = '', titulo = '' }) {
  const gpt = conv?.alvo === 'codex';
  const rodando = ocupada || (m && !m.fim && ['trab', 'alerta', 'semsinal'].includes(m.status));
  if (rodando || pend.length) return htmlRodando(rodando ? m : null, gpt, escalacaoHtml, pend, fila, pedido, titulo, totalDec);
  if (m?.fim && m.status !== 'erro' && Date.now() - m.fim < 12 * 3600e3) return htmlPronto(m, titulo);
  return '';
}

// Contagem das decisões NESTE pedido (o topo conta as do estúdio): "4 neste pedido" ou "faltam 3 de 4".
export const contaDecisoes = (falta, total) => (total > falta ? `faltam ${falta} de ${total}` : `${falta} neste pedido`);
function htmlRodando(m, gpt, escalacaoHtml, pend, fila, pedido, titulo, totalDec = 0) {
  const quem = gpt ? 'O Codex' : 'A assistente';
  const n = etapaDe(m && !m.fim ? m : null);
  const ult = m?.passos.at(-1);
  const alerta = pend.length > 0 || m?.status === 'alerta';
  const quemFaz = ult && ult.agente && ult.agente !== 'Orquestrador' ? `${tituloDe(ult.agente)}: ` : '';
  const agora = !m ? `${quem} já recebeu o pedido e vai começar. A resposta aparece aqui embaixo.` : ult ? quemFaz + primeiraFrase(frase(ult), 90) : 'Lendo o pedido e montando o plano…';
  const ultT = Math.max(ult?.t || 0, m?.ultimo || 0);
  // Recolhido (padrão): uma faixa com o pedido, a etapa e a próxima ação (Decidir). Aberto: etapas, o que está fazendo e o menu.
  const aberto = menuAberto;
  // A etapa (percurso do pedido) fica no subtítulo; as decisões ficam no botão Decidir: duas contas, dois lugares.
  const sub = `Etapa ${n} de 4 · ${nomeEtapa(n)}${m && !pend.length ? ` · há ${tempoDe(Date.now() - m.inicio)}` : ''}`;
  const soPerguntas = pend.length > 0 && pend.every((x) => x.q);
  const nDec = contaDecisoes(pend.length, Math.max(totalDec, pend.length));
  const pendHtml = pend.length ? `<div class="cp-pend"><p><b>${ico('mao')} ${soPerguntas ? 'Sua assistente tem perguntas' : pend.length > 1 ? `${pend.length} decisões neste pedido` : 'Uma decisão neste pedido'}</b><span>${esc(pend[0].titulo)}${pend.length > 1 ? ` <em>e mais ${pend.length - 1}</em>` : ''}</span></p></div>` : '';
  return `<div class="cp cp-rodando${alerta ? ' cp-alerta' : ''}${aberto ? ' aberto' : ''}">
    <div class="cp-cab"><span class="cp-pulso"></span>
      <button type="button" class="cp-tit" data-cp="menu" aria-expanded="${aberto}" title="${aberto ? 'Recolher' : 'Ver etapas e opções'}"><b>${esc(titulo || nomePedido(m, pedido))}</b><small>${sub}</small></button>
      ${pend.length ? `<button type="button" class="btn forte cp-decidir" data-cp="aprovar" aria-label="${soPerguntas ? 'Responder às perguntas da assistente' : `Decidir: ${nDec}`}"><span>${soPerguntas ? 'Responder' : 'Decidir'}</span><small>${soPerguntas ? 'perguntas' : esc(nDec)}</small></button>` : ''}
      <button type="button" class="cp-menu-btn" data-cp="menu" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher o cartão do pedido' : 'Etapas e opções do pedido'}">${ico('seta', aberto ? 'gira' : 'gira-baixo')}</button></div>
    ${aberto ? trilha(n, alerta) : `<div class="cp-mini" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i < n ? 'ok' : i === n ? (alerta ? 'atual alerta' : 'atual') : ''}"></i>`).join('')}</div>`}
    ${aberto && (titulo && (m?.titulo || pedido)) ? `<p class="cp-orig"><b>Pedido:</b> ${esc(primeiraFrase(m?.titulo || pedido, 140))}</p>` : ''}
    ${aberto ? (pendHtml || `<p class="cp-agora">${esc(agora)}${ultT ? `<small class="cp-ult"> · ${D.ha(ultT)}</small>` : ''}</p>`) : ''}
    ${!aberto && !pend.length ? `<p class="cp-agora cp-agora-curta"><b>Agora:</b> ${esc(agora)}${ultT ? `<small class="cp-ult"> · ${D.ha(ultT)}</small>` : ''}</p><p class="cp-depois"><b>Próximo:</b> ${esc(PROXIMO[n] || '')}</p>` : ''}
    ${fila ? `<p class="cp-fila">+${fila} pedido${fila > 1 ? 's' : ''} seu${fila > 1 ? 's' : ''} na fila: começa${fila > 1 ? 'm' : ''} quando este terminar.</p>` : ''}
    ${aberto ? `<div class="cp-menu">
      <button type="button" class="cp-pagina" data-cp="pagina">${ico('jornal')} Página do pedido: andamento e entregas</button>
      ${escalacaoHtml ? `<button type="button" data-cp="escalacao">${ico('equipe')} Quem está fazendo o quê</button>` : ''}
      ${m ? `<button type="button" data-cp="missao" data-id="${esc(m.id)}">${ico('jornal')} Passo a passo completo</button>` : ''}
      <button type="button" class="cp-parar" data-cp="parar">${ico('pare')} Interromper pedido</button>
    </div>` : ''}
    ${aberto && escalacaoHtml ? `<div class="cp-esc"${escAberta ? '' : ' hidden'}>${escalacaoHtml}</div>` : ''}</div>`;
}

let maisAcoes = false;
function htmlPronto(m, titulo) {
  const arqs = arquivosMudados(m), minis = (m.miniaturas || []).length;
  const passos = proximosPassos(m);
  const frase1 = primeiraFrase(m.resposta || '', 140);
  return `<div class="cp cp-pronto">
    <div class="cp-cab"><span class="cp-ok">${ico('check')}</span><div class="cp-tit"><b>${esc(titulo || nomePedido(m))}</b><small>Pronto em ${tempoDe(m.duracao)} · ${D.ha(m.fim)} · mudou ${esc(resumoMudou(arqs, minis))}</small></div></div>
    ${frase1 ? `<p class="cp-resumo">${esc(frase1)}</p>` : ''}
    <div class="cp-pronto-acoes"><button type="button" class="btn forte cp-ver" data-cp="pagina">Ver resultado</button>
      <button type="button" class="btn cp-mais" data-cp="mais" aria-expanded="${maisAcoes}">E agora? ${maisAcoes ? '▴' : '▾'}</button></div>
    ${maisAcoes ? `<div class="cp-prox">${passos.map((p, i) => `<button type="button" class="cp-sug" data-cp-sug="${i}">${esc(p.rot)}</button>`).join('')}</div>` : ''}
  </div>`;
}

// Liga os botões do cartão (uma vez por elemento). m() devolve a missão de agora.
export function ligarAgora(el, missaoAtual) {
  if (!el || el.dataset.cpLigado) return;
  el.dataset.cpLigado = '1';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cp],[data-cp-sug]'); if (!b) return;
    const m = missaoAtual();
    if (b.dataset.cp === 'menu') { menuAberto = !menuAberto; return ctx.redesenharPedido?.(); }
    if (b.dataset.cp === 'mais') { maisAcoes = !maisAcoes; return ctx.redesenharPedido?.(); }
    if (b.dataset.cp === 'parar') { menuAberto = false; ctx.redesenharPedido?.(); return ctx.parar(); }
    if (b.dataset.cp === 'escalacao') { escAberta = !escAberta; const box = el.querySelector('.cp-esc'); if (box) box.hidden = !escAberta; return; }
    if (b.dataset.cp === 'missao') { menuAberto = false; return ctx.abrirMissao(b.dataset.id); }
    if (b.dataset.cp === 'pagina') { menuAberto = false; return ctx.abrirPedidoPagina?.({ conv: ctx.conversaAtual?.() ?? null, missao: m?.id || null }); }
    if (b.dataset.cp === 'aprovar') {
      if (ctx.abrirAutorizacoes) return ctx.abrirAutorizacoes();
      const ap = document.querySelector('#msgs .aprovacao'); if (!ap) return;
      ap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ap.classList.add('piscar'); setTimeout(() => ap.classList.remove('piscar'), 1600);
      return;
    }
    if (b.dataset.cpSug != null && m) {
      const p = proximosPassos(m)[Number(b.dataset.cpSug)]; if (!p) return;
      if (p.bola) return ctx.abrirBola?.({ texto: `Dá uma olhada no que ficou pronto: ${primeiraFrase(m.titulo, 90)}`, missao: m });
      if (p.missao) return ctx.abrirMissao(m.id);
      ctx.preencher(p.texto);
    }
  });
}
