// O estado de um pedido no chat, numa função só (aba, seletor do celular, cartão do pedido e chip do mapa).
// Prioridade: precisa de você > fazendo > pronto. A etapa ("Etapa 3 de 4") é linha secundária, à parte.
// Sem dependências: usado pelo site e pelo teste do Node (escritorio/estado-pedido.test.mjs).
// nDec: decisões que faltam neste pedido · soPerguntas: todas são perguntas da assistente.

export const decisoes = (n) => `${n} ${n === 1 ? 'decisão' : 'decisões'}`;
// A contagem única do chat no celular (cabeçalho): "4 decisões pendentes" / "1 decisão pendente".
export const pendentes = (n) => `${decisoes(n)} ${n === 1 ? 'pendente' : 'pendentes'}`;
// Contagem NESTE pedido, sempre com unidade: "4 decisões neste pedido" ou "faltam 3 de 4 decisões".
export const contaDecisoes = (falta, total = falta) => (total > falta ? `faltam ${falta} de ${decisoes(total)}` : `${decisoes(falta)} neste pedido`);

export function estadoPedido({ nDec = 0, soPerguntas = false, rodando = false, pronto = false } = {}) {
  if (nDec > 0) return { k: 'voce', ic: '✋', txt: soPerguntas ? 'Aguardando suas respostas' : nDec > 1 ? 'Aguardando suas decisões' : 'Aguardando sua decisão' };
  if (rodando) return { k: 'fazendo', ic: '⏳', txt: 'Fazendo' };
  if (pronto) return { k: 'pronto', ic: '✅', txt: 'Pronto' };
  return null;
}
