// Ambientes do escritório (rodada 4): chão e paredes com cara própria em cada sala.
//   · Criação: tábuas de madeira mel   · Marketing: carpete colorido em placas
//   · Copa: ladrilho xadrez creme/terracota   · Sala de reunião: taco (parquet) com tapetes
//   · Salas do Rafael e do Kenny: madeira com tapete   · Corredores: pedra clara
//   · Paredes: papel de parede por sala, lambri de madeira, rodapé; quinas e soleiras nas passagens.
// Tudo é desenhado por código, pixel a pixel, uma vez só (vai para o "fundo" do mundo).
// Cores com pouco contraste interno: os bonecos (contorno escuro) continuam se destacando do chão.
import { T, MW, MH, SALAS } from './mapa.js';
import { novoCanvas } from './arte.js';

const W = MW * T, H = MH * T;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mist = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luz = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
// ruído determinístico por pixel (o mesmo a cada carga: o chão não "pisca" entre recargas)
const ruido = (x, y, s = 0) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

// ---------- regiões (em pixels) ----------
const R = (x0, y0, x1, y1) => ({ x0: x0 * T, y0: y0 * T, x1: (x1 + 1) * T, y1: (y1 + 1) * T });
export const ZONAS = {
  corredor: [R(1, 11, 38, 13), R(19, 14, 20, 22), R(1, 22, 38, 22)],
  criacao: R(1, 14, 18, 21),
  marketing: R(21, 14, 38, 21),
  copa: R(1, 23, 38, 26),
  reuniao: R(13, 2, 26, 11),
  salas: SALAS.map((s) => R(s.x0, 2, s.x1, 10)),
};

export function pintarAmbientes(fundo) {
  const cv = novoCanvas(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const pon = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; };
  const cada = (r, f) => { for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) f(x, y); };

  // ---- corredores: placas de pedra clara (40 px) com rejunte fino ----
  const pedra = [hex('#b3ab9c'), hex('#aba393'), hex('#b8b0a2')];
  for (const r of ZONAS.corredor) cada(r, (x, y) => {
    const bx = Math.floor(x / 24), by = Math.floor(y / 24), lx = x % 24, ly = y % 24;
    let c = pedra[Math.floor(ruido(bx, by, 3) * 3)];
    c = luz(c, (ruido(x, y) - 0.5) * 8);
    if (lx === 0 || ly === 0) c = hex('#8c8475'); else if (lx === 1 || ly === 1) c = luz(c, 10);
    pon(x, y, c);
  });

  // ---- Criação: tábuas de madeira (mel), 8 px de altura, emendas desencontradas ----
  tabuas(ZONAS.criacao, ['#b98552', '#c08f5c', '#ad7a49', '#c79a66', '#b5804f'], '#6e4428', 1);

  // ---- Marketing: carpete em placas coloridas (teal com placas coral, mostarda e lilás) ----
  {
    const r = ZONAS.marketing, base = [hex('#3f7a7e'), hex('#467f83')], acento = [hex('#b06a5e'), hex('#bf9650'), hex('#7a6c96')];
    cada(r, (x, y) => {
      const tx = Math.floor(x / T), ty = Math.floor(y / T), lx = x % T, ly = y % T;
      const borda = tx === 21 || tx === 38 || ty === 14 || ty === 21;
      let c;
      if (borda) c = hex('#5b4a6e');
      else { const k = (tx * 5 + ty * 3) % 11; c = k === 0 ? mist(acento[(tx >> 1) % 3], base[0], 0.25) : base[(tx + ty) % 2]; }
      // fibra: listras diagonais bem fracas, direção alternada por placa (como carpete de escritório)
      const fio = ((tx + ty) % 2 ? (lx + ly) : (lx - ly + 16)) % 4 === 0 ? -4 : 0;
      c = luz(c, fio + (ruido(x, y, 7) - 0.5) * 8);
      if (borda) { if ((tx === 21 && lx === 15) || (tx === 38 && lx === 0) || (ty === 14 && ly === 15) || (ty === 21 && ly === 0)) c = hex('#d4a04a'); }
      else if (lx === 0 || ly === 0) c = luz(c, -10);
      pon(x, y, c);
    });
  }

  // ---- Copa: ladrilho xadrez creme / terracota com rejunte e brilho ----
  {
    const claro = hex('#e2d3b4'), escuro = hex('#b8694c');
    cada(ZONAS.copa, (x, y) => {
      const tx = Math.floor(x / T), ty = Math.floor(y / T), lx = x % T, ly = y % T;
      let c = (tx + ty) % 2 ? escuro : claro;
      c = luz(c, (ruido(x, y, 11) - 0.5) * 6);
      if (lx === 0 || ly === 0) c = hex('#8f7a62');
      else if (lx === 1 || ly === 1) c = luz(c, 14);
      else if (lx === 15 || ly === 15) c = luz(c, -12);
      if (lx > 2 && lx < 6 && ly === 3) c = luz(c, 26); // brilho
      pon(x, y, c);
    });
    // passadeira verde-sálvia embaixo da mesa grande da copa
    tapete(R(15, 24, 24, 26), { campo: '#7d9a7a', campo2: '#86a383', borda: '#4e6a52', friso: '#e8dcc0', motivo: 'listras' });
  }

  // ---- Sala de reunião (salão): taco em cesto (parquet) nogueira + tapetes ----
  {
    const tons = [hex('#8e5d3b'), hex('#996642'), hex('#865636')];
    cada(ZONAS.reuniao, (x, y) => {
      const tx = Math.floor(x / T), ty = Math.floor(y / T), lx = x % T, ly = y % T;
      const horiz = (tx + ty) % 2 === 0, faixa = Math.floor((horiz ? ly : lx) / 4), ao = horiz ? lx : ly;
      let c = tons[(faixa + tx * 2 + ty) % 3];
      c = luz(c, Math.sin((ao + faixa * 5) * 0.9) * 3 + (ruido(x, y, 5) - 0.5) * 7);
      if ((horiz ? ly : lx) % 4 === 0) c = luz(c, -22);
      if (lx === 0 || ly === 0) c = hex('#5a3820');
      pon(x, y, c);
    });
    // tapete persa embaixo dos sofás e outro embaixo da mesa de reunião
    tapete({ x0: 16 * T, y0: 3 * T - 4, x1: 22 * T, y1: 8 * T - 2 }, { campo: '#8e2f3a', campo2: '#9a3742', borda: '#273a5c', friso: '#e4cf9a', motivo: 'losango' });
    tapete({ x0: 21 * T, y0: 7 * T + 10, x1: 26 * T, y1: 11 * T + 2 }, { campo: '#3d5a78', campo2: '#44638a', borda: '#20304a', friso: '#d9c08a', motivo: 'pontos' });
  }

  // ---- salas do Rafael (madeira cerejeira) e do Kenny (madeira acinzentada), com tapete ----
  SALAS.forEach((s, i) => {
    tabuas(ZONAS.salas[i], i === 0 ? ['#9a5a3a', '#a46242', '#8f5234', '#a8694a'] : ['#7d6a58', '#86725f', '#76634f', '#8c7865'], i === 0 ? '#5a2f1c' : '#4a3c2e', 2 + i, true);
    tapete(R(s.x0 + 1, 6, s.x1 - 1, 9), i === 0
      ? { campo: '#b8603e', campo2: '#c06a46', borda: '#5e2a1c', friso: '#f0d9a8', motivo: 'losango' }
      : { campo: '#3f6a96', campo2: '#4672a0', borda: '#1f3554', friso: '#e8dcc0', motivo: 'losango' });
    // tapetinho verde embaixo da mesa do Codex
    tapete({ x0: s.codex.mesa[0] * T - 4, y0: 7 * T + 6, x1: (s.codex.mesa[0] + 3) * T + 4, y1: 10 * T + 10 }, { campo: '#3f7a5a', campo2: '#468262', borda: '#234a36', friso: '#cfe6c8', motivo: 'listras' });
  });

  g.putImageData(img, 0, 0);
  fundo.getContext('2d').drawImage(cv, 0, 0);

  // ---------- ajudantes (fecham sobre d/pon) ----------
  function tabuas(r, cores, emenda, semente, vertical = false) {
    const cs = cores.map(hex), em = hex(emenda);
    const AL = 8; // altura da tábua
    cada(r, (x, y) => {
      const a = vertical ? x : y, b = vertical ? y : x; // a: atravessa as tábuas; b: ao longo da tábua
      const fil = Math.floor(a / AL), la = a % AL;
      // emendas desencontradas: cada fileira tem um deslocamento e tábuas de 40..72 px
      const desl = Math.floor(ruido(fil, semente, 1) * 64), comp = 40 + Math.floor(ruido(fil, semente, 2) * 4) * 8;
      const pos = b + desl, peca = Math.floor(pos / comp), lb = pos % comp;
      let c = cs[Math.floor(ruido(fil, peca, semente) * cs.length)];
      // veio: ondas suaves ao longo da tábua + ruído fino
      const veio = Math.sin(b * 0.18 + fil * 1.7 + Math.sin(b * 0.05 + peca) * 2) * (la === 3 || la === 5 ? 6 : 2.5);
      c = luz(c, veio + (ruido(x, y, semente + 9) - 0.5) * 6);
      // nó da madeira (raro)
      if (ruido(fil, peca, semente + 4) < 0.08 && Math.abs(lb - comp / 2) < 2 && Math.abs(la - 4) < 2) c = mist(c, em, 0.55);
      if (la === AL - 1) c = em;              // vão entre fileiras
      else if (la === 0) c = luz(c, 12);      // borda iluminada
      if (lb === 0) c = em; else if (lb === 1) c = luz(c, 9);
      pon(x, y, c);
    });
  }
  function tapete(r, o) {
    const campo = hex(o.campo), campo2 = hex(o.campo2), borda = hex(o.borda), friso = hex(o.friso);
    const w = r.x1 - r.x0, h = r.y1 - r.y0, cx = r.x0 + w / 2, cy = r.y0 + h / 2;
    // sombra do tapete no chão (1 px embaixo e à direita)
    for (let x = r.x0 + 1; x <= r.x1; x++) { const i = (r.y1 * W + x) * 4; if (r.y1 < H) { d[i] *= 0.78; d[i + 1] *= 0.78; d[i + 2] *= 0.78; } }
    cada(r, (x, y) => {
      const bx = Math.min(x - r.x0, r.x1 - 1 - x), by = Math.min(y - r.y0, r.y1 - 1 - y), b = Math.min(bx, by);
      let c;
      if (b === 0) c = luz(borda, -18);
      else if (b <= 3) c = (b === 2 ? friso : borda);
      else if (b === 4) c = luz(campo, -14);
      else {
        c = (Math.floor((x - r.x0) / 2) + Math.floor((y - r.y0) / 2)) % 2 ? campo : campo2;
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        if (o.motivo === 'losango') {
          const k = dx / (w / 2 - 6) + dy / (h / 2 - 6);
          if (Math.abs(k - 0.62) < 0.05) c = friso; else if (k < 0.3) c = Math.abs(k - 0.18) < 0.05 ? friso : luz(borda, 10);
          if (bx > 6 && by > 6 && (bx === 8 || by === 8) && (x + y) % 4 === 0) c = luz(friso, -30);
        } else if (o.motivo === 'pontos') {
          if ((x - r.x0) % 8 === 4 && (y - r.y0) % 8 === 4) c = friso;
          if (b === 7) c = luz(borda, 12);
        } else if (o.motivo === 'listras') {
          if ((y - r.y0) % 6 === 0) c = luz(campo, -12);
        }
      }
      c = luz(c, (ruido(x, y, 21) - 0.5) * 8);
      pon(x, y, c);
    });
    // franja nas pontas (esquerda e direita)
    for (let y = r.y0 + 2; y < r.y1 - 2; y += 2) { pon(r.x0 - 1, y, friso); pon(r.x1, y, friso); }
  }
}

// ---------- paredes: papel de parede por sala, lambri e rodapé ----------
// A parede do fundo ocupa as linhas 0 e 1 (32 px): topo escuro, papel (4..19), lambri (20..27), rodapé (28..31).
export function pintarParedes(fundo) {
  const g = fundo.getContext('2d');
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const trechos = [
    { x0: 0, x1: 13 * T, papel: '#c9805e', papel2: '#b8704f', desenho: 'listras' },        // sala do Rafael (terracota)
    { x0: 13 * T, x1: 27 * T, papel: '#7f9a78', papel2: '#93ad8a', desenho: 'flor' },     // reunião (sálvia com florzinha)
    { x0: 27 * T, x1: W, papel: '#6f87a8', papel2: '#5f7798', desenho: 'listras' },        // sala do Kenny (azul)
  ];
  for (const t of trechos) {
    for (let x = t.x0; x < t.x1; x++) for (let y = 4; y < 20; y++) {
      let c = t.papel;
      if (t.desenho === 'listras') c = Math.floor((x - t.x0) / 3) % 3 === 0 ? t.papel2 : t.papel;
      else if (t.desenho === 'flor') { const lx = (x - t.x0) % 10, ly = (y + (Math.floor((x - t.x0) / 10) % 2) * 5) % 10; c = (lx === 5 && (ly === 4 || ly === 6)) || (ly === 5 && (lx === 4 || lx === 6)) ? t.papel2 : lx === 5 && ly === 5 ? '#e8d9a8' : t.papel; }
      r(x, y, 1, 1, c);
    }
    r(t.x0, 4, t.x1 - t.x0, 1, 'rgba(255,255,255,.18)');   // luz do teto no alto do papel
    r(t.x0, 18, t.x1 - t.x0, 2, 'rgba(40,20,10,.18)');     // sombra acima do lambri
  }
  // topo da parede (espessura vista de cima)
  r(0, 0, W, 4, '#3a2618'); r(0, 3, W, 1, '#5a3a24');
  // lambri: painéis de madeira com moldura
  r(0, 20, W, 8, '#8a5a34'); r(0, 20, W, 1, '#c08a58'); r(0, 21, W, 1, '#6e4426');
  for (let x = 4; x < W; x += 20) { r(x, 22, 16, 5, '#7c4e2c'); r(x, 22, 16, 1, '#5e3a20'); r(x, 26, 16, 1, '#a8744a'); r(x + 15, 22, 1, 5, '#a8744a'); }
  // rodapé escuro com friso claro
  r(0, 28, W, 4, '#4a2c18'); r(0, 28, W, 1, '#b07a4a');
  // pilares onde os vidros encontram a parede do fundo
  for (const px of [12 * T + 5, 27 * T + 5]) { r(px - 1, 0, 8, 32, '#2a1a10'); r(px, 0, 6, 31, '#6e4a30'); r(px + 1, 0, 1, 31, '#9a6e48'); }
  // arandelas (luminária de parede): o brilho à noite vem do vida.desenharLuz
  for (const ax of ARANDELAS) { r(ax - 3, 9, 7, 2, '#2a1a10'); r(ax - 2, 5, 5, 5, '#2a1a10'); r(ax - 1, 6, 3, 3, '#f6e2a8'); r(ax, 11, 1, 3, '#2a1a10'); }

  // paredes laterais e de baixo (só o topo aparece): borda escura, tampo de madeira e sombra no chão
  const tampo = (x, y, w, h, vert) => {
    r(x, y, w, h, '#3a2618');
    if (vert) { r(x + 2, y, w - 4, h, '#5a3a24'); r(x + 3, y, 1, h, '#7a5236'); }
    else { r(x, y + 2, w, h - 4, '#5a3a24'); r(x, y + 3, w, 1, '#7a5236'); }
  };
  tampo(0, 2 * T, T, H - 2 * T, true); tampo(W - T, 2 * T, T, H - 2 * T, true); tampo(0, H - T, W, T, false);
  r(T, 2 * T, 3, H - 3 * T, 'rgba(10,8,20,.16)'); r(W - T - 3, 2 * T, 3, H - 3 * T, 'rgba(10,8,20,.10)');

  // ---- transições: soleiras de latão entre corredor e salas, capachos nas entradas ----
  const sol = (x, y, w, h) => { r(x, y, w, h, '#6e5a3a'); r(x, y, w, 1, '#d8b86a'); };
  sol(T, 22 * T - 1, 18 * T, 2); sol(21 * T, 22 * T - 1, 18 * T, 2);   // Criação/Marketing -> corredor de baixo
  sol(T, 23 * T - 1, (MW - 2) * T, 2);                                  // corredor -> copa
  sol(13 * T, 11 * T + 14, 14 * T, 2);                                   // reunião -> corredor
  // capachos nas portas das salas de vidro e na entrada da copa
  const capacho = (x, y, w, h, cor) => { r(x, y, w, h, '#2a1a10'); r(x + 1, y + 1, w - 2, h - 2, cor); g.fillStyle = 'rgba(0,0,0,.18)'; for (let k = x + 3; k < x + w - 2; k += 3) g.fillRect(k, y + 2, 1, h - 4); };
  for (const s of SALAS) capacho(s.porta * T + 2, 12 * T + 1, 2 * T - 4, 10, '#8a6a3a');
  capacho(19 * T + 2, 22 * T + 3, 2 * T - 4, 10, '#7d4a3a');
}
export const ARANDELAS = [4.5 * T, 10 * T, 16 * T, 23 * T, 30 * T, 34 * T + 4];

// pôsteres e bilhetes presos nas divisórias das baias (cor e desenho mudam por mesa)
export function enfeitarDivisorias(fundo, divisorias) {
  const g = fundo.getContext('2d');
  const r = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const cores = ['#f0c65a', '#8fd0e8', '#f29a8a', '#b8e08a', '#e0b0f0'];
  divisorias.filter((d) => !d.lado).forEach((d, i) => {
    const k = i % 4;
    if (k === 0 || (k === 2 && i % 3 === 0)) { // pôster com moldura (nem toda baia tem)
      const x = d.x + 8 + (k === 2 ? 20 : 0), y = d.y + 4;
      r(x - 1, y - 1, 12, 11, '#2a1a10'); r(x, y, 10, 9, k === 0 ? '#2f4f7a' : '#7a3a4a');
      if (k === 0) { r(x + 2, y + 5, 6, 3, '#f0c65a'); r(x + 4, y + 2, 2, 3, '#f4efe2'); } else { r(x + 2, y + 2, 6, 2, '#ffd23f'); r(x + 3, y + 5, 4, 2, '#f4efe2'); }
    }
    // bilhetes autoadesivos
    if (i % 3 !== 1) for (let n = 0; n < 1 + (i % 2); n++) { const x = d.x + 30 - (k === 2 ? 22 : 0) + n * 6, y = d.y + 5 + (n % 2) * 3; r(x, y, 5, 5, cores[(i + n) % cores.length]); r(x, y + 4, 5, 1, 'rgba(0,0,0,.18)'); r(x + 1, y + 2, 3, 1, 'rgba(40,30,20,.35)'); }
  });
}
