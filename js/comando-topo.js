// Topo com UMA prioridade: uma faixa acionável (a coisa mais importante agora, ex.: "4 decisões suas · Resolver")
// e, ao lado, "Resumo ▾": os outros avisos + fila, fazendo e custo do dia, recolhidos numa lista.
// Sem nada esperando você, a faixa fica calma ("Nada esperando você · 11 trabalhando") e abre o mesmo resumo.
// Cada item: { k, nivel: 'urgente' | 'aviso' | 'calmo', ic, txt, sub, acao }. Tocar num item leva ao lugar dele
// (quem decide para onde é o app.js, pelo data-aviso; "resumo" abre a lista aqui mesmo).
import { esc } from './comando-ctx.js';
import { ico } from './comando-icones.js';

let lista = null, aberta = false, ult = { el: null, resto: [], op: {} };
const linha = (x, principal) => `<button type="button" class="av-item ${x.nivel}${principal ? ' principal' : ''}" data-aviso="${esc(x.k)}" title="${esc(x.txt + (x.sub ? ': ' + x.sub : ''))}">
  <span class="av-ic">${ico(x.ic)}</span><span class="av-txt"><b>${esc(x.txt)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><span class="av-acao">${esc(x.acao || 'Ver')}<i aria-hidden="true">›</i></span></button>`;

// op: { calmo: texto da faixa quando nada espera você, numerosHtml: os números do dia, aoNumero(qual) }
export function desenharAviso(el, itens, op = {}) {
  if (!el) return;
  const calmo = { k: 'resumo', nivel: 'calmo', ic: 'check', txt: op.calmo || 'Nada esperando você', sub: 'Toque para ver o resumo do dia', acao: 'Resumo' };
  const [p, ...resto] = itens.length ? itens : [calmo];
  ult = { el, resto: itens.length ? resto : [], op };
  const n = ult.resto.length;
  const botao = itens.length ? `<button type="button" class="av-mais av-resumo" data-av-mais aria-expanded="${aberta}" aria-label="Resumo do dia${n ? ` e mais ${n} aviso${n > 1 ? 's' : ''}` : ''}" title="Resumo: fila, quem está fazendo, custo${n ? ` e mais ${n} aviso${n > 1 ? 's' : ''}` : ''}"><span>Resumo</span>${n ? `<b class="av-n">${n}</b>` : ''}<i aria-hidden="true">▾</i></button>` : '';
  const html = `<div class="aviso-topo ${p.nivel}">${linha(p, true)}${botao}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  const mais = el.querySelector('[data-av-mais]');
  if (mais) mais.onclick = (e) => { e.stopPropagation(); alternar(); };
  if (aberta) abrirLista(); else fecharLista();
}
export function alternar() { if (aberta) fecharLista(); else abrirLista(); }

function abrirLista() {
  const { el, resto, op } = ult; if (!el) return;
  aberta = true;
  const num = typeof op.numerosHtml === 'function' ? op.numerosHtml() : op.numerosHtml || '';
  if (!lista) {
    lista = document.createElement('div'); lista.className = 'av-lista'; lista.setAttribute('role', 'dialog'); lista.setAttribute('aria-label', 'Resumo do dia');
    document.body.appendChild(lista);
    document.addEventListener('pointerdown', (e) => { if (aberta && !e.target.closest('.av-lista,[data-av-mais],[data-aviso="resumo"]')) fecharLista(); });
    // Um toque na lista vale como um toque no topo (o app.js decide para onde ir); os números vão ao lugar deles.
    lista.addEventListener('click', (e) => {
      const rd = e.target.closest('[data-rd]'); if (rd) { fecharLista(); ult.op.aoNumero?.(rd.dataset.rd); return; }
      const b = e.target.closest('[data-aviso]'); if (b) { fecharLista(); ult.el.onclick?.({ target: b }); }
    });
  }
  lista.innerHTML = `${resto.length ? `<p class="av-lista-tit">Também esperando você</p>${resto.map((x) => linha(x, false)).join('')}` : ''}
    ${num ? `<p class="av-lista-tit">${resto.length ? 'Agora no escritório' : 'Resumo de agora'}</p><div class="av-numeros">${num}</div>` : ''}`;
  const r = el.getBoundingClientRect();
  lista.style.top = Math.round(r.bottom + 6) + 'px';
  lista.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
  lista.style.width = Math.min(400, innerWidth - 16) + 'px';
  lista.hidden = false;
  el.querySelector('[data-av-mais]')?.setAttribute('aria-expanded', 'true');
}
export function fecharLista() {
  aberta = false;
  if (lista) lista.hidden = true;
  document.querySelector('#statusTopo [data-av-mais]')?.setAttribute('aria-expanded', 'false');
}
