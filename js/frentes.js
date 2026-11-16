// Cada trabalho tem um JOGO (Genesis, Cook your way up…) e um SETOR (Criação ou Marketing).
// A classificação é automática: o jogo sai da pasta do projeto; o setor, de quem trabalhou e das palavras do pedido.

export const JOGOS = [
  { id: 'genesis', nome: 'Genesis', icone: '🎮', cor: '#4fbf82' },
  { id: 'cook', nome: 'Cook your way up', curto: 'Cook', icone: '🍳', cor: '#f0b43d' },
  { id: 'estudio', nome: 'Estúdio', icone: '🏢', cor: '#a785f0' },
];
export const SETORES = [
  { id: 'criacao', nome: 'Criação', icone: '🛠️', cor: '#5aa9e6', descricao: 'Concepção, código, arte, desenvolvimento, balanceamento' },
  { id: 'marketing', nome: 'Marketing', icone: '📣', cor: '#ef6a55', descricao: 'Vídeos, trailers, páginas do jogo, anúncios, redes' },
];
// Para amarrar uma pasta a um jogo na mão (ex.: { 'meu-jogo': 'cook' }).
export const PASTAS = {};

const MKT_PASTA = /trailer|reel|short|video|vídeo|aviso|teaser|youtube|marketing|steam-page|pagina|devlog|_video/i;
const MKT_AGENTES = new Set(['editor-de-video', 'criador-de-conteudo', 'Render']);
const MKT_TEXTO = /\bv[ií]deos?\b|devlog|\bvoz\b|narrador|trailer|\bshorts?\b|\breels?\b|youtube|remotion|thumbnail|roteiro|legenda|\bcortes?\b|narra[cç][aã]o|tiktok|instagram|an[uú]ncio|\bads?\b|campanha|p[aá]gina (da steam|do jogo)|steam page|press ?kit|marketing|divulga|post\b|twitter|\bx\.com|newsletter|influenc/i;
const ESTUDIO_TEXTO = /escrit[oó]rio|est[uú]dio genesis|\bponte\b|genesis-estudio|supabase/i;

export const jogoPorId = (id) => JOGOS.find((j) => j.id === id) || auto.get(id) || { id, nome: id, icone: '📁', cor: '#9a90a8' };
export const setorPorId = (id) => SETORES.find((s) => s.id === id) || SETORES[0];
const auto = new Map();
export const todosJogos = () => [...JOGOS, ...auto.values()];

export function jogoDaPasta(projeto, pessoa, texto = '') {
  const p = String(projeto || '').toLowerCase();
  if (PASTAS[p]) return PASTAS[p];
  if (p === 'genesis-estudio' || p === 'genesis-escritorio' || ESTUDIO_TEXTO.test(texto)) return 'estudio';
  if (/cook/.test(p) || /cook your way/i.test(texto)) return 'cook';
  if (!p || p.startsWith('genesis') || p === 'rafon') return 'genesis';
  // Pasta fora do Genesis no PC do Kenny: é o Cook (até alguém dizer outra coisa).
  if (MKT_PASTA.test(p)) return 'genesis'; // pastas de vídeo soltas (ex.: devlog_1mes) são do Genesis
  if (pessoa === 'Kenny') return 'cook';
  const id = `pasta:${p}`;
  if (!auto.has(id)) auto.set(id, { id, nome: p.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), icone: '📁', cor: '#c9a34a', auto: true });
  return id;
}
export function setorDe({ projeto, pasta, pedido, agentes }) {
  const nomes = [...(agentes || [])];
  const sub = String(pasta || '').replace(/\\/g, '/').split('/').slice(-3).join('/'); // só o fim do caminho (ex.: genesis-game/_video/devlog_1mes)
  if (MKT_PASTA.test(String(projeto || '')) || MKT_PASTA.test(sub) || nomes.some((a) => MKT_AGENTES.has(a)) || MKT_TEXTO.test(pedido || '')) return 'marketing';
  return 'criacao';
}

// Frente = jogo + setor. Mantém { id, nome, icone, cor } para o resto da página.
const cacheFrentes = new Map();
export function frente(jogo, setor) {
  const k = `${jogo}:${setor}`;
  if (!cacheFrentes.has(k)) {
    const j = jogoPorId(jogo), s = setorPorId(setor);
    cacheFrentes.set(k, { id: k, jogo, setor, nome: `${j.curto || j.nome} · ${s.nome}`, icone: j.icone, iconeSetor: s.icone, cor: j.cor, corSetor: s.cor, descricao: `${j.nome}: ${s.descricao}` });
  }
  return cacheFrentes.get(k);
}
export function classificar(m) {
  const jogo = jogoDaPasta(m.projeto, m.pessoa, m.pedido);
  return frente(jogo, jogo === 'estudio' ? 'criacao' : setorDe(m));
}
export const frentePorId = (id) => { if (!id) return null; const [j, s] = id.split(':'); return s ? frente(j, s) : null; };
export const FRENTES = JOGOS.flatMap((j) => SETORES.map((s) => frente(j.id, s.id)));
export const todasFrentes = () => [...cacheFrentes.values()];
