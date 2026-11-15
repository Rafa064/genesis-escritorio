// Visual de cada personagem, montado com as peças do guarda-roupa (pagina/arte/personagens).
// Cor: nome de variação do guarda-roupa ("Navy", "White"...) ou "#rrggbb" para tingir.
// Para mudar o visual de alguém, troque as peças aqui (veja os nomes em arte/personagens/<peça>/).
export const VISUAL = {
  // Pessoas (genéricos por enquanto: mesma base, cor da camisa de cada um)
  Rafael: { pele: 'Tan', olhos: '#3a2a20', top: ['tshirt', '#e0763a'], pants: ['jeans', 'Navy'], shoes: ['sneakers', 'White'], hair: ['short', '#2b1d14'] },
  Kenny: { olhos: '#2b2b33', top: ['tshirt', '#3a86e0'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'Black'], hair: ['spiky', '#1d1a1a'] },

  // Assistente (orquestradora), na recepção da sala de cada um
  Orquestrador: { olhos: '#5a3a8a', top: ['turtleneck', '#efe6d2'], jacket: ['blazer', '#6c4a8a'], pants: ['skirt', 'Original'], shoes: ['boots', 'Black'], hair: ['long_waves', '#7a3b26'], lanyard: ['lanyard', 'Original'], shades: ['glasses', 'Tortoise'] },

  // Sub-agentes do Claude
  'editor-de-video': { pele: 'Dark', olhos: '#2b1d14', top: ['tshirt', '#2a2a33'], jacket: ['bomber', '#b8332e'], pants: ['jeans', 'Navy'], shoes: ['sneakers', 'White'], hair: ['mop', '#1d1414'] },
  'criador-de-conteudo': { olhos: '#2f7f45', top: ['tank_top', 'Red'], jacket: ['open_shirt', '#f0c23a'], pants: ['shorts', 'Original'], shoes: ['sneakers', 'White'], hair: ['high_ponytail', '#e8c35a'], earrings: ['earrings', 'Silver'] },
  'artista-3d': { pele: 'Tan', olhos: '#2b1d14', top: ['long_sleeved_shirt', '#3aa79a'], pants: ['jeans', 'Original'], shoes: ['boots', 'Original'], hair: ['bob', 'Black'], shades: ['glasses', 'Pink'], earrings: ['earrings', 'Rose gold'] },
  balanceador: { olhos: '#3a5a8a', top: ['long_sleeved_shirt', '#5a9a5a'], jacket: ['long_coat', '#ecebe6'], pants: ['jeans', 'Navy'], shoes: ['boots', 'Black'], hair: ['parted', 'White'], beard: ['stubble', 'Gray'], shades: ['glasses', 'Aviator'] },
  explorador: { pele: 'Tan', olhos: '#2b1d14', top: ['tshirt', '#c9b27a'], jacket: ['vest', '#7a5a2a'], pants: ['shorts', 'Dark'], shoes: ['boots', 'Original'], hair: ['short', '#4a2a1a'] },
  'revisor-godot': { pele: 'Dark', olhos: '#2b1d14', full: ['suit_and_tie', '#2f4f7f'], shoes: ['boots', 'Black'], hair: ['slicked_back', '#1d1414'], shades: ['glasses', 'Tortoise'] },

  // Ferramentas de fora: viram "colegas" com cara de ferramenta
  Codex: { olhos: '#1d1a22', full: ['business_suit', '#2b2b33'], shoes: ['boots', 'Black'], hair: ['side_swept', '#d9d9d9'], shades: ['shades', 'Aviator'] },
  PixelLab: { olhos: '#a04fd0', full: ['dress', '#d04f9a'], shoes: ['sneakers', 'White'], hair: ['bob', '#f08ac0'], earrings: ['earrings', 'Silver'] },
  Blender: { pele: 'Tan', olhos: '#2b1d14', top: ['tshirt', '#f08a24'], jacket: ['bomber', '#264a7a'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'Black'], hair: ['short', '#2b1d14'], beard: ['goatee', 'Black'] },
  Render: { olhos: '#2b1d14', top: ['turtleneck', '#8a2a2a'], pants: ['jeans', 'Navy'], shoes: ['boots', 'Black'], hair: ['long', '#3a2a20'], watch: ['watch', 'Silver'] },
  Godot: { pele: 'Dark', olhos: '#2b1d14', top: ['tshirt', '#478cbf'], pants: ['jeans', 'Original'], shoes: ['sneakers', 'White'], hair: ['shoulder_length', '#1d1414'], lanyard: ['lanyard', 'Original'] },

  // Qualquer outro agente
  '*': { olhos: '#2b1d14', top: ['long_sleeved_shirt', 'White'], pants: ['jeans', 'Navy'], shoes: ['sneakers', 'Black'], hair: ['side_swept', '#6b3f1d'], lanyard: ['lanyard', 'Original'] },
};
export const visualDe = (nome) => VISUAL[nome] || VISUAL['*'];
