// Topo enxuto: UM aviso prioritário (o primeiro da lista) e, se houver mais, um "+N" que abre os outros.
// Cada item: { k, nivel: 'urgente' | 'aviso', ic, txt, sub, acao }. Tocar num item leva ao lugar dele
// (quem decide para onde é o app.js, pelo data-aviso).
import { esc } from './comando-ctx.js';
import { ico } from './comando-icones.js';

let lista = null, aberta = false;
const linha = (x, principal) => `<button type="button" class="av-item ${x.nivel}${principal ? ' principal' : ''}" data-aviso="${esc(x.k)}" title="${esc(x.txt + (x.sub ? ': ' + x.sub : ''))}">
  <span class="av-ic">${ico(x.ic)}</span><span class="av-txt"><b>${esc(x.txt)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span><span class="av-acao">${esc(x.acao || 'Ver')}<i aria-hidden="true">›</i></span></button>`;

export function desenharAviso(el, itens) {
  if (!el) return;
  if (!itens.length) { if (el.dataset.h !== '') { el.innerHTML = ''; el.dataset.h = ''; } fecharLista(); return; }
  const [p, ...resto] = itens;
  const html = `<div class="aviso-topo ${p.nivel}">${linha(p, true)}${resto.length ? `<button type="button" class="av-mais" data-av-mais aria-expanded="${aberta}" title="Mais ${resto.length} aviso(s)"><b>+${resto.length}</b><small>aviso${resto.length > 1 ? "s" : ""}</small></button>` : ''}</div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  const mais = el.querySelector('[data-av-mais]');
  if (mais) mais.onclick = (e) => { e.stopPropagation(); aberta ? fecharLista() : abrirLista(el, resto); };
  if (aberta && resto.length) abrirLista(el, resto); else fecharLista();
}

function abrirLista(el, resto) {
  aberta = true;
  if (!lista) {
    lista = document.createElement('div'); lista.className = 'av-lista'; lista.setAttribute('role', 'menu');
    document.body.appendChild(lista);
    document.addEventListener('pointerdown', (e) => { if (aberta && !e.target.closest('.av-lista,[data-av-mais]')) fecharLista(); });
    // Um toque na lista vale como um toque no topo (o app.js decide para onde ir).
    lista.addEventListener('click', (e) => { const b = e.target.closest('[data-aviso]'); if (b) { fecharLista(); el.onclick?.({ target: b }); } });
  }
  lista.innerHTML = `<p class="av-lista-tit">Também esperando você</p>${resto.map((x) => linha(x, false)).join('')}`;
  const r = el.getBoundingClientRect();
  lista.style.top = Math.round(r.bottom + 6) + 'px';
  lista.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
  lista.style.width = Math.min(380, innerWidth - 16) + 'px';
  lista.hidden = false;
  el.querySelector('[data-av-mais]')?.setAttribute('aria-expanded', 'true');
}
export function fecharLista() {
  aberta = false;
  if (lista) lista.hidden = true;
  document.querySelector('#statusTopo [data-av-mais]')?.setAttribute('aria-expanded', 'false');
}
