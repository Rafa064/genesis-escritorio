// Fonte única da contagem "o que espera você" (topo, Hoje e Resumo usam a mesma conta).
// Decisão = cada ação de um pedido de autorização ou cada pergunta da assistente que ainda não tem resposta,
// mais cada agente parado num alerta sem autorização. As do terminal do PC entram também: o agente fica parado
// do mesmo jeito até você responder. Aviso = algo para ver que não é decisão (ex.: o teste da manhã quebrou).
// Sem DOM: dá para testar com node (escritorio/contagem.test.mjs).

// decisoes: [{ pedido: chave do pedido (conversa ou sessão), n: quantas decisões ainda faltam nele }]
export function contarPendencias({ decisoes = [], avisos = 0 } = {}) {
  const ativas = decisoes.filter((d) => d && d.n > 0);
  const n = ativas.reduce((s, d) => s + d.n, 0);
  const pedidos = new Set(ativas.map((d) => String(d.pedido ?? '?'))).size;
  return { decisoes: n, pedidos, avisos: Math.max(0, avisos | 0), total: n + Math.max(0, avisos | 0) };
}

// Junta avisos a uma contagem já feita (o Hoje soma o teste quebrado às decisões do topo, sem mudar o número delas).
export const comAvisos = (c, avisos = 0) => { const a = Math.max(0, avisos | 0); return { ...c, avisos: (c?.avisos || 0) + a, total: (c?.total || 0) + a }; };

const um =(n, s, p) => `${n} ${n === 1 ? s : p}`;
// "5 decisões em 2 pedidos" · "3 decisões em um pedido" · "1 decisão"
export function textoDecisoes(c) {
  if (!c?.decisoes) return 'Nenhuma decisão';
  if (c.decisoes === 1) return '1 decisão';
  return `${c.decisoes} decisões em ${c.pedidos > 1 ? `${c.pedidos} pedidos` : 'um pedido'}`;
}
// Selo do "Precisa de você": "5 decisões · 1 aviso" (decisão e aviso nunca somam no mesmo número).
export function textoPendencias(c) {
  const partes = [];
  if (c?.decisoes) partes.push(um(c.decisoes, 'decisão', 'decisões'));
  if (c?.avisos) partes.push(um(c.avisos, 'aviso', 'avisos'));
  return partes.join(' · ');
}

// Quem espera você NÃO está "em andamento": o agente parado num alerta (autorização ou pergunta) é uma decisão
// sua e aparece só em "Precisa de você". "Fazendo agora" conta só quem continua sozinho.
export const esperaVoce = (estado) => (typeof estado === 'string' ? estado : estado?.status ?? estado?.cls) === 'alerta';
// Separa uma lista em quem continua e quem espera você (ehAlerta diz se o item está parado esperando).
export function separarAndamento(lista = [], ehAlerta = esperaVoce) {
  const andando = [], esperando = [];
  for (const x of lista) (ehAlerta(x) ? esperando : andando).push(x);
  return { andando, esperando };
}

// ---------- Em andamento: UMA definição com unidade explícita (mapa, Hoje e Equipe usam a mesma) ----------
// Tarefa = cada passo ou pedido sendo feito agora (um agente pode tocar mais de um).
// Agente = cada cargo da equipe trabalhando agora. Quem espera você (alerta) ou travou (erro) não entra:
// está em "Precisa de você".
export const trabalhando = (cls) => cls === 'trab' || cls === 'semsinal';
// "11 tarefas · 3 agentes" · "1 tarefa · 1 agente · 1 ferramenta" · "Nada em andamento". Nome estável: a frente do mapa usa.
export function textoAndamento({ tarefas = 0, agentes = 0, ferramentas = 0 } = {}) {
  const t = Math.max(0, tarefas | 0), a = Math.max(0, agentes | 0), f = Math.max(0, ferramentas | 0);
  if (!t && !a) return 'Nada em andamento';
  return `${um(t, 'tarefa', 'tarefas')} · ${um(a, 'agente', 'agentes')}${f ? ` · ${um(f, 'ferramenta', 'ferramentas')}` : ''}`;
}

// ---------- Em andamento POR PEDIDO (Hoje, mapa e Equipe usam a mesma conta) ----------
// Cada pedido aberto traz as etapas sendo feitas agora, com o responsável de cada uma:
//   agente (cargo da equipe ou visitante), ferramenta (Render, Godot, Blender, PixelLab…: um programa, não um agente)
//   ou assistente (a sessão do dev, quando ninguém mais está trabalhando no pedido).
// tarefas = etapas em andamento · agentes = responsáveis DIFERENTES que são agentes · ferramentas = idem, ferramentas.
// Quem espera você (alerta) ou travou (erro) não entra: está em "Precisa de você".
const FERRAMENTAS = new Set(['render', 'godot', 'blender', 'pixellab', 'huggingface', 'hf', 'ffmpeg']);
export const ehFerramenta = (nome, tipo = '') => tipo === 'conector' || FERRAMENTAS.has(String(nome ?? '').toLowerCase());
const responsavelPadrao = (nome, tipo) => ({ id: String(nome), nome: String(nome), tipo: tipo === 'assistente' ? 'assistente' : ehFerramenta(nome, tipo) ? 'ferramenta' : 'agente' });
// missoes: as de dados.js ({ id, pessoa, titulo, status, fim, ultimo, alvo, passos }); escalacao(m) diz quem entrou no pedido.
export function montarAndamento(missoes = [], { escalacao = (m) => m.escalacao || [], responsavel = responsavelPadrao, acao = () => '', agora = Date.now() } = {}) {
  const out = [];
  for (const m of missoes) {
    if (!m || m.fim || !['trab', 'semsinal', 'alerta'].includes(m.status) || agora - (m.ultimo || 0) > 12 * 3600e3) continue;
    const etapas = [], vistos = new Set();
    for (const x of escalacao(m)) {
      if (!['agente', 'programa', 'conector'].includes(x.tipo) || !['trabalhando', 'semsinal'].includes(x.estado) || x.ult?.tipo === 'alerta') continue;
      const r = responsavel(x.nome, x.tipo); if (!r || vistos.has(r.id)) continue;
      vistos.add(r.id);
      etapas.push({ ...r, cls: x.estado === 'semsinal' ? 'semsinal' : 'trab', acao: acao(x) });
    }
    // Ninguém chamado trabalhando: quem toca o pedido é a própria assistente (se não estiver parada esperando você).
    if (!etapas.length && m.status !== 'alerta') {
      const r = responsavel(m.alvo === 'codex' ? 'Codex' : 'Orquestrador', 'assistente');
      if (r) etapas.push({ ...r, cls: m.status, acao: acao({ ult: m.passos?.at(-1) }) });
    }
    if (etapas.length) out.push({ id: m.id, pessoa: m.pessoa, titulo: m.titulo, etapas, t: m.ultimo || 0 });
  }
  return out;
}
export function contarAndamento(pedidos = []) {
  const agentes = new Set(), ferramentas = new Set();
  let tarefas = 0;
  for (const p of pedidos) for (const e of p?.etapas || []) {
    tarefas++;
    if (e.tipo === 'agente') agentes.add(e.id);
    else if (e.tipo === 'ferramenta') ferramentas.add(e.id);
  }
  return { nPedidos: pedidos.length, tarefas, agentes: agentes.size, ferramentas: ferramentas.size };
}

// Os pedidos que esperam você, um por linha: nome do pedido, quantas decisões e a próxima (a primeira que falta).
// decisoes: os mesmos itens de contarPendencias, com { titulo, proxima, quem } (opcionais).
export function listarPedidos(decisoes = []) {
  const por = new Map();
  for (const d of decisoes) {
    if (!d || !(d.n > 0)) continue;
    const k = String(d.pedido ?? '?');
    const p = por.get(k) || { pedido: k, titulo: '', n: 0, proxima: '', quem: '' };
    p.n += d.n;
    if (!p.titulo && d.titulo) p.titulo = d.titulo;
    if (!p.proxima && d.proxima) { p.proxima = d.proxima; p.quem = d.quem || p.quem; }
    if (!p.quem && d.quem) p.quem = d.quem;
    por.set(k, p);
  }
  return [...por.values()];
}
