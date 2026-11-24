// Bonecos caprichados: em cima da folha montada (arte.js) entram o ACESSÓRIO de cada função
// (fone, pincel, prancheta, lupa, calculadora...), os detalhes do Rafael (pelo de gato branco na
// roupa preta) e do Kenny (gravata vermelha), e um contorno escuro de 1 px para destacar do chão.
// Também desenha o quadro com "respiração" (o tronco desce 1 px de vez em quando) e a caneca de café.
import { novoCanvas, DIR } from './arte.js';

// acessório por agente (nome do agente -> lista de peças)
export const ACESSORIOS = {
  'editor-de-video': ['fone:#d0302a'],
  'mixador-de-audio': ['fone:#3aa79a'],
  'artista-3d': ['pincel:#e05a9a'],
  critico: ['prancheta'],
  explorador: ['lupa'],
  balanceador: ['calculadora'],
  'revisor-godot': ['caneta'],
  'criador-de-conteudo': ['celular'],
  Orquestrador: ['headset'],
  Rafael: ['pelos'],
  Kenny: ['gravata'],
};

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// Linha do topo da cabeça (primeiro pixel opaco) de cada quadro: 3 linhas x 8 quadros.
function medir(d, W) {
  const topo = [];
  for (let lin = 0; lin < 3; lin++) for (let q = 0; q < 8; q++) {
    let t = 2;
    achou: for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (d[((lin * 32 + y) * W + q * 16 + x) * 4 + 3] > 40) { t = y; break achou; }
    topo.push(t);
  }
  return topo;
}

export function enfeitar(folha, nome) {
  const W = folha.width, H = folha.height;
  const cv = novoCanvas(W, H), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(folha, 0, 0);
  const base = g.getImageData(0, 0, W, H);
  const topo = medir(base.data, W);
  const pecas = ACESSORIOS[nome] || [];
  // pelos de gato: mexe nos pixels escuros da roupa (do pescoço para baixo)
  if (pecas.includes('pelos')) {
    const d = base.data;
    for (let lin = 0; lin < 3; lin++) for (let q = 0; q < 8; q++) {
      const ht = topo[lin * 8 + q];
      for (let y = ht + 15; y < 31; y++) for (let x = 1; x < 15; x++) {
        const i = ((lin * 32 + y) * W + q * 16 + x) * 4;
        if (d[i + 3] < 200 || lum(d[i], d[i + 1], d[i + 2]) > 0.3) continue;
        let h = (x * 374761393 + (y - ht) * 668265263 + lin * 2246822519) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
        // pelinhos soltos, mais no peito e nos ombros (logo abaixo da cabeça)
        const peito = y < ht + 21 ? 6 : 11;
        if (h % peito === 0) { d[i] = 242; d[i + 1] = 238; d[i + 2] = 230; } else if (h % 29 === 1) { d[i] = 196; d[i + 1] = 192; d[i + 2] = 186; }
      }
    }
    g.putImageData(base, 0, 0);
  }
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  for (let lin = 0; lin < 3; lin++) for (let q = 0; q < 8; q++) {
    const ox = q * 16, oy = lin * 32, ht = topo[lin * 8 + q];
    const sentado = q >= 3;
    // mão: frente/costas à direita de quem olha; de lado, na frente do corpo
    const hx = ox + (lin === 2 ? 11 : 13), hy = oy + ht + (lin === 2 ? 19 : 20) + (sentado && lin === 0 ? 0 : 0);
    for (const p of pecas) {
      const [tipo, cor] = p.split(':');
      if (tipo === 'fone' || tipo === 'headset') {
        const c = cor || '#6c4a8a', esc = '#1b1a26', aro = '#c8ced8';
        if (lin === 2) {
          px(ox + 5, oy + ht, 5, 1, aro); px(ox + 5, oy + ht + 1, 1, 6, aro);
          px(ox + 4, oy + ht + 7, 3, 5, esc); px(ox + 5, oy + ht + 8, 2, 3, c);
          if (tipo === 'headset') { px(ox + 7, oy + ht + 11, 3, 1, esc); px(ox + 10, oy + ht + 11, 1, 1, '#ffd23f'); }
        } else {
          px(ox + 5, oy + ht, 6, 1, aro); px(ox + 3, oy + ht + 1, 2, 1, aro); px(ox + 11, oy + ht + 1, 2, 1, aro);
          px(ox + 2, oy + ht + 2, 1, 5, aro); px(ox + 13, oy + ht + 2, 1, 5, aro);
          px(ox + 1, oy + ht + 7, 3, 5, esc); px(ox + 1, oy + ht + 8, 2, 3, c);
          if (tipo === 'fone') { px(ox + 12, oy + ht + 7, 3, 5, esc); px(ox + 13, oy + ht + 8, 2, 3, c); }
          if (tipo === 'headset' && lin === 0) { px(ox + 3, oy + ht + 11, 1, 1, esc); px(ox + 4, oy + ht + 12, 2, 1, esc); px(ox + 6, oy + ht + 12, 1, 1, '#ffd23f'); }
        }
      } else if (tipo === 'lupa') {
        // lupa grande, para fora do corpo: aro dourado, vidro claro com brilho, cabo marrom
        const x = Math.min(ox + 11, hx - 2), y = hy - 8;
        px(x + 1, y, 3, 1, '#e0b040'); px(x, y + 1, 1, 3, '#e0b040'); px(x + 4, y + 1, 1, 3, '#e0b040'); px(x + 1, y + 4, 3, 1, '#e0b040');
        px(x + 1, y + 1, 3, 3, '#a8e4f8'); px(x + 1, y + 1, 1, 1, '#ffffff'); px(x + 2, y + 2, 1, 1, '#ffffff');
        px(x + 1, y + 5, 1, 1, '#7a4a22'); px(x, y + 6, 1, 2, '#7a4a22');
      } else if (tipo === 'prancheta') {
        const x = Math.min(ox + 11, hx - 2), y = hy - 6;
        px(x, y, 5, 7, '#8a5428'); px(x + 1, y + 1, 3, 5, '#fffaf0'); px(x + 1, y + 2, 3, 1, '#8a8a96'); px(x + 1, y + 4, 2, 1, '#8a8a96'); px(x + 3, y + 4, 1, 1, '#d0302a');
        px(x + 1, y - 1, 3, 1, '#d8dce4');
      } else if (tipo === 'calculadora') {
        const x = Math.min(ox + 11, hx - 2), y = hy - 6;
        px(x, y, 5, 7, '#e8e4dc'); px(x + 1, y + 1, 3, 5, '#3a3f4a'); px(x + 1, y + 1, 3, 1, '#8ef070');
        px(x + 1, y + 3, 1, 1, '#ffffff'); px(x + 3, y + 3, 1, 1, '#ffffff'); px(x + 2, y + 4, 1, 1, '#ffffff'); px(x + 3, y + 5, 1, 1, '#f08a24');
      } else if (tipo === 'pincel') {
        const x = Math.min(ox + 14, hx + 1), y = hy;
        px(x, y - 4, 1, 5, '#c08040'); px(x, y - 5, 1, 1, '#d8dce4');
        px(x - 1, y - 8, 2, 3, cor || '#e05a9a'); px(x - 1, y - 8, 1, 1, '#ffd0e8');
      } else if (tipo === 'celular') {
        const x = Math.min(ox + 12, hx - 1), y = hy - 6;
        px(x, y, 4, 6, '#1b1a26'); px(x + 1, y + 1, 2, 4, '#6ac0ff'); px(x + 1, y + 1, 1, 1, '#ffffff'); px(x + 2, y + 3, 1, 1, '#ff6a9a');
      } else if (tipo === 'caneta') {
        const x = Math.min(ox + 14, hx + 1), y = hy - 7;
        px(x, y, 1, 1, '#1b1a26'); px(x, y + 1, 1, 5, '#e0302a'); px(x - 1, y + 1, 1, 2, '#ffffff'); px(x, y + 6, 1, 1, '#f4efe2');
      } else if (tipo === 'gravata') {
        if (lin === 0) {
          const y = oy + ht + 15;
          px(ox + 5, y - 1, 2, 1, '#f4f1ea'); px(ox + 9, y - 1, 2, 1, '#f4f1ea');
          px(ox + 7, y, 2, 1, '#9a1f1a'); px(ox + 7, y + 1, 2, 3, '#d0302a'); px(ox + 7, y + 4, 1, 1, '#d0302a');
        } else if (lin === 2) {
          px(ox + 10, oy + ht + 15, 1, 4, '#d0302a');
        }
      }
    }
  }
  // contorno de 1 px (só onde é transparente e encosta no boneco), sem passar da célula
  const d = g.getImageData(0, 0, W, H), p = d.data, o = new Uint8ClampedArray(p);
  const opaco = (x, y) => o[(y * W + x) * 4 + 3] > 90;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (o[i + 3] > 20) continue;
    const cx = x % 16, cy = y % 32;
    if ((cx > 0 && opaco(x - 1, y)) || (cx < 15 && opaco(x + 1, y)) || (cy > 0 && opaco(x, y - 1)) || (cy < 31 && opaco(x, y + 1))) { p[i] = 22; p[i + 1] = 18; p[i + 2] = 32; p[i + 3] = 200; }
  }
  g.putImageData(d, 0, 0);
  cv.topo = topo;
  return cv;
}

// Desenha o quadro; com "respira", a parte de cima (cabeça e tronco) desce 1 px.
export function desenharQuadro(g, folha, dir, q, x, y, respira = 0) {
  const linha = DIR[dir] ?? 0, sx = q * 16, sy = linha * 32;
  const corte = q >= 3 ? 25 : 22;
  const pinta = () => {
    if (!respira) { g.drawImage(folha, sx, sy, 16, 32, 0, 0, 16, 32); return; }
    g.drawImage(folha, sx, sy + corte, 16, 32 - corte, 0, corte, 16, 32 - corte);
    g.drawImage(folha, sx, sy, 16, corte, 0, respira, 16, corte);
  };
  g.save();
  if (dir === 'esq') { g.translate(x + 16, y); g.scale(-1, 1); } else g.translate(x, y);
  pinta();
  g.restore();
}

// Caneca de café na mão (sobe até a boca de tempos em tempos) com fumacinha.
export function caneca(g, b, x, y, t) {
  const topo = b.folha.topo?.[(DIR[b.dir] ?? 0) * 8 + 1] ?? 2;
  const fase = (t + (b.fase || 0)) % 4.2;
  const bebe = fase > 3.2;
  const lado = b.dir === 'esq' ? -1 : 1;
  let cx = b.dir === 'cima' ? x + 12 : b.dir === 'baixo' ? x + 11 : x + 8 + lado * 4;
  let cy = y + topo + (bebe ? 13 : 19);
  if (bebe && b.dir !== 'cima') cx = b.dir === 'baixo' ? x + 9 : x + 8 + lado * 3;
  g.fillStyle = '#1b1a26'; g.fillRect(cx - 1, cy - 1, 5, 5);
  g.fillStyle = '#f4efe2'; g.fillRect(cx, cy, 3, 3);
  g.fillStyle = '#c0503a'; g.fillRect(cx, cy + 1, 3, 1);
  g.fillStyle = '#1b1a26'; g.fillRect(cx + 3, cy + 1, 1, 1);
  if (!bebe) {
    g.fillStyle = 'rgba(255,255,255,.55)';
    const s = Math.floor(t * 3) % 3;
    g.fillRect(cx + 1 + (s === 1 ? 1 : 0), cy - 3 - s, 1, 1);
    g.fillRect(cx + (s === 2 ? 1 : 0), cy - 5 - s, 1, 1);
  }
}
