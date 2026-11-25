// Painel "Hoje" (Mais › Hoje, ou o selo 💡 no mapa): três funções de valor num lugar só.
//   💡 Sugestões: 3 a 5 pedidos prontos que a ponte escreve toda manhã (escritorio/sugestoes.mjs),
//      com "Mandar" (vai pela barra de comando, numa conversa nova) e "Editar antes".
//   📋 Fila do dia: o que cada agente está fazendo agora, o que vem depois e o que já entregou hoje.
//   🪙 Custo e uso: custo/tokens por dia, pessoa, modelo e agente (Claude); pedidos e tempo (Codex).
// Fontes: estado.info.sugestoes e estado.info.uso (a ponte manda), eventos, comandos (só os seus) e o quadro.
import * as D from './dados.js';
import { primeiraFrase, frase } from './humano.js';
import { icoPx, nomeProjeto, plural } from './leitura.js';
import * as Rot from './hoje-rotinas.js';
import { cargoDe } from './equipe.js';
import { contarPendencias, comAvisos, textoDecisoes, textoPendencias, separarAndamento } from './contagem.js';

let ctx = null;
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let sub = guardado('hojeSub', 'sugestoes'), projetoSel = guardado('hojeProjeto', ''), editando = null, confirmar = null;
const DIA = 86400e3;
const diaDe = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const inicioDoDia = (t = Date.now()) => new Date(t).setHours(0, 0, 0, 0);
const ultimosDias = (n) => Array.from({ length: n }, (_, i) => diaDe(inicioDoDia() - (n - 1 - i) * DIA + 12 * 3600e3));
const dinheiro = (v) => `US$ ${(v || 0).toFixed(2).replace('.', ',')}`;
const milhar = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(Math.round(n || 0)));
const TAMANHO = { P: ['P', 'até 15 min', 'até 15 min'], M: ['M', '15 a 45 min', '15–45 min'], G: ['G', 'mais de 45 min', '45+ min'] };

export function ligar(c) {
  ctx = c;
  if (ctx.DEMO) prepararDemo();
  criarSelo();
  setInterval(() => { atualizarSelo(); if (ctx.aberto()) desenhar(); }, 20e3);
}

// ======================= selo no mapa: "💡 Hoje · 5" =======================
function criarSelo() {
  if (document.getElementById('seloHoje')) return;
  const b = document.createElement('button');
  b.id = 'seloHoje'; b.type = 'button'; b.className = 'selo-hoje';
  b.title = 'Hoje: sugestões de pedido, fila dos agentes e custo de IA';
  b.onclick = () => ctx.abrir();
  document.getElementById('palco')?.appendChild(b);
  atualizarSelo();
}
export function atualizarSelo() {
  const b = document.getElementById('seloHoje'); if (!b || !ctx?.eu()) return;
  const s = minhasSugestoes(), novas = s ? s.projetos.reduce((n, p) => n + p.prompts.filter((x) => !foiEnviada(s, p, x)).length, 0) : 0;
  b.innerHTML = novas ? `<span class="ic">💡</span><i>${novas}</i><b>${novas === 1 ? 'sugestão' : 'sugestões'}</b>` : '<span class="ic">☀</span><b>Hoje</b>';
  b.classList.toggle('tem', !!novas);
  b.setAttribute('aria-label', novas ? `Hoje: ${novas} sugestões de pedido` : 'Hoje: fila e custo de IA');
}

// ======================= painel =======================
export async function desenhar(forcar = false) {
  const el = document.getElementById('hojeCorpo'); if (!el || !ctx) return;
  // Não apaga o que a pessoa está escrevendo (o painel se redesenha sozinho a cada 15-20 s).
  if (!forcar && (editando || confirmar || el.contains(document.activeElement) && document.activeElement.matches('textarea, input'))) return;
  const abas = [['sugestoes', icoPx('sol'), 'Seu dia'],['fila', icoPx('lista'), 'Fila'], ['custo', icoPx('moeda'), 'Custo']];
  const topo = `<div class="hj-abas" role="tablist">${abas.map(([id, ic, t]) => `<button role="tab" data-hsub="${id}" class="${sub === id ? 'on' : ''}" aria-selected="${sub === id}"><span class="ic">${ic}</span>${t}</button>`).join('')}</div>`;
  let corpo = '';
  try { corpo = sub === 'fila' ? await htmlFila() : sub === 'custo' ? await htmlCusto() : await htmlSugestoes(); }
  catch (e) { console.warn('hoje:', e); corpo = `<p class="hj-vazio">Não consegui montar esta parte agora (${ctx.esc(e.message)}).</p>`; }
  // O gasto de IA é contexto, não ação: vai para o fim, numa linha recolhida (a aba Custo já mostra tudo).
  let pe = '';
  if (sub !== 'custo') try { pe = htmlCabecaDia(await resumoDoDia()); } catch (e) { console.warn('hoje (resumo):', e); }
  // O painel se redesenha sozinho: o que estava aberto (detalhes recolhidos) continua aberto.
  const abertos = new Set([...el.querySelectorAll('details[open]')].map((x) => x.dataset.chave || x.querySelector(':scope > summary')?.textContent));
  el.innerHTML = topo + `<div class="hj-corpo hj-${sub}">${corpo}</div>` + pe;
  el.querySelectorAll('details').forEach((x) => { if (abertos.has(x.dataset.chave || x.querySelector(':scope > summary')?.textContent)) x.open = true; });
  el.onclick = clique;
  atualizarSelo();
}

// ======================= resumo do dia: fila, andamento, o que espera você e o custo =======================
// Uma conta só, usada no Escritório (painel de baixo do mapa), na Atividade e no topo do Hoje.
// Abre o Hoje com um pedido pronto no editor (ex.: "Ensinar" da Equipe). Nada é enviado antes de "Enviar pedido".
export async function preparar({ titulo, texto, alvo = 'claude', projeto = 'genesis-game' }) {
  sub = 'sugestoes'; guarda('hojeSub', sub); confirmar = null;
  editando = { livre: true, titulo, texto, alvo, projeto };
  ctx?.abrir(); await desenhar(true);
  const ta = document.getElementById('hjEditor'); if (!ta) return;
  ta.focus({ preventScroll: true }); ta.setSelectionRange(0, 0); ta.scrollTop = 0; ta.closest('.hj-sug')?.scrollIntoView({ block: 'nearest' });
}
export function abrirEm(s) { if (s) { sub = s; guarda('hojeSub', sub); } editando = confirmar = null; ctx?.abrir(); return desenhar(true); }
export async function resumoDoDia() {
  if (!ctx?.eu()) return null;
  const por = await filaDoDia();
  let fila = 0;
  for (const m of por.values()) for (const l of m.values()) fila += l.depois.filter((x) => x.de !== 'quadro').length;
  const { dias, porPessoa } = await dadosCusto(), pessoas = ctx.pessoas();
  const soma = (i, k) => pessoas.reduce((s, p) => s + (porPessoa[p]?.dias[i]?.[k] || 0), 0);
  const H = dias.length - 1, ant = dias.slice(0, H).map((_, i) => soma(i, 'custo')).filter((v) => v > 0);
  const hoje = soma(H, 'custo'), ontem = soma(H - 1, 'custo'), media = ant.length ? ant.reduce((a, b) => a + b, 0) / ant.length : 0;
  const pedSemana = dias.reduce((s, _, i) => s + soma(i, 'pedidos'), 0), custoSemana = dias.reduce((s, _, i) => s + soma(i, 'custo'), 0);
  const porPedido = pedSemana ? custoSemana / pedSemana : 0;
  const c = ctx.contagens?.() || {};
  return { fila, fazendo: c.fazendo ?? 0, esperando: c.esperando ?? 0, livres: c.livres ?? 0, hoje, ontem, media, diasMedia: ant.length, porPedido, estimativaFila: fila * porPedido, temCusto: pessoas.some((p) => porPessoa[p]?.fonte) };
}
export const dinheiroCurto = dinheiro;
export function comparacao(r) {
  if (!r.temCusto) return 'sem dados de custo ainda';
  if (!r.media) return r.ontem ? `ontem ${dinheiro(r.ontem)}` : 'primeiro dia com dados';
  const pct = Math.round(((r.hoje - r.media) / r.media) * 100);
  return pct > 5 ? `${pct}% acima da média` : pct < -5 ? `${-pct}% abaixo da média` : 'na média dos últimos dias';
}
// Os três números do dia (mesma cor e ícone dos indicadores do mapa). Toque abre a lista.
export function htmlNumerosDia(r, { custo = false, curto = false } = {}) {
  if (curto) { // faixa fina de uma linha (mapa aproximado no celular)
    const c = (v, rot, cls, tit) => `<button type="button" class="rd-n ${cls}" data-rd="${cls}" title="${tit}"><i class="rd-ind" aria-hidden="true"></i><b>${v}</b><span>${rot}</span></button>`;
    return `<div class="rd-linha rd-fino">${c(r.fila, 'na fila', 'fila', 'Ver a fila do dia')}${c(r.fazendo, 'fazendo', 'fazendo', 'Quem está trabalhando agora')}${c(r.esperando, 'decisões', 'esperando', 'Decisões que só você pode dar')}${c('<small>US$</small>' + (r.hoje || 0).toFixed(2).replace('.', ','), 'IA', 'custo', 'Gasto estimado de IA hoje (US$)')}</div>`;
  }
  const n = (v, rot, cls, tit) => `<button type="button" class="rd-n ${cls}" data-rd="${cls}" title="${tit}"><i class="rd-ind" aria-hidden="true"></i><b>${v}</b><span>${rot}</span></button>`;
  return `<div class="rd-linha${custo ? ' com-custo' : ''}">${n(r.fila, 'Na fila', 'fila', 'Pedidos esperando a vez: ver a fila do dia')}${n(r.fazendo, 'Fazendo', 'fazendo', 'Quem está trabalhando agora')}${n(r.esperando, r.esperando === 1 ? 'Decisão sua' : 'Decisões suas', 'esperando', 'Decisões e autorizações que só você pode dar')}${custo ? n('<small>US$</small>' + (r.hoje || 0).toFixed(2).replace('.', ','), 'IA hoje', 'custo', 'Gasto estimado de IA hoje: ver o custo') : ''}</div>`;
}
// Fim do Hoje: uma linha recolhida com o gasto de IA; tocar abre média, ontem, fila e os números do dia.
function htmlCabecaDia(r) {
  if (!r) return '';
  const { esc } = ctx;
  return `<details class="hj-dia r5" data-chave="custo-dia" aria-label="Custo de IA hoje">
    <summary><span class="hj-dia-rot">Custo de IA hoje:</span> <b>${dinheiro(r.hoje)}</b><i class="hj-dia-seta" aria-hidden="true">▾</i><span class="hj-dia-comp">${esc(comparacao(r))}</span></summary>
    <ul class="hj-dia-ul"><li><span>Média (${r.diasMedia || 0} ${r.diasMedia === 1 ? 'dia' : 'dias'})</span><b>${dinheiro(r.media)}</b></li><li><span>Ontem</span><b>${dinheiro(r.ontem)}</b></li><li><span>Fila (${r.fila})</span><b>≈ ${dinheiro(r.estimativaFila)}</b></li></ul>
    ${htmlNumerosDia(r)}
    <p class="hj-dia-nota">É uma estimativa pelo uso, não uma cobrança: a assinatura já cobre. A fila usa o custo médio por pedido da semana. Detalhes na aba Custo.</p>
  </details>`;
}

async function clique(e) {
  const mo = e.target.closest('[data-motivo]'); if (mo) { const ab = mo.classList.toggle('todo'); mo.setAttribute('aria-expanded', ab); return; }
  const rd = e.target.closest('[data-rd]'); if (rd) { ctx.resumoIr?.(rd.dataset.rd); return; }
  const t = e.target.closest('[data-hsub],[data-hproj],[data-mandar],[data-editar],[data-cancelar],[data-enviar-ed],[data-gerar],[data-expandir],[data-pedir-melhoria],[data-ed-alvo],[data-post-preparar],[data-teste-preparar]');
  if (!t) return;
  if (t.dataset.hsub) { sub = t.dataset.hsub; guarda('hojeSub', sub); editando = confirmar = null; return desenhar(true); }
  if (t.dataset.hproj !== undefined) { projetoSel = t.dataset.hproj; guarda('hojeProjeto', projetoSel); editando = confirmar = null; return desenhar(true); }
  if (t.dataset.expandir !== undefined) { const alvo = document.getElementById(t.dataset.expandir); const aberto = alvo?.classList.toggle('curto') === false; t.setAttribute('aria-expanded', aberto); t.textContent = aberto ? 'Mostrar menos ▴' : 'Ler pedido completo ▾'; return; }
  if (t.dataset.gerar !== undefined) return gerarDeNovo(t);
  const s = minhasSugestoes(), proj = s && projetoAtual(s);
  // Ideias de posts (Estrategista): o pedido vai para o projeto do jogo, numa conversa nova.
  if (t.dataset.postPreparar !== undefined) { const x = Rot.dados(ctx).conteudo?.ideias?.[Number(t.dataset.postPreparar)]; if (x) { editando = { post: Number(t.dataset.postPreparar), texto: Rot.pedidoDaIdeia(x), alvo: 'claude' }; confirmar = null; await desenhar(true); document.getElementById('hjEditor')?.focus(); } return; }
  // Teste da manhã quebrou: pedido pronto para o Programador consertar (abre o editor, não manda).
  if (t.dataset.testePreparar !== undefined) { const te = Rot.dados(ctx).teste; editando = { livre: true, titulo: 'Consertar o teste da manhã', alvo: 'claude', projeto: 'genesis-game', texto: pedidoDoTeste(te) }; confirmar = null; await desenhar(true); document.getElementById('hjEditor')?.focus(); return; }
  if (t.dataset.enviarEd !== undefined && editando?.livre) {
    const texto = document.getElementById('hjEditor')?.value.trim(); if (!texto) return;
    const { alvo, projeto } = editando; editando = null;
    try { await ctx.mandar(texto, { alvo, projeto }); } catch (e) { ctx.toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); }
    return desenhar(true);
  }
  if (t.dataset.enviarEd !== undefined && editando?.post != null) {
    const texto = document.getElementById('hjEditor')?.value.trim(); if (!texto) return;
    const c = Rot.dados(ctx).conteudo, x = c?.ideias?.[editando.post], alvo = editando.alvo;
    editando = null;
    try { await ctx.mandar(texto, { alvo, projeto: 'genesis-game' }); if (x) Rot.marcarIdeia(c, x); } catch (e) { ctx.toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); }
    return desenhar(true);
  }
  if (t.dataset.pedirMelhoria !== undefined) { const m = proj?.melhorias?.[Number(t.dataset.pedirMelhoria)]; if (m) { editando = { melhoria: Number(t.dataset.pedirMelhoria), texto: m.prompt || m.texto, alvo: 'claude' }; return desenhar(true); } return; }
  const i = Number(t.dataset.mandar ?? t.dataset.editar ?? t.dataset.enviarEd ?? t.dataset.cancelar ?? -1);
  const sug = proj?.prompts?.[i];
  if (t.dataset.edAlvo) { if (editando) { editando.texto = document.getElementById('hjEditor')?.value ?? editando.texto; editando.alvo = t.dataset.edAlvo; } return desenhar(true); }
  if (t.dataset.cancelar !== undefined) { editando = confirmar = null; return desenhar(true); }
  if (t.dataset.editar !== undefined && sug) { editando = { i, texto: textoParaMandar(sug), alvo: sug.alvo }; confirmar = null; await desenhar(true); const ta = document.getElementById('hjEditor'); ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length); return; }
  if (t.dataset.enviarEd !== undefined && editando) {
    const texto = document.getElementById('hjEditor')?.value.trim(); if (!texto) return;
    const alvo = editando.alvo, marca = editando.i != null ? sug : null;
    editando = null;
    return mandar(texto, alvo, proj, marca, s);
  }
  if (t.dataset.mandar !== undefined && sug) {
    // 1º toque abre a conferência (pedido inteiro + para onde vai); só "Enviar pedido" manda.
    if (confirmar !== i) { confirmar = i; editando = null; return desenhar(true); }
    confirmar = null;
    return mandar(textoParaMandar(sug), sug.alvo, proj, sug, s);
  }
}

async function mandar(texto, alvo, proj, sug, s) {
  try {
    await ctx.mandar(texto, { alvo, projeto: proj?.projeto || null });
    if (sug) { marcarEnviada(s, proj, sug); }
  } catch (e) { ctx.toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); }
  atualizarSelo();
}

async function gerarDeNovo(botao) {
  botao.disabled = true; botao.textContent = 'Pedindo…';
  try {
    if (ctx.DEMO) { await new Promise((r) => setTimeout(r, 600)); demoSug.gerado = new Date().toISOString(); demoSug.projetos[0].prompts.push(demoSug.projetos[0].prompts.shift()); }
    else {
      let r = await ctx.R.sb.from('comandos').insert({ tipo: 'sugestoes' });
      if (r.error) r = await ctx.R.sb.from('comandos').insert({ tipo: 'jornal', texto: 'sugestoes' }); // sem o SQL 4
      if (r.error) throw r.error;
    }
    ctx.toast({ titulo: 'Pedi sugestões novas', texto: ctx.DEMO ? 'Demonstração: reordenei as sugestões.' : 'A ponte escreve em 1 a 2 minutos (o PC precisa estar ligado).', cor: '#f4c95d' });
  } catch (e) { ctx.toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); }
  desenhar(true);
}

// ======================= 💡 sugestões =======================
let demoSug = null;
function minhasSugestoes() {
  const eu = ctx.eu()?.pessoa; if (!eu) return null;
  const s = ctx.estados().get(eu)?.info?.sugestoes;
  if (s?.projetos?.length) return s;
  return ctx.DEMO ? demoSug : null;
}
const projetoAtual = (s) => s.projetos.find((p) => p.projeto === projetoSel) || s.projetos[0];
const chaveEnviada = (s, p, x) => `hojeEnviada|${s.dia || diaDe(s.gerado)}|${p.projeto}|${x.titulo}`;
const foiEnviada = (s, p, x) => !!guardado(chaveEnviada(s, p, x), '');
const marcarEnviada = (s, p, x) => guarda(chaveEnviada(s, p, x), String(Date.now()));
// O agente e a skill sugeridos vão junto no pedido (é por isso que a sugestão existe).
function textoParaMandar(x) {
  const dica = [x.agente && `o agente ${x.agente}`, x.skill && `a skill ${x.skill}`].filter(Boolean).join(' e ');
  return x.prompt + (dica && !x.prompt.includes(x.agente || x.skill) ? `\n\n(Sugestão do escritório: use ${dica}.)` : '');
}

const pedidoDoTeste = (te) => `O teste automático da manhã quebrou na ${te?.branch || 'main'}${te?.commit ? ` (${te.commit})` : ''}. Reproduza rodando o teste, ache a causa, corrija e prove com ALL OK e sem SCRIPT ERROR.${te?.erros?.length ? `\n\nErros:\n${te.erros.slice(0, 6).join('\n')}` : ''}`;
// Quem do time faz uma sugestão: o cargo (pelo agente sugerido), o Crítico quando vai ao Codex, senão a sua assistente.
function quemFaz(agente, alvo) {
  const c = agente ? cargoDe(agente) : alvo === 'codex' ? cargoDe('critico') : null;
  if (c) return { id: c.id, nome: c.nome + (alvo === 'codex' && agente ? ' · Codex' : '') };
  if (agente) return { id: agente, nome: ctx.nomeAgente(agente) };
  return { id: 'Orquestrador', nome: 'Sua assistente' };
}
// Uma linha do Hoje: rostinho de quem faz, o quê, e UM botão direto. Título e motivo têm até 2 linhas cada;
// tocar no texto abre tudo (data-motivo), sem cortar o motivo da espera no meio.
async function linhaHoje({ quem, titulo, sub = '', botao = '', cls = '' }) {
  const { esc } = ctx;
  return `<article class="hj-item ${cls}"><img class="hj-rosto" src="${await ctx.retratoDe(quem.id)}" alt="" title="${esc(quem.nome)}">
    <div class="hj-item-txt" data-motivo role="button" tabindex="0" aria-expanded="false" title="Toque para ler tudo"><b>${esc(titulo)}</b><small><span class="hj-it-quem">${esc(quem.nome)}</span>${sub ? ` · ${sub}` : ''}</small></div>${botao}</article>`;
}
// selo: o número do grupo, sempre com unidade (ex.: "5 decisões · 1 aviso"); sem ele, "N itens".
const grupoHoje = (cls, titulo, itens, vazio, selo = '', topo = '') => { const n = selo || (itens.length ? plural(itens.length, 'item', 'itens') : ''); return `<section class="hj-grupo ${cls}"><h3><span>${titulo}</span>${n ? `<i>${n}</i>` : ''}</h3>${topo}${itens.length ? itens.join('') : `<p class="hj-grupo-vazio">${vazio}</p>`}</section>`; };

// Sugestões em três grupos: o que precisa de você, o que está andando e o que ficou pronto hoje.
async function htmlSugestoes() {
  const { esc } = ctx;
  const s = minhasSugestoes(), eu = ctx.eu().pessoa;
  const editor = (titulo, n, rows, extra = '') => `<article class="hj-sug editando"><header><span class="hj-n">${n}</span><b>${esc(titulo)}</b></header>
      <label class="hj-rot" for="hjEditor">Revise o pedido. Nada é enviado até você tocar em “Enviar pedido”.</label><textarea id="hjEditor" rows="${rows}">${esc(editando.texto)}</textarea>
      <div class="hj-alvo"><span>Vai para</span><button data-ed-alvo="claude" class="${editando.alvo !== 'codex' ? 'on' : ''}">👑 Claude</button><button data-ed-alvo="codex" class="${editando.alvo === 'codex' ? 'on' : ''}">🧠 Codex</button></div>
      <div class="hj-acoes"><button class="btn" data-cancelar${extra}>Cancelar</button><button class="btn forte" data-enviar-ed${extra}>Enviar pedido ▶</button></div></article>`;
  // Pedido preparado de fora (ex.: "Ensinar" na Equipe): o editor fica no topo.
  const livre = editando?.livre ? editor(editando.titulo, '✎', 7) : '';
  const p = s ? projetoAtual(s) : null;
  const velho = s && (s.dia || diaDe(s.gerado)) !== diaDe(Date.now());
  const marcos = new Map((ctx.marcos() || []).map((m) => [m.id, m]));
  const precisa = [], andando = [], pronto = [], sugeridas = [], depois = [];
  let nAgora = 0; // "agora" só conta quem continua trabalhando (não quem espera você nem pedido só enviado)
  // 1. Decisões que só você pode dar: a MESMA conta do aviso do topo (contagem.js).
  const t = Rot.dados(ctx).teste, prog = quemFaz('programador');
  const dec = ctx.contagens?.().pendencias || contarPendencias();
  const cont = comAvisos(dec, t && !t.ok ? 1 : 0);
  if (dec.decisoes) precisa.push(await linhaHoje({ quem: { id: 'Orquestrador', nome: 'Sua assistente' }, titulo: textoDecisoes(dec), sub: 'os agentes esperam você', botao: `<button class="btn forte hj-item-btn" data-rd="esperando">Responder</button>`, cls: 'urgente' }));
  // 2. Teste da manhã (Programador): quebrou = um aviso em "Precisa de você"; passou = pronto hoje.
  if (t && !t.ok) precisa.push(await linhaHoje({ quem: prog, titulo: 'Teste da manhã quebrou', sub: esc(String(t.erros?.[0] || 'veja o registro').slice(0, 80)), botao: '<button class="btn forte hj-item-btn" data-teste-preparar>Preparar pedido</button>', cls: 'urgente' }));
  if (t?.ok) pronto.push(await linhaHoje({ quem: prog, titulo: 'Teste da manhã passou', sub: `às ${D.hora(new Date(t.quando).getTime())}`, botao: '<span class="hj-selo-ok">ALL OK</span>' }));
  // 3. Sugestões do dia: as não enviadas ficam em "Sugestões para mandar" (são opção, não pendência);
  //    as enviadas estão em andamento.
  for (const [i, x] of (p?.prompts || []).entries()) {
    const enviada = foiEnviada(s, p, x), tam = TAMANHO[x.tamanho] || TAMANHO.M, mc = x.marco && marcos.get(x.marco), quem = quemFaz(x.agente, x.alvo);
    if (editando && editando.i === i) { sugeridas.push(editor(x.titulo, i + 1, 8, `="${i}"`)); continue; }
    if (confirmar === i) {
      const destino = `${x.alvo === 'codex' ? '🧠 Codex' : `👑 sua assistente (Claude)${x.agente ? `, que chama o ${esc(ctx.nomeAgente(x.agente))}` : ''}`} · conversa nova · projeto ${esc(nomeProjeto(p.projeto))}`;
      (enviada ? andando : sugeridas).push(`<article class="hj-sug aberta ${enviada ? 'enviada' : ''}">
        <header><span class="hj-n">${enviada ? '✓' : i + 1}</span><b>${esc(x.titulo)}</b></header>
        ${x.por ? `<p class="hj-motivo-todo"><b>Por quê:</b> ${esc(x.por)}</p>` : ''}
        <dl class="hj-ficha"><dt>Quem faz</dt><dd>${esc(quem.nome)}</dd><dt>Duração</dt><dd>${tam[1]}</dd>${mc || x.marco ? `<dt>Marco</dt><dd>${esc(mc ? mc.titulo : 'marco #' + x.marco)}</dd>` : ''}<dt>Vai para</dt><dd>${destino}${x.skill ? ` · receita “${esc(x.skill)}”` : ''}</dd></dl>
        <p class="hj-rot">O pedido que será enviado:</p>
        <p class="hj-texto">${esc(textoParaMandar(x))}</p>
        <div class="hj-acoes"><button class="btn" data-cancelar="${i}">Fechar</button><button class="btn" data-editar="${i}">Editar</button><button class="btn forte" data-mandar="${i}">Enviar pedido ▶</button></div>
      </article>`);
      continue;
    }
    if (enviada) andando.push(await linhaHoje({ quem, titulo: x.titulo, sub: 'pedido enviado', botao: `<button class="btn hj-item-btn" data-mandar="${i}">Ver</button>`, cls: 'feito' }));
    else sugeridas.push(await linhaHoje({ quem, titulo: x.titulo, sub: tam[2], botao: `<button class="btn forte hj-item-btn" data-mandar="${i}" title="Abre o pedido inteiro para conferir antes de enviar">Mandar</button>` }));
  }
  // 4. Quem está trabalhando agora e o que já entregou hoje (da fila do dia, só a sua equipe).
  try {
    const linhas = [...((await filaDoDia()).get(eu)?.values() || [])];
    const { andando: continuam, esperando } = separarAndamento(linhas.filter((x) => x.agora.length), (l) => l.agora.some((x) => x.alerta));
    for (const l of esperando) precisa.push(await linhaHoje({ quem: quemFaz(l.nome === 'Orquestrador' ? '' : l.nome), titulo: l.agora.find((x) => x.alerta).t, sub: '<b class="hj-alerta">parado, esperando você</b>', botao: '<button class="btn forte hj-item-btn" data-rd="esperando">Responder</button>', cls: 'urgente espera' }));
    for (const l of continuam) andando.push(await linhaHoje({ quem: quemFaz(l.nome === 'Orquestrador' ? '' : l.nome), titulo: l.agora[0].t, sub: 'trabalhando', botao: '<button class="btn hj-item-btn" data-rd="fazendo">Ver</button>' }));
    nAgora = continuam.length;
    for (const l of linhas.filter((x) => x.feitos && x.ultimoFeito && x.nome !== 'Orquestrador')) pronto.push(await linhaHoje({ quem: quemFaz(l.nome === 'Orquestrador' ? '' : l.nome), titulo: primeiraFrase(l.ultimoFeito.texto || 'Entrega', 80), sub: `${plural(l.feitos, 'entrega')} hoje`, botao: '<button class="btn hj-item-btn" data-hsub="fila">Ver</button>', cls: 'feito' }));
  } catch (e) { console.warn('hoje (fila):', e); }
  // 5. Ideias para preparar quando der: melhorias (Gerente) e posts (Estrategista).
  for (const [i, m] of (p?.melhorias || []).entries()) depois.push(editando?.melhoria === i ? editor(m.titulo, '★', 5) : await linhaHoje({ quem: quemFaz('gerente'), titulo: m.titulo, sub: 'melhoria do escritório', botao: `<button class="btn hj-item-btn" data-pedir-melhoria="${i}" title="Abre o pedido para você revisar; nada é enviado ainda">Preparar pedido</button>` }));
  depois.push(...await Rot.linhasIdeias(ctx, editando, editor, linhaHoje, quemFaz('estrategista')));
  const cab = s ? `<div class="hj-cab sub"><div><small>${esc(nomeProjeto(p.projeto))} · ${velho ? 'escritas ' + new Date(s.gerado).toLocaleDateString('pt-BR', { weekday: 'long' }) : ((h) => h === 'agora' ? 'escritas agora' : 'escritas há ' + h)(D.ha(new Date(p.gerado || s.gerado).getTime()))}</small></div><button class="btn mini" data-gerar title="Pedir à ponte sugestões novas agora">↻ Atualizar</button></div>`
    : `<div class="hj-cab sub"><div><small>Sem sugestões hoje: a ponte escreve de 3 a 5 pedidos toda manhã.</small></div><button class="btn mini" data-gerar title="Precisa da ponte ligada e atualizada">Gerar agora</button></div>`;
  const projs = s?.projetos.length > 1 ? `<div class="hj-chips">${s.projetos.map((x) => `<button data-hproj="${esc(x.projeto)}" class="${x === p ? 'on' : ''}">${esc(nomeProjeto(x.projeto))} <small>${x.prompts.length}</small></button>`).join('')}</div>` : '';
  // Ordem fixa: Precisa de você › Em andamento › Pronto hoje › Sugestões para mandar › Ideias para depois.
  return livre
    + grupoHoje('g-precisa', 'Precisa de você', precisa, 'Nada esperando você agora.', textoPendencias(cont))
    + grupoHoje('g-andando', 'Em andamento', andando, 'Ninguém trabalhando agora. Mande uma sugestão abaixo.', nAgora ? `${nAgora} agora` : andando.length ? plural(andando.length, 'item', 'itens') : '')
    + grupoHoje('g-pronto', 'Pronto hoje', pronto, 'Nenhuma entrega ainda hoje.', pronto.length ? plural(pronto.length, 'entrega') : '')
    + grupoHoje('g-sugestoes', 'Sugestões para mandar', sugeridas, 'Todas as sugestões de hoje já foram mandadas.', sugeridas.length ? plural(sugeridas.length, 'sugestão', 'sugestões') : '', projs + cab)
    + (depois.length ? grupoHoje('g-depois', 'Ideias para depois', depois, '', plural(depois.length, 'ideia')) : '')
    + '<details class="hj-nota-det"><summary>Como funcionam as sugestões</summary><p class="hj-nota">Toque em <b>Mandar</b> para ler o pedido inteiro antes de enviar; só “Enviar pedido” manda, numa conversa nova com a sua assistente. <b>Preparar pedido</b> abre o texto para você editar. As sugestões são escritas por uma IA mais simples: confira antes de pedir coisa grande.</p></details>';
}

// ======================= 📋 fila do dia =======================
let cacheCmd = { t: 0, lista: [] };
async function meusComandos() {
  if (ctx.DEMO) return demoComandos;
  if (Date.now() - cacheCmd.t < 20e3) return cacheCmd.lista;
  const { data } = await ctx.R.sb.from('comandos').select('id,conversa_id,status,texto,criado').eq('tipo', 'chat').gte('criado', new Date(inicioDoDia()).toISOString()).order('id', { ascending: false }).limit(80);
  cacheCmd = { t: Date.now(), lista: data || [] };
  return cacheCmd.lista;
}
// Etapa do quadro -> agente provável (pelas palavras); sem palavra conhecida fica com a assistente.
const PISTAS = [[/v[ií]deo|short|trailer|devlog|corte|render/i, 'editor-de-video'], [/balance|dificuldade|bots?\b|vida|dano/i, 'balanceador'], [/sprite|pixel|arte|desenh|ícone|icone|baú|bau/i, 'PixelLab'], [/3d|modelo|blender/i, 'artista-3d'], [/revis|teste|bug|code review/i, 'revisor-godot'], [/roteiro|título|titulo|thumb|capa|youtube|post|steam/i, 'criador-de-conteudo'], [/áudio|audio|som|música|musica|trilha|mix/i, 'mixador-de-audio'], [/achar|onde|explor|mapear/i, 'explorador']];
const agenteDaEtapa = (t) => PISTAS.find(([re]) => re.test(t))?.[1] || 'Orquestrador';

async function filaDoDia() {
  const hoje0 = inicioDoDia(), pessoas = ctx.pessoas(), eu = ctx.eu().pessoa;
  const por = new Map(pessoas.map((p) => [p, new Map()]));
  const linha = (p, nome) => { if (!por.has(p)) por.set(p, new Map()); const m = por.get(p); if (!m.has(nome)) m.set(nome, { nome, agora: [], depois: [], feitos: 0, ultimoFeito: null }); return m.get(nome); };
  const add = (lista, txt, extra = {}) => { const t = primeiraFrase(txt, 90); if (t && !lista.some((x) => x.t === t)) lista.push({ t, ...extra }); };
  // Missões abertas: quem está trabalhando e quem foi escalado e ainda não começou.
  for (const m of D.missoes()) {
    if (m.fim || !['trab', 'alerta', 'semsinal'].includes(m.status) || Date.now() - m.ultimo > 12 * 3600e3) continue;
    const ass = m.alvo === 'codex' ? 'Codex' : 'Orquestrador';
    add(linha(m.pessoa, ass).agora, m.titulo, { alerta: m.status === 'alerta' });
    for (const x of D.escalacao(m)) {
      if (x.tipo !== 'agente' && x.tipo !== 'programa') continue;
      if (['trabalhando', 'semsinal'].includes(x.estado)) add(linha(m.pessoa, x.nome).agora, x.ult?.descricao || (x.ult ? frase(x.ult) : '') || m.titulo, { alerta: x.ult?.tipo === 'alerta' });
      else if (x.estado === 'planejado') add(linha(m.pessoa, x.nome).depois, x.por || m.titulo, { de: 'missão' });
    }
  }
  // Entregas de hoje.
  for (const e of D.eventos) {
    if (e.t < hoje0 || !e.pessoa || !e.agente) continue;
    if (e.tipo === 'fim' && e.agente !== 'Orquestrador') { const l = linha(e.pessoa, e.agente); l.feitos++; l.ultimoFeito = e; }
    if (e.agente === 'Orquestrador' && e.tipo === 'espera' && e.resposta) { const l = linha(e.pessoa, 'Orquestrador'); l.feitos++; l.ultimoFeito = e; }
  }
  // Seus pedidos esperando na fila (a página só vê os seus).
  const convs = new Map((ctx.conversas() || []).map((c) => [c.id, c]));
  for (const c of await meusComandos()) {
    const alvo = convs.get(c.conversa_id)?.alvo === 'codex' ? 'Codex' : 'Orquestrador';
    if (c.status === 'novo') add(linha(eu, alvo).depois, c.texto, { de: 'fila', aba: convs.get(c.conversa_id)?.titulo });
    else if (c.status === 'rodando') add(linha(eu, alvo).agora, c.texto);
  }
  // Etapas pendentes dos marcos em andamento, de quem é o marco.
  for (const mc of ctx.marcos() || []) {
    if (!['fazendo', 'afazer'].includes(mc.coluna) || !mc.responsavel || !por.has(mc.responsavel)) continue;
    for (const et of (mc.etapas || []).filter((x) => !x.feito).slice(0, mc.coluna === 'fazendo' ? 2 : 1)) add(linha(mc.responsavel, agenteDaEtapa(`${et.t} ${mc.titulo}`)).depois, `${et.t} · ${mc.titulo}`, { de: 'quadro', marco: mc.id });
  }
  return por;
}

async function htmlFila() {
  const { esc } = ctx;
  const por = await filaDoDia(), eu = ctx.eu().pessoa;
  const ordem = [eu, ...[...por.keys()].filter((p) => p !== eu)];
  let html = '<p class="hj-intro">O que cada agente está fazendo <b>agora</b>, o que vem <b>depois</b> e quanto já entregou <b>hoje</b>.</p>';
  for (const p of ordem) {
    const linhas = [...(por.get(p)?.values() || [])].filter((l) => l.agora.length || l.depois.length || l.feitos);
    const ag = linhas.reduce((n, l) => n + l.agora.length, 0), dp = linhas.reduce((n, l) => n + l.depois.length, 0), ft = linhas.reduce((n, l) => n + l.feitos, 0);
    html += `<section class="hj-pessoa" style="--cor:${ctx.corPessoa(p)}"><h3><span>${esc(p === eu ? 'Sua equipe' : 'Equipe de ' + p)}</span><small>${ag} trabalhando · ${dp} na fila · ${plural(ft, 'entrega')} hoje</small></h3>`;
    if (!linhas.length) { html += '<p class="hj-vazio mini">Ninguém trabalhando nem na fila. Que tal uma sugestão do dia?</p></section>'; continue; }
    linhas.sort((a, b) => (b.agora.length - a.agora.length) || (b.depois.length - a.depois.length) || (b.feitos - a.feitos));
    for (const l of linhas) {
      const nome = l.nome === 'Orquestrador' ? (p === eu ? 'Sua assistente' : 'Assistente') : ctx.nomeAgente(l.nome);
      const st = l.agora.some((x) => x.alerta) ? ['alerta', '! precisa de você'] : l.agora.length ? ['trab', '… trabalhando'] : l.depois.length ? ['fila', '○ na fila'] : ['fim', '✓ entregou'];
      const mais = (lista, n) => lista.length > n ? `<li class="mais">+${lista.length - n}</li>` : '';
      const lista = (itens, rot, ic, nota, cls = '') => itens.length ? `<div class="hj-rotulo ${cls}">${rot}</div><ul class="hj-depois ${cls}">${itens.slice(0, 3).map((x) => `<li><i>${ic(x)}</i><span>${esc(x.t)}${nota(x) ? ` <em>(${nota(x)})</em>` : ''}</span></li>`).join('')}${mais(itens, 3)}</ul>` : '';
      html += `<div class="hj-ag est-${st[0]}"><img src="${await ctx.retratoDe(l.nome)}" alt=""><div class="hj-ag-txt">
        <div class="hj-ag-nome"><b>${esc(nome)}</b><span class="hj-est">${st[1]}</span>${l.feitos ? `<span class="hj-feitos" title="Entregas de hoje">✓ ${l.feitos} hoje</span>` : ''}</div>
        ${l.agora.length ? `<div class="hj-rotulo hj-r-agora">Agora</div><ul class="hj-agora">${l.agora.slice(0, 2).map((x) => `<li>${esc(x.t)}</li>`).join('')}${mais(l.agora, 2)}</ul>` : ''}
        ${lista(l.depois.filter((x) => x.de !== 'quadro'), 'Na fila', (x) => x.de === 'fila' ? '⏳' : '○', (x) => x.de === 'fila' ? 'pedido seu' : 'chamado no pedido')}${lista(l.depois.filter((x) => x.de === 'quadro'), 'No quadro · ainda não pedido', () => '🏁', () => l.nome !== 'Orquestrador' ? 'agente provável' : '', 'sugerido')}
      </div></div>`;
    }
    html += '</section>';
  }
  return html + '<details class="hj-nota-det"><summary>O que significa cada sinal</summary><p class="hj-nota">⏳ pedido seu esperando a vez · ○ a assistente já chamou este agente no pedido · 🏁 etapa aberta no quadro que ninguém pediu ainda (o agente é um palpite pelas palavras). Os pedidos na fila do outro só ele vê.</p></details>';
}

// ======================= 🪙 custo e uso =======================
let cacheNotas = { t: 0, dias: null };
// Sem o caderninho da ponte (ponte antiga): soma as notas fiscais do SEU chat dos últimos 7 dias.
async function notasDoChat() {
  if (ctx.DEMO) return null;
  if (Date.now() - cacheNotas.t < 120e3) return cacheNotas.dias;
  const { data } = await ctx.R.sb.from('chat').select('texto,t').eq('de', 'sistema').like('texto', '{"nota"%').gte('t', new Date(inicioDoDia() - 7 * DIA).toISOString()).limit(1000);
  const dias = {};
  for (const r of data || []) {
    let n; try { n = JSON.parse(r.texto).nota; } catch { continue; }
    const d = (dias[diaDe(new Date(r.t).getTime())] ??= { claude: { pedidos: 0, custo: 0, ms: 0, tokens: 0 }, modelos: {} });
    d.claude.pedidos++; d.claude.custo += n.custo || 0; d.claude.ms += n.ms || 0; d.claude.tokens += (n.entrada || 0) + (n.saida || 0) + (n.cacheCriado || 0);
    for (const m of n.modelos || []) (d.modelos[m] ??= { pedidos: 0, custo: 0, tokens: 0 }).pedidos++;
  }
  cacheNotas = { t: Date.now(), dias };
  return dias;
}
const modeloCurto = (m) => { const s = String(m).toLowerCase(); const fam = /opus/.test(s) ? 'Opus' : /sonnet/.test(s) ? 'Sonnet' : /haiku/.test(s) ? 'Haiku' : /gpt|codex|o\d/.test(s) ? 'GPT' : m; const v = /(\d+)[-.](\d+)/.exec(s); return v ? `${fam} ${v[1]}.${v[2]}` : fam; };

async function dadosCusto() {
  const dias = ultimosDias(7), eu = ctx.eu().pessoa, pessoas = ctx.pessoas();
  const porPessoa = {}, modelos = {};
  for (const p of pessoas) {
    let fonte = ctx.estados().get(p)?.info?.uso?.dias || (ctx.DEMO ? demoUso[p] : null);
    const temCaderno = !!fonte;
    if (!fonte && p === eu) fonte = await notasDoChat();
    porPessoa[p] = { temCaderno, fonte: !!fonte, dias: dias.map((d) => { const x = fonte?.[d]?.claude || {}; return { dia: d, custo: x.custo || 0, pedidos: x.pedidos || 0, tokens: x.tokens || 0, ms: x.ms || 0 }; }) };
    for (const d of dias) for (const [m, v] of Object.entries(fonte?.[d]?.modelos || {})) { const k = modeloCurto(m); const o = (modelos[k] ??= { custo: 0, pedidos: 0, tokens: 0 }); o.custo += v.custo || 0; o.pedidos += v.pedidos || 0; o.tokens += v.tokens || 0; }
  }
  // Codex (sem custo): pedidos e tempo, pelas missões (site e VS Code) de cada um.
  const codex = Object.fromEntries(pessoas.map((p) => [p, dias.map(() => ({ pedidos: 0, ms: 0 }))]));
  const ini = inicioDoDia() - 6 * DIA;
  for (const m of D.missoes()) if (m.alvo === 'codex' && m.inicio >= ini && codex[m.pessoa]) { const i = dias.indexOf(diaDe(m.inicio)); if (i >= 0) { codex[m.pessoa][i].pedidos++; codex[m.pessoa][i].ms += m.duracao || 0; } }
  // Por agente: a nota de uso que vem na entrega de cada sub-agente (tempo e tokens; custo não vem).
  const agentes = {};
  for (const e of D.eventos) if (e.tipo === 'fim' && e.uso && e.agente && e.agente !== 'Orquestrador' && e.t >= ini) { const a = (agentes[e.agente] ??= { tokens: 0, ms: 0, n: 0 }); a.tokens += (e.uso.entrada || 0) + (e.uso.saida || 0) + (e.uso.cacheCriado || 0); a.ms += e.uso.ms || 0; a.n++; }
  return { dias, porPessoa, modelos, codex, agentes };
}

function grafico(dias, porPessoa, pessoas) {
  const W = 340, H = 150, base = 120, topo = 18, larg = W / dias.length;
  const tot = dias.map((_, i) => pessoas.reduce((s, p) => s + (porPessoa[p]?.dias[i].custo || 0), 0));
  const max = Math.max(0.01, ...tot);
  let barras = '';
  dias.forEach((d, i) => {
    let y = base; const x = i * larg + larg * 0.2, w = larg * 0.6;
    for (const p of pessoas) { const v = porPessoa[p]?.dias[i].custo || 0; if (!v) continue; const h = Math.max(2, (v / max) * (base - topo)); y -= h; barras += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${ctx.corPessoa(p)}" rx="2"><title>${p}: ${dinheiro(v)}</title></rect>`; }
    const hoje = i === dias.length - 1;
    if (tot[i]) barras += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="hj-g-val">${tot[i] < 10 ? tot[i].toFixed(2).replace('.', ',') : Math.round(tot[i])}</text>`;
    const dt = new Date(d + 'T12:00');
    barras += `<text x="${(x + w / 2).toFixed(1)}" y="${base + 16}" text-anchor="middle" class="hj-g-dia ${hoje ? 'hoje' : ''}">${hoje ? 'hoje' : dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</text>`;
  });
  return `<svg class="hj-grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Custo estimado por dia nos últimos 7 dias"><line x1="0" x2="${W}" y1="${base}" y2="${base}" class="hj-g-eixo"/>${barras}</svg>`;
}
const barraH = (rot, v, max, txt, cor = 'var(--hj-acento)') => `<div class="hj-barra"><span class="r">${rot}</span><span class="b"><i style="width:${Math.max(3, (v / (max || 1)) * 100).toFixed(1)}%;background:${cor}"></i></span><span class="v">${txt}</span></div>`;

async function htmlCusto() {
  const { esc } = ctx;
  const pessoas = ctx.pessoas(), eu = ctx.eu().pessoa;
  const { dias, porPessoa, modelos, codex, agentes } = await dadosCusto();
  const soma = (i, k) => pessoas.reduce((s, p) => s + (porPessoa[p]?.dias[i][k] || 0), 0);
  const H = dias.length - 1, O = dias.length - 2;
  const delta = (a, b) => { if (!b) return a ? '<em class="sobe">novo</em>' : '<em>=</em>'; const pct = Math.round(((a - b) / b) * 100); return `<em class="${pct > 0 ? 'sobe' : pct < 0 ? 'desce' : ''}">${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}%</em>`; };
  const semana = dias.reduce((s, _, i) => s + soma(i, 'custo'), 0);
  const cxHoje = pessoas.reduce((s, p) => s + codex[p][H].pedidos, 0), cxOntem = pessoas.reduce((s, p) => s + codex[p][O].pedidos, 0);
  const cxSemana = pessoas.reduce((s, p) => s + codex[p].reduce((a, x) => a + x.pedidos, 0), 0), cxMs = pessoas.reduce((s, p) => s + codex[p].reduce((a, x) => a + x.ms, 0), 0);
  const semFonte = pessoas.filter((p) => !porPessoa[p].fonte);
  let html = `<div class="hj-tiles">
    <div class="hj-tile"><small>Uso de hoje, estimado em US$</small><b>${dinheiro(soma(H, 'custo'))}</b><span>ontem ${dinheiro(soma(O, 'custo'))} ${delta(soma(H, 'custo'), soma(O, 'custo'))}</span><span class="hj-aviso">estimativa, não é cobrança</span></div>
    <div class="hj-tile"><small>Pedidos Claude</small><b>${soma(H, 'pedidos')}</b><span>ontem ${soma(O, 'pedidos')} ${delta(soma(H, 'pedidos'), soma(O, 'pedidos'))}</span></div>
    <div class="hj-tile"><small>Tokens hoje</small><b>${milhar(soma(H, 'tokens'))} <span class="un">tokens</span></b><span>ontem ${milhar(soma(O, 'tokens'))}</span></div>
    <div class="hj-tile gpt"><small>Codex hoje</small><b>${cxHoje} <span class="un">${cxHoje === 1 ? 'pedido' : 'pedidos'}</span></b><span>ontem ${cxOntem} · o Codex não informa custo</span></div>
  </div>`;
  html += `<h3 class="hj-sec">Últimos 7 dias <small>${dinheiro(semana)} no total</small></h3><div class="hj-legenda">${pessoas.map((p) => `<span><i style="background:${ctx.corPessoa(p)}"></i>${esc(p)} ${dinheiro(porPessoa[p].dias.reduce((s, x) => s + x.custo, 0))}</span>`).join('')}</div>${grafico(dias, porPessoa, pessoas)}`;
  const mods = Object.entries(modelos).sort((a, b) => b[1].custo - a[1].custo || b[1].pedidos - a[1].pedidos);
  if (mods.length) { const mx = Math.max(...mods.map(([, v]) => v.custo || v.pedidos)); html += `<h3 class="hj-sec">Por modelo <small>7 dias</small></h3>${mods.slice(0, 6).map(([m, v]) => barraH(esc(m), v.custo || v.pedidos, mx, v.custo ? `${dinheiro(v.custo)} · ${v.pedidos} ped.` : `${v.pedidos} pedidos`)).join('')}`; }
  const ags = Object.entries(agentes).sort((a, b) => b[1].tokens - a[1].tokens);
  if (ags.length) { const mx = ags[0][1].tokens; html += `<h3 class="hj-sec">Tokens por agente <small>7 dias · ⏱ tempo trabalhando</small></h3>${ags.slice(0, 7).map(([a, v]) => barraH(`${esc(ctx.nomeAgente(a))} <small>⏱ ${D.duracao(v.ms)}</small>`, v.tokens, mx, `${milhar(v.tokens)} tokens`, 'var(--hj-acento2)')).join('')}`; }
  html += `<h3 class="hj-sec">Codex <small>pedidos e tempo (sem preço por pedido)</small></h3>${barraH('7 dias', cxSemana, Math.max(1, cxSemana), `${cxSemana} pedidos · ${D.duracao(cxMs)}`, 'var(--gpt, #3fb37f)')}${pessoas.map((p) => { const n = codex[p].reduce((a, x) => a + x.pedidos, 0); return barraH(esc(p), n, Math.max(1, cxSemana), `${n}`, ctx.corPessoa(p)); }).join('')}`;
  html += `<details class="hj-como"><summary>Como calculamos?</summary><p>Ao fim de cada pedido, o Claude Code informa quanto aquele trabalho custaria em dólar se fosse pago por uso (tokens × preço de cada modelo). Vocês pagam a assinatura mensal, então esse valor <b>não é cobrado</b>: serve para comparar dias, pessoas e modelos. Tokens são os pedacinhos de texto que a IA lê e escreve. O Codex não informa esse valor, então mostramos só quantos pedidos e quanto tempo.</p></details><p class="hj-nota">${semFonte.length ? ` Sem dados de ${semFonte.map(esc).join(' e ')}: a ponte dele precisa estar atualizada.` : ''}${!porPessoa[eu]?.temCaderno && porPessoa[eu]?.fonte ? ' Seus números vêm das notas do chat (a ponte nova guarda tudo, inclusive por modelo).' : ''}</p>`;
  return html;
}

// ======================= demonstração (?demo) =======================
let demoUso = {}, demoComandos = [];
function prepararDemo() {
  const ag = Date.now(), dias = ultimosDias(8);
  const serie = (base, var_, seed) => dias.map((_, i) => Math.max(0, base + Math.sin(i * 1.7 + seed) * var_));
  const fazer = (base, seed, mods) => Object.fromEntries(dias.map((d, i) => { const c = serie(base, base * 0.6, seed)[i], ped = Math.round(c * 9 + 2); return [d, { claude: { pedidos: ped, custo: Math.round(c * 100) / 100, ms: ped * 140e3, tokens: Math.round(c * 210e3) }, modelos: Object.fromEntries(mods.map(([m, f]) => [m, { pedidos: Math.max(1, Math.round(ped * f)), custo: Math.round(c * f * 100) / 100, tokens: Math.round(c * f * 210e3) }])) }]; }));
  demoUso = { Rafael: fazer(2.6, 1, [['claude-opus-4-5', 0.7], ['claude-haiku-4-5', 0.2], ['claude-sonnet-4-5', 0.1]]), Kenny: fazer(1.3, 3, [['claude-sonnet-4-5', 0.8], ['claude-haiku-4-5', 0.2]]) };
  demoComandos = [
    { id: 901, conversa_id: 2, status: 'novo', texto: 'Revise o InventoryModel e diga se a separação ficou limpa', criado: new Date(ag - 4 * 60e3).toISOString() },
    { id: 902, conversa_id: 1, status: 'novo', texto: 'Depois do render, gere 3 capas para o Short e peça nota ao Codex', criado: new Date(ag - 2 * 60e3).toISOString() },
  ];
  // Entregas antigas com nota de uso (para o custo por agente) e pedidos ao Codex nos dias anteriores.
  const ev = (h, pessoa, agente, tipo, texto, extra = {}) => ({ id: `hj${h}${agente}${tipo}`, t: ag - h * 3600e3, pessoa, agente, tipo, texto, sessao: `hj-${pessoa}-${Math.floor(h)}`, projeto: 'genesis-game', ...extra });
  const uso = (ms, tk, mod) => ({ ms, entrada: tk * 0.2, saida: tk * 0.3, cacheCriado: tk * 0.5, modelos: [mod] });
  D.adicionar([
    ev(26, 'Rafael', 'editor-de-video', 'fim', 'Trailer v2 montado: 58 s, 14 cortes', { uso: uso(1620e3, 410e3, 'claude-sonnet-4-5') }),
    ev(30, 'Rafael', 'criador-de-conteudo', 'fim', 'Roteiro do devlog de 1 mês pronto', { uso: uso(540e3, 120e3, 'claude-sonnet-4-5') }),
    ev(50, 'Kenny', 'revisor-godot', 'fim', 'Revisão do player.gd: 3 achados', { uso: uso(380e3, 160e3, 'claude-sonnet-4-5') }),
    ev(52, 'Kenny', 'explorador', 'fim', 'Mapa do sistema de receitas do Cook', { uso: uso(210e3, 90e3, 'claude-haiku-4-5') }),
    ev(75, 'Rafael', 'artista-3d', 'fim', 'Espada do Gatuno low poly exportada', { uso: uso(900e3, 230e3, 'claude-sonnet-4-5') }),
    ev(30, 'Rafael', 'Codex', 'pedido', 'Nota do trailer v2 com folhas de quadros', { origem: 'site', sessao: 'hj-cx1' }), ev(29.6, 'Rafael', 'Codex', 'fim', 'Nota 7/10', { origem: 'site', sessao: 'hj-cx1' }),
    ev(54, 'Kenny', 'Codex', 'pedido', 'Segunda opinião no dash', { origem: 'vscode', sessao: 'hj-cx2' }), ev(53.5, 'Kenny', 'Codex', 'fim', 'Dash ok, falta teste', { origem: 'vscode', sessao: 'hj-cx2' }),
    ev(98, 'Rafael', 'Codex', 'pedido', 'Revisar o balanceamento do Veterano', { origem: 'site', sessao: 'hj-cx3' }), ev(97.2, 'Rafael', 'Codex', 'fim', 'Taxa ok', { origem: 'site', sessao: 'hj-cx3' }),
  ]);
  // Sugestões de verdade, geradas pelo escritorio/sugestoes.mjs --seco (haiku) e ligadas aos marcos da demo.
  demoSug = { dia: diaDe(ag), gerado: new Date(ag - 95 * 60e3).toISOString(), projetos: [{
    projeto: 'genesis-game', gerado: new Date(ag - 95 * 60e3).toISOString(), modelo: 'haiku', fontes: { commits: 12, marcos: 6, pendencias: 2, skills: 36, agentes: 12 },
    prompts: [
      { titulo: 'Fechar o Short Raio + Fogo', prompt: 'Termine a edição do Short "Raio + Fogo = ?" (marco #1): ajuste o corte do compasso 3, que o Codex disse que atrasa, e renderize de novo em 1080x1920. Depois peça a nota ao Codex com as folhas de quadros. Pronto quando a nota for 9 ou mais e o vídeo estiver em _video/out.', alvo: 'claude', agente: 'editor-de-video', skill: 'video-do-jogo', por: 'É prioridade 1 com prazo em 2 dias e só faltam 2 etapas.', tamanho: 'M', marco: 1 },
      { titulo: 'Teste automático do avanço rápido (dash)', prompt: 'Escreva o teste automático do dash do player (marco #2): rode o Godot sem tela, faça o player dar dash 20 vezes e confira a invencibilidade curta e que não aparece o erro "Nonexistent function dash in base Nil". Pronto quando o teste passar e estiver no CI local.', alvo: 'claude', agente: 'revisor-godot', skill: '', por: 'O marco do Kenny está atrasado 1 dia e o erro de ontem ainda aparece no registro de erros.', tamanho: 'P', marco: 2 },
      { titulo: 'Segunda opinião no inventário', prompt: 'Faça uma revisão crítica da separação entre InventoryModel e InventoryView do Cook. Procure acoplamento escondido, sinais duplicados e nós criados por frame. Não edite nada: devolva uma lista priorizada com arquivo e linha.', alvo: 'codex', agente: '', skill: '', por: 'O Codex mexeu em 14 arquivos ontem: vale outro olhar antes de seguir com o baú.', tamanho: 'M', marco: 3 },
      { titulo: 'Rodada de bots no Veterano', prompt: 'Rode 30 partidas com bots no Veterano e confira se a taxa de vitória ficou entre 45% e 55% depois do ajuste do Dragão do Inverno e da Morvane. Mexa só em data/. Pronto quando tiver a tabela antes/depois.', alvo: 'claude', agente: 'balanceador', skill: 'balanceamento-com-bots', por: 'O marco está em "revisar": falta a prova com números para fechar.', tamanho: 'G', marco: 6 },
      { titulo: 'Roteiro do trailer de lançamento', prompt: 'Escreva o roteiro do trailer de 60 s para a página da Steam (marco #4): gancho em 3 s, 3 mecânicas, chefe, chamada final. Liste as cenas que precisamos gravar do jogo e a trilha sugerida.', alvo: 'claude', agente: 'criador-de-conteudo', skill: 'video-do-jogo', por: 'Está em "a fazer" sem etapas: o roteiro destrava o resto.', tamanho: 'M', marco: 4 },
    ],
    melhorias: [
      { titulo: 'Skill de capa de Short', texto: 'A assistente criou a receita de capa só ontem e ela ainda não tem exemplo. Uma skill com 3 modelos de capa aprovados economiza idas e voltas.', prompt: 'Complete a skill thumbnail-do-short com 3 modelos de capa aprovados, tamanhos do YouTube e um checklist de legibilidade no celular.' },
      { titulo: 'Fila automática no PixelLab', texto: 'O plano grátis aceita uma geração por vez e já deu erro de concorrência. Uma rotina que enfileira evita retrabalho.', prompt: 'Crie uma skill pixellab-em-fila que dispara uma geração por vez, espera terminar e tenta de novo no erro de concorrência.' },
    ],
  }] };
}
