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
// "11 tarefas · 3 agentes" · "1 tarefa · 1 agente" · "Nada em andamento". Nome estável: a frente do mapa usa.
export function textoAndamento({ tarefas = 0, agentes = 0 } = {}) {
  const t = Math.max(0, tarefas | 0), a = Math.max(0, agentes | 0);
  if (!t && !a) return 'Nada em andamento';
  return `${um(t, 'tarefa', 'tarefas')} · ${um(a, 'agente', 'agentes')}`;
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
