// Coordenação com a dupla: presença (site / PC / projeto / marco / o que a IA está fazendo),
// avisos de conflito, "passar a bola" (pedido ou recado com contexto) e reagir ao que o outro mandou.
// Usa só a tabela de recados (cor 'bola' e 'bola-ok'): funciona sem SQL novo.
import * as D from './dados.js';
import { frase, primeiraFrase } from './humano.js';
import { tituloDe } from './config.js';
import { ctx, $, esc, lerJson, guardado, guarda, nomeArq } from './comando-ctx.js';
import { arquivosMudados } from './comando-progresso.js';

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
const chaveArq =(a) => String(a).replace(/\\/g, '/').toLowerCase().split('/').slice(-3).join('/');
function arquivosRecentes(p) {
  const desde = Date.now() - JANELA_CONFLITO, out = new Map();
  for (const m of D.missoes()) {
    if (m.pessoa !== p || m.ultimo < desde) continue;
    for (const e of m.passos) {
      if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(e.ferramenta || '') || e.t < desde) continue;
      const a = String(e.arq || e.alvo || '').trim(); if (!a) continue;
      const k = chaveArq(a), x = out.get(k);
      if (!x || x.t < e.t) out.set(k, { a, t: e.t, missao: m.id });
    }
  }
  return out;
}
export function conflitos() {
  const eu = ctx.eu()?.pessoa, outro = ctx.outra(); if (!eu || !outro) return [];
  const a = presenca(eu), b = presenca(outro), lista = [];
  if (a.branch && a.branch === b.branch && ctx.pcLigado(outro)) lista.push({ k: `branch|${a.branch}`, icone: '⎇', texto: `Vocês dois estão na branch <b>${esc(a.branch)}</b>`, curto: `Você e ${outro} estão trabalhando na mesma versão do projeto. Combinem quem salva primeiro.`, recado: `⚠ Estamos os dois na branch ${a.branch}. Combina quem commita primeiro?` });
  const meus = arquivosRecentes(eu), dele = arquivosRecentes(outro);
  const juntos = [...meus.keys()].filter((k) => dele.has(k));
  if (juntos.length) {
    const k0 = juntos[0], nomes = juntos.slice(0, 2).map((k) => esc(nomeArq(meus.get(k).a))).join(', ');
    lista.push({ k: `arq|${juntos.sort().join(',')}`, icone: '📝', missao: dele.get(k0).missao, curto: `Você e ${outro} mexeram no mesmo arquivo (${nomeArq(meus.get(k0).a)}). Combinem quem continua.`,
      texto: `<b>${nomes}</b>${juntos.length > 2 ? ` +${juntos.length - 2}` : ''}: sua IA mexeu ${haT(meus.get(k0).t)} e a do ${esc(outro)} ${haT(dele.get(k0).t)}. Combine quem segue antes de commitar.`,
      recado: `⚠ Nossas IAs mexeram em ${juntos.slice(0, 3).map((k) => nomeArq(meus.get(k).a)).join(', ')}. Segura um pouco que eu termino e te aviso?` });
  }
  if (a.marco && b.marco && a.marco.id === b.marco.id && (a.ativa || b.ativa)) lista.push({ k: `marco|${a.marco.id}`, icone: '🏁', texto: `As IAs dos dois estão no marco <b>${esc(a.marco.titulo)}</b>`, curto: `As IAs de vocês dois estão no mesmo marco (${a.marco.titulo}). Dividam o trabalho.`, recado: `⚠ Nossas IAs estão no mesmo marco (${a.marco.titulo}). Divide: eu fico com uma parte e você com outra?` });
  return lista;
}

// ---------- bolas (pedido/recado com contexto para o outro) ----------
const ehBola = (r) => r.cor === 'bola';
function estadoBolas() {
  const rs = ctx.recados(), oks = new Map();
  for (const r of rs) if (r.cor === 'bola-ok') { const j = lerJson(r.texto); if (j.id) oks.set(Number(j.id), { ...j, pessoa: r.pessoa, criado: r.criado }); }
  return rs.filter(ehBola).map((r) => ({ r, j: lerJson(r.texto), ok: oks.get(r.id) || null })).filter((x) => x.j.texto);
}
const ROT_OK = { ia: 'mandou para a IA', feito: 'resolveu', visto: 'viu', dispensou: 'dispensou' };
export function resumoRecado(r) {
  if (r?.cor === 'bola') { const j = lerJson(r.texto); return `🏀 ${j.alvo && j.alvo !== 'pessoa' ? 'pedido para a sua IA' : 'bola para você'}: ${primeiraFrase(j.texto || '', 90)}`; }
  if (r?.cor === 'bola-ok') { const j = lerJson(r.texto); return `🏀 ${ROT_OK[j.acao] || 'respondeu'} a bola`; }
  return null;
}

// ---------- desenho ----------
let aberto = guardado('cdAberto', '1') === '1', folha = null;
const corP = (p) => ctx.corPessoa(p);
const ponto = ([cls, rot]) => `<span class="cd-st ${cls}"><i></i>${esc(rot)}</span>`;

async function linhaPessoa(x, grande) {
  const marco = x.marco ? `<button type="button" class="cd-marco" data-cd-marco="${x.marco.id}">🏁 ${esc(primeiraFrase(x.marco.titulo, 34))}</button>` : '';
  return `<div class="cd-pessoa ${grande ? 'grande' : ''}" style="--cor:${corP(x.p)}">
    <img src="${await ctx.retrato(x.p)}" alt="">
    <div class="cd-p-txt"><div class="cd-p-l1"><b>${esc(x.p === ctx.eu().pessoa ? 'Você' : x.p)}</b>${ponto(x.site)}${ponto(x.pc)}</div>
      <div class="cd-p-l2">${x.projeto ? `<span>📁 ${esc(x.projeto)}</span>` : ''}${x.branch ? `<span>⎇ ${esc(x.branch)}</span>` : ''}${marco}</div>
      ${x.agora ? `<div class="cd-p-agora"><span class="cd-pulso"></span>${esc(x.agora)}</div>` : ''}</div>
  </div>`;
}

export async function desenhar() {
  const el = $('#coordDupla'); if (!el || !ctx.eu?.()) return;
  const eu = ctx.eu().pessoa, outro = ctx.outra(); if (!outro) { el.innerHTML = ''; return; }
  const po = presenca(outro), pe = presenca(eu), cf = conflitos();
  const bolas = estadoBolas();
  const praMim = bolas.filter((b) => b.j.para === eu && !b.ok).sort((a, b) => new Date(b.r.criado) - new Date(a.r.criado));
  const minhas = bolas.filter((b) => b.r.pessoa === eu).sort((a, b) => new Date(b.r.criado) - new Date(a.r.criado)).slice(0, 2);
  const reacoes = reacoesMissoes();
  const dele = D.missoes().filter((m) => m.pessoa === outro).slice(0, 2);
  let html = `<div class="cd ${aberto ? 'aberto' : ''}">
    <div class="cd-topo">${await linhaPessoa(po, true)}<button type="button" class="btn mini cd-bola-btn" data-cd="bola" title="Mandar um pedido ou recado com contexto para ${esc(outro)}">🏀 Passar a bola</button></div>`;
  if (cf.length) html += `<div class="cd-conflitos">${cf.map((c) => `<div class="cd-conf"><span>${c.icone}</span><div><p><b>Possível conflito.</b> ${c.texto}</p><div class="cd-conf-acoes"><button type="button" class="btn mini forte" data-cd-conf="${esc(c.k)}">Avisar ${esc(outro)}</button>${c.missao ? `<button type="button" class="btn mini" data-cd-abrir="${esc(c.missao)}">Ver o que ele fez</button>` : ''}</div></div></div>`).join('')}</div>`;
  if (praMim.length) html += `<div class="cd-bolas"><p class="cd-rot">🏀 ${praMim.length === 1 ? 'Uma bola para você' : `${praMim.length} bolas para você`}</p>${praMim.slice(0, 3).map(cartaoBola).join('')}</div>`;
  html += `<button type="button" class="cd-mais" data-cd="alternar">${aberto ? 'menos ▴' : `mais: você, o que ${esc(outro)} pediu e suas bolas ▾`}</button>`;
  if (aberto) {
    html += `<div class="cd-corpo">${await linhaPessoa(pe, false)}`;
    if (dele.length) html += `<p class="cd-rot">O que ${esc(outro)} pediu</p>${dele.map((m) => missaoDele(m, reacoes.get(m.id))).join('')}`;
    if (minhas.length) html += `<p class="cd-rot">Suas bolas</p>${minhas.map((b) => `<div class="cd-minha"><span>${b.ok ? '✅' : '⏳'}</span><p>${esc(primeiraFrase(b.j.texto, 70))}<small>${esc(ALVOS[b.j.alvo] || '')} · ${b.ok ? `${esc(b.ok.pessoa)} ${ROT_OK[b.ok.acao] || 'respondeu'}` : 'esperando'} · ${D.ha(new Date(b.r.criado).getTime())}</small></p></div>`).join('')}`;
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  ligar(el);
  desenharChip(po, cf.length, praMim.length);
}
function cartaoBola({ r, j }) {
  const ia = j.alvo === 'claude' || j.alvo === 'codex';
  return `<div class="cd-bola" data-bola="${r.id}" style="--cor:${corP(r.pessoa)}">
    <div class="cd-b-cab"><b>${esc(r.pessoa)}</b> ${ia ? `pede para a sua IA <span class="alvo ${j.alvo === 'codex' ? 'gpt' : 'claude'}">${j.alvo === 'codex' ? 'Codex' : 'Claude'}</span>` : 'passou para você'}<small>${D.ha(new Date(r.criado).getTime())}</small></div>
    <p class="cd-b-txt">${esc(j.texto)}</p>${j.ctx ? `<p class="cd-b-ctx">📎 ${esc(j.ctx)}</p>` : ''}
    <button type="button" class="btn forte cd-b-principal" data-bola-acao="ia">▶ Pedir ao ${j.alvo === 'codex' ? 'Codex' : 'Claude'}${ia ? '' : ' (minha IA)'}</button>
    <div class="cd-b-acoes"><button type="button" class="cd-b-sec" data-bola-acao="responder">💬 Responder</button><button type="button" class="cd-b-sec" data-bola-acao="feito">✓ Já resolvi</button><button type="button" class="cd-b-sec" data-bola-acao="dispensou">✕ Dispensar</button></div></div>`;
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

// Chip do outro no topo (no celular é a única presença à vista): ponto de status + ⚠ conflito + 🏀 bolas.
function desenharChip(po, nConf, nBolas) {
  let chip = $('#chipDupla');
  if (!chip) {
    chip = document.createElement('button'); chip.id = 'chipDupla'; chip.type = 'button'; chip.className = 'chip-dupla';
    $('#topo .logo')?.after(chip);
    chip.onclick = () => ctx.abrirAba('dupla');
  }
  const cls = po.pc[0] === 'on' ? 'on' : po.site[0] === 'on' ? 'site' : 'off';
  chip.style.setProperty('--cor', corP(po.p));
  chip.title = `${po.p}: ${po.site[1]} · ${po.pc[1]}${po.projeto ? ' · ' + po.projeto : ''}${po.agora ? ' · ' + po.agora : ''}`;
  ctx.retrato(po.p).then((src) => {
    // Nome + onde ele está (em palavras) + quantos pedidos dele esperam você.
    const onde = po.pc[0] === 'on' ? 'no PC' : po.site[0] === 'on' ? 'no site' : 'fora';
    chip.innerHTML = `<img src="${src}" alt=""><i class="cd-dot ${cls}"></i><span class="cd-txt"><span class="cd-nome">${esc(po.p)}</span><small class="cd-onde">${onde}</small></span>${po.ativa ? '<span class="cd-trab" title="A IA dele está trabalhando">⚙</span>' : ''}${nConf ? `<b class="cd-aviso" title="Conflito">⚠</b>` : ''}${nBolas ? `<b class="cd-n" title="${nBolas} pedido(s) dele esperando você">${nBolas} pedido${nBolas > 1 ? "s" : ""}</b>` : ''}`;
  });
  // Conflito novo: avisa uma vez (toast), sem repetir a cada redesenho.
  for (const c of conflitos()) {
    const k = 'cdConf:' + c.k; if (guardado(k, '')) continue; guarda(k, String(Date.now()));
    ctx.toast({ titulo: 'Combine com o ' + po.p, texto: c.curto || c.texto.replace(/<[^>]+>/g, ''), cor: '#ffd23f', acao: () => ctx.abrirAba('dupla') });
  }
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
    const cf = t.closest('[data-cd-conf]');
    if (cf) { const c = conflitos().find((x) => x.k === cf.dataset.cdConf); if (c) { await enviar(c.recado, 'msg'); ctx.toast({ titulo: 'Avisei o ' + ctx.outra(), cor: '#4fbf82' }); } return; }
    const ab = t.closest('[data-cd-abrir]'); if (ab) return ctx.abrirMissao(ab.dataset.cdAbrir);
    const rg = t.closest('[data-cd-reagir]');
    if (rg) { const id = rg.closest('[data-cd-missao]').dataset.cdMissao, txt = `${rg.dataset.cdReagir} ${id}`, minha = ctx.recados().find((r) => r.cor === 'reacao' && r.pessoa === ctx.eu().pessoa && r.texto === txt); if (minha) await ctx.tirarRecado(minha); else await enviar(txt, 'reacao'); return desenhar(); }
    const ba = t.closest('[data-bola-acao]');
    if (ba) {
      const id = Number(ba.closest('[data-bola]').dataset.bola), b = estadoBolas().find((x) => x.r.id === id); if (!b) return;
      const acao = ba.dataset.bolaAcao;
      if (acao === 'responder') { ctx.abrirAba('dupla'); const tx = $('#textoRecado'); if (tx) { tx.value = `@${b.r.pessoa} `; tx.focus(); } return; }
      if (acao === 'ia') {
        const alvo = b.j.alvo === 'codex' ? 'codex' : 'claude';
        const texto = `${b.j.texto}${b.j.ctx ? `\n\n(Contexto que o ${b.r.pessoa} mandou: ${b.j.ctx})` : ''}`;
        try { await ctx.pedirNaBarra(texto, alvo, { nova: true, projeto: b.j.projeto }); } catch (err) { return ctx.toast({ titulo: 'Não mandei', texto: err.message, cor: '#ef6a55' }); }
      }
      await enviar(JSON.stringify({ id, acao }), 'bola-ok');
      if (acao !== 'ia') ctx.toast({ titulo: acao === 'feito' ? 'Marcado como resolvido' : 'Bola dispensada', texto: `${b.r.pessoa} fica sabendo.`, cor: '#4fbf82' });
      return desenhar();
    }
  });
}
async function enviar(texto, cor) { try { await ctx.mandarRecado(texto, cor); } catch (err) { ctx.toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); throw err; } }

// Contexto automático: projeto, branch, marco e (se veio de uma missão) o que ela mudou.
function contextoAuto(missao) {
  const pe = presenca(ctx.eu().pessoa), partes = [];
  const m = missao || pe.ativa || pe.ultima;
  if (m) partes.push(`missão “${primeiraFrase(m.titulo, 60)}”`);
  if (pe.projeto) partes.push(`projeto ${pe.projeto}`);
  if (pe.branch) partes.push(`branch ${pe.branch}`);
  const mc = (m && ctx.marcoDaMissao(m)) || pe.marco; if (mc) partes.push(`marco ${mc.titulo}`);
  const arqs = m ? arquivosMudados(m) : []; if (arqs.length) partes.push(`mexeu em ${arqs.slice(0, 3).map(nomeArq).join(', ')}`);
  return { texto: partes.join(' · ').slice(0, 160), projeto: m?.projeto || pe.projeto || '' };
}

// Folha "Passar a bola": para quem (ele ou a IA dele), o quê e com qual contexto.
export function abrirBola({ texto = '', missao = null, alvo = 'pessoa' } = {}) {
  const outro = ctx.outra(); if (!outro) return;
  ctx.abrirAba('dupla');
  const auto = contextoAuto(missao);
  if (!folha) { folha = document.createElement('div'); folha.className = 'cd-folha-fundo'; document.body.appendChild(folha); }
  folha.hidden = false;
  folha.innerHTML = `<form class="cd-folha painel-px" autocomplete="off">
    <h3>🏀 Passar a bola para ${esc(outro)}</h3>
    <div class="cd-alvos dois"><label><input type="radio" name="cdQuem" value="pessoa" ${alvo === 'pessoa' ? 'checked' : ''}><span>🙋 Para o ${esc(outro)}</span></label><label><input type="radio" name="cdQuem" value="ia" ${alvo !== 'pessoa' ? 'checked' : ''}><span>🤖 Para a IA dele</span></label></div>
    <div class="cd-alvos dois cd-qual-ia" data-cd-qual><label><input type="radio" name="cdIa" value="claude" ${alvo !== 'codex' ? 'checked' : ''}><span>Claude</span></label><label><input type="radio" name="cdIa" value="codex" ${alvo === 'codex' ? 'checked' : ''}><span>Codex</span></label></div>
    <p class="cd-ajuda" data-cd-ajuda></p>
    <textarea name="texto" rows="3" maxlength="280" placeholder="O que você precisa? (ex.: roda o teste do dash com o meu fix)" required>${esc(texto)}</textarea>
    ${auto.texto ? `<label class="cd-ctx"><input type="checkbox" name="usarCtx" checked><span><b>📎 ${esc(outro)} também vê:</b> ${esc(auto.texto)}</span></label>` : '<input type="checkbox" name="usarCtx" hidden>'}
    <div class="linha"><button type="button" class="btn" data-cd-fechar>Cancelar</button><span class="espaco"></span><button class="btn forte">Passar</button></div></form>`;
  const f = folha.querySelector('form');
  const valor = () => (f.cdQuem.value === 'pessoa' ? 'pessoa' : f.cdIa.value);
  const ajuda = () => { const v = valor(); f.querySelector('[data-cd-qual]').hidden = v === 'pessoa'; f.querySelector('[data-cd-ajuda]').textContent = v === 'pessoa' ? `${outro} recebe um recado com o contexto e responde quando puder.` : `${outro} recebe o pedido pronto e, com um toque, manda para a IA dele (${v === 'codex' ? 'Codex' : 'Claude'}) no PC dele. Ninguém mexe no PC do outro sem ele aceitar.`; };
  ajuda(); f.onchange = ajuda;
  folha.onclick = (e) => { if (e.target === folha || e.target.closest('[data-cd-fechar]')) folha.hidden = true; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const t = f.texto.value.trim(); if (!t) return;
    const j = { para: outro, alvo: valor(), texto: t.slice(0, 280), ctx: f.usarCtx.checked ? auto.texto : '', projeto: auto.projeto.slice(0, 40) };
    try { await enviar(JSON.stringify(j), 'bola'); folha.hidden = true; ctx.toast({ titulo: `🏀 Bola com ${outro}`, texto: 'Ele recebe um aviso; você vê aqui quando ele pegar.', cor: '#4fbf82' }); desenhar(); } catch {}
  };
  setTimeout(() => f.texto.focus(), 30);
}
