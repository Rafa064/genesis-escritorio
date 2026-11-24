// Página do pedido: um lugar só para acompanhar UM pedido do começo ao fim.
// Abre de qualquer cartão de pedido (mapa, Atividade, conversa, decisões) e logo depois do "Novo pedido".
//   título · linha do tempo (Enviado → Fazendo → Precisa de você → Pronto) · responsável
//   · PRÓXIMO PASSO em destaque · decisões pendentes (com botões) · entregas (arquivos, prints, links)
//   · ações: responder/ajustar, parar, refazer.
// O app.js entrega os dados pelo ctx (comando-ctx.js); este módulo só monta a tela e chama as ações.
import * as D from './dados.js';
import { frase, primeiraFrase } from './humano.js';
import { tituloDe } from './config.js';
import { ctx, esc, guardado, guarda, nomeArq, tempoDe } from './comando-ctx.js';
import { ico } from './comando-icones.js';
import { arquivosMudados } from './comando-progresso.js';

let ref = null;          // { conv, missao }
let recem = null;        // { quando } logo depois de enviar
let rascunho = '';       // o que está escrito em "Responder ou pedir ajuste" (sobrevive aos redesenhos)
let confirmar = null;    // 'refazer' | 'parar' quando a pergunta de confirmação está aberta
let ligado = false;
const ETAPAS = ['Enviado', 'Fazendo', 'Precisa de você', 'Pronto'];
const concluidos = () => { try { return new Set(JSON.parse(guardado('pedidosConcluidos', '[]'))); } catch { return new Set(); } };
const chaveDe = (conv, m) => (conv ? `c${conv.id}` : m ? `m${m.id}` : '');

// ---------- abrir ----------
export function abrir(r = {}) {
  ref = { conv: r.conv ?? null, missao: r.missao ?? null };
  recem = r.recem ? { quando: Date.now() } : null;
  rascunho = ''; confirmar = null;
  ctx.abrirAba('pedido', !r.recem);
  const p = document.getElementById('pedidoPagina')?.closest('.painel'); if (p) p.scrollTop = 0;
  // Fora do demo, as mensagens de uma conversa que não está aberta chegam depois: redesenha quando vierem.
  const id = dadosDe()?.conv?.id;
  if (id != null) ctx.carregarMsgs?.([id]).then(() => { if (aberto()) desenhar(); });
}
export const aberto = () => !!ref && !document.querySelector('[data-painel="pedido"]')?.hidden;

// ---------- dados: tudo o que a página precisa de um pedido ----------
export function dadosDe(r = ref) {
  if (!r) return null;
  const eu = ctx.eu()?.pessoa;
  let conv = r.conv != null ? ctx.conversas().find((c) => c.id === r.conv) || null : null;
  let m = r.missao ? D.missoes().find((x) => x.id === r.missao) || null : null;
  if (!conv && m) conv = ctx.convDaMissao(m);
  if (conv && !m) m = ctx.missaoDaConversa(conv);
  if (!conv && !m) return null;
  const meu = conv ? true : m?.pessoa === eu;
  const msgs = conv ? ctx.mensagensDe(conv.id) || [] : [];
  const pedidoTxt = msgs.find((x) => x.de === 'eu')?.texto || m?.pedido || conv?.titulo || '';
  const ultResp = [...msgs].reverse().find((x) => x.de === 'assistente')?.texto || '';
  const ultEu = msgs.map((x, i) => [x, i]).filter(([x]) => x.de === 'eu').at(-1)?.[1] ?? -1;
  const erroMsg = msgs.slice(ultEu + 1).filter((x) => x.de === 'erro').at(-1)?.texto || '';
  const ocupada = conv ? ctx.convOcupada(conv.id) : false;
  const fila = conv ? ctx.filaDe(conv.id) : 0;
  const pend = conv ? ctx.pendDe(conv.id) : 0;
  const aprovs = conv ? ctx.aprovacoesDe(conv.id) : [];
  const rodando = m && !m.fim && ['trab', 'alerta', 'semsinal'].includes(m.status);
  const respondeuDepois = ultResp && msgs.findLastIndex?.((x) => x.de === 'assistente') > ultEu;
  let estado;
  if (pend || (m?.status === 'alerta' && !m.fim && meu)) estado = 'precisa';
  else if (erroMsg || m?.status === 'erro') estado = 'erro';
  else if (rodando || (ocupada && m && !m.fim)) estado = 'fazendo';
  else if (ocupada) estado = fila > 0 ? 'fila' : 'enviado';
  else if (m?.fim || respondeuDepois) estado = 'pronto';
  else estado = 'enviado';
  if (estado === 'pronto' && concluidos().has(chaveDe(conv, m))) estado = 'concluido';
  const visual = conv ? ctx.visualAba(conv) : null;
  const titulo = primeiraFrase(visual?.nome || conv?.titulo || m?.titulo || pedidoTxt || 'Pedido', 80);
  return { conv, m, meu, pessoa: m?.pessoa || eu, msgs, pedidoTxt, ultResp, erroMsg, ocupada, fila, pend, aprovs, estado, titulo, visual,
    alvo: conv?.alvo || m?.alvo || 'claude', projeto: conv?.projeto || m?.projeto || '' };
}

// Estado curto (para listas e chips).
export const ROT_ESTADO = { precisa: ['alerta', 'Precisa de você'], fazendo: ['trab', 'Fazendo'], fila: ['fila', 'Na fila'], enviado: ['fila', 'Enviado'], pronto: ['ok', 'Pronto'], concluido: ['ok', 'Concluído'], erro: ['erro', 'Travou'] };
const etapaDe = (e) => ({ enviado: 0, fila: 0, fazendo: 1, erro: 1, precisa: 2, pronto: 3, concluido: 4 })[e] ?? 0;

// ---------- desenho ----------
const linhaTempo = (d) => {
  const n = etapaDe(d.estado), m = d.m;
  const quando = [m?.inicio ? D.ha(m.inicio) : '', m?.passos?.find((e) => e.ferramenta)?.t ? D.ha(m.passos.find((e) => e.ferramenta).t) : '', '', m?.fim ? D.ha(m.fim) : ''];
  return `<ol class="pp-tempo" aria-label="Andamento do pedido">${ETAPAS.map((t, i) => {
    let cls = i < n ? 'ok' : i === n ? 'atual' : '';
    if (i === 2 && n === 3 && !d.m?.alertas) cls = 'pulou';          // não precisou de você
    if (i === 1 && d.estado === 'erro') cls = 'atual erro';
    if (i === 2 && d.estado === 'precisa') cls = 'atual alerta';
    if (n === 4) cls = i === 2 && !d.m?.alertas ? 'pulou' : 'ok';
    const sub = cls === 'pulou' ? 'não precisou' : i === 2 && d.estado === 'precisa' ? 'agora' : i === 1 && d.estado === 'erro' ? 'travou' : cls.startsWith('ok') || cls.startsWith('atual') ? (quando[i] && quando[i] !== 'agora' ? `há ${quando[i]}` : quando[i]) : '';
    return `<li class="${cls}"><i aria-hidden="true"></i><span>${esc(t)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</li>`;
  }).join('')}</ol>`;
};

async function responsavel(d) {
  const ult = d.m?.passos?.at(-1);
  const ag = ult?.agente && ult.agente !== 'Orquestrador' && ['fazendo', 'precisa'].includes(d.estado) ? ult.agente : null;
  const dono = d.pessoa === ctx.eu()?.pessoa ? (d.alvo === 'codex' ? 'Codex' : 'Sua assistente') : `Assistente do ${d.pessoa}`;
  const equipe = d.m ? [...d.m.agentes].filter((a) => a !== ag).slice(0, 5) : [];
  const rostos = await Promise.all(equipe.map(async (a) => `<img src="${await ctx.retrato(a)}" alt="" title="${esc(tituloDe(a))}">`));
  return `<div class="pp-resp">
    <div class="pp-pessoa"><img src="${await ctx.retrato(d.alvo === 'codex' ? 'Codex' : 'Orquestrador')}" alt=""><span><small>Responsável</small><b>${esc(dono)}</b><em>${esc(d.alvo === 'codex' ? 'Codex (GPT)' : 'Claude')}${d.projeto ? ` · projeto ${esc(d.projeto)}` : ''}</em></span></div>
    ${ag ? `<div class="pp-pessoa"><img src="${await ctx.retrato(ag)}" alt=""><span><small>Fazendo agora</small><b>${esc(tituloDe(ag))}</b><em>${esc(primeiraFrase(frase(ult), 60))}</em></span></div>` : ''}
    ${rostos.length ? `<div class="pp-equipe"><small>Também ajudaram</small><span>${rostos.join('')}</span></div>` : ''}
  </div>`;
}

// O que vem agora, em uma frase grande, com o botão certo.
function proximo(d) {
  const quem = d.alvo === 'codex' ? 'O Codex' : 'A assistente';
  const meu = d.meu;
  const ult = d.m?.passos?.at(-1);
  switch (d.estado) {
    case 'precisa': return { cls: 'alerta', ic: 'mao', tit: d.aprovs.length ? (d.pend > 1 ? `Você decide: ${d.pend} decisões neste pedido` : 'Você decide: 1 decisão') : 'Ela espera você', txt: d.aprovs.length ? `${d.pend > 1 ? 'A primeira está logo abaixo. ' : ''}${quem} segue sozinha depois que você escolher.` : `${quem} parou e espera você na conversa.`, botao: d.aprovs.length ? null : ['conversa', 'Abrir a conversa'] };
    case 'fazendo': return { cls: 'trab', ic: 'engrenagem', tit: 'Nada para você agora', txt: `${ult?.agente && ult.agente !== 'Orquestrador' ? tituloDe(ult.agente) + ': ' : ''}${ult ? primeiraFrase(frase(ult), 110) : 'montando o plano'}. Você recebe um aviso se precisar decidir algo.`, botao: null };
    case 'fila': return { cls: 'fila', ic: 'pontos', tit: 'Na fila', txt: `${quem} termina o pedido anterior desta conversa e começa este em seguida.`, botao: null };
    case 'enviado': return { cls: 'fila', ic: 'seta', tit: 'Enviado: começa em instantes', txt: (ctx.estadoPedido?.({ alvo: d.alvo, convId: null }) || '').replace(/^.*ocupada.*$/i, '') || `${quem} já recebeu. O andamento aparece aqui sozinho.`, botao: null };
    case 'erro': return { cls: 'erro', ic: 'alerta', tit: 'Travou: precisa de um empurrão', txt: primeiraFrase(d.erroMsg || d.m?.passos?.filter((e) => e.tipo === 'erro').at(-1)?.texto || 'Deu erro e parou.', 160), botao: meu && d.conv ? ['refazer', 'Tentar de novo'] : null };
    case 'pronto': return { cls: 'ok', ic: 'check', tit: 'Pronto: confira a entrega', txt: 'Abra o resultado. Se estiver bom, conclua; se não, peça um ajuste.', botao: ['ver', d.m?.miniaturas?.length ? 'Ver o resultado' : 'Ver a resposta completa'], sec: meu && d.conv ? ['concluir', 'Está bom, concluir'] : null, ter: meu && d.conv ? ['ajustar', 'Pedir ajuste'] : null };
    default: return { cls: 'ok', ic: 'check', tit: 'Concluído', txt: 'Você marcou este pedido como concluído. Se mudar de ideia, peça um ajuste.', botao: null, sec: meu && d.conv ? ['ajustar', 'Pedir ajuste'] : null };
  }
}

const LINK = /https?:\/\/[^\s)>\]"'`]+/g;
// O que um arquivo é, em linguagem de gente (pela extensão e pela pasta).
function tipoArq(a) {
  const s = String(a).replace(/\\/g, '/').toLowerCase(), ext = s.split('.').pop();
  if (/skill\.md$|\/skills\//.test(s)) return { nome: 'Receita nova para as IAs', desc: 'ensina a equipe a repetir este tipo de tarefa' };
  if (/\.(mp4|webm|mov|gif)$/.test(s)) return { nome: 'Vídeo', desc: 'arquivo de vídeo pronto para ver' };
  if (/\.(png|jpe?g|webp|svg)$/.test(s)) return { nome: 'Imagem', desc: 'arte, print ou capa' };
  if (/\.(tsx|jsx)$/.test(s) && /video|remotion|short|trailer|raio/.test(s)) return { nome: 'Montagem do vídeo', desc: 'a receita que gera o vídeo (cortes, textos, música)' };
  if (/\/video\/|beat|corte/.test(s) && /\.(m?js|ts|py)$/.test(s)) return { nome: 'Ferramenta de vídeo', desc: 'ajuda a cortar no ritmo da música' };
  if (/\.(gd|tscn|tres)$/.test(s)) return { nome: 'Código do jogo', desc: 'muda como o jogo funciona ou aparece' };
  if (/\.(json|csv|ya?ml)$/.test(s)) return { nome: 'Dados e números', desc: 'valores de configuração (vida, tempos, listas)' };
  if (/\.(css|html)$/.test(s) || /pagina\//.test(s)) return { nome: 'Visual do site', desc: 'telas e estilos do escritório' };
  if (/\.(md|txt)$/.test(s)) return { nome: 'Texto ou anotação', desc: 'documento escrito' };
  if (/\.(m?js|ts|py)$/.test(s)) return { nome: 'Código', desc: 'programa ou script do projeto' };
  return { nome: `Arquivo .${ext}`, desc: 'outro arquivo do projeto' };
}
async function entregas(d) {
  const arqs = d.m ? arquivosMudados(d.m) : [];
  const minis = d.m?.miniaturas || [];
  const urls = minis.length ? await ctx.urlsMiniaturas(minis.slice(0, 6).map((x) => x.caminho)).catch(() => []) : [];
  const links = [...new Set([d.m?.resposta || '', d.ultResp].join(' ').match(LINK) || [])].slice(0, 5);
  const resposta = d.ultResp || d.m?.resposta || '';
  const partes = [];
  if (resposta && ['pronto', 'concluido', 'erro'].includes(d.estado)) partes.push(`<blockquote class="pp-resposta"><small>${d.alvo === 'codex' ? 'O Codex' : 'A assistente'} respondeu</small>${esc(primeiraFrase(resposta.replace(/[*`_#>]/g, ''), 280))}</blockquote>`);
  if (urls.filter(Boolean).length) partes.push(`<div class="pp-prints">${minis.slice(0, 6).map((mi, i) => urls[i] ? `<button type="button" class="pp-print${mi.video ? ' video' : ''}" data-pp-mini="${i}"><img src="${esc(urls[i])}" alt="" loading="lazy"><span>${esc(mi.nome || nomeArq(mi.caminho))}</span></button>` : '').join('')}</div>`);
  if (arqs.length) {
    // Para leigo: o que cada arquivo É ("Código do vídeo", "Receita da IA"); nome e pasta ficam nos detalhes.
    const tipos = arqs.map(tipoArq), grupos = new Map();
    for (const t of tipos) grupos.set(t.nome, { ...t, n: (grupos.get(t.nome)?.n || 0) + 1 });
    partes.push(`<div class="pp-mudou"><p class="pp-mudou-tit">${ico('lapis')}<b>Mudou ${arqs.length} arquivo${arqs.length > 1 ? 's' : ''} no projeto</b></p>
      <ul class="pp-tipos">${[...grupos.values()].map((g) => `<li><b>${esc(g.nome)}</b>${g.n > 1 ? ` <small>×${g.n}</small>` : ''}<span>${esc(g.desc)}</span></li>`).join('')}</ul>
      <details class="pp-tec"><summary>Ver nomes e pastas dos arquivos</summary><ul class="pp-arqs">${arqs.slice(0, 12).map((a) => { const p = String(a).replace(/\\/g, '/').split('/'); return `<li>${ico('lapis')}<span><b>${esc(p.pop())}</b><small>${esc(p.slice(-3).join('/') || 'pasta do projeto')}</small></span></li>`; }).join('')}${arqs.length > 12 ? `<li class="pp-mais">e mais ${arqs.length - 12} arquivo(s)</li>` : ''}</ul></details></div>`);
  }
  if (links.length) partes.push(`<ul class="pp-links">${links.map((u) => `<li>${ico('globo')}<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a></li>`).join('')}</ul>`);
  const n = arqs.length + urls.filter(Boolean).length + links.length;
  return { n, html: partes.join('') || `<p class="pp-vazio">${d.estado === 'pronto' || d.estado === 'concluido' ? 'Ela respondeu sem mudar arquivos.' : 'Ainda sem entregas. Arquivos, prints e links aparecem aqui assim que ficarem prontos.'}</p>` };
}

function acoes(d) {
  if (!d.meu || !d.conv) return d.pessoa !== ctx.eu()?.pessoa ? `<div class="pp-sec pp-acoes"><p class="pp-nota">Este pedido é do ${esc(d.pessoa)}. Só ele decide e pede ajustes; você pode comentar na conversa da dupla.</p><button type="button" class="btn" data-pp="dupla">Falar com o ${esc(d.pessoa)}</button></div>` : '';
  const rodando = ['fazendo', 'precisa', 'fila', 'enviado'].includes(d.estado);
  const conf = confirmar === 'refazer'
    ? `<div class="pp-conf" role="alertdialog" aria-label="Refazer o pedido"><p><b>Refazer do zero?</b> ${rodando ? 'O que está rodando para agora e ' : ''}ela começa de novo com o mesmo pedido. O que já foi feito continua nos arquivos.</p><div class="pp-conf-bt"><button type="button" class="btn" data-pp="cancelar">Cancelar</button><button type="button" class="btn forte" data-pp="refazer-sim">Sim, refazer</button></div></div>`
    : confirmar === 'parar'
      ? `<div class="pp-conf" role="alertdialog" aria-label="Parar o pedido"><p><b>Parar este pedido?</b> Ela interrompe agora. O que já foi feito fica salvo e dá para continuar depois.</p><div class="pp-conf-bt"><button type="button" class="btn" data-pp="cancelar">Continuar rodando</button><button type="button" class="btn perigo-forte" data-pp="parar-sim">Sim, parar</button></div></div>` : '';
  return `<section class="pp-sec pp-acoes" id="ppResponder"><h3>Responder ou pedir ajuste</h3>
    <form class="pp-form" data-pp-form><textarea name="txt" rows="2" maxlength="4000" placeholder="${rodando ? 'Ex.: deixa o corte 3 mais curto' : 'Ex.: ficou ótimo, agora faz a versão em inglês'}" aria-label="Responder ou pedir ajuste">${esc(rascunho)}</textarea>
      <button class="btn forte" data-pp-enviar>${d.ocupada ? 'Enviar (entra na fila)' : 'Enviar'}</button></form>
    ${conf}
    <div class="pp-outras"><span class="pp-outras-rot">Ver:</span><button type="button" class="pp-lk" data-pp="conversa">a conversa</button>${d.m ? `<button type="button" class="pp-lk" data-pp="passos">o passo a passo</button>` : ''}</div>
    <div class="pp-outras pp-risco"><span class="pp-outras-rot">Outras ações:</span>${rodando ? `<button type="button" class="pp-lk pp-parar" data-pp="parar">Parar pedido</button>` : ''}<button type="button" class="pp-lk" data-pp="refazer">Refazer do zero</button></div>
  </section>`;
}

let ultHtml = '', desenhando = false, denovo = false;
export async function desenhar() {
  const el = document.getElementById('pedidoPagina'); if (!el) return;
  if (desenhando) { denovo = true; return; }
  desenhando = true;
  try {
    const d = dadosDe();
    if (!d) { el.innerHTML = '<p class="pp-vazio">Não achei este pedido. Ele pode ter sido apagado.</p>'; ultHtml = ''; return; }
    const [cls, rot] = ROT_ESTADO[d.estado];
    const px = proximo(d), ent = await entregas(d);
    const secEntregas = `<section class="pp-sec pp-entregas" id="ppEntregas"><h3>${ico('imagem')}${['pronto', 'concluido'].includes(d.estado) ? 'Resultado' : 'Entregas até agora'}${ent.n ? ` <small>${ent.n}</small>` : ''}</h3>${ent.html}</section>`;
    const decisoes = d.aprovs.length ? `<section class="pp-sec pp-decisoes" id="ppDecisoes" aria-label="Decisões pendentes"><div class="pp-ap">${d.aprovs.map((a) => ctx.cartaoAprovacao(a)).join('')}</div></section>` : '';
    const html = `${recem && Date.now() - recem.quando < 20e3 ? `<p class="pp-recem">${ico('check')}<span><b>Pedido enviado.</b> Pode fechar: o aviso chega quando precisar de você ou ficar pronto.</span></p>` : ''}
      <header class="pp-cab"><span class="pp-est ${cls}"><i></i>${esc(rot)}</span><h2>${esc(d.titulo)}</h2>
        ${d.pedidoTxt && primeiraFrase(d.pedidoTxt, 200) !== d.titulo ? `<p class="pp-pedido"><b>Pedido:</b> ${esc(primeiraFrase(d.pedidoTxt, 200))}</p>` : ''}
        <p class="pp-meta">${d.m?.inicio ? `Enviado há ${esc(D.ha(d.m.inicio))}` : d.conv?.atualizado ? `Atualizado ${esc(D.ha(new Date(d.conv.atualizado).getTime()))}` : ''}${d.m?.duracao && d.m.fim ? ` · levou ${esc(tempoDe(d.m.duracao))}` : ''}${d.fila ? ` · +${d.fila} na fila` : ''}</p></header>
      ${linhaTempo(d)}
      <section class="pp-prox ${px.cls}${d.estado === 'precisa' && d.aprovs.length ? ' compacto' : ''}" aria-label="Próximo passo"><span class="pp-prox-ic">${ico(px.ic)}</span><div><small>Próximo passo</small><b>${esc(px.tit)}</b><p>${esc(px.txt)}</p>
        ${px.botao || px.sec ? `<div class="pp-prox-bt">${px.botao ? `<button type="button" class="btn forte" data-pp="${px.botao[0]}">${esc(px.botao[1])}</button>` : ''}${px.sec ? `<button type="button" class="btn" data-pp="${px.sec[0]}">${esc(px.sec[1])}</button>` : ''}${px.ter ? `<button type="button" class="btn" data-pp="${px.ter[0]}">${esc(px.ter[1])}</button>` : ''}</div>` : ''}</div></section>
      ${decisoes}
      ${['pronto', 'concluido'].includes(d.estado) ? secEntregas + await responsavel(d) : await responsavel(d) + secEntregas}
      ${acoes(d)}`;
    if (html !== ultHtml) {
      const foco = document.activeElement?.name === 'txt' && el.contains(document.activeElement);
      const sel = foco ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
      const rolagem = el.closest('.painel')?.scrollTop ?? 0;
      el.innerHTML = html; ultHtml = html;
      ctx.ligarAprovacoes(el.querySelector('.pp-ap') || el);
      const t = el.querySelector('textarea[name=txt]');
      if (t) { t.value = rascunho; if (foco) { t.focus(); t.setSelectionRange(...sel); } }
      const p = el.closest('.painel'); if (p) p.scrollTop = rolagem;
    }
    if (!ligado) ligar(el);
  } finally {
    desenhando = false;
    if (denovo) { denovo = false; setTimeout(desenhar, 0); }
  }
}

function ligar(el) {
  ligado = true;
  el.addEventListener('input', (e) => { if (e.target.name === 'txt') rascunho = e.target.value; });
  el.addEventListener('keydown', (e) => { if (e.target.name === 'txt' && e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); responder(); } });
  el.addEventListener('submit', (e) => { e.preventDefault(); responder(); });
  el.addEventListener('click', async (e) => {
    const mi = e.target.closest('[data-pp-mini]');
    if (mi) { const d = dadosDe(); const x = d?.m?.miniaturas[Number(mi.dataset.ppMini)]; if (x) { const [u] = await ctx.urlsMiniaturas([x.caminho]).catch(() => []); ctx.abrirMidia?.(x, u, d.m.pessoa); } return; }
    const b = e.target.closest('[data-pp]'); if (!b) return;
    const d = dadosDe(); if (!d) return;
    const q = b.dataset.pp;
    if (q === 'decisoes') return document.getElementById('ppDecisoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (q === 'ajustar') { const t = el.querySelector('textarea[name=txt]'); t?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => t?.focus(), 250); return; }
    if (q === 'conversa') return ctx.acompanharPedido(d.conv?.id ?? null);
    if (q === 'ver') {
      const x = d.m?.miniaturas?.[0];
      if (x) { const [u] = await ctx.urlsMiniaturas([x.caminho]).catch(() => []); if (u) return ctx.abrirMidia?.(x, u, d.m.pessoa); }
      return d.conv ? ctx.acompanharPedido(d.conv.id) : d.m && ctx.abrirMissao(d.m.id);
    }
    if (q === 'passos') return d.m && ctx.abrirMissao(d.m.id);
    if (q === 'dupla') return ctx.abrirAba('dupla');
    if (q === 'cancelar') { confirmar = null; return desenhar(); }
    if (q === 'parar') { confirmar = 'parar'; return desenhar(); }
    if (q === 'refazer') { confirmar = 'refazer'; await desenhar(); el.querySelector('.pp-conf')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (q === 'concluir') {
      const s = concluidos(); s.add(chaveDe(d.conv, d.m)); guarda('pedidosConcluidos', JSON.stringify([...s].slice(-200)));
      ctx.toast({ titulo: 'Pedido concluído', texto: 'Fica no histórico. Se precisar, peça um ajuste por aqui.', cor: '#4fbf82' });
      return desenhar();
    }
    if (q === 'parar-sim') {
      confirmar = null;
      try { await ctx.pararPedido(d.conv.id); ctx.toast({ titulo: 'Pedido parado', texto: 'O que já foi feito fica salvo. Para continuar, responda por aqui.', cor: '#f0973d' }); }
      catch (err) { ctx.toast({ titulo: 'Não consegui parar', texto: err.message, cor: '#ef6a55' }); }
      return desenhar();
    }
    if (q === 'refazer-sim') {
      confirmar = null;
      try {
        if (d.ocupada) await ctx.pararPedido(d.conv.id);
        await ctx.responderPedido(d.conv.id, `Refaça este pedido do zero, com calma, e me diga o que mudou: ${d.pedidoTxt}`);
        recem = { quando: Date.now() };
      } catch (err) { ctx.toast({ titulo: 'Não consegui refazer', texto: err.message, cor: '#ef6a55' }); }
      return desenhar();
    }
  });
}

async function responder() {
  const d = dadosDe(), t = rascunho.trim();
  if (!d?.conv || !t) { document.querySelector('#pedidoPagina textarea[name=txt]')?.focus(); return; }
  try {
    await ctx.responderPedido(d.conv.id, t);
    rascunho = '';
    const tx = document.querySelector('#pedidoPagina textarea[name=txt]'); if (tx) tx.value = '';
    // Pedido concluído que recebe ajuste volta a andar.
    const s = concluidos(); if (s.delete(chaveDe(d.conv, d.m))) guarda('pedidosConcluidos', JSON.stringify([...s]));
  } catch (err) { ctx.toast({ titulo: 'Não consegui mandar', texto: err.message, cor: '#ef6a55' }); }
  desenhar();
}

// ---------- lista "Seus pedidos" (Atividade › Resumo) ----------
export function htmlLista(max = 4) {
  const eu = ctx.eu?.()?.pessoa; if (!eu || !ctx.conversas) return '';
  const ordem = { precisa: 0, erro: 1, fazendo: 2, fila: 3, enviado: 3, pronto: 4, concluido: 5 };
  const itens = ctx.conversas().map((c) => dadosDe({ conv: c.id })).filter(Boolean)
    .filter((d) => d.msgs.length || d.m || d.ocupada)
    .sort((a, b) => ordem[a.estado] - ordem[b.estado] || new Date(b.conv.atualizado || 0) - new Date(a.conv.atualizado || 0)).slice(0, max);
  if (!itens.length) return '';
  return `<section class="cx pp-lista"><h3>${ico('jornal')} Seus pedidos <small>${itens.length}</small></h3>
    ${itens.map((d) => { const [cls, rot] = ROT_ESTADO[d.estado]; const px = proximo(d); return `<button type="button" class="pp-item ${cls}" data-pp-conv="${d.conv.id}"><span class="pp-est ${cls}"><i></i>${esc(rot)}</span><b>${esc(d.titulo)}</b><small>${esc(px.tit)}</small><span class="pp-item-seta">${ico('seta')}</span></button>`; }).join('')}
    <button type="button" class="link pp-novo" data-novo-pedido="">＋ Novo pedido</button></section>`;
}

// Qualquer elemento com data-pp-conv / data-pp-missao abre a página (captura: vale em qualquer tela).
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-pp-conv],[data-pp-missao]'); if (!b || !ctx.abrirAba) return;
  e.preventDefault(); e.stopPropagation();
  abrir(b.dataset.ppConv ? { conv: Number(b.dataset.ppConv) } : { missao: b.dataset.ppMissao });
}, true);
