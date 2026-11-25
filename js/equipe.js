// Equipe fixa do escritório: poucos CARGOS, um boneco por cargo, compartilhado pelos dois devs.
// A lista oficial é escritorio/equipe.json; a ponte manda em estado.info.equipe (com as skills que
// existem em cada PC). Sem ponte (ou ponte antiga), vale a cópia abaixo.
// Sub-agente com o nome num "apelido" do cargo = o boneco do cargo trabalha. general-purpose, Explore
// e Plan contam como a assistente de quem pediu. Qualquer outro sub-agente vira visitante.
import { TITULOS } from './config.js';
import { setorPorId } from './frentes.js';

export const CARGOS_PADRAO = [
  { id: 'gerente', nome: 'Gerente do estúdio', setor: 'criacao', modelo: 'haiku', apelidos: [], skills: ['orquestrar', 'wiki-genesis'],
    papel: 'Planeja o dia: lê o quadro, os commits e as pendências e sugere as tarefas do dia, com o pedido pronto para mandar.',
    trilha: [{ skill: 'resumo-da-semana', porque: 'fechar a semana com o que saiu, o que travou e o custo de IA' }],
    rotinas: [{ id: 'sugestoes-do-dia', quando: 'diaria 08:00', o_que: 'Sugestões do dia: 3 a 5 pedidos prontos + ideias de melhoria' }] },
  { id: 'programador', nome: 'Programador Godot', setor: 'criacao', modelo: 'sonnet', apelidos: ['explorador', 'revisor-godot', 'balanceador'],
    skills: ['kit-de-classe', 'cartas-de-classe', 'hud-em-jogo', 'tela-e-momento-maquete', 'balanceamento-com-bots', 'idiomas-do-jogo'],
    papel: 'Escreve e revisa o código do jogo (GDScript), acha onde as coisas estão, balanceia os números de data/ com os bots e roda os testes.',
    trilha: [{ skill: 'corrigir-bug-com-teste', porque: 'receita: reproduzir no teste automático, corrigir, provar com ALL OK' }],
    rotinas: [{ id: 'teste-da-manha', quando: 'diaria 07:30', o_que: 'Roda o teste automático do Genesis na main e avisa só se quebrou' }] },
  { id: 'artista', nome: 'Artista', setor: 'criacao', modelo: 'sonnet', apelidos: ['artista-3d'], skills: ['arte-de-menu', 'efeito-em-monstro'],
    papel: 'Arte do jogo: modelos 3D (Tripo + Blender), arte pintada dos menus, efeitos visuais e pixel art (PixelLab, sempre perguntando antes de gastar créditos).',
    trilha: [{ skill: 'monstro-novo', porque: 'do desenho no ChatGPT até o monstro andando no jogo, num passo a passo só' }], rotinas: [] },
  { id: 'editor', nome: 'Editor de vídeo', setor: 'marketing', modelo: 'sonnet', apelidos: ['editor-de-video', 'mixador-de-audio'], skills: ['video-do-jogo', 'remotion-best-practices'],
    papel: 'Monta trailers, devlogs e Shorts no Remotion com gameplay gravado, cuida do som (narração, música, mixagem) e entrega o vídeo pronto para nota.',
    trilha: [{ skill: 'thumbnail-do-short', porque: 'capa padrão dos Shorts que mais deram clique' }], rotinas: [] },
  { id: 'estrategista', nome: 'Estrategista de conteúdo', setor: 'marketing', modelo: 'haiku', apelidos: ['criador-de-conteudo'], skills: [],
    papel: 'Decide o que postar: olha os números do canal e o que estourou no nicho e sugere os próximos posts (tema, título, gancho, capa).',
    trilha: [{ skill: 'pauta-da-semana', porque: 'transformar as ideias do dia num calendário de posts' }],
    rotinas: [{ id: 'ideias-de-posts', quando: 'diaria 08:30', o_que: 'Lê os números públicos do canal e sugere 3 próximos posts com título, gancho e por quê' }] },
  { id: 'critico', nome: 'Crítico', setor: 'criacao', modelo: 'sonnet', apelidos: ['critico', 'Codex'], skills: ['salvar-vitoria'],
    papel: 'Dá nota de 0 a 10 a vídeo, arte ou tela antes de mostrar ao dev, com 2 a 4 problemas concretos (usa o Codex).', trilha: [], rotinas: [] },
];

const baixo = (s) => String(s ?? '').toLowerCase();
const DA_ASSISTENTE = new Set(['general-purpose', 'explore', 'plan', 'claude', 'orquestrador']);
export const daAssistente = (nome) => DA_ASSISTENTE.has(baixo(nome));
const nomeDe = (x) => (typeof x === 'string' ? x : x?.nome || x?.skill || '');

// Lista de cargos para a tela: a da ponte (a minha primeiro) ou a padrão. Cada skill/apelido diz em
// quais PCs existe (em: ['Rafael', …]) e se algum PC já informou (sabido).
let cache = { k: '', lista: CARGOS_PADRAO };
export function cargos(estados, eu) {
  const listas = [...(estados?.entries?.() || [])].sort(([a], [b]) => (b === eu) - (a === eu)).map(([p, st]) => [p, st?.info?.equipe]).filter(([, l]) => Array.isArray(l) && l.length);
  // chamado muitas vezes por segundo: só refaz quando chega uma lista nova da ponte (outro objeto)
  if (cache.refs && cache.refs.length === listas.length && cache.refs.every(([p, l], i) => listas[i][0] === p && listas[i][1] === l)) return cache.lista;
  const k = JSON.stringify(listas);
  if (k === cache.k) { cache.refs = listas; return cache.lista; }
  const base = listas[0]?.[1] || CARGOS_PADRAO;
  const marcar = (lista, campo, c) => lista.map((x) => {
    const nome = nomeDe(x), em = [];
    let sabido = false;
    for (const [p, l] of listas) {
      const y = (l.find((o) => o.id === c.id)?.[campo] || []).find((o) => baixo(nomeDe(o)) === baixo(nome));
      if (y && typeof y === 'object' && y.existe !== undefined) { sabido = true; if (y.existe) em.push(p); }
    }
    return { ...(typeof x === 'object' ? x : {}), nome, em, sabido };
  });
  const lista = base.filter((c) => c?.id).map((c) => ({
    ...c, curto: String(c.nome || c.id).split(' ')[0],
    skills: marcar(c.skills || [], 'skills', c), apelidos: marcar(c.apelidos || [], 'apelidos', c), trilha: marcar(c.trilha || [], 'trilha', c), rotinas: c.rotinas || [],
  }));
  for (const c of lista) TITULOS[c.id] = c.nome; // tituloDe('programador') = 'Programador Godot'
  cache = { k, lista, refs: listas };
  return lista;
}
// Cargo de um agente (pelo id do cargo ou por um dos apelidos). null = não é da equipe.
export function cargoDe(nome, lista = cache.lista) {
  const n = baixo(nome); if (!n) return null;
  return lista.find((c) => baixo(c.id) === n || (c.apelidos || []).some((a) => baixo(nomeDe(a)) === n)) || null;
}
// Para o modo ?demo: a equipe como a ponte mandaria, com as skills marcadas por um catálogo de exemplo.
export function equipeDemo(skillsDoPc = []) {
  const tem = new Set(skillsDoPc.map(baixo));
  return CARGOS_PADRAO.map((c) => ({ ...c, apelidos: c.apelidos.map((nome) => ({ nome, existe: nome === 'Codex' ? undefined : true })),
    skills: c.skills.map((nome) => ({ nome, existe: tem.has(nome) })), trilha: c.trilha.map((t) => ({ ...t, existe: tem.has(t.skill) })) }));
}

const MODELOS = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', fable: 'Fable' };
const quandoRotina = (q) => String(q || '').replace(/^diaria\s*/i, 'todo dia às ').replace(/^semanal\s*/i, 'toda semana ');
// Painel "Equipe": um cartão por cargo. ctx = { lista, estado(c) -> { st, acao, pessoa } | null, retratoDe, esc, corPessoa, pessoas }
export async function htmlCargos({ lista, estado, retratoDe, esc, corPessoa, pessoas }) {
  const chip = (s, extra = '') => {
    const tem = s.em.length > 0, dica = !s.sabido ? 'nenhum PC informou ainda (ponte desligada ou antiga)' : tem ? `instalada no PC de ${s.em.join(' e ')}` : 'ainda não existe em nenhum PC';
    return `<span class="cg-skill ${tem ? 'tem' : s.sabido ? 'falta' : ''} ${extra}" title="${esc(dica)}">${tem ? '✓' : '○'} ${esc(s.nome)}</span>`;
  };
  const vivos = lista.filter((c) => estado(c)?.vivo).length;
  const totSk = lista.reduce((n, c) => n + c.skills.length, 0), temSk = lista.reduce((n, c) => n + c.skills.filter((s) => s.em.length).length, 0);
  const algumSabido = lista.some((c) => c.skills.some((s) => s.sabido));
  const cartao = async (c) => {
    const e = estado(c), set = setorPorId(c.setor), nivel = c.skills.filter((s) => s.em.length).length;
    return `<article class="cg-card ${e?.vivo ? 'vivo' : ''}" data-cargo="${esc(c.id)}" tabindex="0" style="--cor:${set.cor}" title="Ver no mapa">
      <img src="${await retratoDe(c.id)}" alt="">
      <div class="cg-txt">
        <div class="cg-nome"><b>${esc(c.nome)}</b>${c.modelo ? `<span class="modelo claude">${esc(MODELOS[baixo(c.modelo)] || c.modelo)}</span>` : ''}<span class="cg-setor">${set.icone} ${esc(set.nome)}</span>${algumSabido ? `<span class="cg-nivel" title="Nível = quantas skills dele existem">nível ${nivel}</span>` : ''}</div>
        <div class="cg-est" style="--cor:${e?.st.cor || '#7d7590'}"><i>${e?.st.glifo || 'z'}</i>${esc(e?.vivo ? `${e.st.rot}${e.pessoa ? ' · para ' + e.pessoa : ''}` : e?.st.cls === 'fim' ? 'entregou · agora na copa' : 'livre · na copa')}${e?.acao ? ` <span>${esc(e.acao)}</span>` : ''}</div>
        <p class="cg-papel">${esc(c.papel || '')}</p>
        <div class="cg-linha"><span class="cg-rot">Skills</span><div>${c.skills.length ? c.skills.map((s) => chip(s)).join('') : '<i class="cg-nada">nenhuma ainda</i>'}</div></div>
        ${c.trilha.length ? `<div class="cg-linha"><span class="cg-rot">Próxima</span><div>${c.trilha.map((t) => `${chip(t, 'trilha')}<span class="cg-pq">${esc(t.porque || '')}</span>`).join('')}</div></div>` : ''}
        ${c.apelidos.length ? `<div class="cg-linha"><span class="cg-rot">Também atende por</span><div>${c.apelidos.map((a) => `<code class="cg-apelido">${esc(a.nome)}</code>`).join('')}</div></div>` : ''}
        ${c.rotinas.length ? `<div class="cg-linha"><span class="cg-rot">Faz sozinho</span><div>${c.rotinas.map((r) => `<span class="cg-rotina">⏰ ${esc(quandoRotina(r.quando))}: ${esc(r.o_que)}</span>`).join('')}</div></div>` : ''}
      </div></article>`;
  };
  const grupos = ['criacao', 'marketing'].map((s) => [setorPorId(s), lista.filter((c) => (c.setor || 'criacao') === s)]).filter(([, l]) => l.length);
  let html = `<p class="eq-resumo"><b>${lista.length} cargos</b>, um boneco cada, dos dois devs${vivos ? ` · <b>${vivos} trabalhando agora</b>` : ' · todos livres'}${algumSabido ? ` · ${temSk} de ${totSk} skills instaladas` : ''}</p>`;
  for (const [set, l] of grupos) html += `<section class="eq-sec cg-sec" style="--cor:${set.cor}"><h3>${set.icone} ${esc(set.nome)} <small>${l.length}</small></h3><div class="cg-grade">${(await Promise.all(l.map(cartao))).join('')}</div></section>`;
  const assist = await retratoDe('Orquestrador');
  html += `<section class="eq-sec cg-sec cg-extra"><h3>Também no escritório</h3><div class="cg-mais">
    <div class="cg-mini"><img src="${assist}" alt=""><div><b>Assistente de cada dev</b>${pessoas().map((p) => ` <span class="eq-dono" style="--cor:${corPessoa(p)}">${esc(p)}</span>`).join('')}<p>É a sessão do Claude de cada um, na recepção da sala. Quando ela chama <code>general-purpose</code>, <code>Explore</code> ou <code>Plan</code>, quem trabalha é ela mesma.</p></div></div>
    <div class="cg-mini"><span class="cg-ic">🧳</span><div><b>Visitantes</b><p>Sub-agente de fora da equipe aparece numa mesa só enquanto trabalha e vai embora quando entrega.</p></div></div>
    <div class="cg-mini"><span class="cg-ic">🛠️</span><div><b>Ferramentas</b><p>PixelLab, Blender, Render e Godot não são bonecos: voam até a mesa de quem está usando.</p></div></div>
  </div></section>`;
  return html;
}
