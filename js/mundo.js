// O mundo: desenha o escritório e move os bonecos (agentes, você, a outra pessoa).
import { T, MW, MH, montarPlanta, caminho, tileDe } from './mapa.js';
import { imagem, colorir, carregarMoveis, montarPersonagem, novoCanvas } from './arte.js';
import { visualDe } from './personagens.js';
import { enfeitar, desenharQuadro, caneca } from './bonecos.js';
import * as vida from './vida.js';
import { iniciarSomAmbiente } from './som-ambiente.js';

const rnd = (s) => { let x = s >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
const hash = (n) => [...String(n)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function criarMundo() {
  const planta = montarPlanta();
  montarPersonagem({}).catch(() => null); // já pede o guarda-roupa (167 KB) junto com os móveis
  const mv = await carregarMoveis();
  const fundo = novoCanvas(MW * T, MH * T);
  const b = fundo.getContext('2d');
  b.imageSmoothingEnabled = false;

  // ---- pisos (cada combinação piso+cor é colorida uma vez) ----
  const pisos = new Map();
  const tiposPiso = new Set(planta.tipo.flat().filter((t) => t > 0));
  await Promise.all([...[...tiposPiso].map((t) => imagem(`pisos/floor_${t - 1}.png`)), imagem('paredes/wall_0.png')]); // todos de uma vez
  const pisoDe = async (t, c) => {
    const k = t + JSON.stringify(c);
    if (!pisos.has(k)) pisos.set(k, colorir(await imagem(`pisos/floor_${t - 1}.png`), c));
    return pisos.get(k);
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (planta.tipo[y][x] > 0) b.drawImage(await pisoDe(planta.tipo[y][x], planta.cor[y][x]), x * T, y * T);
  // sombra suave do pé das paredes e dos vidros
  b.fillStyle = 'rgba(10,8,20,.22)'; b.fillRect(T, 2 * T, (MW - 2) * T, 4);
  // ---- paredes (auto-tile 4x4 pela vizinhança, colorido) ----
  const folhaParede = colorir(await imagem('paredes/wall_0.png'), planta.cor[0][0]);
  const ehParede = (x, y) => y >= 0 && x >= 0 && x < MW && y < MH && planta.tipo[y][x] === 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!ehParede(x, y)) continue;
    const mask = (ehParede(x, y - 1) ? 1 : 0) | (ehParede(x + 1, y) ? 2 : 0) | (ehParede(x, y + 1) ? 4 : 0) | (ehParede(x - 1, y) ? 8 : 0);
    b.drawImage(folhaParede, (mask % 4) * 16, Math.floor(mask / 4) * 32, 16, 32, x * T, y * T - T, 16, 32);
  }
  // ---- coisas na parede ----
  for (const p of planta.naParede) { const img = mv[p.img]; if (img) b.drawImage(img, Math.round(p.x), Math.round(p.y)); }
  // ---- divisórias das baias (tecido azul-acinzentado com borda clara em cima) ----
  for (const d of planta.divisorias) {
    b.fillStyle = '#1b1a26'; b.fillRect(d.x, d.y, d.w, d.h);
    b.fillStyle = d.cor || '#5f6d8c'; b.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2); if (d.lado) { b.fillStyle = 'rgba(255,255,255,.16)'; b.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2); }
    b.fillStyle = '#b8c3d9'; b.fillRect(d.x + 1, d.y + 1, d.w - 2, 2);
    if (!d.lado) { b.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 6; k < d.w - 4; k += 7) b.fillRect(d.x + k, d.y + 6, 1, d.h - 9); b.fillStyle = 'rgba(10,8,20,.25)'; b.fillRect(d.x + 1, d.y + d.h, d.w - 2, 3); }
  }
  // ---- vidros ----
  for (const v of planta.vidros) {
    if (v.h) for (let x = v.x0; x <= v.x1; x++) {
      if (v.porta != null && (x === v.porta || x === v.porta + 1)) continue;
      const px = x * T, py = v.y * T;
      b.fillStyle = 'rgba(150,205,235,.28)'; b.fillRect(px, py - 12, T, 26);
      b.fillStyle = '#d6edf7'; b.fillRect(px, py - 13, T, 2);
      b.fillStyle = '#3b4a5c'; b.fillRect(px, py + 13, T, 3);
      b.fillStyle = 'rgba(10,8,20,.2)'; b.fillRect(px, py + 16, T, 3);
      if ((x * 7) % 5 < 2) { b.fillStyle = 'rgba(255,255,255,.4)'; for (let k = 0; k < 7; k++) b.fillRect(px + 3 + k, py - 8 + k * 3, 1, 3); }
    }
    if (v.h && v.porta != null) { b.fillStyle = '#3b4a5c'; b.fillRect(v.porta * T - 2, v.y * T - 14, 3, 30); b.fillRect((v.porta + 2) * T - 1, v.y * T - 14, 3, 30); }
    if (v.v) for (let y = v.y0; y <= v.y1; y++) { const px = v.x * T + 6, py = y * T; b.fillStyle = 'rgba(150,205,235,.34)'; b.fillRect(px, py, 4, T); b.fillStyle = '#3b4a5c'; b.fillRect(px - 1, py, 1, T); b.fillStyle = '#d6edf7'; b.fillRect(px + 4, py, 1, T); }
  }

  // ---- minimapa (pré-desenhado) ----
  const mini = novoCanvas(MW * 4, MH * 4), mx = mini.getContext('2d');
  mx.imageSmoothingEnabled = true; mx.drawImage(fundo, 0, 0, MW * 4, MH * 4);
  mx.fillStyle = 'rgba(10,8,20,.35)'; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (planta.solido[y][x] && planta.tipo[y][x] !== 0) mx.fillRect(x * 4, y * 4, 4, 4);

  const mundo = new Mundo(planta, mv, fundo, mini);
  vida.iniciar(mundo);
  try { iniciarSomAmbiente(mundo); } catch (e) { console.warn('som ambiente:', e); }
  return mundo;
}

class Mundo {
  constructor(planta, mv, fundo, mini) {
    Object.assign(this, { planta, mv, fundo, mini });
    this.agentes = new Map();   // id -> boneco
    this.pessoas = new Map();   // nome -> boneco remoto
    this.eu = null;
    this.t = 0;
    this.particulas = [];
  }

  // ---------- bonecos ----------
  async boneco(id, nome, visual) {
    const folha = enfeitar(await montarPersonagem(visual || visualDe(nome)), nome);
    return { id, nome, folha, x: 0, y: 0, dir: 'baixo', modo: 'parado', caminho: null, quadro: 1, anda: 0, espera: 0, fase: Math.random() * 5 };
  }
  // Coloca/atualiza os agentes de uma equipe (equipe 0 = sala da esquerda).
  async sincronizarAgentes(todos) {
    // ferramentas (PixelLab, Render, Godot...) não são bonecos: viram itens que voam até quem usa
    const itens = todos.filter((a) => a.item || vida.ehItem(a.nome)), lista = todos.filter((a) => !itens.includes(a));
    const vistos = new Set();
    // monta os bonecos novos em paralelo (o laço abaixo só espera o que já está pronto)
    await Promise.all(lista.filter((a) => !this.agentes.has(a.id)).map((a) => montarPersonagem(visualDe(a.nome)).catch(() => null)));
    for (const a of lista) {
      vistos.add(a.id);
      let b = this.agentes.get(a.id);
      if (!b) {
        b = await this.boneco(a.id, a.nome);
        b.lugar = a.lugar; b.x = a.lugar.x; b.y = a.lugar.y; b.dir = a.lugar.dir; b.modo = a.lugar.copa ? 'parado' : 'sentado'; b.noLugar = a.lugar.id;
        b.sorte = rnd(hash(a.id)); b.espera = 2 + b.sorte() * 8;
        this.agentes.set(a.id, b);
        b.novo = true;
      }
      Object.assign(b, { status: a.status, ferramenta: a.ferramenta, pessoa: a.pessoa, m: a.m, lugar: a.lugar, anel: a.anel || null });
      vida.notarEventos(this, b, b.novo); b.novo = false;
    }
    for (const id of [...this.agentes.keys()]) if (!vistos.has(id)) { vida.liberar(this, this.agentes.get(id)); this.agentes.delete(id); }
    vida.definirUsos(this, lista, itens);
  }
  async criarEu(nome, pos) {
    this.eu = await this.boneco('eu', nome);
    Object.assign(this.eu, { x: pos[0] * T, y: pos[1] * T, pessoa: nome, skate: false });
  }
  async atualizarPessoa(nome, dados) {
    let p = this.pessoas.get(nome);
    if (!p) { p = await this.boneco('p:' + nome, nome); p.pessoa = nome; p.x = dados.x; p.y = dados.y; this.pessoas.set(nome, p); }
    Object.assign(p, { alvoX: dados.x, alvoY: dados.y, dir: dados.dir || p.dir, skate: !!dados.skate, andandoRemoto: !!dados.andando, visto: performance.now() });
  }

  andarPara(b, tx, ty) {
    const de = tileDe(b.x, b.y);
    const livres = new Set([`${tx},${ty}`, `${de[0]},${de[1]}`]);
    const c = caminho(this.planta.solido, de, [tx, ty], livres);
    if (c && c.length > 1) { b.caminho = c.slice(1).map(([x, y]) => [x * T + 8, y * T + 12]); b.modo = 'andando'; return true; }
    return false;
  }
  irAte(px, py) { // clique no chão (só você)
    const [tx, ty] = tileDe(px, py);
    if (this.planta.solido[ty]?.[tx]) return false;
    return this.andarPara(this.eu, tx, ty);
  }

  // ---------- comportamento dos agentes ----------
  // Cada agente tem um lugar: mesa (trabalhando), copa (livre) ou recepção (assistente/Codex). Se o lugar muda, ele anda até lá.
  pensar(b, dt) {
    const l = b.lugar; if (!l) return;
    if (b.cena && vida.cena(this, b, dt)) return;
    if (b.rot && !l.copa) { vida.liberar(this, b); b.noLugar = null; }
    if (!l.copa) b.acao = null;
    if (l.copa && vida.rotina(this, b, dt)) return;
    if (b.noLugar === l.id) {
      // na copa: de vez em quando vira para outro lado (parece que conversa)
      if (l.copa && b.modo === 'parado') { b.espera -= dt; if (b.espera <= 0) { b.dir = ['esq', 'dir', 'baixo', 'cima'][Math.floor(b.sorte() * 4)]; b.espera = 4 + b.sorte() * 8; } }
      return;
    }
    if (b.caminho) return;
    b.espera -= dt; if (b.espera > 0) return;
    if (!this.andarPara(b, ...l.tile)) { b.x = l.x; b.y = l.y; b.dir = l.dir; b.modo = l.copa ? 'parado' : 'sentado'; b.noLugar = l.id; }
    b.espera = 0.2 + b.sorte() * 0.8;
  }

  seguirCaminho(b, dt, vel) {
    if (!b.caminho?.length) return false;
    const [ax, ay] = b.caminho[0];
    const dx = ax - b.x, dy = ay - b.y, d = Math.hypot(dx, dy);
    const passo = vel * dt;
    if (Math.abs(dx) > Math.abs(dy)) b.dir = dx < 0 ? 'esq' : 'dir'; else if (d > 0.5) b.dir = dy < 0 ? 'cima' : 'baixo';
    if (d <= passo) { b.x = ax; b.y = ay; b.caminho.shift(); }
    else { b.x += (dx / d) * passo; b.y += (dy / d) * passo; }
    b.anda += dt;
    if (!b.caminho.length) {
      b.caminho = null;
      const [tx, ty] = tileDe(b.x, b.y);
      if (b.lugar && tx === b.lugar.tile[0] && ty === b.lugar.tile[1]) { b.x = b.lugar.x; b.y = b.lugar.y; b.dir = b.lugar.dir; b.modo = b.lugar.copa ? 'parado' : 'sentado'; b.noLugar = b.lugar.id; }
      else b.modo = 'parado';
    }
    return true;
  }

  bate(x, y) {
    for (const [px, py] of [[x - 4, y - 3], [x + 4, y - 3], [x - 4, y + 1], [x + 4, y + 1]]) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || this.planta.solido[ty][tx]) return true;
    }
    return false;
  }

  // entrada: {dx, dy, skate}
  atualizar(dt, entrada) {
    this.t += dt;
    for (const b of this.agentes.values()) {
      this.pensar(b, dt);
      if (b.modo === 'sentado' && b.caminho) b.modo = 'andando';
      this.seguirCaminho(b, dt, 46);
    }
    const eu = this.eu;
    if (eu) {
      eu.skate = entrada.skate;
      const vel = eu.skate ? 190 : 82;
      let { dx, dy } = entrada;
      if (dx || dy) {
        eu.caminho = null;
        if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
        eu.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esq' : 'dir') : (dy < 0 ? 'cima' : 'baixo');
        const nx = eu.x + dx * vel * dt, ny = eu.y + dy * vel * dt;
        if (!this.bate(nx, eu.y)) eu.x = nx;
        if (!this.bate(eu.x, ny)) eu.y = ny;
        eu.anda += dt; eu.modo = 'andando';
      } else if (!this.seguirCaminho(eu, dt, vel)) eu.modo = 'parado';
      if (eu.skate && eu.modo === 'andando' && Math.random() < dt * 30) this.particulas.push({ x: eu.x + (Math.random() * 8 - 4), y: eu.y + 1, v: 0.5 });
    }
    for (const p of this.pessoas.values()) {
      if (p.alvoX == null) continue;
      const dx = p.alvoX - p.x, dy = p.alvoY - p.y, d = Math.hypot(dx, dy);
      if (d > 200) { p.x = p.alvoX; p.y = p.alvoY; }
      else { p.x += dx * Math.min(1, dt * 10); p.y += dy * Math.min(1, dt * 10); }
      p.modo = d > 1 || p.andandoRemoto ? 'andando' : 'parado'; if (p.modo === 'andando') p.anda += dt;
    }
    vida.atualizar(this, dt);
    for (const q of this.particulas) q.v -= dt * 1.5;
    this.particulas = this.particulas.filter((q) => q.v > 0);
  }

  // ---------- desenho ----------
  desenharBoneco(g, b) {
    const x = Math.round(b.x) - 8;
    let y = Math.round(b.y) - 31;
    let q = 1;
    // anel no chão com a cor do jogo (quem está trabalhando)
    if (b.anel) { const ax = Math.round(b.x), ay = Math.round(b.y); const pisca = 0.55 + Math.sin(this.t * 4) * 0.2; g.globalAlpha = pisca; g.fillStyle = b.anel; g.fillRect(ax - 8, ay - 2, 16, 4); g.fillRect(ax - 6, ay - 3, 12, 6); g.globalAlpha = 1; }
    // sombra
    { const sx = Math.round(b.x), sy = Math.round(b.y); g.fillStyle = 'rgba(10,8,20,.18)'; g.fillRect(sx - 6, sy - 1, 12, 2); g.fillStyle = 'rgba(10,8,20,.22)'; g.fillRect(sx - 5, sy - 2, 10, 4); g.fillRect(sx - 3, sy - 3, 6, 6); }
    if (b.modo === 'sentado') {
      y += 3;
      if (b.status === 'trab') q = b.ferramenta === 'ler' ? 5 + (Math.floor(this.t * 1.5) % 2) : 3 + (Math.floor(this.t * 5 + (b.id.length % 3)) % 2);
      else if (b.status === 'alerta') { q = 7; y -= Math.floor(this.t * 4) % 2; }
      else q = 7;
    } else if (b.modo === 'andando') {
      q = b.skate ? 1 : [0, 1, 2, 1][Math.floor(b.anda * 8) % 4];
    }
    if (b.skate) {
      // skate: tábua + rodinhas, o boneco sobe 3 px e balança
      const sx = Math.round(b.x) - 8, sy = Math.round(b.y) - 3;
      g.fillStyle = '#1b1a26'; g.fillRect(sx + 1, sy, 14, 3);
      g.fillStyle = b.pessoa === 'Kenny' ? '#3a86e0' : '#e0763a'; g.fillRect(sx + 2, sy, 12, 2);
      g.fillStyle = '#f4efe2'; g.fillRect(sx + 3, sy, 3, 1);
      g.fillStyle = '#1b1a26'; g.fillRect(sx + 3, sy + 3, 2, 2); g.fillRect(sx + 11, sy + 3, 2, 2);
      y -= 3 + (b.modo === 'andando' ? Math.floor(this.t * 6) % 2 : 0);
    }
    // respiração: parado ou sentado sem digitar, o tronco desce 1 px de vez em quando
    const digita = b.modo === 'sentado' && b.status === 'trab';
    const respira = b.modo !== 'andando' && !digita && ((this.t + (b.fase || 0)) % 2.6) > 1.7 ? 1 : 0;
    desenharQuadro(g, b.folha, b.dir, q, x, y, respira);
    if (b.acao === 'cafe') caneca(g, b, x, y, this.t);
    b.topo = y;
  }

  desenhar(g, cam, vw, vh) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0e0c15'; g.fillRect(0, 0, vw, vh);
    g.save(); g.translate(-cam.x, -cam.y);
    g.drawImage(this.fundo, 0, 0);
    vida.desenharJanelas(g, this);
    // estado das telas: anima o PC de quem está trabalhando
    const statusDaMesa = new Map();
    for (const b of this.agentes.values()) if (b.lugar && !b.lugar.copa) statusDaMesa.set(b.lugar.id, b.modo === 'sentado' ? b.status : 'livre');
    const coisas = [];
    for (const m of this.planta.moveis) {
      coisas.push({ y: m.ordem, f: () => {
        let img = this.mv[m.img];
        if (m.img === 'pcFrente') {
          const st = m.anima?.startsWith('dono') ? 'trab' : statusDaMesa.get(m.anima);
          img = st === 'trab' || st === 'alerta' ? this.mv.pcFrente[Math.floor(this.t * 3 + m.x) % 3] : st === 'fim' || st === 'erro' ? this.mv.pcFrente[0] : this.mv.pcDesligado;
        }
        if (!img) return;
        const px = Math.round(m.x), py = Math.round(m.y + (m.dy || 0) - (m.sobre ? 14 : 0));
        if (m.espelho) { g.save(); g.translate(px + img.width, py); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, px, py);
        if (m.img === 'pcFrente' && statusDaMesa.get(m.anima) === 'semsinal') this.telaSemSinal(g, px, py);
      } });
    }
    for (const b of this.agentes.values()) coisas.push({ y: b.ordemY ?? (b.y + (b.modo === 'sentado' ? 0 : 0.5)), f: () => this.desenharBoneco(g, b) });
    this.planta.assentos.forEach((a, i) => coisas.push({ y: a.pc.y + 3 * T + 1.6, f: () => vida.desenharCacareco(g, a, i) }));
    const est = this.planta.estante; coisas.push({ y: est.y + est.h, f: () => vida.desenharEstante(g, this) });
    for (const l of this.planta.luminarias) coisas.push({ y: l.y, f: () => vida.desenharLuminaria(g, this, l) });
    for (const p of this.pessoas.values()) coisas.push({ y: p.y + 0.6, f: () => this.desenharBoneco(g, p) });
    if (this.eu) coisas.push({ y: this.eu.y + 0.7, f: () => this.desenharBoneco(g, this.eu) });
    coisas.sort((a, b) => a.y - b.y).forEach((c) => c.f());
    for (const q of this.particulas) { g.fillStyle = `rgba(230,225,215,${q.v})`; g.fillRect(Math.round(q.x), Math.round(q.y - (1 - q.v) * 4), 2, 2); }
    vida.desenharVapor(g, this);
    vida.desenharItens(g, this);
    // ícones de estado por cima de tudo
    for (const b of this.agentes.values()) if (b.topo != null) this.icone(g, Math.round(b.x), b.topo - (b.modo === 'sentado' && b.lugar?.dir === 'cima' ? 24 : 6), b.status, b.id);
    // luz do dia pelo relógio real (manhã clara, tarde dourada, noite com luminárias acesas)
    vida.desenharLuz(g, this, cam, vw, vh);
    g.restore();
    vida.desenharBaloes(this, g, cam);
  }
  // toque num item (ferramenta): mostra o cartão do que ele está fazendo
  tocarItem(x, y) { return vida.tocarItem(this, x, y); }

  // Tela do PC (16x32; a tela fica em x 3..12, y 5..9) piscando em amarelo com um "?" escuro.
  telaSemSinal(g, px, py) {
    g.fillStyle = Math.floor(this.t * 2) % 2 ? '#7a6420' : '#ffd23f'; g.fillRect(px + 3, py + 5, 10, 5);
    g.fillStyle = '#1b1a26'; g.fillRect(px + 6, py + 5, 3, 1); g.fillRect(px + 8, py + 6, 1, 1); g.fillRect(px + 7, py + 7, 1, 1); g.fillRect(px + 7, py + 9, 1, 1);
  }

  icone(g, x, y, cls, id) {
    const q = this.t * 8 + hash(id) % 16;
    const bb = Math.round(Math.sin(q / 4) * 1.2);
    const r = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(x + dx, y + dy + bb, w, h); };
    const base = (c) => { r(-6, -9, 12, 10, '#1b1a26'); r(-5, -8, 10, 8, c); r(-1, 1, 2, 2, '#1b1a26'); };
    if (cls === 'trab') { base('#fffaf0'); for (let k = 0; k < 3; k++) r(-4 + k * 3, -5, 2, 2, Math.floor(q / 3) % 3 === k ? '#f0973d' : '#b9ad9c'); }
    else if (cls === 'fim') { base('#4fbf82'); r(-3, -4, 1, 2, '#fff'); r(-2, -3, 1, 2, '#fff'); r(-1, -2, 1, 1, '#fff'); r(0, -4, 1, 2, '#fff'); r(1, -5, 1, 2, '#fff'); r(2, -6, 1, 2, '#fff'); }
    else if (cls === 'erro') { base('#ef6a55'); r(-3, -6, 2, 2, '#fff'); r(1, -6, 2, 2, '#fff'); r(-1, -4, 2, 2, '#fff'); r(-3, -2, 2, 1, '#fff'); r(1, -2, 2, 1, '#fff'); }
    else if (cls === 'semsinal') { base('#8fa3c7'); r(-2, -7, 4, 1, '#fff'); r(1, -6, 1, 2, '#fff'); r(-1, -4, 2, 1, '#fff'); r(-1, -2, 2, 1, '#fff'); }
    else if (cls === 'alerta') { const pulo = Math.abs(Math.sin(this.t * 6)) * 3; g.fillStyle = '#1b1a26'; g.fillRect(x - 3, y - 13 - pulo, 6, 12); g.fillStyle = '#ffd23f'; g.fillRect(x - 2, y - 12 - pulo, 4, 7); g.fillRect(x - 2, y - 4 - pulo, 4, 2); }
  }

  desenharMinimapa(g, w, h, cam, vw, vh) {
    const kx = w / (MW * T), ky = h / (MH * T);
    g.imageSmoothingEnabled = true; g.drawImage(this.mini, 0, 0, w, h);
    const cor = { trab: '#f0973d', alerta: '#ffd23f', erro: '#ef6a55', fim: '#4fbf82', semsinal: '#8fa3c7' };
    for (const b of this.agentes.values()) { g.fillStyle = cor[b.status] || '#aab1c4'; g.fillRect(b.x * kx - 1.5, b.y * ky - 2, 3, 3); }
    for (const p of this.pessoas.values()) { g.fillStyle = '#fff'; g.fillRect(p.x * kx - 2.5, p.y * ky - 3, 5, 5); g.fillStyle = p.pessoa === 'Kenny' ? '#3a86e0' : '#e0763a'; g.fillRect(p.x * kx - 1.5, p.y * ky - 2, 3, 3); }
    if (this.eu) { g.fillStyle = '#fff'; g.fillRect(this.eu.x * kx - 3, this.eu.y * ky - 3.5, 6, 6); g.fillStyle = this.eu.pessoa === 'Kenny' ? '#3a86e0' : '#e0763a'; g.fillRect(this.eu.x * kx - 2, this.eu.y * ky - 2.5, 4, 4); }
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.strokeRect(cam.x * kx + 0.5, cam.y * ky + 0.5, vw * kx, vh * ky);
  }
}
