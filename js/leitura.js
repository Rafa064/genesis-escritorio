// Rodada 4 (leitura): ajudas pequenas para as telas que não são o mapa (Atividade, Hoje, Equipe, Quadro, Mais, fichas).
//  - plural de verdade ("1 pedido", "3 pedidos") no lugar de "missão(ões)" e "arquivo(s)";
//  - nome de projeto para leigo ("genesis-game" vira "Genesis");
//  - ícones pixel 16x16 (mesmo traço de comando-icones.js) no lugar dos emojis das listas.
// Carregado também como módulo solto pelo index.html: aí só troca rótulos fixos da casca da gaveta.
import { ico } from './comando-icones.js';

// "1 pedido" / "3 pedidos". muitos: forma plural (padrão: um + "s").
export const plural = (n, um, muitos = um + 's') => `${n} ${n === 1 ? um : muitos}`;

// Nome de projeto que uma pessoa leiga reconhece. Os nomes de pasta ficam nos detalhes técnicos.
const PROJETOS = { 'genesis-game': 'Genesis', 'genesis-estudio': 'Estúdio', 'genesis-videos': 'Vídeos do Genesis', cook: 'Cook', 'cook-game': 'Cook' };
export function nomeProjeto(p) {
  const s = String(p || '').trim(); if (!s) return '';
  if (PROJETOS[s.toLowerCase()]) return PROJETOS[s.toLowerCase()];
  const limpo = s.replace(/[-_](game|jogo|app|site)$/i, '').replace(/[-_]+/g, ' ');
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

// Ícones pixel extras (16x16, preenchidos com a cor do texto).
const EXTRA = {
  livro: 'M2 2h5v1h2V2h5v12H9v1H7v-1H2zM3 3v10h4V4H6V3zM9 4v9h4V3h-3v1z',
  cadeado: 'M5 1h6v1h1v4h1v9H3V6h1V2h1zM6 3v3h4V3zM7 9v3h2V9z',
  xis: 'M2 2h3v1h1v1h1v1h2V4h1V3h1V2h3v3h-1v1h-1v1h-1v2h1v1h1v1h1v3h-3v-1h-1v-1H9v-1H7v1H6v1H5v1H2v-3h1v-1h1V9h1V7H4V6H3V5H2z',
  relogio: 'M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2zM5 3v1H4v1H3v6h1v1h1v1h6v-1h1v-1h1V5h-1V4h-1V3zM7 4h2v4h3v2H7z',
  moeda: 'M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2zM7 3v1H5v4h4v2H5v2h2v1h2v-1h2V8H7V6h4V4H9V3z',
  lista: 'M2 2h12v12H2zM3 3v10h10V3zM4 4h2v2H4zM7 4h5v2H7zM4 7h2v2H4zM7 7h5v2H7zM4 10h2v2H4zM7 10h5v2H7z',
  robo: 'M7 0h2v2h4v1h1v4h1v3h-1v3h-1v1H3v-1H2v-3H1V7h1V3h1V2h4zM4 5v3h3V5zM9 5v3h3V5zM5 10v2h6v-2z',
  tomada: 'M5 1h2v4h2V1h2v4h2v4h-1v2h-1v1H9v3H7v-3H5v-1H4V9H3V5h2z',
  play: 'M4 2h2v1h2v1h2v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H8v1H6v1H4z',
  pino: 'M5 1h6v1h1v1h-1v4h1v1h1v2H9v5H7v-5H3V8h1V7h1V3H4V2h1z',
  olho: 'M5 4h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V7h1V6h1V5h2zM6 6v4h4V6zM7 7h2v2H7z',
  controle: 'M3 4h10v1h1v1h1v5h-1v1h-3v-1H5v1H2v-1H1V6h1V5h1zM4 6v1H3v1h1v1h1V8h1V7H5V6zM10 6v2h2V6zM11 8v2h2V8z',
  panela: 'M4 3h8v2h3v1h-3v6h-1v1H5v-1H4V6H1V5h3zM5 6v5h6V6z',
  predio: 'M3 1h10v14H9v-3H7v3H3zM5 3v2h2V3zM9 3v2h2V3zM5 7v2h2V7zM9 7v2h2V7z',
  megafone: 'M12 2h2v12h-2v-1h-1v-1H9v-1H6v3H4v-3H2V6h7V5h2V4h1z',
  ferramenta: 'M10 1h4v1h1v4h-2V4h-1v1h-1v2h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H2v-2h1v-1h1v-1h1V9h1V8h1V7h1V6h1V3h1V2h-1z',
  pastinha: 'M1 3h6v1h1v1h7v9H1zM2 6v7h12V6z',
};
export function icoPx(nome, cls = '') {
  if (!EXTRA[nome]) return ico(nome, cls);
  return `<svg class="pxi ${cls}" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="${EXTRA[nome]}"/></svg>`;
}
// Emoji das listas antigas -> ícone pixel.
const DE_EMOJI = { '📖': 'livro', '✏️': 'lapis', '🤖': 'robo', '📘': 'livro', '▶️': 'play', '🔌': 'tomada', '🌐': 'globo', '⚠️': 'alerta', '❌': 'xis',
  '🔐': 'cadeado', '⚙️': 'engrenagem', '✅': 'check', '💡': 'sol', '📋': 'lista', '🪙': 'moeda', '⏱': 'relogio', '📌': 'pino', '👀': 'olho',
  '🎮': 'controle', '🍳': 'panela', '🏢': 'predio', '🛠️': 'ferramenta', '📣': 'megafone', '📁': 'pastinha' };
export const icoDeEmoji = (e) => (DE_EMOJI[e] ? icoPx(DE_EMOJI[e], 'ic-lista') : e);

// Estado de um pedido em palavras de gente, o mesmo selo na lista e na ficha.
const SELO = { trab: ['andamento', 'Em andamento'], semsinal: ['andamento', 'Em andamento'], alerta: ['voce', 'Aguarda você'], espera: ['voce', 'Aguarda você'], fim: ['entregue', 'Entregue'], erro: ['erro', 'Deu erro'], planejado: ['fila', 'Na fila'], livre: ['entregue', 'Entregue'] };
export const seloEstado = (status) => { const [c, t] = SELO[status] || SELO.espera; return `<span class="st-selo ${c}">${t}</span>`; };

// Rótulos fixos da gaveta (index.html): "Missões" vira "Pedidos", o nome que o resto do app usa.
function trocarRotulos() {
  const b = document.querySelector('#segAtividade [data-seg="missoes"]'); if (b && b.textContent.trim() === 'Missões') b.textContent = 'Por frente';
  const busca = document.getElementById('buscaMissoes'); if (busca) busca.placeholder = 'Buscar um pedido…';
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trocarRotulos); else trocarRotulos(); }
