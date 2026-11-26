// Modelo e esforço do pedido (Claude ou Codex). A escolha fica guardada neste aparelho, uma para cada IA,
// e vale para todo pedido novo e para as respostas no chat. "Padrão" = o que o Claude Code / Codex já usa.
// Vai para a ponte numa linha escondida no começo do pedido (a conversa mostra só o texto); a ponte tira a linha
// e passa --model/--effort (Claude) ou -m/-c model_reasoning_effort (Codex).
import { ctx, esc, guardado, guarda, lerJson } from './comando-ctx.js';

const CLAUDE = [
  { id: 'fable', nome: 'Fable', sobre: 'o mais capaz' },
  { id: 'opus', nome: 'Opus', sobre: 'código e criação pesados' },
  { id: 'sonnet', nome: 'Sonnet', sobre: 'rápido e bom no dia a dia' },
  { id: 'haiku', nome: 'Haiku', sobre: 'o mais rápido e barato' },
];
const ESF_CLAUDE = ['low', 'medium', 'high', 'xhigh', 'max'];
// Sem a lista da ponte (ponte antiga): só os níveis que todo modelo do Codex aceita.
const ESF_CODEX = ['low', 'medium', 'high', 'xhigh', 'max'];
const NOME_ESF = { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo', ultra: 'Ultra' };

// Modelos do Codex: a ponte lê do Codex instalado no PC (info.ia.codex); sem isso, só o "Padrão".
const modelos = (alvo) => (alvo === 'codex' ? ctx.estado?.(ctx.eu?.()?.pessoa)?.info?.ia?.codex || [] : CLAUDE);
const chave = (alvo) => `ia_${alvo === 'codex' ? 'codex' : 'claude'}`;

export function escolha(alvo) {
  const e = lerJson(guardado(chave(alvo), '{}'));
  const ms = modelos(alvo), m = ms.find((x) => x.id === e.modelo);
  const esfs = esforcos(alvo, m?.id);
  return { modelo: m ? m.id : '', esforco: esfs.includes(e.esforco) ? e.esforco : '' };
}
function esforcos(alvo, modelo) {
  if (alvo !== 'codex') return ESF_CLAUDE;
  const ms = modelos('codex'), m = ms.find((x) => x.id === modelo);
  if (m?.esforcos?.length) return m.esforcos;
  // "Padrão" do Codex: só os níveis que todos os modelos da lista aceitam.
  const listas = ms.map((x) => x.esforcos || []).filter((l) => l.length);
  return listas.length ? ESF_CODEX.filter((n) => listas.every((l) => l.includes(n))) : ESF_CODEX;
}
export function escolher(alvo, mudou) {
  const e = { ...escolha(alvo), ...mudou };
  if (!esforcos(alvo, e.modelo).includes(e.esforco)) e.esforco = '';
  guarda(chave(alvo), JSON.stringify(e));
}

// Linha escondida para a ponte ('' quando está tudo no padrão: a ponte antiga nem percebe).
export function cabecalho(alvo) {
  const e = escolha(alvo);
  if (!e.modelo && !e.esforco) return '';
  return `⟦ia${e.modelo ? ` modelo=${e.modelo}` : ''}${e.esforco ? ` esforco=${e.esforco}` : ''}⟧\n`;
}

// "Opus · alto" (vazio no padrão): para mostrar junto da IA.
export function rotulo(alvo) {
  const e = escolha(alvo), m = modelos(alvo).find((x) => x.id === e.modelo);
  return [m?.nome, e.esforco && NOME_ESF[e.esforco]?.toLowerCase()].filter(Boolean).join(' · ');
}

// Os dois <select> (Modelo e Esforço). linha/rot = classes CSS da linha e do rótulo; curto = textos menores (caixa da conversa).
export function htmlSelects(alvo, { linha = 'bc-op', rot = 'bc-op-rot', curto = false } = {}) {
  const e = escolha(alvo), ms = modelos(alvo);
  const padrao = curto ? 'Padrão' : alvo === 'codex' ? 'Padrão do Codex' : 'Padrão do Claude Code';
  const opM = [`<option value="">${padrao}</option>`, ...ms.map((m) => `<option value="${esc(m.id)}" ${m.id === e.modelo ? 'selected' : ''}>${esc(m.nome)}${m.sobre && !curto ? ` (${esc(m.sobre)})` : ''}</option>`)].join('');
  const opE = [`<option value="">Padrão</option>`, ...esforcos(alvo, e.modelo).map((n) => `<option value="${n}" ${n === e.esforco ? 'selected' : ''}>${NOME_ESF[n] || n}</option>`)].join('');
  return `<label class="${linha}"><span class="${rot}">Modelo</span><select data-ia-modelo="${alvo}" aria-label="Modelo">${opM}</select></label>
    <label class="${linha}"><span class="${rot}">Esforço</span><select data-ia-esforco="${alvo}" aria-label="Esforço">${opE}</select></label>`;
}
// Liga os selects de um painel (uma vez). depois(): redesenhar quem mostra o rótulo.
export function ligar(el, depois) {
  if (!el || el.dataset.iaLigado) return;
  el.dataset.iaLigado = '1';
  el.addEventListener('change', (ev) => {
    const s = ev.target;
    if (s.dataset.iaModelo) escolher(s.dataset.iaModelo, { modelo: s.value });
    else if (s.dataset.iaEsforco) escolher(s.dataset.iaEsforco, { esforco: s.value });
    else return;
    depois?.();
  });
}
