// Conversa no celular: espaço para decidir.
// - O topo global (perfil, "N decisões", Resumo) some com a conversa aberta (CSS em estilo-chat-cel.css);
//   no lugar dele, "‹ Voltar" na faixa Dupla/Assistente.
// - As abas de conversa viram um seletor: um botão com o nome inteiro da conversa e o estado dela;
//   tocar abre a lista "Em qual conversa?" (nomes inteiros, estado de cada uma).
// - O compositor começa recolhido num botão "Responder": a decisão e os botões ficam inteiros na tela.
import { esc } from './comando-ctx.js';

export const ehCel = () => innerWidth <= 760;

// Seletor da conversa aberta (só aparece no celular). v: { icone, nome, cor } · selo: ['✋', 'pede sua aprovação'] ou null.
export function desenharSeletor(el, { v, selo, outras = 0, aberta = false }) {
  if (!el) return;
  const html = `<span class="sc-ic" aria-hidden="true">${esc(v?.icone || '✦')}</span><span class="sc-txt"><b>${esc(v?.nome || 'Conversa nova')}</b><small>${selo ? `${esc(selo[0])} ${esc(selo[1])}` : 'conversa aberta'}${outras ? ` · trocar (${outras} outra${outras > 1 ? 's' : ''})` : ''}</small></span><span class="sc-seta" aria-hidden="true">${aberta ? '▴' : '▾'}</span>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  el.style.setProperty('--cor', v?.cor || 'var(--borda-clara)');
  el.setAttribute('aria-expanded', String(aberta));
  el.title = `${v?.nome || 'Conversa nova'}: toque para trocar de conversa`;
}

// Compositor recolhido: "Responder" abre a caixa (com 📎 e Enviar); "Recolher" volta. Com texto, fica aberto.
export function ligarCompositor(form, entrada) {
  if (!form || form.dataset.celLigado) return;
  form.dataset.celLigado = '1';
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-cmp-abrir]')) { abrir(form, entrada); return; }
    if (e.target.closest('[data-cmp-recolher]')) { e.preventDefault(); recolher(form, entrada); }
  });
  entrada.addEventListener('input', () => { if (entrada.value.trim()) form.classList.add('aberto'); });
}
export function abrir(form, entrada) { form.classList.add('aberto'); setTimeout(() => entrada?.focus(), 0); }
export function recolher(form, entrada) { if (entrada?.value.trim()) return; form.classList.remove('aberto'); entrada?.blur(); }

// Depois de decidir: leva à próxima decisão ainda aberta (na conversa ou na folha "Decidir").
export function irProximaDecisao(caixa) {
  const prox = caixa?.querySelector('.aprovacao:not(.decidida)');
  if (prox) prox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return !!prox;
}
