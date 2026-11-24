// Arte: carrega os PNGs (Pixel Agents, MIT), colore pisos/paredes e monta os personagens
// em camadas (corpo, olhos, roupa, cabelo...). Tudo 16 px por tile; personagem 16x32.
const BASE = new URL('../arte/', import.meta.url).href;
const cache = new Map();
let criarCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let carregar = (url) => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error(url)); i.src = url; });
export function usarAmbiente(env) { if (env.criarCanvas) criarCanvas = env.criarCanvas; if (env.carregar) carregar = env.carregar; }
export const novoCanvas = (w, h) => criarCanvas(w, h);

export async function imagem(rel) {
  if (!cache.has(rel)) cache.set(rel, carregar(BASE + rel).catch(() => null));
  return cache.get(rel);
}

// ---------- cor ----------
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
function hslRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = h / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// Igual ao Pixel Agents: a luminância do cinza vira a luz da cor {h, s, b, c}.
export function colorir(img, { h, s, b = 0, c = 0 }) {
  const cv = criarCanvas(img.width, img.height), x = cv.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let l = lum(p[i], p[i + 1], p[i + 2]);
    if (c) l = 0.5 + (l - 0.5) * ((100 + c) / 100);
    if (b) l += b / 200;
    l = Math.max(0, Math.min(1, l));
    [p[i], p[i + 1], p[i + 2]] = hslRgb(h, s / 100, l);
  }
  x.putImageData(d, 0, 0);
  return cv;
}
// Pinta uma peça (cinza ou colorida) numa cor, mantendo a luz relativa de cada pixel.
function tingir(p, cor) {
  const [tr, tg, tb] = hex(cor), [th, ts, tl] = rgbHsl(tr, tg, tb);
  let soma = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { soma += lum(p[i], p[i + 1], p[i + 2]); n++; }
  const media = n ? soma / n : 0.5;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const l = Math.max(0, Math.min(1, tl + (lum(p[i], p[i + 1], p[i + 2]) - media) * 1.1));
    [p[i], p[i + 1], p[i + 2]] = hslRgb(th, ts, l);
  }
}
function trocar(p, mapa) {
  const m = new Map(Object.entries(mapa).map(([a, b]) => [a.toLowerCase(), hex(b)]));
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const k = '#' + [p[i], p[i + 1], p[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const n = m.get(k);
    if (n) [p[i], p[i + 1], p[i + 2]] = n;
  }
}

// ---------- personagens ----------
let guarda = null;
async function guardaRoupa() { if (!guarda) guarda = fetch(BASE + 'personagens/wardrobe.json').then((r) => r.json()).catch(() => ({ parts: {} })); return guarda; }
export function usarGuardaRoupa(json) { guarda = Promise.resolve(json); }

const ORDEM = ['body', 'olhos', 'pants', 'top', 'full', 'jacket', 'lanyard', 'necklace', 'watch', 'shoes', 'hair', 'earrings', 'beard', 'shades', 'hat'];
// spec: { body: 'flat', pele: 'Tan', top: ['tshirt', '#e0763a' | 'White'], pants: [...], hair: [...], ... , olhos: '#3a2a20' }
export async function montarPersonagem(spec) {
  const chave = JSON.stringify(spec);
  if (cache.has('p:' + chave)) return cache.get('p:' + chave);
  const tarefa = (async () => {
    // pede todas as camadas de uma vez (antes ia uma por uma: ~17 s para abrir num 4G lento)
    for (const slot of ORDEM) {
      if (slot === 'olhos') { ['whites', 'iris.both', 'lashes'].forEach((parte) => imagem(`personagens/eyes/plain/${parte}.png`)); continue; }
      if (spec.full && (slot === 'top' || slot === 'pants')) continue;
      const v = slot === 'body' ? [spec.body || 'flat', spec.pele] : spec[slot];
      if (v) imagem(`personagens/${slot}/${(Array.isArray(v) ? v : [v])[0]}.png`);
    }
    const w = await guardaRoupa();
    const cv = criarCanvas(128, 96), x = cv.getContext('2d');
    for (const slot of ORDEM) {
      if (slot === 'olhos') {
        for (const parte of ['whites', 'iris.both', 'lashes']) {
          const img = await imagem(`personagens/eyes/plain/${parte}.png`);
          if (!img) continue;
          if (parte === 'iris.both' && spec.olhos) x.drawImage(pintado(img, null, spec.olhos), 0, 0); else x.drawImage(img, 0, 0);
        }
        continue;
      }
      if (spec.full && (slot === 'top' || slot === 'pants')) continue;
      const v = slot === 'body' ? [spec.body || 'flat', spec.pele] : spec[slot];
      if (!v) continue;
      const [id, cor] = Array.isArray(v) ? v : [v];
      const img = await imagem(`personagens/${slot}/${id}.png`);
      if (!img) continue;
      const def = (w.parts[slot] || []).find((p) => p.id === id);
      const troca = cor && !cor.startsWith('#') ? def?.swaps?.[cor] : null;
      x.drawImage(pintado(img, troca, cor?.startsWith('#') ? cor : null), 0, 0);
    }
    return cv;
  })();
  cache.set('p:' + chave, tarefa);
  return tarefa;
}
function pintado(img, troca, cor) {
  if (!troca && !cor) return img;
  const cv = criarCanvas(img.width, img.height), x = cv.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height);
  if (troca) trocar(d.data, troca);
  if (cor) tingir(d.data, cor);
  x.putImageData(d, 0, 0);
  return cv;
}

// Quadro do personagem: linha 0 frente, 1 costas, 2 direita (esquerda = espelho).
// Quadros: 0-2 andando, 3-4 digitando, 5-6 lendo, 7 sentado.
export const DIR = { baixo: 0, cima: 1, dir: 2, esq: 2 };
export function quadroPersonagem(g, folha, dir, q, x, y) {
  const linha = DIR[dir] ?? 0;
  if (dir === 'esq') {
    g.save(); g.translate(x + 16, y); g.scale(-1, 1);
    g.drawImage(folha, q * 16, linha * 32, 16, 32, 0, 0, 16, 32);
    g.restore();
  } else g.drawImage(folha, q * 16, linha * 32, 16, 32, x, y, 16, 32);
}

// Retrato (rosto e ombros, frente) para o painel.
export function retrato(folha, tamanho = 64) {
  const cv = criarCanvas(tamanho, tamanho), x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  const k = tamanho / 16;
  x.drawImage(folha, 16, 6, 16, 16, 0, 0, tamanho, tamanho);
  return cv;
}

// ---------- móveis ----------
export const MOVEIS = {
  mesa: 'moveis/DESK/DESK_FRONT.png', mesaLado: 'moveis/DESK/DESK_SIDE.png',
  pcFrente: ['moveis/PC/PC_FRONT_ON_1.png', 'moveis/PC/PC_FRONT_ON_2.png', 'moveis/PC/PC_FRONT_ON_3.png'], pcDesligado: 'moveis/PC/PC_FRONT_OFF.png',
  pcCostas: 'moveis/PC/PC_BACK.png', pcLado: 'moveis/PC/PC_SIDE.png',
  cadeiraCostas: 'moveis/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png', cadeiraFrente: 'moveis/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png',
  cadeiraMadeiraFrente: 'moveis/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png', cadeiraMadeiraCostas: 'moveis/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png',
  sofaFrente: 'moveis/SOFA/SOFA_FRONT.png', sofaCostas: 'moveis/SOFA/SOFA_BACK.png', sofaLado: 'moveis/SOFA/SOFA_SIDE.png',
  mesaCentro: 'moveis/COFFEE_TABLE/COFFEE_TABLE.png', mesaGrande: 'moveis/TABLE_FRONT/TABLE_FRONT.png', mesinha: 'moveis/SMALL_TABLE/SMALL_TABLE_FRONT.png',
  estante: 'moveis/BOOKSHELF/BOOKSHELF.png', estanteDupla: 'moveis/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',
  planta: 'moveis/PLANT/PLANT.png', planta2: 'moveis/PLANT_2/PLANT_2.png', plantaGrande: 'moveis/LARGE_PLANT/LARGE_PLANT.png', plantaPendurada: 'moveis/HANGING_PLANT/HANGING_PLANT.png', cacto: 'moveis/CACTUS/CACTUS.png', vaso: 'moveis/POT/POT.png',
  relogio: 'moveis/CLOCK/CLOCK.png', quadro: 'moveis/LARGE_PAINTING/LARGE_PAINTING.png', quadrinho: 'moveis/SMALL_PAINTING/SMALL_PAINTING.png', quadrinho2: 'moveis/SMALL_PAINTING_2/SMALL_PAINTING_2.png',
  lousa: 'moveis/WHITEBOARD/WHITEBOARD.png', cafe: 'moveis/COFFEE/COFFEE.png', lixo: 'moveis/BIN/BIN.png', banco: 'moveis/CUSHIONED_BENCH/CUSHIONED_BENCH.png',
};
export async function carregarMoveis() {
  const out = {};
  await Promise.all(Object.entries(MOVEIS).map(async ([k, v]) => { out[k] = Array.isArray(v) ? await Promise.all(v.map(imagem)) : await imagem(v); }));
  return out;
}
