// HUD de limites de IA, sempre na tela principal (canto do mapa): sessão de 5 h e semana do Claude e do
// ChatGPT/Codex, de quem está escolhido (você ou a outra pessoa, com o retrato e a cor de cada um).
// Minimizado: uma pílula com as duas porcentagens da sessão. Aberto: o cartão com as 4 barras.
// Os números vêm do estado.info.uso.limites que a ponte de cada PC manda (escritorio/uso.mjs).
import * as D from './dados.js';
import { quandoReinicia } from './funcoes-hoje.js';

let ctx = null, el = null;
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let aberto = guardado('limAberto', matchMedia('(max-width: 700px)').matches ? '0' : '1') === '1';
let pessoa = null;
const fotos = new Map(); // retrato em pixel de cada pessoa (vem assíncrono)

export function ligar(c) {
  ctx = c;
  el = document.createElement('div');
  el.id = 'limitesHud'; el.className = 'lim-hud';
  document.getElementById('palco')?.appendChild(el);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-lim]'); if (!b) return;
    const a = b.dataset.lim;
    if (a === 'abrir') aberto = true; else if (a === 'fechar') aberto = false;
    else if (a === 'detalhes') { ctx.abrirEm?.('custo'); return; }
    else if (a.startsWith('p:')) pessoa = a.slice(2);
    guarda('limAberto', aberto ? '1' : '0');
    desenhar();
  });
  desenhar();
  setInterval(desenhar, 30e3);
}

function dadosDe(p) {
  const u = ctx.estados().get(p)?.info?.uso || (ctx.DEMO ? demo(p) : null);
  return u?.limites ? u : null;
}
const usadoAgora = (w) => (!w ? null : w.reinicia && w.reinicia * 1000 < Date.now() ? 0 : w.usado);
const corDe = (v) => (v == null ? '#9a8a74' : v >= 90 ? '#d8453c' : v >= 70 ? '#e39a2e' : '#3a9f6a');
const txtDe = (w) => { const v = usadoAgora(w); if (v != null) return `${Math.round(v)}%`; if (!w) return '—'; return w.status === 'rejected' ? 'esgotado' : w.status === 'allowed_warning' ? 'quase' : 'ok'; };

function barra(rotulo, w) {
  const v = usadoAgora(w);
  const quando = w ? (quandoReinicia(w.reinicia) || (w.aviso ? 'reinicia ' + w.aviso : '')) : 'sem leitura';
  return `<div class="lh-linha${w ? '' : ' vazio'}"><span class="lh-r">${rotulo}</span><b style="color:${corDe(v)}">${txtDe(w)}</b>
    <span class="lh-b"><i style="width:${Math.min(100, Math.max(v ? 3 : 0, v || 0))}%;background:${corDe(v)}"></i></span>
    <small>${quando}</small></div>`;
}

function desenhar() {
  if (!el || !ctx) return;
  const eu = ctx.eu()?.pessoa, todas = ctx.pessoas();
  if (!pessoa || !todas.includes(pessoa)) pessoa = eu || todas[0];
  const u = dadosDe(pessoa), cl = u?.limites?.claude, cx = u?.limites?.codex;
  const quem = pessoa === eu ? `${ctx.esc(pessoa)} <em>(você)</em>` : ctx.esc(pessoa);
  const cor = ctx.corPessoa(pessoa);
  const retrato = (p) => { const r = fotos.get(p); if (r === undefined && ctx.retratoDe) { fotos.set(p, null); Promise.resolve(ctx.retratoDe(p)).then((u) => { fotos.set(p, u); desenhar(); }).catch(() => {}); } return r ? `<img src="${r}" alt="">` : `<i style="background:${ctx.corPessoa(p)}"></i>`; };
  el.style.setProperty('--lh-cor', cor);
  el.classList.toggle('aberto', aberto);
  if (!aberto) {
    const c5 = usadoAgora(cl?.five_hour), g5 = usadoAgora(cx?.five_hour);
    el.innerHTML = `<button type="button" class="lh-pilula" data-lim="abrir" title="Limites de IA de ${ctx.esc(pessoa)} (sessão de 5 h). Tocar abre.">
      <span class="lh-quem">${retrato(pessoa)}${ctx.esc(pessoa)}</span><span class="lh-cap">uso<br>5 h</span>
      <span class="lh-mini"><span class="lh-ia claude">Claude</span><b style="color:${corDe(c5)}">${txtDe(cl?.five_hour)}</b></span>
      <span class="lh-mini"><span class="lh-ia gpt">GPT</span><b style="color:${corDe(g5)}">${txtDe(cx?.five_hour)}</b></span></button>`;
    return;
  }
  const lido = [cl?.t, cx?.t].filter(Boolean);
  const sem = !u ? `<p class="lh-sem">${pessoa === eu ? 'Sua ponte' : `A ponte de ${ctx.esc(pessoa)}`} ainda não manda os limites. No PC: <code>git pull</code> em genesis-estudio e ☰ › Reiniciar ponte.</p>` : '';
  el.innerHTML = `<div class="lh-cartao">
    <div class="lh-topo"><span class="lh-tit">Limites de IA</span><button type="button" class="lh-x" data-lim="fechar" title="Minimizar" aria-label="Minimizar">–</button></div>
    <div class="lh-pessoas">${todas.map((p) => `<button type="button" data-lim="p:${ctx.esc(p)}" class="${p === pessoa ? 'sel' : ''}" style="--c:${ctx.corPessoa(p)}">${retrato(p)}${ctx.esc(p)}${p === eu ? ' (você)' : ''}</button>`).join('')}</div>
    <p class="lh-de">Mostrando os limites de <b style="color:${cor}">${quem}</b>${cl?.plano ? ` · plano ${ctx.esc(cl.plano)}` : ''}</p>
    ${sem || `<div class="lh-ia-bloco"><h5><span class="lh-ia claude">Claude</span></h5>${barra('Sessão 5 h', cl?.five_hour)}${barra('Semana', cl?.seven_day)}</div>
    <div class="lh-ia-bloco"><h5><span class="lh-ia gpt">ChatGPT / Codex</span></h5>${barra('Sessão 5 h', cx?.five_hour)}${barra('Semana', cx?.seven_day)}</div>
    <div class="lh-pe"><span>${lido.length ? 'lido ' + D.ha(Math.max(...lido)) : ''}</span><button type="button" data-lim="detalhes">Mês e detalhes ›</button></div>`}
  </div>`;
}

function demo(p) {
  const s = Math.round(Date.now() / 1000), t = Date.now() - 2 * 60e3;
  const k = p === 'Kenny';
  return { limites: { claude: { plano: k ? 'max' : 'pro', t, five_hour: { usado: k ? 22 : 64, reinicia: s + 7800, t }, seven_day: { usado: k ? 15 : 41, reinicia: s + 3 * 86400, t } },
    codex: { t, five_hour: { usado: k ? 5 : 12, reinicia: s + 14000 }, seven_day: { usado: k ? 30 : 91, reinicia: s + 2 * 86400 } } } };
}
