// Frentes de trabalho: os grandes blocos onde cada pedido (missão) se encaixa.
// A classificação é automática: pela pasta do projeto, por quem trabalhou e pelas palavras do pedido.
// Projeto desconhecido vira uma frente própria com o nome da pasta (assim o jogo novo do Kenny aparece sozinho).

export const FRENTES = [
  { id: 'genesis', nome: 'Genesis', icone: '🎮', cor: '#4fbf82', descricao: 'O jogo: código, arte, balanceamento, testes' },
  { id: 'videos', nome: 'Vídeos do Genesis', icone: '🎬', cor: '#ef6a55', descricao: 'Trailers, Shorts, YouTube, roteiros e renders' },
  { id: 'novo', nome: 'Jogo novo', icone: '🕹️', cor: '#5aa9e6', descricao: 'O jogo novo do Kenny' },
  { id: 'estudio', nome: 'Estúdio', icone: '🏢', cor: '#a785f0', descricao: 'Este escritório, a ponte e as ferramentas da casa' },
];
// Para dar nome bonito a uma pasta (ex.: { 'meu-jogo': 'novo' } joga a pasta na frente "Jogo novo").
export const PASTAS = {};

const VIDEO_PASTA = /trailer|reel|short|video|vídeo|aviso|teaser|youtube/i;
const VIDEO_AGENTES = new Set(['editor-de-video', 'criador-de-conteudo', 'Render']);
const VIDEO_TEXTO = /\bv[ií]deos?\b|trailer|\bshorts?\b|\breels?\b|youtube|remotion|thumbnail|miniatura do v|roteiro|legenda|render(iza)?|\bcortes?\b|narra[cç][aã]o|tiktok|instagram/i;
const ESTUDIO_TEXTO = /escrit[oó]rio|est[uú]dio genesis|\bponte\b|genesis-estudio|supabase/i;

const auto = new Map();
function frenteDaPasta(nome, pessoa) {
  const id = `pasta:${nome}`;
  if (!auto.has(id)) {
    const bonito = nome.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    auto.set(id, { id, nome: bonito, icone: '📁', cor: '#c9a34a', descricao: `Pasta ${nome}`, auto: true, pessoa });
  }
  return auto.get(id);
}
export const frentePorId = (id) => FRENTES.find((f) => f.id === id) || auto.get(id) || null;
export const todasFrentes = () => [...FRENTES, ...auto.values()];

// m: { projeto, pessoa, pedido, agentes:Set|[] }
export function classificar({ projeto, pessoa, pedido, agentes }) {
  const p = String(projeto || '').toLowerCase();
  const nomes = [...(agentes || [])];
  if (PASTAS[p]) return frentePorId(PASTAS[p]) || FRENTES[0];
  if (p === 'genesis-estudio' || p === 'genesis-escritorio' || ESTUDIO_TEXTO.test(pedido || '')) return FRENTES[3];
  if (VIDEO_PASTA.test(p) || nomes.some((a) => VIDEO_AGENTES.has(a)) || VIDEO_TEXTO.test(pedido || '')) {
    if (!p || p.startsWith('genesis')) return FRENTES[1];
  }
  if (!p || p.startsWith('genesis') || p === 'rafon') return FRENTES[0];
  // Pasta que não é do Genesis: no Kenny, é o jogo novo; nos outros, vira frente própria.
  if (pessoa === 'Kenny') return FRENTES[2];
  return frenteDaPasta(p, pessoa);
}
