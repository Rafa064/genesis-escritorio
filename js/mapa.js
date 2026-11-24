// Planta do escritório (tiles de 16 px). Tudo que tem posição fica aqui:
// pisos, paredes, vidros, móveis, lugares dos agentes e caminhos (A*).
export const T = 16, MW = 40, MH = 28;

// Tipos de tile: 0 parede, 1..9 piso (arte/pisos/floor_(n-1).png). Cores no formato do Pixel Agents.
export const COR = {
  parede: { h: 214, s: 30, b: -100, c: -55 },
  trabalho: { h: 212, s: 32, b: -30, c: -78 },
  corredor: { h: 212, s: 22, b: -22, c: -78 },
  salao: { h: 32, s: 30, b: -6, c: -62 },
  tapeteSalao: { h: 352, s: 40, b: -38, c: -70 },
  codex: { h: 152, s: 42, b: -38, c: -68 },
  criacao: { h: 212, s: 34, b: -30, c: -78 },
  marketing: { h: 350, s: 26, b: -34, c: -78 },
  copa: { h: 28, s: 40, b: -14, c: -66 },
  tapeteCopa: { h: 160, s: 30, b: -40, c: -70 },
  salas: [
    { piso: { h: 25, s: 48, b: -43, c: -88 }, tapete: { h: 18, s: 55, b: -48, c: -70 } },   // Rafael (madeira, tapete terracota)
    { piso: { h: 30, s: 30, b: -50, c: -88 }, tapete: { h: 200, s: 45, b: -40, c: -70 } },  // Kenny (madeira escura, tapete azul)
  ],
};

// Salas de vidro (índice 0 = esquerda, 1 = direita).
export const SALAS = [
  { x0: 1, x1: 11, vidroX: 12, porta: 5, mesaDono: [2, 4], assistente: { mesa: [7, 8], lugar: [8, 7] }, codex: { mesa: [3, 8], lugar: [4, 7] }, dono: [6.5, 6.4] },
  { x0: 28, x1: 38, vidroX: 27, porta: 33, mesaDono: [35, 4], assistente: { mesa: [30, 8], lugar: [31, 7] }, codex: { mesa: [34, 8], lugar: [35, 7] }, dono: [33.5, 6.4] },
];
// Alas (setor) e fileiras (jogo). Cada fileira tem 4 mesas sem dono: cada baia = 3 tiles de mesa + 1 de passagem.
export const ALAS = [
  { setor: 'criacao', x0: 2, divisoria: '#5f6d8c' },
  { setor: 'marketing', x0: 22, divisoria: '#8c5f6a' },
];
export const FILAS = [
  { jogo: 'genesis', y: 14, rotulo: '🎮' },
  { jogo: 'cook', y: 18, rotulo: '🍳' },
];
// Agentes conhecidos (aparecem no painel mesmo antes de trabalhar).
export const AGENTES_CONHECIDOS = ['editor-de-video', 'criador-de-conteudo', 'artista-3d', 'balanceador', 'explorador', 'revisor-godot', 'PixelLab', 'Blender', 'Render', 'Godot'];

export function montarPlanta() {
  const tipo = Array.from({ length: MH }, () => new Array(MW).fill(1));
  const cor = Array.from({ length: MH }, () => new Array(MW).fill(COR.trabalho));
  const solido = Array.from({ length: MH }, () => new Array(MW).fill(false));
  const pinta = (x0, y0, x1, y1, t, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { tipo[y][x] = t; cor[y][x] = c; } };
  const trava = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solido[y]?.[x] !== undefined) solido[y][x] = true; };

  // pisos
  pinta(0, 0, MW - 1, MH - 1, 1, COR.trabalho);
  pinta(1, 12, MW - 2, 13, 2, COR.corredor);
  pinta(13, 2, 26, 11, 4, COR.salao);
  pinta(16, 3, 21, 8, 2, COR.tapeteSalao);
  SALAS.forEach((s, i) => { pinta(s.x0, 2, s.x1, 10, 7, COR.salas[i].piso); pinta(s.x0 + 1, 6, s.x1 - 1, 9, 2, COR.salas[i].tapete); pinta(s.codex.mesa[0], 6, s.codex.mesa[0] + 2, 10, 2, COR.codex); });
  // paredes de fora
  pinta(0, 0, MW - 1, 1, 0, COR.parede); pinta(0, 0, 0, MH - 1, 0, COR.parede); pinta(MW - 1, 0, MW - 1, MH - 1, 0, COR.parede); pinta(0, MH - 1, MW - 1, MH - 1, 0, COR.parede);
  trava(0, 0, MW - 1, 1); trava(0, 0, 0, MH - 1); trava(MW - 1, 0, MW - 1, MH - 1); trava(0, MH - 1, MW - 1, MH - 1);

  const moveis = [];    // { img, x, y, ordem, quadros?, espelho? } (px)
  const naParede = [];  // desenhados no fundo
  const vidros = [];    // { h: true, x0, x1, y, porta } | { v: true, x, y0, y1 }
  const divisorias = [];
  const lugares = [];   // { equipe, nome, x, y (pés, px), dir, pc: {x,y}, tile: [tx, ty] }
  const m = (img, tx, ty, w, h, extra = {}) => { moveis.push({ img, x: tx * T, y: ty * T, ordem: (ty * T) + h, ...extra }); };

  // ---------- salas de vidro ----------
  SALAS.forEach((s, i) => {
    const esq = i === 0;
    vidros.push({ h: true, x0: s.x0, x1: s.x1 + (esq ? 1 : 0), y: 11, porta: s.porta });
    if (!esq) vidros.push({ h: true, x0: s.vidroX, x1: s.vidroX, y: 11 });
    vidros.push({ v: true, x: s.vidroX, y0: 2, y1: 10 });
    for (let x = s.x0; x <= s.x1 + 1; x++) if (x !== s.porta && x !== s.porta + 1) trava(x, 11, x, 11);
    trava(s.vidroX, 2, s.vidroX, 11);
    // mesa do dono (2 PCs, cadeira na frente)
    const [mx, my] = s.mesaDono;
    m('mesa', mx, my, 48, 32); trava(mx, my, mx + 2, my + 1);
    m('pcFrente', mx + 0.4, my, 16, 32, { ordem: (my + 2) * T + 1, anima: 'dono' + i, sobre: true, dy: 10 });
    m('pcFrente', mx + 1.6, my, 16, 32, { ordem: (my + 2) * T + 1, anima: 'dono' + i, sobre: true, dy: 10 });
    m('cadeiraCostas', mx + 1, my + 2, 16, 16, { ordem: (my + 3) * T + 2 });
    // estante, plantas, sofá lateral
    naParede.push({ img: 'estante', x: (esq ? 7 : 29) * T, y: T - 2 });
    naParede.push({ img: 'quadro', x: (esq ? 9.5 : 31.5) * T, y: 2 });
    naParede.push({ img: 'relogio', x: (esq ? 5 : 33) * T, y: 0 });
    m('estanteDupla', esq ? s.x1 - 1 : s.x0, 2, 32, 32); trava(esq ? s.x1 - 1 : s.x0, 2, esq ? s.x1 : s.x0 + 1, 3);
    m('plantaGrande', esq ? s.x0 : s.x1 - 1, 8, 32, 48); trava(esq ? s.x0 : s.x1 - 1, 10, esq ? s.x0 + 1 : s.x1, 10);
    m('planta2', esq ? 6 : 32, 2, 16, 32); trava(esq ? 6 : 32, 3, esq ? 6 : 32, 3);
    m('sofaLado', esq ? s.x1 : s.x0, 5, 16, 32, { espelho: esq }); trava(esq ? s.x1 : s.x0, 6, esq ? s.x1 : s.x0, 6);
    // recepção da assistente: ela fica atrás da mesa, de frente para quem chega
    const a = s.assistente;
    m('mesa', a.mesa[0], a.mesa[1], 48, 32); trava(a.mesa[0], a.mesa[1], a.mesa[0] + 2, a.mesa[1] + 1);
    m('pcCostas', a.mesa[0] + 0.3, a.mesa[1], 16, 32, { ordem: (a.mesa[1] + 2) * T + 2, sobre: true, dy: 10 });
    m('cafe', a.mesa[0] + 2, a.mesa[1], 16, 16, { ordem: (a.mesa[1] + 2) * T + 2, sobre: true, dy: 20 });
    m('cadeiraFrente', a.lugar[0], a.lugar[1], 16, 16, { ordem: a.lugar[1] * T + 4 });
    trava(a.lugar[0], a.lugar[1], a.lugar[0], a.lugar[1]);
    // mesa do Codex (GPT): função separada, ao lado da assistente
    const cx = s.codex;
    m('mesa', cx.mesa[0], cx.mesa[1], 48, 32); trava(cx.mesa[0], cx.mesa[1], cx.mesa[0] + 2, cx.mesa[1] + 1);
    m('pcCostas', cx.mesa[0] + 1.6, cx.mesa[1], 16, 32, { ordem: (cx.mesa[1] + 2) * T + 2, sobre: true, dy: 10 });
    m('cacto', cx.mesa[0] + 0.1, cx.mesa[1], 16, 32, { ordem: (cx.mesa[1] + 2) * T + 2, sobre: true, dy: 8 });
    m('cadeiraFrente', cx.lugar[0], cx.lugar[1], 16, 16, { ordem: cx.lugar[1] * T + 4 });
    trava(cx.lugar[0], cx.lugar[1], cx.lugar[0], cx.lugar[1]);
    lugares.push({ id: `fixo|${i}|Codex`, equipe: i, nome: 'Codex', x: cx.lugar[0] * T + 8, y: cx.lugar[1] * T + 21, dir: 'baixo', tile: cx.lugar, pc: null, codex: true });
    lugares.push({ id: `fixo|${i}|Orquestrador`, equipe: i, nome: 'Orquestrador', x: a.lugar[0] * T + 8, y: a.lugar[1] * T + 21, dir: 'baixo', tile: a.lugar, pc: null, assistente: true });
  });

  // ---------- salão ----------
  naParede.push({ img: 'lousa', x: 14 * T, y: 0, mural: true });
  naParede.push({ img: 'quadro', x: 19 * T, y: 2 });
  naParede.push({ img: 'quadrinho', x: 22 * T, y: 0 }); naParede.push({ img: 'quadrinho2', x: 23 * T, y: 0 });
  naParede.push({ img: 'relogio', x: 17 * T, y: 0 });
  m('sofaFrente', 18, 3, 32, 16); trava(18, 3, 19, 3);
  m('mesaCentro', 18, 4, 32, 32); trava(18, 4, 19, 5);
  m('sofaCostas', 18, 6, 32, 16); trava(18, 6, 19, 6);
  m('sofaLado', 17, 4, 16, 32); trava(17, 4, 17, 5);
  m('sofaLado', 20, 4, 16, 32, { espelho: true }); trava(20, 4, 20, 5);
  m('mesinha', 24, 2, 32, 32); trava(24, 2, 25, 3);
  m('cafe', 24.3, 2, 16, 16, { ordem: 4 * T, sobre: true, dy: 18 }); m('cafe', 25, 2, 16, 16, { ordem: 4 * T, sobre: true, dy: 20 });
  m('mesaGrande', 21.5, 7, 48, 64); trava(22, 7, 24, 10);
  for (const [cx, cy, img] of [[21, 7.6, 'cadeiraMadeiraFrente'], [21, 9, 'cadeiraMadeiraFrente'], [25, 7.6, 'cadeiraMadeiraFrente'], [25, 9, 'cadeiraMadeiraFrente']]) m(img, cx, cy, 16, 32, { espelho: cx > 23 });
  m('plantaGrande', 13, 2, 32, 48); trava(13, 4, 14, 4);
  m('planta', 26, 9, 16, 32); trava(26, 10, 26, 10);
  m('planta2', 13, 9, 16, 32); trava(13, 10, 13, 10);
  m('lixo', 26, 7, 16, 16); trava(26, 7, 26, 7);
  // estante das ferramentas (PixelLab, Blender, Godot...): desenhada em código (vida.js); os itens moram nela
  trava(14, 9, 16, 9);
  const mural = { x: 14 * T + 16, y: 2 * T + 12, tile: [15, 2] };

  // ---------- duas alas: Criação (esquerda) e Marketing (direita) ----------
  // Cada ala tem uma fileira por jogo (Genesis em cima, Cook embaixo), com 4 mesas.
  // As mesas não têm dono: o agente senta numa mesa livre da ala e do jogo da tarefa.
  pinta(1, 14, 18, 21, 1, COR.criacao);
  pinta(21, 14, MW - 2, 21, 1, COR.marketing);
  pinta(19, 14, 20, 22, 2, COR.corredor);
  pinta(1, 22, MW - 2, 22, 2, COR.corredor);
  const assentos = [];
  ALAS.forEach((ala) => FILAS.forEach((fila) => [0, 1, 2, 3].forEach((c) => {
    const dx = ala.x0 + c * 4, yb = fila.y;
    divisorias.push({ x: dx * T - 2, y: yb * T - 6, w: 3 * T + 4, h: 18, cor: ala.divisoria });
    divisorias.push({ x: dx * T - 2, y: yb * T - 6, w: 4, h: 4 * T + 2, lado: true, cor: ala.divisoria });
    trava(dx, yb, dx + 2, yb); trava(dx, yb, dx, yb + 3);
    const id = `${ala.setor}|${fila.jogo}|${c}`;
    m('mesa', dx, yb + 1, 48, 32); trava(dx, yb + 1, dx + 2, yb + 2);
    m('pcFrente', dx + 1, yb, 16, 32, { ordem: (yb + 3) * T + 1, anima: id, sobre: true, dy: 24 });
    if (c % 2) m('cafe', dx + 2, yb + 1, 16, 16, { ordem: (yb + 3) * T + 1, sobre: true, dy: 26 });
    else m('vaso', dx + 2, yb + 1, 16, 16, { ordem: (yb + 3) * T + 1, sobre: true, dy: 22 });
    m('cadeiraCostas', dx + 1, yb + 3, 16, 16, { ordem: (yb + 4) * T + 3 });
    trava(dx + 1, yb + 3, dx + 1, yb + 3);
    assentos.push({ id, setor: ala.setor, jogo: fila.jogo, x: (dx + 1) * T + 8, y: (yb + 3) * T + 10, dir: 'cima', tile: [dx + 1, yb + 3], pc: { x: (dx + 1) * T, y: yb * T } });
  })));
  for (const [x, y] of [[19, 15], [20, 19], [1, 12], [38, 12]]) { m(x % 2 ? 'planta' : 'planta2', x, y, 16, 32); trava(x, y + 1, x, y + 1); }

  // ---------- copa: quem está livre fica aqui ----------
  pinta(1, 23, MW - 2, 26, 4, COR.copa);
  pinta(15, 24, 24, 26, 2, COR.tapeteCopa);
  m('mesinha', 2, 23, 32, 32); trava(2, 23, 3, 24);
  m('cafe', 2.3, 23, 16, 16, { ordem: 25 * T, sobre: true, dy: 18 }); m('cafe', 3, 23, 16, 16, { ordem: 25 * T, sobre: true, dy: 20 });
  m('sofaFrente', 7, 23, 32, 16); trava(7, 23, 8, 23);
  m('mesaCentro', 7, 24, 32, 32); trava(7, 24, 8, 25);
  m('sofaLado', 6, 24, 16, 32); trava(6, 24, 6, 25);
  m('sofaLado', 9, 24, 16, 32, { espelho: true }); trava(9, 24, 9, 25);
  m('mesaGrande', 17.5, 23.6, 48, 64); trava(18, 24, 20, 26);
  for (const [cx, cy] of [[17, 24.2], [17, 25.4], [21, 24.2], [21, 25.4]]) m('cadeiraMadeiraFrente', cx, cy, 16, 32, { espelho: cx > 19 });
  m('sofaFrente', 30, 23, 32, 16); trava(30, 23, 31, 23);
  m('mesaCentro', 30, 24, 32, 32); trava(30, 24, 31, 25);
  m('sofaLado', 29, 24, 16, 32); trava(29, 24, 29, 25);
  m('sofaLado', 32, 24, 16, 32, { espelho: true }); trava(32, 24, 32, 25);
  m('mesinha', 36, 23, 32, 32); trava(36, 23, 37, 24);
  m('cafe', 36.4, 23, 16, 16, { ordem: 25 * T, sobre: true, dy: 18 });
  for (const [x, y] of [[13, 23], [26, 23], [1, 25], [38, 25]]) { m(x % 2 ? 'planta' : 'planta2', x, y, 16, 32); trava(x, y + 1, x, y + 1); }
  m('lixo', 12, 26, 16, 16); trava(12, 26, 12, 26);
  // lugares da copa (em pé, conversando, perto do café e dos sofás)
  // (os primeiros da lista são espalhados: com pouca gente ninguém fica amontoado)
  const copa = [[5, 23, 'baixo'], [10, 24, 'esq'], [14, 24, 'dir'], [23, 24, 'esq'], [28, 24, 'dir'], [33, 25, 'esq'], [3, 26, 'cima'], [16, 23, 'baixo'],
    [31, 26, 'cima'], [36, 26, 'cima'], [22, 26, 'esq'], [7, 26, 'cima'], [35, 23, 'baixo'], [27, 26, 'cima'], [15, 26, 'dir'], [22, 23, 'baixo'],
    [4, 24, 'esq'], [4, 25, 'esq'], [2, 25, 'cima'], [8, 26, 'cima'], [10, 25, 'esq'], [24, 25, 'esq'], [28, 25, 'dir'], [30, 26, 'cima'], [33, 24, 'esq'], [35, 25, 'dir']]
    .map(([x, y, dir], i) => ({ id: `copa|${i}`, copa: true, x: x * T + 8, y: y * T + 12, dir, tile: [x, y] }));

  // placas (texto por cima do mapa)
  const placas = [
    { texto: '🛠️ CRIAÇÃO', x: 9.5 * T, y: 12.6 * T, setor: 'criacao' },
    { texto: '📣 MARKETING', x: 30 * T, y: 12.6 * T, setor: 'marketing' },
    ...ALAS.flatMap((ala) => FILAS.map((f) => ({ texto: f.rotulo, x: (ala.x0 - 1.1) * T, y: (f.y + 2.4) * T, jogo: f.jogo, lado: true }))),
    { texto: '☕ COPA · quem está livre', x: 19.5 * T, y: 22.55 * T, copa: true },
  ];
  // pontos de passeio (só no salão e na copa)
  const passeio = [[15, 8], [16, 6], [21, 3], [23, 4], [26, 5], [15, 4]];

  // ---------- vida no mapa: janelas, luminárias, estante de ferramentas e pontos de rotina ----------
  // janelas na parede de cima (o céu muda com o relógio de verdade)
  // (as de cima ficam na parede do fundo; as "de lado" nas paredes laterais, visíveis no celular)
  const janelas = [{ x: 2 * T, y: 3, w: 32 }, { x: 36 * T - 4, y: 3, w: 32 }, { x: 25 * T + 2, y: 3, w: 28 },
    { x: 3, y: 15 * T, w: 10, h: 40, lado: true }, { x: 3, y: 23 * T + 6, w: 10, h: 36, lado: true },
    { x: (MW - 1) * T + 3, y: 15 * T, w: 10, h: 40, lado: true }, { x: (MW - 1) * T + 3, y: 23 * T + 6, w: 10, h: 36, lado: true }];
  // luminárias de chão (acendem à noite)
  const luminarias = [];
  for (const [x, y] of [[1, 2], [38, 2], [16, 2], [22, 2], [11, 23], [27, 23], [20, 15], [19, 21], [1, 18], [38, 18]]) if (!solido[y][x]) { luminarias.push({ x: x * T + 8, y: y * T + 14 }); trava(x, y, x, y); }
  // estante das ferramentas: 3 tiles no salão (x 14..16, y 9), com 8 nichos
  const estante = { x: 14 * T, y: 9 * T - 12, w: 3 * T, h: 26 };
  const casasItens = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: estante.x + 6 + (i % 4) * 12, y: estante.y + (i < 4 ? 7 : 19) }));
  // pontos de rotina de quem está livre: café, sofá, janela. aprox = tile onde a pessoa chega andando.
  const P = (id, tipo, aprox, pose) => ({ id, tipo, aprox, pose });
  const pe = (tx, ty, dir) => ({ x: tx * T + 8, y: ty * T + 12, dir });
  const rotina = [
    P('cafe1', 'cafe', [4, 23], pe(4, 23, 'esq')), P('cafe2', 'cafe', [3, 25], pe(3, 25, 'cima')),
    P('cafe3', 'cafe', [35, 24], pe(35, 24, 'dir')), P('cafe4', 'cafe', [36, 25], pe(36, 25, 'cima')),
    P('cafe5', 'cafe', [24, 4], pe(24, 4, 'cima')), P('cafe6', 'cafe', [25, 4], pe(25, 4, 'cima')),
    // sofás da copa (esquerda e direita) e do salão: sentam em cima do sofá
    P('sofa1', 'sofa', [7, 22], { x: 7 * T + 8, y: 23 * T + 13, dir: 'baixo', modo: 'sentado', ordem: 23 * T + 17 }),
    P('sofa2', 'sofa', [8, 22], { x: 8 * T + 8, y: 23 * T + 13, dir: 'baixo', modo: 'sentado', ordem: 23 * T + 17 }),
    P('sofa3', 'sofa', [5, 24], { x: 6 * T + 8, y: 24 * T + 20, dir: 'dir', modo: 'sentado', ordem: 24 * T + 33 }),
    P('sofa4', 'sofa', [10, 25], { x: 9 * T + 8, y: 25 * T + 4, dir: 'esq', modo: 'sentado', ordem: 24 * T + 33 }),
    P('sofa5', 'sofa', [30, 22], { x: 30 * T + 8, y: 23 * T + 13, dir: 'baixo', modo: 'sentado', ordem: 23 * T + 17 }),
    P('sofa6', 'sofa', [31, 22], { x: 31 * T + 8, y: 23 * T + 13, dir: 'baixo', modo: 'sentado', ordem: 23 * T + 17 }),
    P('sofa7', 'sofa', [28, 25], { x: 29 * T + 8, y: 25 * T + 4, dir: 'dir', modo: 'sentado', ordem: 24 * T + 33 }),
    P('sofa8', 'sofa', [33, 24], { x: 32 * T + 8, y: 24 * T + 20, dir: 'esq', modo: 'sentado', ordem: 24 * T + 33 }),
    P('sofa9', 'sofa', [18, 2], { x: 18 * T + 8, y: 3 * T + 13, dir: 'baixo', modo: 'sentado', ordem: 3 * T + 17 }),
    P('sofa10', 'sofa', [19, 7], { x: 19 * T + 8, y: 6 * T + 8, dir: 'cima', modo: 'sentado', ordem: 6 * T + 6 }),
    P('janela1', 'janela', [26, 2], pe(26, 2, 'cima')), P('janela2', 'janela', [25, 5], pe(25, 5, 'cima')),
  ];
  return { tipo, cor, solido, moveis, naParede, vidros, divisorias, lugares, assentos, copa, placas, mural, passeio, janelas, luminarias, estante, casasItens, rotina };

}

// ---------- caminhos (A* em grade, 4 direções) ----------
export function caminho(solido, de, para, livres = new Set()) {
  const [sx, sy] = de, [ex, ey] = para;
  const ok = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && (!solido[y][x] || livres.has(`${x},${y}`));
  if (!ok(ex, ey)) return null;
  const k = (x, y) => y * MW + x;
  const g = new Map([[k(sx, sy), 0]]), veio = new Map();
  const aberto = [[Math.abs(ex - sx) + Math.abs(ey - sy), sx, sy]];
  const fechado = new Set();
  while (aberto.length) {
    let mi = 0; for (let i = 1; i < aberto.length; i++) if (aberto[i][0] < aberto[mi][0]) mi = i;
    const [, x, y] = aberto.splice(mi, 1)[0];
    if (x === ex && y === ey) {
      const out = [[x, y]]; let c = k(x, y);
      while (veio.has(c)) { c = veio.get(c); out.unshift([c % MW, Math.floor(c / MW)]); }
      return out;
    }
    if (fechado.has(k(x, y))) continue;
    fechado.add(k(x, y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!ok(nx, ny) || fechado.has(k(nx, ny))) continue;
      const ng = g.get(k(x, y)) + 1;
      if (ng < (g.get(k(nx, ny)) ?? Infinity)) { g.set(k(nx, ny), ng); veio.set(k(nx, ny), k(x, y)); aberto.push([ng + Math.abs(ex - nx) + Math.abs(ey - ny), nx, ny]); }
    }
  }
  return null;
}
export const tileDe = (px, py) => [Math.floor(px / T), Math.floor(py / T)];
