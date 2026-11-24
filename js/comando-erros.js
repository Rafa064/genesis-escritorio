// Erros do pedido em linguagem de gente: o que houve + o que fazer (com botão).
// Lê o texto que a ponte devolve no chat (de: 'erro'). A ponte avisa o login vencido com "🔑" no começo.
import { ctx, esc } from './comando-ctx.js';

const REGRAS = [
  { tipo: 'login', re: /^\s*🔑|login (do claude )?(venceu|expirou)|not logged in|please run \/login|invalid api key|oauth token|401\b|unauthori[sz]ed|authentication/i,
    icone: '🔑', titulo: 'O login do Claude venceu no PC',
    dica: 'O Claude do seu PC precisa entrar de novo. Dá para seguir agora pelo celular com o Codex.',
    como: 'Como reconectar o Claude no PC',
    comoTxt: 'No PC: abra o terminal, rode <code>claude</code> e digite <code>/login</code>. Depois volte aqui e toque em “Já reconectei”.',
    acoes: [['codex', 'Continuar com o Codex'], ['reenviar', '↻ Já reconectei']] },
  { tipo: 'limite', re: /limite de uso|usage limit|hit your .*limit|limit reached|rate limit|bati o limite/i,
    icone: '⏳', titulo: 'Acabou o limite de uso do Claude',
    dica: (t) => { const h = horaDe(t); return `${h ? `Ele volta às <b>${h}</b>.` : 'Ele volta sozinho em algumas horas.'} Até lá, o Codex (GPT) pode fazer o mesmo pedido.`; },
    acoes: [['codex', 'Pedir ao Codex agora'], ['reenviar', '↻ Tentar de novo']] },
  { tipo: 'ponte', re: /ponte (está )?desligad|pc desligado|ponte reiniciou|feito com a ponte desligada|modo "sempre ligada"/i,
    icone: '🔌', titulo: 'O PC não pegou o pedido',
    dica: 'A ponte (o programa no seu PC) estava desligada ou reiniciou. Ligue o PC; quando a bolinha ficar verde, mande de novo.',
    acoes: [['reenviar', '↻ Mandar de novo']] },
  { tipo: 'pausa', re: /est[áa] pausada/i, icone: '⏸', titulo: 'A assistente está pausada',
    dica: 'Alguém apertou “Pausar” nos Ajustes. Tire a pausa e mande de novo.', acoes: [['pausa', '▶ Tirar a pausa'], ['reenviar', '↻ Mandar de novo']] },
  { tipo: 'projeto', re: /não está configurado neste PC/i, icone: '📁', titulo: 'Esse projeto não existe neste PC',
    dica: 'Abra uma conversa nova escolhendo um projeto que o PC conhece.', acoes: [['nova', '＋ Conversa nova']] },
  { tipo: 'tempo', re: /passou do limite de \d+ minutos/i, icone: '⏱', titulo: 'Demorou demais e eu parei',
    dica: 'O pedido passou do tempo máximo. Dá para pedir para continuar de onde parou.', acoes: [['continuar', '▶ Continuar de onde parou']] },
  { tipo: 'hora', re: /pedidos por hora/i, icone: '🚦', titulo: 'Muitos pedidos nesta hora',
    dica: 'É um freio de segurança da ponte. Espere alguns minutos e mande de novo.', acoes: [['reenviar', '↻ Mandar de novo']] },
];
const horaDe = (t) => /(?:volta|reset[as]?)\D{0,12}(\d{1,2}:\d{2})/i.exec(String(t))?.[1] || null;

export function tipoErro(texto) {
  const t = String(texto || '');
  const r = REGRAS.find((x) => x.re.test(t));
  if (!r) return { tipo: 'outro', icone: '⚠️', titulo: 'Deu erro neste pedido', dica: 'Tente de novo. Se repetir, peça ao Codex para olhar o erro.', acoes: [['reenviar', '↻ Tentar de novo'], ['codex', 'Pedir ao Codex']] };
  return { ...r, dica: typeof r.dica === 'function' ? r.dica(t) : r.dica, hora: horaDe(t) };
}

// Último erro "que ainda vale" (login / limite) visto em qualquer conversa: vira aviso fixo na barra.
let ultimoGrave = null; // { tipo, hora, t }
export function viuMensagem(c) {
  if (c?.de !== 'erro') return;
  const x = tipoErro(c.texto);
  if (x.tipo === 'login' || x.tipo === 'limite') ultimoGrave = { tipo: x.tipo, hora: x.hora, t: c.criado ? new Date(c.criado).getTime() : Date.now() };
}
export function viuResposta() { ultimoGrave = null; } // uma resposta boa depois do erro: ele passou
function graveAtual() {
  const g = ultimoGrave; if (!g) return null;
  if (Date.now() - g.t > 6 * 3600e3) return null;
  if (g.tipo === 'limite' && g.hora) { const [h, m] = g.hora.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < g.t) d.setDate(d.getDate() + 1); if (Date.now() > d.getTime()) return null; }
  return g;
}

// Linha de estado do chat (em cima das mensagens): sempre com a próxima ação quando algo está errado.
export function htmlEstado({ st = {}, ponte, ocupada, conv, gpt }) {
  const g = !gpt && graveAtual();
  let cor, txt, acao = '';
  if (st.pausado) { cor = '#ef6a55'; txt = 'Assistente pausada: nada roda até tirar a pausa'; acao = botao('pausa', '▶ Tirar a pausa'); }
  else if (!ponte) { cor = '#8a8fa6'; txt = 'PC desligado: o pedido espera a ponte ligar (até 3 min) ou volta com aviso'; }
  else if (g?.tipo === 'login') { cor = '#ffd23f'; txt = '🔑 Login do Claude vencido no PC: rode claude e /login'; acao = botao('codex', 'Usar o Codex'); }
  else if (g?.tipo === 'limite') { cor = '#ffd23f'; txt = `⏳ Claude no limite${g.hora ? ' até ' + g.hora : ''}`; acao = botao('codex', 'Usar o Codex'); }
  else if (ocupada) { cor = '#f0973d'; txt = `${gpt ? 'O Codex' : 'A assistente'} está trabalhando · o que você mandar agora espera ela terminar`; }
  else { cor = '#4fbf82'; txt = `Pronta · 📁 ${conv?.projeto || st.projeto || 'genesis-game'}${st.branch ? ' · ⎇ ' + st.branch : ''}`; }
  return `<i style="--cor:${cor}"></i><span class="ep-txt">${esc(txt)}</span>${acao}`;
}
// Estado curto da barra de comando (no mapa).
export function estadoBarra({ st = {}, ligado, ocupada, alvo }) {
  const g = alvo !== 'codex' && graveAtual();
  if (st.pausado) return ['#ef6a55', 'pausada'];
  if (!ligado) return ['#8a8fa6', 'PC desligado: espera a ponte'];
  if (g?.tipo === 'login') return ['#ffd23f', '🔑 login vencido no PC'];
  if (g?.tipo === 'limite') return ['#ffd23f', `⏳ limite até ${g.hora || '?'}: use o Codex`];
  if (ocupada) return ['#f0973d', 'ocupada: entra na fila'];
  return ['#4fbf82', 'pronta'];
}
const botao = (acao, rot, forte = false) => `<button type="button" class="btn mini cmd-acao${forte ? ' forte' : ''}" data-cmd-acao="${acao}">${esc(rot)}</button>`;

// Troca cada balão de erro do chat por um cartão: o que houve, o que fazer e os botões.
export function decorarErros(el) {
  for (const m of el.querySelectorAll('.msg.erro:not([data-dec])')) {
    const original = m.textContent, x = tipoErro(original);
    m.dataset.dec = x.tipo;
    m.classList.add('cmd-erro');
    m.innerHTML = `<div class="ce-cab"><span class="ce-ic">${x.icone}</span><b>${esc(x.titulo)}</b></div><p class="ce-dica">${x.dica}</p>`
      + `<div class="ce-acoes">${x.acoes.map(([a, r], i) => botao(a, r, i === 0)).join('')}</div>`
      + (x.como ? `<details class="ce-como"><summary>${esc(x.como)}</summary><p>${x.comoTxt}</p></details>` : '')
      + `<details class="ce-orig"><summary>mensagem original</summary><code>${esc(original)}</code></details>`;
  }
  ligarAcoes(el);
}

// Os botões (no cartão de erro e na linha de estado) fazem a ação de verdade.
export function ligarAcoes(el) {
  if (!el || el.dataset.cmdAcoes) return;
  el.dataset.cmdAcoes = '1';
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cmd-acao]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const ultimo = ctx.ultimoPedido?.() || '';
    const acao = b.dataset.cmdAcao;
    try {
      if (acao === 'reenviar') { if (!ultimo) return ctx.toast({ titulo: 'Não achei o pedido', texto: 'Escreva de novo na caixa.', cor: '#ffd23f' }); await ctx.enviarNoChat(ultimo); }
      else if (acao === 'continuar') await ctx.enviarNoChat('Continue de onde parou. Se faltar pouco, termine; se faltar muito, me diga o que falta.');
      else if (acao === 'codex') { if (!ultimo) { ctx.mudarAlvo?.('codex'); return; } await ctx.pedirNaBarra(ultimo, 'codex', {}); ctx.toast({ titulo: 'Mandei para o Codex', texto: 'Mesmo pedido, na conversa do Codex.', cor: '#3fb37f' }); }
      else if (acao === 'pausa') { await ctx.tirarPausa(); ctx.toast({ titulo: 'Pausa tirada', texto: 'Pode mandar de novo.', cor: '#4fbf82' }); }
      else if (acao === 'nova') ctx.novaConversa?.();
    } catch (err) { ctx.toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  });
}
