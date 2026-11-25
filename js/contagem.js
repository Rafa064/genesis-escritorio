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
