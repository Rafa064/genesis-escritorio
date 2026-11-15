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
// Baias: 4 colunas x 3 fileiras por equipe. Cada baia = 3 tiles de mesa + 1 de passagem.
export const EQUIPES = [{ x0: 2 }, { x0: 22 }];
export const FILEIRAS = [14, 18, 22];
export const ORDEM_BAIAS = [
  ['editor-de-video', 'criador-de-conteudo', 'artista-3d', 'balanceador'],
  ['explorador', 'revisor-godot', 'PixelLab', '*'],
  ['Blender', 'Render', 'Godot', '*'],
];

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
    lugares.push({ equipe: i, nome: 'Codex', x: cx.lugar[0] * T + 8, y: cx.lugar[1] * T + 21, dir: 'baixo', tile: cx.lugar, pc: null, codex: true });
    lugares.push({ equipe: i, nome: 'Orquestrador', x: a.lugar[0] * T + 8, y: a.lugar[1] * T + 21, dir: 'baixo', tile: a.lugar, pc: null, assistente: true });
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
  m('lixo', 16, 9, 16, 16); trava(16, 9, 16, 9);
  const mural = { x: 14 * T + 16, y: 2 * T + 12, tile: [15, 2] };

  // ---------- baias ----------
  EQUIPES.forEach((eq, e) => FILEIRAS.forEach((yb, r) => ORDEM_BAIAS[r].forEach((nome, c) => {
    const dx = eq.x0 + c * 4;
    divisorias.push({ x: dx * T - 2, y: yb * T - 6, w: 3 * T + 4, h: 18 });         // painel de trás
    divisorias.push({ x: dx * T - 2, y: yb * T - 6, w: 4, h: 4 * T + 2, lado: true }); // painel da esquerda
    trava(dx, yb, dx + 2, yb); trava(dx, yb, dx, yb + 3);
    m('mesa', dx, yb + 1, 48, 32); trava(dx, yb + 1, dx + 2, yb + 2);
    m('pcFrente', dx + 1, yb, 16, 32, { ordem: (yb + 3) * T + 1, anima: `${e}|${nome}`, sobre: true, dy: 24 });
    if (c % 2) m('cafe', dx + 2, yb + 1, 16, 16, { ordem: (yb + 3) * T + 1, sobre: true, dy: 26 });
    else m('vaso', dx + 2, yb + 1, 16, 16, { ordem: (yb + 3) * T + 1, sobre: true, dy: 22 });
    m('cadeiraCostas', dx + 1, yb + 3, 16, 16, { ordem: (yb + 4) * T + 3 });
    trava(dx + 1, yb + 3, dx + 1, yb + 3);
    lugares.push({ equipe: e, nome, x: (dx + 1) * T + 8, y: (yb + 3) * T + 10, dir: 'cima', tile: [dx + 1, yb + 3], pc: { x: (dx + 1) * T, y: yb * T } });
  })));
  // plantas no corredor do meio e nos cantos
  for (const [x, y] of [[19, 14], [20, 18], [19, 22], [20, 25], [1, 12], [38, 12], [1, 25], [38, 25]]) { m(x % 2 ? 'planta' : 'planta2', x, y, 16, 32); trava(x, y + 1, x, y + 1); }

  // pontos onde os agentes livres gostam de ir
  const passeio = [[15, 8], [16, 6], [21, 3], [23, 4], [26, 5], [15, 4], [22, 11], [18, 12], [21, 13], [10, 13], [30, 13], [19, 20], [20, 16], [19, 24]];
  return { tipo, cor, solido, moveis, naParede, vidros, divisorias, lugares, mural, passeio };
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
