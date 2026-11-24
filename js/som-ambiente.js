// Som ambiente do escritório, todo sintetizado (WebAudio, sem arquivos): teclado quando alguém
// está trabalhando, café (xícara e cafeteira) quando alguém está na copa, e chuva leve nos dias
// de chuva. DESLIGADO por padrão; um botão 🔈 discreto no mapa liga e desliga (lembra a escolha).
let ctx = null, mestre = null, chuva = null, ligado = false, timer = null;

const lembrar = () => { try { return localStorage.getItem('somAmbiente') === '1'; } catch { return false; } };
const guardar = (v) => { try { localStorage.setItem('somAmbiente', v ? '1' : '0'); } catch {} };

function ruido(seg) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seg), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let bufRuido = null;
function tecla(vol = 1) {
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = bufRuido;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 2200; f.Q.value = 3;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  s.connect(f).connect(g).connect(mestre); s.start(t, Math.random() * 1.5, 0.06);
}
function xicara() {
  const t = ctx.currentTime;
  for (const [fr, v] of [[2350, 0.05], [3480, 0.03], [5120, 0.015]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = fr * (0.98 + Math.random() * 0.04);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(mestre); o.start(t); o.stop(t + 0.5);
  }
}
function cafeteira() {
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = bufRuido;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.6);
  s.connect(f).connect(g).connect(mestre); s.start(t, 0, 1.7);
}
function ligarChuva() {
  if (chuva) return;
  const s = ctx.createBufferSource(); s.buffer = ruido(3); s.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
  const g = ctx.createGain(); g.gain.value = 0.05;
  s.connect(hp).connect(lp).connect(g).connect(mestre); s.start();
  chuva = { s, g };
}

function laco(mundo) {
  if (!ligado || !ctx) return;
  const bs = [...mundo.agentes.values()];
  const digitando = bs.filter((b) => b.modo === 'sentado' && b.status === 'trab' && !b.lugar?.copa).length;
  // teclado: mais gente trabalhando = mais teclas (rajadas curtas, como gente digitando)
  if (digitando && Math.random() < Math.min(0.85, 0.18 + digitando * 0.08)) { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) setTimeout(() => ligado && tecla(0.6 + Math.random() * 0.5), i * (60 + Math.random() * 70)); }
  const cafe = bs.filter((b) => b.acao === 'cafe').length;
  if (cafe && Math.random() < 0.012 * cafe) xicara();
  if (cafe && Math.random() < 0.003) cafeteira();
  if (mundo.chuva) ligarChuva(); else if (chuva) { chuva.s.stop(); chuva = null; }
}

function ligar(mundo, botao) {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); mestre = ctx.createGain(); mestre.gain.value = 0.6; mestre.connect(ctx.destination); bufRuido = ruido(2);
  }
  ctx.resume?.();
  ligado = true; mestre.gain.setTargetAtTime(0.6, ctx.currentTime, 0.2);
  clearInterval(timer); timer = setInterval(() => laco(mundo), 220);
  botao.textContent = '🔊'; botao.classList.add('on'); botao.title = 'Som ambiente ligado (toque para desligar)';
  return true;
}
function desligar(botao) {
  ligado = false; clearInterval(timer);
  if (ctx) mestre.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  botao.textContent = '🔈'; botao.classList.remove('on'); botao.title = 'Ligar som ambiente (teclado, café, chuva)';
}

export function iniciarSomAmbiente(mundo) {
  if (typeof document === 'undefined') return;
  const palco = document.getElementById('palco'); if (!palco || document.getElementById('somAmbiente')) return;
  const b = document.createElement('button');
  b.id = 'somAmbiente'; b.type = 'button'; b.className = 'som-ambiente'; b.setAttribute('aria-label', 'Som ambiente');
  desligar(b);
  b.addEventListener('click', (ev) => { ev.stopPropagation(); if (ligado) { desligar(b); guardar(false); } else if (ligar(mundo, b)) guardar(true); });
  palco.appendChild(b);
  // lembrou "ligado": o navegador só deixa tocar depois de um toque na página
  if (lembrar()) { const um = () => { if (!ligado) ligar(mundo, b); removeEventListener('pointerdown', um); }; addEventListener('pointerdown', um); }
}
