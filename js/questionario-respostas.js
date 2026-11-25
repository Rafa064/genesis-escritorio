// Monta as respostas do questionário (ferramenta AskUserQuestion do Claude Code) no formato que ele
// aceita de volta: { "<texto da pergunta>": "<rótulo escolhido ou texto do Outro; vários separados por ', '>" }.
// Sem dependências: usado pelo site (questionario.js) e pelo teste do Node (escritorio/questionario.test.mjs).
// escolhas: { [índice da pergunta]: { opcoes: ['Rótulo', ...], outro: 'texto livre' } }.
export const MAX_RESPOSTA = 1200;

export function respostaDe(p = {}, e = {}) {
  const outro = String(e.outro ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_RESPOSTA);
  const validas = new Set((p.options || []).map((o) => o.label));
  const opcoes = (e.opcoes || []).filter((l) => validas.has(l));
  // Uma escolha só: o Outro (se digitado) vale no lugar da opção.
  if (!p.multiSelect) return outro || opcoes[0] || '';
  // Várias: na ordem em que aparecem na pergunta, e o Outro no fim.
  const ordem = (p.options || []).map((o) => o.label).filter((l) => opcoes.includes(l));
  return [...ordem, ...(outro ? [outro] : [])].join(', ');
}

export function montarRespostas(perguntas = [], escolhas = {}) {
  const r = {};
  perguntas.forEach((p, i) => { const v = respostaDe(p, escolhas[i]); if (v) r[p.question] = v; });
  return r;
}

// Quantas perguntas ainda estão sem resposta (o botão "Responder" só libera com tudo respondido).
export const faltam = (perguntas = [], escolhas = {}) => perguntas.filter((p, i) => !respostaDe(p, escolhas[i])).length;
