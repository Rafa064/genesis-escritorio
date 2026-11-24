// Coordenação com a dupla: presença (site / PC / projeto / marco / o que a IA está fazendo),
// conflitos que viram combinação concreta (arquivo, quem mexeu e quando, Ver alterações, Combinar responsável,
// Avisar), pedidos do outro ("Assumir pedido" / "Encaminhar à minha assistente") e reações.
// Usa só a tabela de recados (cores 'bola', 'bola-ok' e 'combinado'): funciona sem SQL novo.
import * as D from './dados.js';
import { frase, primeiraFrase } from './humano.js';
import { tituloDe } from './config.js';
import { ctx, $, esc, lerJson, guardado, guarda, nomeArq } from './comando-ctx.js';
import { arquivosMudados } from './comando-progresso.js';
import { ico } from './comando-icones.js';

const JANELA_CONFLITO = 3 * 3600e3;
const REACOES = ['👀', '🔥', '✅', '🙏'];
const ALVOS = { pessoa: 'para ele ler', claude: 'para a IA dele (Claude)', codex: 'para a IA dele (Codex)' };

// ---------- presença ----------
function presenca(p) {
  const st = ctx.estado(p) || {}, eu = p === ctx.eu().pessoa;
  const noSite = eu || ctx.presente(p), status = (ctx.presente(p)?.status || st.status || 'disponivel');
  const ligado = ctx.pcLigado(p);
  const site = !noSite ? ['off', 'fora do site'] : status === 'focado' ? ['foco', 'focado'] : status === 'ausente' ? ['longe', 'ausente'] : ['on', eu ? 'você' : 'no site'];
  const pc = !ligado ? ['off', 'PC desligado'] : st.info?.ausente ? ['longe', 'PC parado'] : st.info?.longe ? ['longe', 'longe do PC'] : ['on', 'no PC'];
  const ms = D.missoes().filter((m) => m.pessoa === p);
  const ativa = ms.find((m) => !m.fim && ['trab', 'alerta', 'semsinal'].includes(m.status));
  const marcoAtivo = ativa ? ctx.marcoDaMissao(ativa) : null;
  const marco = marcoAtivo || ctx.marcos().filter((x) => x.coluna === 'fazendo' && x.responsavel === p).sort((a, b) => (a.prioridade || 9) - (b.prioridade || 9))[0] || null;
  const ult = ativa?.passos.at(-1);
  const agora = ativa ? `${ult?.agente && ult.agente !== 'Orquestrador' ? tituloDe(ult.agente) + ': ' : ''}${primeiraFrase(ult ? frase(ult) : ativa.titulo, 70)}` : '';
  return { p, st, site, pc, projeto: ativa?.projeto || st.projeto || '', branch: st.branch || '', marco, ativa, agora, ultima: ms[0] || null };
}

// ---------- conflitos: mesma branch, mesmos arquivos, mesmo marco ----------
const haT = (t) => { const h = D.ha(t); return h === 'agora' ? 'agora' : /\//.test(h) ? 'em ' + h : 'há ' + h; };
const chaveArq = (a) => String(a).replace(/\\/g, '/').toLowerCase().split('/').slice(-3).join('/');
const nomeQuem = (agente, p) => !agente || agente === 'Orquestrador' ? (p === ctx.eu().pessoa ? 'sua assistente' : `a assistente dele`) : tituloDe(agente);
// Cada arquivo mexido nas últimas 3 h: a última vez, por quem (agente), em qual pedido e todas as mexidas.
function arquivosRecentes(p) {
  const desde = Date.now() - JANELA_CONFLITO, out = new Map();
  for (const m of D.missoes()) {
    if (m.pessoa !== p || m.ultimo < desde) continue;
    for (const e of m.passos) {
      if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(e.ferramenta || '') || e.t < desde) continue;
      const a = String(e.arq || e.alvo || '').trim(); if (!a) continue;
      const k = chaveArq(a), x = out.get(k) || { a, t: 0, missao: m.id, titulo: m.titulo, agente: e.agente, mexidas: [] };
      x.mexidas.push({ t: e.t, agente: e.agente, ferramenta: e.ferramenta, missao: m.id, titulo: m.titulo });
      if (x.t < e.t) Object.assign(x, { a, t: e.t, missao: m.id, titulo: m.titulo, agente: e.agente });
      out.set(k, x);
    }
  }
  return out;
}
export function conflitos() {
  const eu = ctx.eu()?.pessoa, outro = ctx.outra(); if (!eu || !outro) return [];
  const a = presenca(eu), b = presenca(outro), lista = [];
  if (a.branch && a.branch === b.branch && ctx.pcLigado(outro)) lista.push({ k: `branch|${a.branch}`, icone: '⎇', t: 0, texto: `Vocês dois estão na branch <b>${esc(a.branch)}</b>`, curto: `Você e ${outro} estão trabalhando na mesma versão do projeto. Combinem quem salva primeiro.`, recado: `⚠ Estamos os dois na branch ${a.branch}. Combina quem commita primeiro?` });
  const meus = arquivosRecentes(eu), dele = arquivosRecentes(outro);
  const juntos = [...meus.keys()].filter((k) => dele.has(k));
  if (juntos.length) {
    const k0 = juntos[0], m0 = meus.get(k0), d0 = dele.get(k0), nomes = juntos.slice(0, 2).map((k) => esc(nomeArq(meus.get(k).a))).join(', ');
    lista.push({ k: `arq|${juntos.sort().join(',')}`, icone: '📝', missao: d0.missao, arq: m0.a, arqNome: nomeArq(m0.a), mais: juntos.length - 1, meu: m0, dele: d0, t: Math.max(m0.t, d0.t),
      curto: `Você e ${outro} mexeram no mesmo arquivo (${nomeArq(m0.a)}). Combinem quem continua.`,
      texto: `<b>${nomes}</b>${juntos.length > 2 ? ` +${juntos.length - 2}` : ''}: sua IA mexeu ${haT(m0.t)} e a do ${esc(outro)} ${haT(d0.t)}. Combine quem segue antes de commitar.`,
      recado: `⚠ Nossas IAs mexeram em ${juntos.slice(0, 3).map((k) => nomeArq(meus.get(k).a)).join(', ')} (a minha ${haT(m0.t)}, a sua ${haT(d0.t)}). Combinamos quem continua? Dá para escolher no cartão do conflito, em Conversas › Dupla.` });
  }
  if (a.marco && b.marco && a.marco.id === b.marco.id && (a.ativa || b.ativa)) lista.push({ k: `marco|${a.marco.id}`, icone: '🏁', t: 0, texto: `As IAs dos dois estão no marco <b>${esc(a.marco.titulo)}</b>`, curto: `As IAs de vocês dois estão no mesmo marco (${a.marco.titulo}). Dividam o trabalho.`, recado: `⚠ Nossas IAs estão no mesmo marco (${a.marco.titulo}). Divide: eu fico com uma parte e você com outra?` });
  return lista;
}
// Combinações registradas (qualquer um dos dois registra; vale para os dois).
function combinados() {
  const out = new Map();
  for (const r of ctx.recados()) if (r.cor === 'combinado') { const j = lerJson(r.texto); if (j.k && !out.has(j.k)) out.set(j.k, { ...j, pessoa: r.pessoa, criado: new Date(r.criado).getTime(), id: r.id }); }
  return out;
}
// Um conflito some do aviso quando há uma combinação registrada depois da última mexida.
const combinadoDe = (c, cb = combinados()) => { const x = cb.get(c.k); return x && x.criado >= (c.t || 0) - 1000 ? x : null; };
export const conflitosAbertos = () => { if (!ctx.recados || !ctx.eu) return []; const cb = combinados(); return conflitos().filter((c) => !combinadoDe(c, cb)); };
const avisados = () => { const m = new Map(); for (const r of ctx.recados()) if (r.cor === 'msg' && r.pessoa === ctx.eu()?.pessoa && /^⚠/.test(r.texto)) { const t = new Date(r.criado).getTime(); if (!m.has('ult') || m.get('ult') < t) m.set('ult', t); } return m.get('ult') || 0; };

// ---------- bolas (pedido/recado com contexto para o outro) ----------
const ehBola = (r) => r.cor === 'bola';
function estadoBolas() {
  const rs = ctx.recados(), oks = new Map();
  for (const r of rs) if (r.cor === 'bola-ok') { const j = lerJson(r.texto); if (j.id) oks.set(Number(j.id), { ...j, pessoa: r.pessoa, criado: r.criado }); }
  return rs.filter(ehBola).map((r) => ({ r, j: lerJson(r.texto), ok: oks.get(r.id) || null })).filter((x) => x.j.texto);
}
export const bolasParaMim = () => { if (!ctx.recados || !ctx.eu) return 0; const eu = ctx.eu()?.pessoa; return eu ? estadoBolas().filter((b) => b.j.para === eu && !b.ok).length : 0; };
const ROT_OK = { ia: 'encaminhou à assistente', assumiu: 'assumiu', feito: 'resolveu', visto: 'viu', dispensou: 'dispensou' };
export function resumoRecado(r) {
  if (r?.cor === 'bola') { const j = lerJson(r.texto); return `🏀 ${j.alvo && j.alvo !== 'pessoa' ? 'pedido para a sua IA' : 'pedido para você'}: ${primeiraFrase(j.texto || '', 90)}`; }
  if (r?.cor === 'bola-ok') { const j = lerJson(r.texto); return `🏀 ${ROT_OK[j.acao] || 'respondeu'} o pedido`; }
  if (r?.cor === 'combinado') { const j = lerJson(r.texto); return `🤝 Combinado${j.arq ? ` em ${nomeArq(j.arq)}` : ''}: ${j.quem === 'dividir' ? 'cada um numa parte' : `${j.quem} continua`}`; }
  return null;
}

// ---------- desenho ----------
let aberto = guardado('cdAberto', '1') === '1';
const verAlt = new Set(); let combinando = null;
const corP = (p) => ctx.corPessoa(p);
const ponto = ([cls, rot]) => `<span class="cd-st ${cls}"><i></i>${esc(rot)}</span>`;

async function linhaPessoa(x, grande) {
  const marco = x.marco ? `<button type="button" class="cd-marco" data-cd-marco="${x.marco.id}">🏁 ${esc(primeiraFrase(x.marco.titulo, 34))}</button>` : '';
  return `<div class="cd-pessoa ${grande ? 'grande' : ''}" style="--cor:${corP(x.p)}">
    <img src="${await ctx.retrato(x.p)}" alt="">
    <div class="cd-p-txt"><div class="cd-p-l1"><b>${esc(x.p === ctx.eu().pessoa ? 'Você' : x.p)}</b>${ponto(x.site)}${ponto(x.pc)}</div>
      <div class="cd-p-l2">${x.projeto ? `<span>📁 ${esc(x.projeto)}</span>` : ''}${marco}</div>
      ${x.agora ? `<div class="cd-p-agora"><span class="cd-pulso"></span>${esc(x.agora)}</div>` : ''}</div>
  </div>`;
}

// Cartão de coordenação de um conflito: o arquivo, quem mexeu e quando, e as três ações.
async function cartaoConflito(c, outro, cb) {
  const feito = combinadoDe(c, cb), eu = ctx.eu().pessoa;
  if (feito) {
    const alvo = c.arq ? ` em ${c.arqNome}` : '';
    const quem = feito.quem === 'dividir' ? `Cada IA fica com uma parte${alvo}` : feito.quem === eu ? `Sua IA continua${alvo}` : `A IA do ${feito.quem} continua${alvo}`;
    const para = feito.quem === 'dividir' ? 'Vocês combinam na conversa qual parte é de quem' : feito.quem === eu ? `A IA do ${outro} para de mexer nesse arquivo` : 'Sua IA para de mexer nesse arquivo';
    const por = feito.pessoa === eu ? 'você' : esc(feito.pessoa);
    return `<div class="cd-conf combinado" data-cd-k="${esc(c.k)}"><div class="cdc-cab">${ico('check')}<div><b>Combinado: ${esc(quem)}</b><small>${c.arq ? esc(c.arq) : ''}</small></div><button type="button" class="cdc-link" data-cdc="mudar">Mudar</button></div>
      <details class="cdc-det"><summary>O que foi combinado</summary><ul class="cdc-feito"><li>${ico('check')}${esc(para)}</li><li>${ico('check')}${feito.pessoa === eu ? `${esc(outro)} foi avisado na conversa` : `${por} avisou você na conversa`}</li><li>${ico('check')}Decisão registrada por ${por} ${haT(feito.criado)}</li></ul></details></div>`;
  }
  // Compacto: o arquivo, quem mexeu e quando (o pedido de cada um fica em "Ver alterações").
  const chip = async (p, x, euMesmo) => `<span class="cdc-chip" style="--cor:${corP(p)}"><img src="${await ctx.retrato(p)}" alt=""><b>${euMesmo ? 'Você' : esc(p)}</b>${haT(x.t)}</span>`;
  const aviso = avisados(), avisouAgora = aviso && aviso >= (c.t || 0);
  const pasta = c.arq ? c.arq.replace(/\\/g, '/').split('/').slice(0, -1).join('/') : '';
  let html = `<div class="cd-conf aberto" data-cd-k="${esc(c.k)}">
    <div class="cdc-cab">${ico('alerta')}<div><b>${c.arq ? 'As IAs de vocês dois mexeram no mesmo arquivo' : 'Possível conflito'}</b><small>${c.arq ? 'Combinem quem continua antes de salvar uma versão.' : esc(c.curto)}</small></div></div>`;
  if (c.arq) html += `<p class="cdc-arq">${ico('lapis')}<span><code>${esc(c.arqNome)}</code><small>${pasta ? `em ${esc(pasta)}` : ''}${c.mais ? ` · +${c.mais} arquivo${c.mais > 1 ? 's' : ''}` : ''}</small></span></p>
    <p class="cdc-quando"><span>Mexeram:</span>${await chip(eu, c.meu, true)}${await chip(outro, c.dele, false)}</p>`;
  if (verAlt.has(c.k) && c.arq) {
    const lin = (p, x) => x.mexidas.slice().sort((a, b) => b.t - a.t).slice(0, 4).map((m) => `<li><span class="cdc-h">${D.hora(m.t)}</span><span><span><b>${esc(p === eu ? 'Você' : p)}</b>: ${esc(nomeQuem(m.agente, p))} ${m.ferramenta === 'Write' ? 'reescreveu o arquivo' : 'editou trechos'}</span><small>pedido “${esc(primeiraFrase(m.titulo || '', 50))}”</small></span><button type="button" class="cdc-link" data-cd-abrir="${esc(m.missao)}">Abrir</button></li>`).join('');
    html += `<div class="cdc-alt"><p>Alterações nas últimas 3 h</p><ol>${lin(eu, c.meu)}${lin(outro, c.dele)}</ol></div>`;
  }
  html += `<div class="cdc-combinar"><p>Combinar responsável${c.arq ? ` por <b>${esc(c.arqNome)}</b>` : ''}:</p>
      <div class="cdc-duas"><button type="button" class="btn" data-cdc-quem="${esc(eu)}"><b>Minha IA continua</b><small>a do ${esc(outro)} para de mexer nele</small></button><button type="button" class="btn" data-cdc-quem="${esc(outro)}"><b>IA do ${esc(outro)} continua</b><small>a sua para de mexer nele</small></button></div></div>
    <div class="cdc-links">${c.arq ? `<button type="button" class="cdc-link" data-cdc="ver" aria-expanded="${verAlt.has(c.k)}">${verAlt.has(c.k) ? 'Esconder alterações' : 'Ver alterações'}</button>` : ''}<button type="button" class="cdc-link" data-cd-conf="${esc(c.k)}">${avisouAgora ? `Avisado ${haT(aviso)} · avisar de novo` : `Avisar ${esc(outro)}`}</button><button type="button" class="cdc-link" data-cdc-quem="dividir">Dividir o arquivo</button></div>`;
  return html + '</div>';
}

export async function desenhar() {
  const el = $('#coordDupla'); if (!el || !ctx.eu?.()) return;
  const eu = ctx.eu().pessoa, outro = ctx.outra(); if (!outro) { el.innerHTML = ''; return; }
  const po = presenca(outro), pe = presenca(eu), cf = conflitos(), cb = combinados();
  const bolas = estadoBolas();
  const praMim = bolas.filter((b) => b.j.para === eu && !b.ok).sort((a, b) => new Date(b.r.criado) - new Date(a.r.criado));
  const minhas = bolas.filter((b) => b.r.pessoa === eu).sort((a, b) => new Date(b.r.criado) - new Date(a.r.criado)).slice(0, 2);
  const reacoes = reacoesMissoes();
  const dele = D.missoes().filter((m) => m.pessoa === outro).slice(0, 2);
  let html = `<div class="cd ${aberto ? 'aberto' : ''}">
    <div class="cd-topo">${await linhaPessoa(po, true)}<button type="button" class="btn mini cd-bola-btn" data-cd="bola" title="Mandar um pedido para ${esc(outro)} (ou para a IA dele)">＋ Novo pedido</button></div>`;
  if (cf.length) html += `<div class="cd-conflitos">${(await Promise.all(cf.map((c) => cartaoConflito(c, outro, cb)))).join('')}</div>`;
  if (praMim.length) html += `<div class="cd-bolas"><p class="cd-rot">${praMim.length === 1 ? `Um pedido do ${esc(outro)} para você` : `${praMim.length} pedidos do ${esc(outro)} para você`}</p>${praMim.slice(0, 3).map(cartaoBola).join('')}</div>`;
  html += `<button type="button" class="cd-mais" data-cd="alternar">${aberto ? 'menos ▴' : `mais: você, o que ${esc(outro)} pediu e seus pedidos a ele ▾`}</button>`;
  if (aberto) {
    html += `<div class="cd-corpo">${await linhaPessoa(pe, false)}`;
    if (dele.length) html += `<p class="cd-rot">O que ${esc(outro)} pediu às IAs</p>${dele.map((m) => missaoDele(m, reacoes.get(m.id))).join('')}`;
    if (minhas.length) html += `<p class="cd-rot">Seus pedidos ao ${esc(outro)}</p>${minhas.map((b) => `<div class="cd-minha"><span>${b.ok ? '✅' : '⏳'}</span><p>${esc(primeiraFrase(b.j.texto, 70))}<small>${esc(ALVOS[b.j.alvo] || '')} · ${b.ok ? `${esc(b.ok.pessoa)} ${ROT_OK[b.ok.acao] || 'respondeu'}` : 'esperando'} · ${D.ha(new Date(b.r.criado).getTime())}</small></p></div>`).join('')}`;
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  ligar(el);
  desenharChip(po, conflitosAbertos().length, praMim.length);
}
// Pedido do outro para você: assumir (você mesmo faz) ou encaminhar à sua assistente (abre o Novo pedido).
function cartaoBola({ r, j }) {
  const ia = j.alvo === 'claude' || j.alvo === 'codex';
  return `<div class="cd-bola" data-bola="${r.id}" style="--cor:${corP(r.pessoa)}">
    <div class="cd-b-cab"><b>${esc(r.pessoa)}</b> ${ia ? 'pede para a sua assistente' : 'pede para você'}<small>${D.ha(new Date(r.criado).getTime())}</small></div>
    <p class="cd-b-txt">${esc(j.texto)}</p>${j.ctx ? `<p class="cd-b-ctx">📎 ${esc(j.ctx)}</p>` : ''}
    <div class="cd-b-duas"><button type="button" class="btn ${ia ? '' : 'forte'}" data-bola-acao="assumiu">Assumir pedido</button><button type="button" class="btn ${ia ? 'forte' : ''}" data-bola-acao="ia">Encaminhar à minha assistente</button></div>
    <div class="cd-b-acoes"><button type="button" class="cd-b-sec" data-bola-acao="responder">Responder</button><button type="button" class="cd-b-sec" data-bola-acao="feito">Já resolvi</button><button type="button" class="cd-b-sec" data-bola-acao="dispensou">Dispensar</button></div></div>`;
}
function reacoesMissoes() {
  const mapa = new Map();
  for (const r of ctx.recados()) if (r.cor === 'reacao') { const i = r.texto.indexOf(' '), e = r.texto.slice(0, i), id = r.texto.slice(i + 1); if (!id.includes('|')) continue; if (!mapa.has(id)) mapa.set(id, new Map()); const m = mapa.get(id); if (!m.has(e)) m.set(e, []); m.get(e).push(r.pessoa); }
  return mapa;
}
function missaoDele(m, rs = new Map()) {
  const eu = ctx.eu().pessoa;
  const st = m.fim ? (m.status === 'erro' ? '× deu erro' : '✓ pronto') : m.status === 'alerta' ? '✋ esperando ele' : '● trabalhando';
  return `<div class="cd-missao" data-cd-missao="${esc(m.id)}"><button type="button" class="cd-m-tit" data-cd-abrir="${esc(m.id)}"><span class="cd-m-st">${st}</span>${esc(primeiraFrase(m.titulo, 70))}<small>${D.ha(m.ultimo)}${m.projeto ? ' · ' + esc(m.projeto) : ''}</small></button>
    <div class="cd-reacoes">${REACOES.map((e) => { const ps = rs.get(e) || []; return `<button type="button" class="${ps.includes(eu) ? 'minha' : ''}" data-cd-reagir="${e}" title="${esc(ps.join(', ') || 'reagir')}">${e}${ps.length ? ' ' + ps.length : ''}</button>`; }).join('')}</div></div>`;
}

// Chip do outro no topo: rosto, nome e onde ele está; o número é de pedidos dele esperando você.
// (O conflito não vira mais um aviso solto sobre o mapa: ele entra no aviso único do topo.)
function desenharChip(po, nConf, nBolas) {
  let chip = $('#chipDupla');
  if (!chip) {
    chip = document.createElement('button'); chip.id = 'chipDupla'; chip.type = 'button'; chip.className = 'chip-dupla';
    $('#topo .logo')?.after(chip);
    chip.onclick = () => ctx.abrirAba('dupla');
  }
  const cls = po.pc[0] === 'on' ? 'on' : po.site[0] === 'on' ? 'site' : 'off';
  chip.style.setProperty('--cor', corP(po.p));
  chip.title = `${po.p}: ${po.site[1]} · ${po.pc[1]}${po.projeto ? ' · ' + po.projeto : ''}${po.agora ? ' · ' + po.agora : ''}${nBolas ? ` · ${nBolas} pedido(s) dele esperando você` : ''}`;
  chip.setAttribute('aria-label', chip.title);
  ctx.retrato(po.p).then((src) => {
    const onde = po.pc[0] === 'on' ? 'no PC' : po.site[0] === 'on' ? 'no site' : 'fora';
    const h = `<img src="${src}" alt=""><i class="cd-dot ${cls}"></i><span class="cd-txt"><span class="cd-nome">${esc(po.p)}</span><small class="cd-onde">${onde}</small></span>${nBolas ? `<b class="cd-n" title="${nBolas} pedido(s) dele esperando você">${nBolas}</b>` : ''}`;
    if (chip.dataset.h !== h) { chip.innerHTML = h; chip.dataset.h = h; }
  });
}

// ---------- ações ----------
function ligar(el) {
  if (el.dataset.cdLigado) return;
  el.dataset.cdLigado = '1';
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const a = t.closest('[data-cd]');
    if (a?.dataset.cd === 'alternar') { aberto = !aberto; guarda('cdAberto', aberto ? '1' : '0'); return desenhar(); }
    if (a?.dataset.cd === 'bola') return abrirBola({});
    const mc = t.closest('[data-cd-marco]'); if (mc) return ctx.abrirMarco(Number(mc.dataset.cdMarco));
    const k = t.closest('[data-cd-k]')?.dataset.cdK;
    const cc = t.closest('[data-cdc]');
    if (cc && k) {
      const acao = cc.dataset.cdc;
      if (acao === 'ver') { if (verAlt.has(k)) verAlt.delete(k); else verAlt.add(k); }
      else if (acao === 'combinar') combinando = k;
      else if (acao === 'cancelar') combinando = null;
      else if (acao === 'mudar') { const x = combinados().get(k), r = x && ctx.recados().find((y) => y.id === x.id); if (r) { try { await ctx.tirarRecado(r); } catch {} } combinando = k; }
      return desenhar();
    }
    const cq = t.closest('[data-cdc-quem]');
    if (cq && k) {
      const c = conflitos().find((x) => x.k === k); if (!c) return;
      const quem = cq.dataset.cdcQuem, outro = ctx.outra(), eu = ctx.eu().pessoa;
      const frase0 = quem === 'dividir' ? `cada um fica com uma parte${c.arq ? ` de ${c.arqNome}` : ''} (combinamos aqui qual)` : quem === eu ? `a minha IA continua${c.arq ? ` em ${c.arqNome}` : ''}; segura a sua IA nele até eu avisar` : `a sua IA continua${c.arq ? ` em ${c.arqNome}` : ''}; a minha não mexe mais nele`;
      try {
        await enviar(JSON.stringify({ k, quem, arq: c.arq || '', por: eu }).slice(0, 480), 'combinado');
        await enviar(`🤝 Combinado: ${frase0}.`, 'msg');
        combinando = null;
        ctx.toast({ titulo: 'Combinado registrado', texto: `${outro} vê a decisão na conversa e o aviso sai do topo dos dois.`, cor: '#4fbf82' });
      } catch {}
      ctx.redesenharTopo?.();
      return desenhar();
    }
    const cf = t.closest('[data-cd-conf]');
    if (cf) { const c = conflitos().find((x) => x.k === cf.dataset.cdConf); if (c) { await enviar(c.recado, 'msg'); ctx.toast({ titulo: 'Avisei o ' + ctx.outra(), texto: 'Ele recebe a mensagem com o arquivo e o horário.', cor: '#4fbf82' }); desenhar(); } return; }
    const ab = t.closest('[data-cd-abrir]'); if (ab) return ctx.abrirMissao(ab.dataset.cdAbrir);
    const rg = t.closest('[data-cd-reagir]');
    if (rg) { const id = rg.closest('[data-cd-missao]').dataset.cdMissao, txt = `${rg.dataset.cdReagir} ${id}`, minha = ctx.recados().find((r) => r.cor === 'reacao' && r.pessoa === ctx.eu().pessoa && r.texto === txt); if (minha) await ctx.tirarRecado(minha); else await enviar(txt, 'reacao'); return desenhar(); }
    const ba = t.closest('[data-bola-acao]');
    if (ba) {
      const id = Number(ba.closest('[data-bola]').dataset.bola), b = estadoBolas().find((x) => x.r.id === id); if (!b) return;
      const acao = ba.dataset.bolaAcao;
      if (acao === 'responder') { ctx.abrirAba('dupla'); const tx = $('#textoRecado'); if (tx) { tx.value = `@${b.r.pessoa} `; tx.focus(); } return; }
      // Encaminhar: o mesmo painel "Novo pedido", já preenchido; a bola só fecha quando o pedido é enviado.
      if (acao === 'ia') return ctx.novoPedido?.({ texto: b.j.texto, contexto: b.j.ctx ? `Contexto que o ${b.r.pessoa} mandou: ${b.j.ctx}` : '', alvo: b.j.alvo === 'codex' ? 'codex' : 'claude', projeto: b.j.projeto, bola: { id, de: b.r.pessoa, texto: b.j.texto } });
      await enviar(JSON.stringify({ id, acao }), 'bola-ok');
      if (acao === 'assumiu') await enviar(`🙋 Peguei o seu pedido: “${primeiraFrase(b.j.texto, 80)}”. Eu mesmo faço e te aviso.`, 'msg');
      ctx.toast({ titulo: acao === 'assumiu' ? 'Pedido assumido' : acao === 'feito' ? 'Marcado como resolvido' : 'Pedido dispensado', texto: `${b.r.pessoa} fica sabendo.`, cor: '#4fbf82' });
      ctx.redesenharTopo?.();
      return desenhar();
    }
  });
}
async function enviar(texto, cor) { try { await ctx.mandarRecado(texto, cor); } catch (err) { ctx.toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); throw err; } }
// Fecha a bola depois que o pedido encaminhado foi enviado (chamado pelo Novo pedido).
export async function bolaEncaminhada(id) { try { await enviar(JSON.stringify({ id, acao: 'ia' }), 'bola-ok'); } catch {} desenhar(); }

// Contexto automático: projeto, branch, marco e (se veio de uma missão) o que ela mudou.
export function contextoAuto(missao) {
  const pe = presenca(ctx.eu().pessoa), partes = [];
  const m = missao || pe.ativa || pe.ultima;
  if (m) partes.push(`missão “${primeiraFrase(m.titulo, 60)}”`);
  if (pe.projeto) partes.push(`projeto ${pe.projeto}`);
  if (pe.branch) partes.push(`branch ${pe.branch}`);
  const mc = (m && ctx.marcoDaMissao(m)) || pe.marco; if (mc) partes.push(`marco ${mc.titulo}`);
  const arqs = m ? arquivosMudados(m) : []; if (arqs.length) partes.push(`mexeu em ${arqs.slice(0, 3).map(nomeArq).join(', ')}`);
  return { texto: partes.join(' · ').slice(0, 160), projeto: m?.projeto || pe.projeto || '' };
}
// Pedido para o outro (ele mesmo ou a IA dele): vira uma "bola" na tabela de recados.
export async function mandarBola({ alvo = 'pessoa', texto, usarCtx = true, missao = null }) {
  const outro = ctx.outra(), auto = contextoAuto(missao);
  const j = { para: outro, alvo, texto: String(texto).slice(0, 280), ctx: usarCtx ? auto.texto : '', projeto: auto.projeto.slice(0, 40) };
  await enviar(JSON.stringify(j), 'bola');
  desenhar();
  return j;
}

// "Passar a bola" agora é o mesmo painel "Novo pedido", com o outro já escolhido como destino.
export function abrirBola({ texto = '', missao = null, alvo = 'pessoa' } = {}) {
  const outro = ctx.outra(); if (!outro) return;
  ctx.novoPedido?.({ para: outro, texto, missao, alvoOutro: alvo === 'pessoa' ? 'pessoa' : 'ia' });
}
