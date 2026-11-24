// Painel "Hoje" (Mais › Hoje, ou o selo 💡 no mapa): três funções de valor num lugar só.
//   💡 Sugestões: 3 a 5 pedidos prontos que a ponte escreve toda manhã (escritorio/sugestoes.mjs),
//      com "Mandar" (vai pela barra de comando, numa conversa nova) e "Editar antes".
//   📋 Fila do dia: o que cada agente está fazendo agora, o que vem depois e o que já entregou hoje.
//   🪙 Custo e uso: custo/tokens por dia, pessoa, modelo e agente (Claude); pedidos e tempo (Codex).
// Fontes: estado.info.sugestoes e estado.info.uso (a ponte manda), eventos, comandos (só os seus) e o quadro.
import * as D from './dados.js';
import { primeiraFrase, frase } from './humano.js';

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
const TAMANHO = { P: ['P', 'até 15 min'], M: ['M', '15 a 45 min'], G: ['G', 'mais de 45 min'] };

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
  const abas = [['sugestoes', '💡', 'Sugestões'], ['fila', '📋', 'Fila'], ['custo', '🪙', 'Custo']];
  const topo = `<div class="hj-abas" role="tablist">${abas.map(([id, ic, t]) => `<button role="tab" data-hsub="${id}" class="${sub === id ? 'on' : ''}" aria-selected="${sub === id}"><span class="ic">${ic}</span>${t}</button>`).join('')}</div>`;
  let corpo = '';
  try { corpo = sub === 'fila' ? await htmlFila() : sub === 'custo' ? await htmlCusto() : htmlSugestoes(); }
  catch (e) { console.warn('hoje:', e); corpo = `<p class="hj-vazio">Não consegui montar esta parte agora (${ctx.esc(e.message)}).</p>`; }
  el.innerHTML = topo + `<div class="hj-corpo hj-${sub}">${corpo}</div>`;
  el.onclick = clique;
  atualizarSelo();
}

async function clique(e) {
  const t = e.target.closest('[data-hsub],[data-hproj],[data-mandar],[data-editar],[data-cancelar],[data-enviar-ed],[data-gerar],[data-expandir],[data-pedir-melhoria],[data-ed-alvo]');
  if (!t) return;
  if (t.dataset.hsub) { sub = t.dataset.hsub; guarda('hojeSub', sub); editando = confirmar = null; return desenhar(true); }
  if (t.dataset.hproj !== undefined) { projetoSel = t.dataset.hproj; guarda('hojeProjeto', projetoSel); editando = confirmar = null; return desenhar(true); }
  if (t.dataset.expandir !== undefined) { const alvo = document.getElementById(t.dataset.expandir); const aberto = alvo?.classList.toggle('curto') === false; t.setAttribute('aria-expanded', aberto); t.textContent = aberto ? 'Mostrar menos ▴' : 'Ler pedido completo ▾'; return; }
  if (t.dataset.gerar !== undefined) return gerarDeNovo(t);
  const s = minhasSugestoes(), proj = s && projetoAtual(s);
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

function htmlSugestoes() {
  const { esc } = ctx;
  const s = minhasSugestoes();
  if (!s) return `<div class="hj-vazio"><b>Ainda não tem sugestões hoje.</b><p>Toda manhã (depois das 7h) a sua ponte lê os agentes, as skills, o quadro de marcos, os últimos commits e as pendências e escreve de 3 a 5 pedidos prontos para mandar.</p><button class="btn forte" data-gerar>Gerar agora</button><p class="hj-nota">Precisa da ponte ligada e atualizada.</p></div>`;
  const p = projetoAtual(s);
  const velho = (s.dia || diaDe(s.gerado)) !== diaDe(Date.now());
  const marcos = new Map((ctx.marcos() || []).map((m) => [m.id, m]));
  const projs = s.projetos.length > 1 ? `<div class="hj-chips">${s.projetos.map((x) => `<button data-hproj="${esc(x.projeto)}" class="${x === p ? 'on' : ''}">${esc(x.projeto)} <small>${x.prompts.length}</small></button>`).join('')}</div>` : '';
  const cab = `<div class="hj-cab"><div><b>Para mandar hoje</b><small>${esc(p.projeto)} · ${velho ? 'de ' + new Date(s.gerado).toLocaleDateString('pt-BR', { weekday: 'long' }) : 'escritas às ' + D.hora(new Date(p.gerado || s.gerado).getTime())} · lidas ${p.fontes ? `${p.fontes.skills} skills, ${p.fontes.marcos} marcos, ${p.fontes.commits} commits` : 'do catálogo e do quadro'}</small></div><button class="btn mini" data-gerar title="Pedir à ponte sugestões novas agora">↻ De novo</button></div>`;
  const destino = (x) => `${x.alvo === 'codex' ? '🧠 Codex' : `👑 sua assistente (Claude)${x.agente ? `, que chama o ${esc(ctx.nomeAgente(x.agente))}` : ''}`} · conversa nova · ${esc(p.projeto)}`;
  const editor = (titulo, n, rows, extra = '') => `<article class="hj-sug editando"><header><span class="hj-n">${n}</span><b>${esc(titulo)}</b></header>
      <label class="hj-rot" for="hjEditor">Revise o pedido. Nada é enviado até você tocar em “Enviar pedido”.</label><textarea id="hjEditor" rows="${rows}">${esc(editando.texto)}</textarea>
      <div class="hj-alvo"><span>Vai para</span><button data-ed-alvo="claude" class="${editando.alvo !== 'codex' ? 'on' : ''}">👑 Claude</button><button data-ed-alvo="codex" class="${editando.alvo === 'codex' ? 'on' : ''}">🧠 Codex</button></div>
      <div class="hj-acoes"><button class="btn" data-cancelar${extra}>Cancelar</button><button class="btn forte" data-enviar-ed${extra}>Enviar pedido ▶</button></div></article>`;
  const cartoes = p.prompts.map((x, i) => {
    const enviada = foiEnviada(s, p, x), tam = TAMANHO[x.tamanho] || TAMANHO.M, mc = x.marco && marcos.get(x.marco);
    if (editando && editando.i === i) return editor(x.titulo, i + 1, 8, `="${i}"`);
    const quem = x.agente ? `${esc(ctx.nomeAgente(x.agente))} <small>com ${x.alvo === 'codex' ? 'o Codex' : 'o Claude'}</small>` : x.alvo === 'codex' ? 'Codex <small>(segunda opinião)</small>' : 'Sua assistente <small>(Claude)</small>';
    const detalhes = [`⏱ ${tam[1]}`, (mc || x.marco) && `🏁 ${esc(mc ? primeiraFrase(mc.titulo, 40) : 'marco #' + x.marco)}`].filter(Boolean).join(' · ');
    const conf = confirmar === i;
    return `<article class="hj-sug ${enviada ? 'enviada' : ''} ${conf ? 'confirmando' : ''}" style="--atraso:${i * 60}ms">
      <header><span class="hj-n">${enviada ? '✓' : i + 1}</span><b>${esc(x.titulo)}</b></header>
      <p class="hj-quemfaz"><span>Quem faz:</span> ${quem}</p>
      ${x.por ? `<p class="hj-por">${esc(x.por)}</p>` : ''}
      <p class="hj-det">${detalhes}</p>
      ${conf ? `<div class="hj-conf"><b>Confira antes de enviar</b><p class="hj-texto">${esc(textoParaMandar(x))}</p><small>Vai para: ${destino(x)}${x.skill ? ` · com a receita pronta “${esc(x.skill)}”` : ''}</small></div>
      <div class="hj-acoes"><button class="btn" data-cancelar="${i}">Cancelar</button><button class="btn" data-editar="${i}">✎ Editar</button><button class="btn forte" data-mandar="${i}">Enviar pedido ▶</button></div>`
      : `<p class="hj-texto curto" id="hjTxt${i}">${esc(x.prompt)}</p><button type="button" class="hj-ler" data-expandir="hjTxt${i}" aria-expanded="false" aria-controls="hjTxt${i}">Ler pedido completo ▾</button>
      <div class="hj-acoes">${enviada ? '<span class="hj-ok">Mandado ✓</span>' : ''}<button class="btn" data-editar="${i}">✎ Editar antes</button><button class="btn forte" data-mandar="${i}">${enviada ? 'Mandar de novo' : 'Mandar ▶'}</button></div>`}
    </article>`;
  }).join('');
  const melhorias = (p.melhorias || []).length ? `<h3 class="hj-sec">🛠 Ideias de melhoria</h3>${p.melhorias.map((m, i) => editando && editando.melhoria === i
    ? editor(m.titulo, '★', 5)
    : `<div class="hj-melhoria"><div><b>${esc(m.titulo)}</b><p>${esc(m.texto)}</p></div><button class="btn mini" data-pedir-melhoria="${i}" title="Abre o pedido para você revisar; nada é enviado ainda">Preparar pedido</button></div>`).join('')}` : '';
  return projs + cab + `<div class="hj-lista">${cartoes}</div>` + melhorias + '<p class="hj-nota">Enviar abre uma conversa nova com a sua assistente. As sugestões vêm de um modelo barato (Haiku): confira antes de pedir coisa grande.</p>';
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
  let html = '<p class="hj-intro">O que cada agente está fazendo <b>agora</b>, o que vem <b>depois</b> (fila, escalação e quadro) e quanto já entregou <b>hoje</b>.</p>';
  for (const p of ordem) {
    const linhas = [...(por.get(p)?.values() || [])].filter((l) => l.agora.length || l.depois.length || l.feitos);
    const ag = linhas.reduce((n, l) => n + l.agora.length, 0), dp = linhas.reduce((n, l) => n + l.depois.length, 0), ft = linhas.reduce((n, l) => n + l.feitos, 0);
    html += `<section class="hj-pessoa" style="--cor:${ctx.corPessoa(p)}"><h3><span>${esc(p === eu ? 'Sua equipe' : 'Equipe de ' + p)}</span><small>${ag} trabalhando · ${dp} na fila ou no quadro · ${ft} entregas hoje</small></h3>`;
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
        ${lista(l.depois.filter((x) => x.de !== 'quadro'), 'Na fila', (x) => x.de === 'fila' ? '⏳' : '○', (x) => x.de === 'fila' ? 'pedido seu' : 'chamado na missão')}${lista(l.depois.filter((x) => x.de === 'quadro'), 'No quadro · ainda não pedido', () => '🏁', () => l.nome !== 'Orquestrador' ? 'agente provável' : '', 'sugerido')}
      </div></div>`;
    }
    html += '</section>';
  }
  return html + '<p class="hj-nota">⏳ pedido seu esperando a vez · ○ a assistente já chamou este agente na missão · 🏁 etapa aberta no quadro que ninguém pediu ainda (o agente é um palpite pelas palavras). Os pedidos na fila do outro só ele vê.</p>';
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
      { titulo: 'Teste automático do dash', prompt: 'Escreva o teste automático do dash do player (marco #2): rode o Godot sem tela, faça o player dar dash 20 vezes e confira a invencibilidade curta e que não aparece o erro "Nonexistent function dash in base Nil". Pronto quando o teste passar e estiver no CI local.', alvo: 'claude', agente: 'revisor-godot', skill: '', por: 'O marco do Kenny está atrasado 1 dia e o erro de ontem ainda aparece no log.', tamanho: 'P', marco: 2 },
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
