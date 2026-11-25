// Questionário da assistente (ferramenta AskUserQuestion): no lugar do Autorizar/Recusar, um formulário.
// Cada pergunta mostra as opções como botões grandes (uma ou várias, conforme multiSelect) e um campo "Outro".
// "Responder" grava { respostas } no detalhe da aprovação com status "permitido" (a ponte devolve ao Claude);
// "Pular" grava "negado" (ela segue com o melhor julgamento dela).
// No celular, uma pergunta por vez ("Pergunta 1 de N", Voltar / Próxima); "Enviar respostas" só na última.
import { esc, lerJson } from './comando-ctx.js';
import { ico } from './comando-icones.js';
import { montarRespostas, faltam } from './questionario-respostas.js';

export const ehQuestionario = (a) => a?.ferramenta === 'AskUserQuestion';
export const perguntasDe = (a) => { const p = lerJson(a.detalhe).perguntas; return Array.isArray(p) ? p : []; };

// O que foi marcado até agora, por aprovação: { [pergunta]: { opcoes: [rótulos], outro: '' } }.
// Fica fora do HTML para sobreviver aos redesenhos da tela enquanto a pessoa responde.
const estado = new Map();
const escolhasDe = (id) => { if (!estado.has(id)) estado.set(id, {}); return estado.get(id); };
// Pergunta da vez no celular, por aprovação (também sobrevive aos redesenhos).
const passos = new Map();
const passoDe = (a) => Math.min(passos.get(a.id) || 0, Math.max(0, perguntasDe(a).length - 1));
const umaPorVez = (a) => innerWidth <= 760 && perguntasDe(a).length > 1;
const respondida = (a, i) => !faltam([perguntasDe(a)[i]], { 0: escolhasDe(a.id)[i] });

function rotuloBotao(a) {
  const n = faltam(perguntasDe(a), escolhasDe(a.id)), total = perguntasDe(a).length;
  if (!n) return { txt: total > 1 ? 'Enviar respostas' : 'Responder', off: false };
  return { txt: n === total && total > 1 ? `Responda as ${total} perguntas` : n > 1 ? `Faltam ${n} perguntas` : total > 1 ? 'Falta 1 pergunta' : 'Escolha uma opção', off: true };
}

// Voltar / Próxima (ou Enviar na última) do modo uma-por-vez.
function navHtml(a) {
  const k = passoDe(a), n = perguntasDe(a).length, ult = k === n - 1, bt = rotuloBotao(a);
  // Desligado, o botão diz o que fazer ("Escolha uma opção acima"); marcado, diz o próximo passo
  // ("Próxima pergunta ›" e, na última, "Enviar respostas"; se faltar uma de antes, "Falta 1 pergunta").
  const fazer = 'Escolha uma opção acima', ok = respondida(a, k);
  return `<div class="qz-nav"><button type="button" class="btn qz-voltar" data-q-nav="-1"${k ? '' : ' disabled'}>‹ Voltar</button>${ult
    ? `<button type="button" class="btn forte qz-enviar" data-q-enviar${bt.off ? ' disabled' : ''}>${esc(!ok ? fazer : bt.off ? bt.txt : 'Enviar respostas')}</button>`
    : `<button type="button" class="btn forte qz-prox" data-q-nav="1"${ok ? '' : ' disabled'}>${ok ? 'Próxima pergunta ›' : fazer}</button>`}</div>`;
}

export function html(a, info = {}) {
  const pergs = perguntasDe(a), esc0 = escolhasDe(a.id), bt = rotuloBotao(a), passo = umaPorVez(a), k = passoDe(a);
  const blocos = pergs.map((p, i) => {
    const e = esc0[i] || {}, marc = new Set(e.opcoes || []);
    const ops = (p.options || []).map((o, k) => `<button type="button" class="qz-op${marc.has(o.label) && !(e.outro && !p.multiSelect) ? ' on' : ''}" data-q-op="${k}" aria-pressed="${marc.has(o.label)}">
        <i class="qz-marca${p.multiSelect ? ' quad' : ''}" aria-hidden="true"></i><span><b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></button>`).join('');
    return `<div class="qz-perg" role="group" aria-labelledby="qz-${a.id}-${i}" data-q-i="${i}"${passo && i !== k ? ' hidden' : ''}>
      <div class="qz-enunc" id="qz-${a.id}-${i}">${p.header ? `<em class="qz-tag">${esc(p.header)}</em>` : ''}<b>${esc(p.question)}</b>${p.multiSelect ? '<small>Pode marcar mais de uma.</small>' : ''}</div>
      <div class="qz-ops">${ops}</div>
      <label class="qz-outro"><span>Outro</span><input type="text" data-q-outro maxlength="600" placeholder="Escreva outra resposta…" value="${esc(e.outro || '')}" autocomplete="off"></label>
    </div>`;
  }).join('');
  const quem = info.quem || 'A assistente';
  return `<div class="aprovacao ap3 qz" data-ap="${a.id}" data-ap-i="0" data-q="${a.id}">
    ${info.numeroHtml || ''}
    <div class="ap3-cab"><span class="ap-ic">${ico('ajuda')}</span><div class="ap3-tit"><b>${pergs.length > 1 ? `${pergs.length} perguntas para você` : 'Uma pergunta para você'}</b><small class="ap3-dest">${esc(quem)} quer acertar o pedido${info.pedido ? ` “${esc(info.pedido)}”` : ''} antes de seguir.</small></div></div>
    ${passo ? `<p class="qz-passo" aria-live="polite"><b>Pergunta ${k + 1} de ${pergs.length}</b><span class="qz-pontos" aria-hidden="true">${pergs.map((_, i) => `<i class="${i === k ? 'atual' : respondida(a, i) ? 'ok' : ''}"></i>`).join('')}</span></p>` : ''}
    ${pergs.length ? blocos : '<p class="ap-nota">As perguntas não vieram. Toque em Pular e responda na conversa.</p>'}
    ${passo ? navHtml(a) : `<div class="qz-botoes"><button type="button" class="btn forte qz-enviar" data-q-enviar${bt.off ? ' disabled' : ''}>${esc(bt.txt)}</button><button type="button" class="btn ap3-recusar" data-q-pular>Pular</button></div>`}
    <p class="qz-nota">${passo ? '<button type="button" class="qz-pular-link" data-q-pular>Pular as perguntas</button>: ' : 'Pular: '}ela segue com o melhor julgamento dela e conta no fim o que supôs.</p>
  </div>`;
}

// Atualiza os botões de um cartão sem redesenhar (não perde o foco do campo Outro).
function atualizar(card, a) {
  const pergs = perguntasDe(a), esc0 = escolhasDe(a.id);
  card.querySelectorAll('[data-q-i]').forEach((fs) => {
    const i = Number(fs.dataset.qI), p = pergs[i] || {}, e = esc0[i] || {}, marc = new Set(e.opcoes || []);
    fs.querySelectorAll('[data-q-op]').forEach((b) => { const l = p.options?.[Number(b.dataset.qOp)]?.label, on = marc.has(l) && !(e.outro && !p.multiSelect); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  });
  // Uma por vez (celular): mostra a pergunta da vez, os pontinhos e troca Próxima/Enviar.
  const nav = card.querySelector('.qz-nav');
  if (nav) {
    const k = passoDe(a);
    card.querySelectorAll('[data-q-i]').forEach((fs) => { fs.hidden = Number(fs.dataset.qI) !== k; });
    const ps = card.querySelector('.qz-passo b'); if (ps) ps.textContent = `Pergunta ${k + 1} de ${pergs.length}`;
    card.querySelectorAll('.qz-pontos i').forEach((x, i) => { x.className = i === k ? 'atual' : respondida(a, i) ? 'ok' : ''; });
    nav.outerHTML = navHtml(a);
  }
  const bt = rotuloBotao(a), b = card.querySelector('[data-q-enviar]');
  if (b && !nav) { b.textContent = bt.txt; b.disabled = bt.off; }
}

// Liga o formulário. f: { achar(id), enviar(a, status, detalhe) (async), toast }.
// Devolve true quando o clique era do questionário (o app.js não trata mais nada).
export async function clique(e, f) {
  const card = e.target.closest('[data-q]'); if (!card) return false;
  const a = f.achar(Number(card.dataset.q)); if (!a) return true;
  const esc0 = escolhasDe(a.id), pergs = perguntasDe(a);
  const op = e.target.closest('[data-q-op]');
  if (op) {
    const i = Number(op.closest('[data-q-i]').dataset.qI), p = pergs[i] || {}, l = p.options?.[Number(op.dataset.qOp)]?.label;
    const x = esc0[i] = { opcoes: [], outro: '', ...esc0[i] };
    if (p.multiSelect) x.opcoes = x.opcoes.includes(l) ? x.opcoes.filter((y) => y !== l) : [...x.opcoes, l];
    else { x.opcoes = [l]; x.outro = ''; const inp = op.closest('[data-q-i]').querySelector('[data-q-outro]'); if (inp) inp.value = ''; }
    atualizar(card, a);
    return true;
  }
  const nav = e.target.closest('[data-q-nav]');
  if (nav) {
    passos.set(a.id, Math.max(0, Math.min(pergs.length - 1, passoDe(a) + Number(nav.dataset.qNav))));
    atualizar(card, a);
    card.querySelector('.qz-passo')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  }
  const enviar = e.target.closest('[data-q-enviar]'), pular = e.target.closest('[data-q-pular]');
  if (!enviar && !pular) return true;
  if (enviar && faltam(pergs, esc0)) { f.toast({ titulo: 'Falta responder', texto: 'Escolha uma opção (ou escreva em Outro) em cada pergunta.', cor: '#f0973d' }); return true; }
  const respostas = enviar ? montarRespostas(pergs, esc0) : null;
  const detalhe = JSON.stringify(enviar ? { respostas } : { pulou: true });
  card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await f.enviar(a, enviar ? 'permitido' : 'negado', detalhe);
    estado.delete(a.id); passos.delete(a.id);
    f.toast(enviar ? { titulo: 'Respostas enviadas', texto: 'Ela começa com o que você escolheu.', cor: '#4fbf82' } : { titulo: 'Perguntas puladas', texto: 'Ela segue com o melhor julgamento dela.', cor: '#f0973d' });
  } catch (err) { card.querySelectorAll('button').forEach((b) => { b.disabled = false; }); atualizar(card, a); f.toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  return true;
}

// Digitar em "Outro": guarda o texto (uma escolha só: o Outro vale no lugar da opção marcada).
export function digitar(e, achar) {
  const inp = e.target.closest?.('[data-q-outro]'); if (!inp) return;
  const card = inp.closest('[data-q]'), a = achar(Number(card.dataset.q)); if (!a) return;
  const i = Number(inp.closest('[data-q-i]').dataset.qI), esc0 = escolhasDe(a.id);
  esc0[i] = { opcoes: [], outro: '', ...esc0[i], outro: inp.value };
  atualizar(card, a);
}
