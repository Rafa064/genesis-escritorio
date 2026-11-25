// Questionário da assistente (ferramenta AskUserQuestion): no lugar do Autorizar/Recusar, um formulário.
// Cada pergunta mostra as opções como botões grandes (uma ou várias, conforme multiSelect) e um campo "Outro".
// "Responder" grava { respostas } no detalhe da aprovação com status "permitido" (a ponte devolve ao Claude);
// "Pular" grava "negado" (ela segue com o melhor julgamento dela).
import { esc, lerJson } from './comando-ctx.js';
import { ico } from './comando-icones.js';
import { montarRespostas, faltam } from './questionario-respostas.js';

export const ehQuestionario = (a) => a?.ferramenta === 'AskUserQuestion';
export const perguntasDe = (a) => { const p = lerJson(a.detalhe).perguntas; return Array.isArray(p) ? p : []; };

// O que foi marcado até agora, por aprovação: { [pergunta]: { opcoes: [rótulos], outro: '' } }.
// Fica fora do HTML para sobreviver aos redesenhos da tela enquanto a pessoa responde.
const estado = new Map();
const escolhasDe = (id) => { if (!estado.has(id)) estado.set(id, {}); return estado.get(id); };

function rotuloBotao(a) {
  const n = faltam(perguntasDe(a), escolhasDe(a.id)), total = perguntasDe(a).length;
  if (!n) return { txt: total > 1 ? 'Enviar respostas' : 'Responder', off: false };
  return { txt: n === total && total > 1 ? `Responda as ${total} perguntas` : n > 1 ? `Faltam ${n} perguntas` : total > 1 ? 'Falta 1 pergunta' : 'Escolha uma opção', off: true };
}

export function html(a, info = {}) {
  const pergs = perguntasDe(a), esc0 = escolhasDe(a.id), bt = rotuloBotao(a);
  const blocos = pergs.map((p, i) => {
    const e = esc0[i] || {}, marc = new Set(e.opcoes || []);
    const ops = (p.options || []).map((o, k) => `<button type="button" class="qz-op${marc.has(o.label) && !(e.outro && !p.multiSelect) ? ' on' : ''}" data-q-op="${k}" aria-pressed="${marc.has(o.label)}">
        <i class="qz-marca${p.multiSelect ? ' quad' : ''}" aria-hidden="true"></i><span><b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></button>`).join('');
    return `<div class="qz-perg" role="group" aria-labelledby="qz-${a.id}-${i}" data-q-i="${i}">
      <div class="qz-enunc" id="qz-${a.id}-${i}">${p.header ? `<em class="qz-tag">${esc(p.header)}</em>` : ''}<b>${esc(p.question)}</b>${p.multiSelect ? '<small>Pode marcar mais de uma.</small>' : ''}</div>
      <div class="qz-ops">${ops}</div>
      <label class="qz-outro"><span>Outro</span><input type="text" data-q-outro maxlength="600" placeholder="Escreva outra resposta…" value="${esc(e.outro || '')}" autocomplete="off"></label>
    </div>`;
  }).join('');
  const quem = info.quem || 'A assistente';
  return `<div class="aprovacao ap3 qz" data-ap="${a.id}" data-ap-i="0" data-q="${a.id}">
    <div class="ap3-cab"><span class="ap-ic">${ico('ajuda')}</span><div class="ap3-tit"><b>${pergs.length > 1 ? 'Perguntas antes de começar' : 'Uma pergunta antes de começar'}</b><small class="ap3-dest">${esc(quem)} quer acertar o pedido${info.pedido ? ` “${esc(info.pedido)}”` : ''} antes de gastar tempo.</small></div></div>
    ${pergs.length ? blocos : '<p class="ap-nota">As perguntas não vieram. Toque em Pular e responda na conversa.</p>'}
    <div class="qz-botoes"><button type="button" class="btn forte qz-enviar" data-q-enviar${bt.off ? ' disabled' : ''}>${esc(bt.txt)}</button><button type="button" class="btn ap3-recusar" data-q-pular>Pular</button></div>
    <p class="qz-nota">Pular: ela segue com o melhor julgamento dela e conta no fim o que supôs.</p>
  </div>`;
}

// Atualiza os botões de um cartão sem redesenhar (não perde o foco do campo Outro).
function atualizar(card, a) {
  const pergs = perguntasDe(a), esc0 = escolhasDe(a.id);
  card.querySelectorAll('[data-q-i]').forEach((fs) => {
    const i = Number(fs.dataset.qI), p = pergs[i] || {}, e = esc0[i] || {}, marc = new Set(e.opcoes || []);
    fs.querySelectorAll('[data-q-op]').forEach((b) => { const l = p.options?.[Number(b.dataset.qOp)]?.label, on = marc.has(l) && !(e.outro && !p.multiSelect); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  });
  const bt = rotuloBotao(a), b = card.querySelector('[data-q-enviar]');
  if (b) { b.textContent = bt.txt; b.disabled = bt.off; }
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
  const enviar = e.target.closest('[data-q-enviar]'), pular = e.target.closest('[data-q-pular]');
  if (!enviar && !pular) return true;
  if (enviar && faltam(pergs, esc0)) { f.toast({ titulo: 'Falta responder', texto: 'Escolha uma opção (ou escreva em Outro) em cada pergunta.', cor: '#f0973d' }); return true; }
  const respostas = enviar ? montarRespostas(pergs, esc0) : null;
  const detalhe = JSON.stringify(enviar ? { respostas } : { pulou: true });
  card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await f.enviar(a, enviar ? 'permitido' : 'negado', detalhe);
    estado.delete(a.id);
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
