// Barra de comando: escolha de projeto clara (um chip "📁 projeto ▾" ao lado do destino).
// Trocar o projeto de uma conversa que já existe abre uma conversa nova (cada conversa roda numa pasta).
import { ctx, esc } from './comando-ctx.js';

let escolhido = null; // projeto escolhido para a próxima conversa nova
const projetos = () => { const ps = (ctx.estado(ctx.eu().pessoa)?.info?.projetos || []).map((p) => p.nome).filter(Boolean); return ps.length ? ps : ['genesis-game']; };
export const projetoNovo = () => (escolhido && projetos().includes(escolhido) ? escolhido : null) || ctx.estado(ctx.eu().pessoa)?.projeto || projetos()[0];

// Linha "para onde vai": IA · conversa · projeto, num só lugar.
export function htmlDestino(conv, alvo, visual = {}) {
  const ia = alvo === 'codex' ? 'Codex' : 'Claude';
  return `<span class="bc-destino" style="--cor:${conv ? visual.cor : '#a785f0'}" title="O pedido vai para esta conversa">→ <b>${ia}</b> · <span class="bc-conv">${conv ? `${visual.icone || ''} ${esc(visual.nome || conv.titulo)}` : '＋ conversa nova'}</span></span>`;
}
export function htmlProjeto(conv) {
  const p = conv?.projeto || projetoNovo();
  return `<button type="button" class="bc-proj" data-bc-proj title="Em qual projeto (pasta do PC) o pedido roda. Toque para trocar.">📁 <span>${esc(p)}</span> ▾</button>`;
}

let menu = null;
export function ligarProjeto(barra) {
  if (!barra || barra.dataset.projLigado) return;
  barra.dataset.projLigado = '1';
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bc-proj]'); if (!b) return;
    e.preventDefault();
    if (menu && !menu.hidden) { menu.hidden = true; return; }
    if (!menu) { menu = document.createElement('div'); menu.className = 'bc-menu-proj painel-px'; document.body.appendChild(menu); }
    const conv = ctx.conversaDaBarra(), atual = conv?.projeto || projetoNovo();
    menu.innerHTML = `<p>Rodar o pedido em qual projeto?</p>${projetos().map((p) => `<button type="button" data-p="${esc(p)}" class="${p === atual ? 'on' : ''}">📁 ${esc(p)}${p === atual ? ' ✓' : ''}</button>`).join('')}<small>${conv ? 'Outro projeto começa uma conversa nova.' : 'Vale para a conversa nova.'}</small>`;
    const r = b.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(innerWidth - 248, r.left)) + 'px';
    menu.style.bottom = (innerHeight - r.top + 6) + 'px';
    menu.onclick = (ev) => {
      const x = ev.target.closest('[data-p]'); if (!x) return;
      escolhido = x.dataset.p; menu.hidden = true;
      if (conv && conv.projeto !== escolhido) ctx.setNova(true);
      ctx.desenharBarra();
    };
  });
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.hidden && !e.target.closest('.bc-menu-proj,[data-bc-proj]')) menu.hidden = true; });
}
