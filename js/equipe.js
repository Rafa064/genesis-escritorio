// Equipe fixa do escritório: poucos CARGOS, um boneco por cargo, compartilhado pelos dois devs.
// A lista oficial é escritorio/equipe.json; a ponte manda em estado.info.equipe (com as skills que
// existem em cada PC). Sem ponte (ou ponte antiga), vale a cópia abaixo.
// Sub-agente com o nome num "apelido" do cargo = o boneco do cargo trabalha. general-purpose, Explore
// e Plan contam como a assistente de quem pediu. Qualquer outro sub-agente vira visitante.
import { TITULOS } from './config.js';
import { setorPorId } from './frentes.js';
import { trabalhando, textoAndamento } from './contagem.js';

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
// Nome legível de uma skill (o id cru, como "wiki-genesis", só aparece no detalhe).
const NOMES_SKILL = { orquestrar: 'Orquestrar pedidos', 'wiki-genesis': 'Wiki do Genesis', 'kit-de-classe': 'Kit de classe', 'cartas-de-classe': 'Cartas de classe',
  'hud-em-jogo': 'HUD da partida', 'tela-e-momento-maquete': 'Telas no estilo maquete', 'balanceamento-com-bots': 'Balancear com bots', 'idiomas-do-jogo': 'Traduções do jogo',
  'arte-de-menu': 'Arte de menu', 'efeito-em-monstro': 'Efeito em monstro', 'video-do-jogo': 'Vídeo do jogo', 'remotion-best-practices': 'Boas práticas do Remotion',
  'salvar-vitoria': 'Salvar vitória', 'resumo-da-semana': 'Resumo da semana', 'corrigir-bug-com-teste': 'Corrigir bug com teste', 'monstro-novo': 'Monstro novo',
  'thumbnail-do-short': 'Capa do Short', 'pauta-da-semana': 'Pauta da semana' };
export function nomeSkill(id) {
  const s = String(id || '');
  if (NOMES_SKILL[s]) return NOMES_SKILL[s];
  const t = s.split(':').pop().replace(/[-_]+/g, ' ').replace(/\bgenesis\b/gi, 'Genesis').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const frase1 = (s) => { const t = String(s || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/[.\s]*$/, '.') : ''; };
// "Ensinar": o pedido que a assistente recebe para criar a próxima skill do cargo (vai para o editor, não sai sozinho).
export function pedidoEnsinar(c, t) {
  if (!t) return `Proponha a próxima skill da trilha do cargo ${c.nome}: olhe o que ele mais repetiu nos últimos pedidos e o que deu certo, e sugira 1 skill com id, nome e o benefício em uma frase. Depois acrescente em "trilha" do cargo "${c.id}" no escritorio/equipe.json do genesis-estudio. Não crie a skill ainda.`;
  const id = t.nome || t.skill;
  return `Crie a skill \`${id}\` para o cargo ${c.nome} em \`.claude/skills/${id}/SKILL.md\` do genesis-game, seguindo superpowers:writing-skills, a partir do que já funcionou (${t.porque || 'os últimos pedidos desse cargo'}). Depois atualize a trilha dele no escritorio/equipe.json do genesis-estudio (tire "${id}" de "trilha" e ponha em "skills" do cargo "${c.id}").`;
}
// Filtro do painel: muda na hora (só CSS, pelo data-filtro) e o próximo desenho já sai com ele.
let filtroCargos = 'todos';
const VAZIO = { vivo: 'Ninguém trabalhando agora.', precisa: 'Ninguém precisa de você agora.' };
const precisa = (e) => ['alerta', 'erro'].includes(e?.st?.cls);
// "Trabalhando" = a mesma definição de "agentes" do mapa e do Hoje (contagem.js): quem espera você não entra.
const anda = (e) => !!e?.vivo && trabalhando(e.st?.cls);
if (typeof document !== 'undefined') document.addEventListener('change', (ev) => {
  const r = ev.target; if (r?.name !== 'cgFiltro') return;
  filtroCargos = r.value;
  const l = r.closest('.cg-lista'); if (!l) return;
  l.dataset.filtro = filtroCargos;
  for (const lb of l.querySelectorAll('.cg-filtro label')) lb.classList.toggle('on', lb.contains(r));
  const v = l.querySelector('.cg-vazio'); if (v) v.textContent = VAZIO[filtroCargos] || '';
});
// "2 habilidades" (na interface é sempre habilidade; o id técnico da skill só aparece no detalhe).
export const habilidades = (n) => `${n} ${n === 1 ? 'habilidade' : 'habilidades'}`;
// Celular: o cartão é compacto; tocar nele abre o resto (papel, trilha, Ensinar). Guarda quem está aberto entre redesenhos.
const cartoesAbertos = new Set();
// Devolve true se o toque foi tratado aqui (abrir/fechar), para não levar ao mapa.
export function alternarCargo(alvo, celular) {
  const card = alvo?.closest?.('.cg-card'); if (!card || !celular) return false;
  if (alvo.closest('.cg-corpo') && card.classList.contains('aberto')) return true; // toque no meio do aberto não fecha
  const id = card.dataset.cargo, ab = !cartoesAbertos.has(id);
  if (ab) cartoesAbertos.add(id); else cartoesAbertos.delete(id);
  card.classList.toggle('aberto', ab); card.setAttribute('aria-expanded', ab);
  return true;
}
export const abrirCartao = (id) => cartoesAbertos.add(id);
export const proximaDaTrilha = (c) => c.trilha.find((t) => !t.em.length) || null;
// Painel "Equipe": um cartão por cargo; a trilha (nível, próxima habilidade e "Ensinar habilidade") é o centro.
// ctx = { lista, estado(c) -> { st, acao, pessoa } | null, retratoDe, esc, corPessoa, pessoas, andamento: { tarefas, agentes } }
export async function htmlCargos({ lista, estado, retratoDe, esc, corPessoa, pessoas, andamento = null }) {
  const chip = (s) => {
    const tem = s.em.length > 0, dica = !s.sabido ? 'nenhum PC informou ainda (ponte desligada ou antiga)' : tem ? `instalada no PC de ${s.em.join(' e ')}` : 'ainda não existe em nenhum PC';
    return `<span class="cg-skill ${tem ? 'tem' : s.sabido ? 'falta' : ''}" title="${esc(dica)}">${tem ? '✓' : '○'} ${esc(nomeSkill(s.nome))} <code>${esc(s.nome)}</code></span>`;
  };
  const vivos = lista.filter((c) => anda(estado(c))).length;
  const totSk = lista.reduce((n, c) => n + c.skills.length, 0), temSk = lista.reduce((n, c) => n + c.skills.filter((s) => s.em.length).length, 0);
  const algumSabido = lista.some((c) => c.skills.some((s) => s.sabido));
  const cartao = async (c) => {
    const e = estado(c), set = setorPorId(c.setor);
    // Nível = habilidades dele que existem (sem nenhum PC informando, conta as da lista). A barra vai até o fim da trilha.
    const nivel = algumSabido ? c.skills.filter((s) => s.em.length).length : c.skills.length;
    const prox = proximaDaTrilha(c), total = Math.max(nivel, c.skills.length) + c.trilha.filter((t) => !t.em.length).length;
    const pct = total ? Math.round((nivel / total) * 100) : 100;
    // Estado numa linha (sem a ação); embaixo, "Agora: o que está fazendo", inteiro, em até 2 linhas (também no celular fechado).
    const est = e?.vivo ? e.st.rot : e?.st.cls === 'fim' ? 'entregou · agora na copa' : 'livre · na copa';
    const fazendo = e?.vivo ? e.acao || (precisa(e) ? 'Esperando você para seguir' : 'Começando um pedido') : '';
    const acao = fazendo ? `<p class="cg-acao" title="${esc(fazendo)}"><b>Agora:</b> ${esc(fazendo)}${e.pessoa ? ` <span>· para ${esc(e.pessoa)}</span>` : ''}</p>` : '';
    const rotina = c.rotinas[0], aberto = cartoesAbertos.has(c.id);
    const rotinas = c.rotinas.map((r) => `<li>${esc(quandoRotina(r.quando))}: ${esc(r.o_que)}</li>`).join('');
    return `<article class="cg-card${anda(e) ? ' vivo' : ''}${precisa(e) ? ' precisa' : ''}${aberto ? ' aberto' : ''}" data-cargo="${esc(c.id)}" tabindex="0" style="--cor:${set.cor}" title="Ver no mapa" aria-expanded="${aberto}">
      <header class="cg-cab"><img src="${await retratoDe(c.id)}" alt="">
        <div class="cg-txt"><b class="cg-nm">${esc(c.nome)}</b>
          <div class="cg-est" style="--cor:${e?.st.cor || '#7d7590'}"><i>${e?.st.glifo || 'z'}</i><span>${esc(est)}</span></div></div><i class="cg-abre" aria-hidden="true">▾</i></header>
      ${acao}
      <p class="cg-sabe"><b>${habilidades(nivel)}</b> · ${prox ? `falta 1 para o nível ${nivel + 1}` : `nível ${nivel}, trilha completa`}</p>
      <div class="cg-corpo">
      <p class="cg-papel">${esc(c.papel || '')}</p>
      ${rotina ? `<p class="cg-rotina">⏰ Sozinho, ${esc(quandoRotina(rotina.quando))}: ${esc(String(rotina.o_que).replace(/\s*\(.*\)\s*$/, '').split(':')[0])}</p>` : ''}
      <div class="cg-trilha">
        <div class="cg-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${nivel}" aria-label="Trilha de ${esc(c.nome)}: ${nivel} de ${total} habilidades"><i style="width:${pct}%"></i></div>
        ${prox ? `<div class="cg-prox"><small>Próxima habilidade</small><p>${esc(frase1(prox.porque))}</p></div><button type="button" class="btn forte cg-ensinar" data-ensinar="${esc(c.id)}" title="Prepara o pedido para a assistente criar esta habilidade. Nada é enviado antes de você revisar.">Ensinar habilidade: ${esc(nomeSkill(prox.nome))}</button>`
          : `<div class="cg-prox fim"><small>Próxima habilidade</small><p>Trilha completa por enquanto.</p></div><button type="button" class="btn cg-ensinar" data-ensinar="${esc(c.id)}" title="Prepara um pedido para a assistente propor a próxima habilidade deste cargo">Sugerir a próxima habilidade</button>`}
      </div>
      <button type="button" class="btn cg-mapa" data-cargo-mapa="${esc(c.id)}">Ver no mapa</button>
      <details class="cg-det"><summary>${c.skills.length ? 'Ver as habilidades e detalhes' : 'Nenhuma habilidade ainda · detalhes'}</summary>
        <p class="cg-ficha cg-papel-todo">${esc(c.papel || '')}</p>
        ${rotinas ? `<ul class="cg-ficha cg-rotinas">${rotinas}</ul>` : ''}
        ${c.skills.length ? `<div class="cg-chips">${c.skills.map(chip).join('')}</div>` : ''}
        ${prox ? `<p class="cg-ficha">Próxima: <code>${esc(prox.nome)}</code></p>` : ''}
        ${c.apelidos.length ? `<p class="cg-ficha">Também atende por ${c.apelidos.map((a) => `<code>${esc(a.nome)}</code>`).join(' ')}</p>` : ''}
        ${c.modelo ? `<p class="cg-ficha">Modelo: ${esc(MODELOS[baixo(c.modelo)] || c.modelo)}</p>` : ''}
      </details>
      </div>
    </article>`;
  };
  const grupos = ['criacao', 'marketing'].map((s) => [setorPorId(s), lista.filter((c) => (c.setor || 'criacao') === s)]).filter(([, l]) => l.length);
  const nPrecisa = lista.filter((c) => precisa(estado(c))).length;
  const and = andamento || { tarefas: vivos, agentes: vivos };
  const resumo = `<b>${lista.length} cargos</b>, um boneco cada, dos dois devs${and.tarefas || and.agentes ? ` · em andamento: <b>${textoAndamento(and)}</b>` : ' · todos livres'}${algumSabido ? ` · ${temSk} de ${totSk} habilidades instaladas` : ''} · <b>Ensinar habilidade</b> sobe o cargo de nível`;
  // Filtro (Todos / Trabalhando / Precisam de você) e a frase de resumo atrás do "i" (no celular).
  const filtros = [['todos', 'Todos', lista.length], ['vivo', 'Trabalhando', vivos], ['precisa', 'Precisam de você', nPrecisa]];
  let html = `<div class="cg-lista" data-filtro="${filtroCargos}"><div class="cg-topo"><div class="cg-filtro" role="radiogroup" aria-label="Mostrar">${filtros.map(([id, t, n]) => `<label class="${id === filtroCargos ? 'on' : ''}${id === 'precisa' && n ? ' alerta' : ''}"><input type="radio" name="cgFiltro" value="${id}"${id === filtroCargos ? ' checked' : ''}>${t} <small>${n}</small></label>`).join('')}</div>
    <details class="cg-info"><summary title="Sobre esta tela" aria-label="Sobre esta tela">i</summary><p class="eq-resumo">${resumo}</p></details></div>
    <p class="eq-resumo cg-resumo-pc">${resumo}</p>
    <p class="cg-vazio">${VAZIO[filtroCargos] || ''}</p>`;
  for (const [set, l] of grupos) html += `<section class="eq-sec cg-sec" style="--cor:${set.cor}"><h3>${set.icone} ${esc(set.nome)} <small>${l.length} ${l.length === 1 ? 'cargo' : 'cargos'}</small></h3><div class="cg-grade">${(await Promise.all(l.map(cartao))).join('')}</div></section>`;
  html += '</div>';
  const assist = await retratoDe('Orquestrador');
  html += `<section class="eq-sec cg-sec cg-extra"><h3>Também no escritório</h3><div class="cg-mais">
    <div class="cg-mini"><img src="${assist}" alt=""><div><b>Assistente de cada dev</b>${pessoas().map((p) => ` <span class="eq-dono" style="--cor:${corPessoa(p)}">${esc(p)}</span>`).join('')}<p>É a sessão do Claude de cada um, na recepção da sala. Quando ela chama <code>general-purpose</code>, <code>Explore</code> ou <code>Plan</code>, quem trabalha é ela mesma.</p></div></div>
    <div class="cg-mini"><span class="cg-ic">🧳</span><div><b>Visitantes</b><p>Sub-agente de fora da equipe aparece numa mesa só enquanto trabalha e vai embora quando entrega.</p></div></div>
    <div class="cg-mini"><span class="cg-ic">🛠️</span><div><b>Ferramentas</b><p>PixelLab, Blender, Render e Godot não são bonecos: voam até a mesa de quem está usando.</p></div></div>
  </div></section>`;
  return html;
}
