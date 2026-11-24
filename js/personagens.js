// Visual de cada personagem, montado com as peças do guarda-roupa (pagina/arte/personagens).
// Cor: nome de variação do guarda-roupa ("Navy", "White"...) ou "#rrggbb" para tingir.
// Para mudar o visual de alguém, troque as peças aqui (veja os nomes em arte/personagens/<peça>/).
// Agente novo não precisa entrar aqui: a ficha dele (frontmatter) pode apontar um "visual" desta
// lista ou só dar uma "cor"; sem nada, ele ganha um visual pelo nome (visualPeloNome).
import { fichaDe } from './config.js';

export const VISUAL = {
  // Pessoas. Rafael: cabelo claro/branco, roupa preta (os pelos de gato brancos entram em bonecos.js).
  // Kenny: cabelo escuro, camisa amarela, calça marrom "quadrada" e gravata vermelha (bonecos.js) — homenagem ao Bob Esponja.
  Rafael: { olhos: '#3a5a8a', top: ['long_sleeved_shirt', '#26242c'], pants: ['jeans', '#1f1e25'], shoes: ['sneakers', 'Black'], hair: ['short', '#eeeae0'] },
  Kenny: { olhos: '#2b2b33', top: ['tshirt', '#f5d63a'], pants: ['shorts', '#8a5a2a'], shoes: ['sneakers', 'Black'], hair: ['spiky', '#1d1a1a'] },

  // Assistente (orquestradora), na recepção da sala de cada um
  Orquestrador: { olhos: '#5a3a8a', top: ['turtleneck', '#efe6d2'], jacket: ['blazer', '#6c4a8a'], pants: ['skirt', 'Original'], shoes: ['boots', 'Black'], hair: ['long_waves', '#7a3b26'], lanyard: ['lanyard', 'Original'], shades: ['glasses', 'Tortoise'] },

  // Sub-agentes do Claude
  'editor-de-video': { pele: 'Dark', olhos: '#2b1d14', top: ['tshirt', '#2a2a33'], jacket: ['bomber', '#b8332e'], pants: ['jeans', 'Navy'], shoes: ['sneakers', 'White'], hair: ['mop', '#1d1414'] },
  'criador-de-conteudo': { olhos: '#2f7f45', top: ['tank_top', 'Red'], jacket: ['open_shirt', '#f0c23a'], pants: ['shorts', 'Original'], shoes: ['sneakers', 'White'], hair: ['high_ponytail', '#e8c35a'], earrings: ['earrings', 'Silver'] },
  'artista-3d': { pele: 'Tan', olhos: '#2b1d14', top: ['long_sleeved_shirt', '#3aa79a'], pants: ['jeans', 'Original'], shoes: ['boots', 'Original'], hair: ['bob', 'Black'], shades: ['glasses', 'Pink'], earrings: ['earrings', 'Rose gold'] },
  balanceador: { olhos: '#3a5a8a', top: ['long_sleeved_shirt', '#5a9a5a'], jacket: ['long_coat', '#ecebe6'], pants: ['jeans', 'Navy'], shoes: ['boots', 'Black'], hair: ['parted', 'White'], beard: ['stubble', 'Gray'], shades: ['glasses', 'Aviator'] },
  explorador: { pele: 'Tan', olhos: '#2b1d14', top: ['tshirt', '#c9b27a'], jacket: ['vest', '#7a5a2a'], pants: ['shorts', 'Dark'], shoes: ['boots', 'Original'], hair: ['short', '#4a2a1a'] },
  critico: { pele: 'Pale', olhos: '#1d1a22', top: ['turtleneck', '#1d1a22'], jacket: ['long_coat', '#7a6a5a'], pants: ['jeans', 'Navy'], shoes: ['boots', 'Black'], hair: ['parted', '#7a7a80'], shades: ['glasses', 'Tortoise'] },
  'mixador-de-audio': { olhos: '#2b1d14', top: ['tshirt', '#5a3a8a'], jacket: ['bomber', '#2a2a33'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'White'], hair: ['spiky', '#3aa79a'] },
  'revisor-godot': { pele: 'Dark', olhos: '#2b1d14', full: ['suit_and_tie', '#2f4f7f'], shoes: ['boots', 'Black'], hair: ['slicked_back', '#1d1414'], shades: ['glasses', 'Tortoise'] },

  // Ferramentas de fora: viram "colegas" com cara de ferramenta
  Codex: { olhos: '#1d1a22', full: ['business_suit', '#1f6a50'], shoes: ['boots', 'Black'], hair: ['side_swept', '#2b2b33'], shades: ['shades', 'Aviator'] },
  PixelLab: { olhos: '#a04fd0', full: ['dress', '#d04f9a'], shoes: ['sneakers', 'White'], hair: ['bob', '#f08ac0'], earrings: ['earrings', 'Silver'] },
  Blender: { pele: 'Tan', olhos: '#2b1d14', top: ['tshirt', '#f08a24'], jacket: ['bomber', '#264a7a'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'Black'], hair: ['short', '#2b1d14'], beard: ['goatee', 'Black'] },
  Render: { olhos: '#2b1d14', top: ['turtleneck', '#8a2a2a'], pants: ['jeans', 'Navy'], shoes: ['boots', 'Black'], hair: ['long', '#3a2a20'], watch: ['watch', 'Silver'] },
  Godot: { pele: 'Dark', olhos: '#2b1d14', top: ['tshirt', '#478cbf'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'White'], hair: ['shoulder_length', '#1d1414'], lanyard: ['lanyard', 'Original'] },

  // Qualquer outro agente
  '*': { olhos: '#2b1d14', top: ['long_sleeved_shirt', 'White'], pants: ['jeans', 'Navy'], shoes: ['sneakers', 'Black'], hair: ['side_swept', '#6b3f1d'], lanyard: ['lanyard', 'Original'] },
};

// Agente sem visual próprio ganha um visual montado a partir do NOME: sempre o mesmo para o mesmo
// nome, e diferente entre agentes (em vez de todos iguais ao '*'). A "cor" da ficha vira a roupa de cima.
const ESCOLHAS = {
  pele: [undefined, 'Tan', 'Dark', 'Pale'],
  olhos: ['#2b1d14', '#3a5a8a', '#2f7f45', '#5a3a8a', '#1d1a22'],
  top: ['tshirt', 'long_sleeved_shirt', 'turtleneck', 'tank_top'],
  jacket: [null, null, 'blazer', 'bomber', 'vest', 'open_shirt', 'long_coat'],
  pants: [['jeans', 'Navy'], ['jeans', 'Original'], ['shorts', 'Dark'], ['shorts', 'Original'], ['skirt', 'Original']],
  shoes: [['sneakers', 'White'], ['sneakers', 'Black'], ['boots', 'Black'], ['boots', 'Original']],
  hair: ['short', 'bob', 'mop', 'parted', 'spiky', 'long', 'long_waves', 'high_ponytail', 'side_swept', 'slicked_back', 'shoulder_length', 'bowl_cut'],
  corCabelo: ['#1d1414', '#2b1d14', '#4a2a1a', '#7a3b26', '#e8c35a', '#d9d9d9', '#6b3f1d', '#3a2a20'],
  cor: ['#c0503a', '#3a86e0', '#5a9a5a', '#d0a03a', '#8a4ab0', '#3aa79a', '#d04f9a', '#4a5a7a'],
  extra: [null, null, ['shades', ['glasses', 'Tortoise']], ['lanyard', ['lanyard', 'Original']], ['earrings', ['earrings', 'Silver']], ['beard', ['stubble', '#2b1d14']]],
};
function visualPeloNome(nome, cor) {
  let h = 2166136261; for (const c of String(nome)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const tira = (lista) => { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; return lista[h % lista.length]; };
  const v = { pele: tira(ESCOLHAS.pele), olhos: tira(ESCOLHAS.olhos), pants: tira(ESCOLHAS.pants), shoes: tira(ESCOLHAS.shoes), hair: [tira(ESCOLHAS.hair), tira(ESCOLHAS.corCabelo)] };
  const top = tira(ESCOLHAS.top), jaqueta = tira(ESCOLHAS.jacket), principal = cor || tira(ESCOLHAS.cor), extra = tira(ESCOLHAS.extra);
  if (jaqueta) { v.top = [top, '#ecebe6']; v.jacket = [jaqueta, principal]; } else v.top = [top, principal];
  if (extra) v[extra[0]] = extra[1];
  if (!v.pele) delete v.pele;
  return v;
}
// Ordem: visual escolhido na ficha > visual feito à mão aqui > visual pelo nome (com a cor da ficha).
export function visualDe(nome) {
  const f = fichaDe(nome);
  return (f?.visual && VISUAL[f.visual]) || VISUAL[nome] || (nome === '*' ? VISUAL['*'] : visualPeloNome(nome, f?.cor));
}
