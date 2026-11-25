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
  const html = `<span class="sc-ic" aria-hidden="true">${esc(v?.icone || '✦')}</span><span class="sc-txt"><b>${esc(v?.nome || 'Conversa nova')}</b><small>${selo ? `${esc(selo[0])} ${esc(selo[1])}` : 'conversa aberta'}${outras && !selo ? ` · trocar (${outras} outra${outras > 1 ? 's' : ''})` : ''}</small></span><span class="sc-seta" aria-hidden="true">${aberta ? '▴' : '▾'}</span>`;
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

// ---------- Rodapé da decisão (celular) ----------
// Com uma pergunta ou decisão aberta na conversa, o rodapé fixo mostra a AÇÃO PRINCIPAL dela
// ("Próxima pergunta ›" e, na última, "Enviar respostas"); "Escrever na conversa" vira um link pequeno.
// O botão do rodapé só repassa o toque ao botão do próprio cartão (a regra fica no questionario.js).
function acaoDoRodape(msgs) {
  const card = msgs?.querySelector('.aprovacao:not(.decidida)'); if (!card) return null;
  if (card.matches('[data-q]')) {
    const alvo = card.querySelector('.qz-nav .qz-prox, .qz-nav .qz-enviar, .qz-botoes .qz-enviar');
    if (!alvo) return null;
    const voltar = card.querySelector('.qz-nav .qz-voltar:not(:disabled)');
    return { card, alvo, txt: alvo.textContent.trim(), off: alvo.disabled, voltar };
  }
  const n = msgs.querySelectorAll('.aprovacao:not(.decidida)').length;
  return { card, txt: n > 1 ? `Ver a próxima decisão ↓` : 'Ver a decisão ↓', off: false, rolar: true };
}
function desenharRodape(form, msgs) {
  const box = form.querySelector('.cmp-acao'); if (!box) return;
  const a = ehCel() ? acaoDoRodape(msgs) : null;
  form.classList.toggle('com-acao', !!a);
  box.hidden = !a; if (!a) return;
  const html = `${a.voltar ? '<button type="button" class="btn cmp-acao-voltar" data-acao-voltar aria-label="Pergunta anterior">‹</button>' : ''}<button type="button" class="btn forte cmp-acao-ir" data-acao-ir${a.off ? ' disabled' : ''}>${esc(a.txt)}</button>`;
  if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
}
// Cabeçalho do celular numa faixa só: ‹ Voltar · conversa (nome + estado, toque troca) · Detalhes.
// Enquanto há decisão, o cartão do pedido (etapa, página, interromper) fica recolhido atrás de "Detalhes".
function desenharDetalhes(hud, btn) {
  const card = hud?.querySelector('.cp-rodando'), tem = !!card?.classList.contains('cp-tem-dec');
  btn.hidden = !tem;
  const aberto = !!card?.classList.contains('aberto');
  btn.setAttribute('aria-expanded', String(aberto));
  const html = `<span aria-hidden="true">${aberto ? '▴' : '▾'}</span><small>${aberto ? 'Fechar' : 'Detalhes'}</small>`;
  if (btn.dataset.h !== html) { btn.innerHTML = html; btn.dataset.h = html; }
  hud?.classList.toggle('det-aberto', aberto);
}
export function ligarCabecalhoERodape(form, msgs, hud, seletor) {
  if (!form || form.dataset.acaoLigada) return;
  form.dataset.acaoLigada = '1';
  const box = document.createElement('div'); box.className = 'cmp-acao'; box.hidden = true;
  form.prepend(box);
  box.addEventListener('click', (e) => {
    const a = acaoDoRodape(msgs); if (!a) return;
    if (e.target.closest('[data-acao-voltar]')) { a.voltar?.click(); return; }
    if (!e.target.closest('[data-acao-ir]')) return;
    if (a.rolar) { a.card.scrollIntoView({ behavior: 'smooth', block: 'start' }); a.card.classList.add('piscar'); setTimeout(() => a.card.classList.remove('piscar'), 1600); return; }
    a.alvo.click();
  });
  // O seletor da conversa entra na faixa de cima (‹ Voltar · conversa · Detalhes); no PC ele fica escondido.
  const faixa = seletor?.closest('.painel')?.querySelector('.seg-conversas');
  if (faixa && seletor) { faixa.append(seletor); faixa.classList.add('faixa-cel'); }
  const det = document.createElement('button');
  det.type = 'button'; det.className = 'det-pedido-cel'; det.hidden = true; det.title = 'Etapa do pedido, página e opções';
  seletor?.after(det);
  det.addEventListener('click', () => hud?.querySelector('.cp-menu-btn')?.click());
  let fila = 0;
  const agendar = () => { if (fila) return; fila = requestAnimationFrame(() => { fila = 0; desenharRodape(form, msgs); desenharDetalhes(hud, det); }); };
  new MutationObserver(agendar).observe(msgs, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'hidden'] });
  if (hud) new MutationObserver(agendar).observe(hud, { childList: true, subtree: true });
  addEventListener('resize', agendar);
  agendar();
}
