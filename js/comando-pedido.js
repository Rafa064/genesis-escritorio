// "Novo pedido": UM painel, com o mesmo nome em todo lugar (botão do mapa, Conversas, pedido do Kenny,
// sugestões do Hoje). Escrever o que precisa → projeto → contexto opcional → Enviar pedido.
// Quem executa (Claude ou Codex) e em qual conversa ficam recolhidos em "Detalhes".
// Depois do envio o mesmo painel mostra: pedido criado, responsável e estado (e "Acompanhar pedido").
import { ctx, esc, guardado, guarda } from './comando-ctx.js';
import { primeiraFrase } from './humano.js';
import { ico } from './comando-icones.js';
import * as CDu from './comando-dupla.js';
import { ETAPAS } from './comando-progresso.js';

let fundo = null, st = {};
const projetos = () => { const ps = (ctx.estado(ctx.eu().pessoa)?.info?.projetos || []).map((p) => p.nome).filter(Boolean); return ps.length ? ps : ['genesis-game']; };
const nomeIa = (a) => (a === 'codex' ? 'Codex' : 'Claude');

function garantir() {
  if (fundo) return fundo;
  fundo = document.createElement('div'); fundo.id = 'novoPedido'; fundo.className = 'np-fundo'; fundo.hidden = true;
  document.body.appendChild(fundo);
  fundo.addEventListener('click', aoClicar);
  fundo.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
  fundo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fechar();
    if (e.key === 'Enter' && !e.shiftKey && e.target.name === 'texto' && matchMedia('(pointer: fine)').matches) { e.preventDefault(); enviar(); }
  });
  return fundo;
}
export const aberto = () => !!fundo && !fundo.hidden;
export function fechar() { if (fundo) fundo.hidden = true; document.body.classList.remove('np-aberto'); }

// op: { texto, para ('eu' | nome do outro), alvo, projeto, contexto, conv (id para continuar), bola, missao, alvoOutro }
export function abrirNovoPedido(op = {}) {
  garantir();
  const outro = ctx.outra();
  st = {
    para: outro && (op.para === outro || op.para === 'outro') ? outro : 'eu', alvo: op.alvo || (guardado('alvoBarra', 'claude') === 'codex' ? 'codex' : 'claude'),
    projeto: op.projeto && projetos().includes(op.projeto) ? op.projeto : ctx.projetoPadrao(), conv: op.conv ?? null,
    bola: op.bola || null, missao: op.missao || null, alvoOutro: op.alvoOutro || 'pessoa', enviando: false,
  };
  desenharForm(op.texto || '', op.contexto || '');
  fundo.hidden = false; document.body.classList.add('np-aberto');
  setTimeout(() => { const t = fundo.querySelector('textarea[name=texto]'); t?.focus(); if (t) t.setSelectionRange(t.value.length, t.value.length); }, 40);
}

function desenharForm(texto, contexto) {
  const outro = ctx.outra(), paraOutro = st.para !== 'eu';
  const conv = st.conv != null ? ctx.conversas().find((c) => c.id === st.conv) : null;
  const recente = ctx.conversas().filter((c) => (c.alvo || 'claude') === st.alvo).sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado))[0];
  const estado = paraOutro ? '' : ctx.estadoPedido({ alvo: st.alvo, convId: st.conv });
  const auto = paraOutro ? CDu.contextoAuto(st.missao) : null;
  fundo.innerHTML = `<form class="np painel-px" role="dialog" aria-modal="true" aria-labelledby="npTit" autocomplete="off">
    <div class="np-cab"><h2 id="npTit">${ico('lapis')}Novo pedido</h2><button type="button" class="np-x" data-np="fechar" aria-label="Fechar">×</button></div>
    ${st.bola ? `<p class="np-origem"><b>${esc(st.bola.de)}</b> pediu: “${esc(primeiraFrase(st.bola.texto, 120))}”. Revise e envie para a sua assistente.</p>` : ''}
    ${outro && !st.bola ? `<div class="np-bloco"><span class="np-rot" id="npParaRot">Para quem</span><div class="np-seg" role="radiogroup" aria-labelledby="npParaRot">
      <button type="button" role="radio" aria-checked="${!paraOutro}" class="${!paraOutro ? 'on' : ''}" data-np-para="eu">Minha assistente</button>
      <button type="button" role="radio" aria-checked="${paraOutro}" class="${paraOutro ? 'on' : ''}" data-np-para="${esc(outro)}">${esc(outro)}</button></div></div>` : ''}
    <label class="np-bloco"><span class="np-rot">O que você precisa?</span>
      <textarea name="texto" rows="3" maxlength="${paraOutro ? 280 : 4000}" placeholder="${paraOutro ? `Ex.: dá uma olhada no Short antes de eu publicar?` : 'Ex.: monta o Short do combo Raio + Fogo com corte no compasso'}">${esc(texto)}</textarea></label>
    ${paraOutro
      ? `<div class="np-bloco"><span class="np-rot">Quem faz</span><div class="np-seg">
          <button type="button" class="${st.alvoOutro === 'pessoa' ? 'on' : ''}" data-np-outro="pessoa">${esc(outro)} mesmo</button>
          <button type="button" class="${st.alvoOutro !== 'pessoa' ? 'on' : ''}" data-np-outro="ia">A assistente dele</button></div>
          <p class="np-ajuda">${st.alvoOutro === 'pessoa' ? `${esc(outro)} recebe o pedido e responde quando puder.` : `${esc(outro)} recebe o pedido pronto e decide se manda para a assistente dele. Ninguém mexe no PC do outro sem ele aceitar.`}</p></div>
        ${auto.texto ? `<label class="np-chk"><input type="checkbox" name="usarCtx" checked><span><b>Mandar o contexto junto</b><small>${esc(auto.texto)}</small></span></label>` : ''}`
      : `<div class="np-bloco np-linha"><span class="np-rot">Projeto</span><select name="projeto" aria-label="Projeto">${projetos().map((p) => `<option ${p === (conv?.projeto || st.projeto) ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <details class="np-ctx" ${contexto ? 'open' : ''}><summary>Contexto <small>(opcional)</small></summary><textarea name="contexto" rows="2" maxlength="1200" placeholder="Arquivos, links ou o que ela precisa saber">${esc(contexto)}</textarea></details>
        <details class="np-det"><summary>Detalhes <small>· ${esc(nomeIa(st.alvo))} · ${conv ? 'continua uma conversa' : 'conversa nova'}</small></summary>
          <div class="np-bloco"><span class="np-rot">Quem executa</span><div class="np-seg"><button type="button" class="${st.alvo === 'claude' ? 'on' : ''}" data-np-ia="claude">Claude <small>(padrão)</small></button><button type="button" class="${st.alvo === 'codex' ? 'on' : ''}" data-np-ia="codex">Codex</button></div></div>
          <div class="np-bloco"><span class="np-rot">Conversa</span><div class="np-seg"><button type="button" class="${!conv ? 'on' : ''}" data-np-conv="">Nova</button>${recente ? `<button type="button" class="${conv ? 'on' : ''}" data-np-conv="${recente.id}">Continuar “${esc(primeiraFrase(recente.titulo, 26))}”</button>` : ''}</div></div>
        </details>`}
    ${estado ? `<p class="np-estado">${esc(estado)}</p>` : ''}
    <div class="np-rodape"><button type="button" class="btn" data-np="fechar">Cancelar</button><button class="btn forte" data-np-enviar>${paraOutro ? `Enviar ao ${esc(outro)}` : 'Enviar pedido'}</button></div>
  </form>`;
}

function valores() {
  const f = fundo.querySelector('form');
  return { texto: f?.texto?.value || '', contexto: f?.contexto?.value || '', projeto: f?.projeto?.value || st.projeto, usarCtx: f?.usarCtx ? f.usarCtx.checked : false };
}
function aoClicar(e) {
  if (e.target === fundo) return fechar();
  const b = e.target.closest('[data-np],[data-np-para],[data-np-ia],[data-np-conv],[data-np-outro]'); if (!b) return;
  const v = valores();
  if (b.dataset.np === 'fechar') return fechar();
  if (b.dataset.np === 'acompanhar') { fechar(); return st.criado?.para === 'eu' ? ctx.acompanharPedido(st.criado.convId) : ctx.abrirAba('dupla'); }
  if (b.dataset.np === 'outro') return abrirNovoPedido({});
  st.projeto = v.projeto;
  if (b.dataset.npPara) st.para = b.dataset.npPara;
  if (b.dataset.npIa) { st.alvo = b.dataset.npIa; guarda('alvoBarra', st.alvo); st.conv = null; }
  if (b.dataset.npConv != null) st.conv = b.dataset.npConv ? Number(b.dataset.npConv) : null;
  if (b.dataset.npOutro) st.alvoOutro = b.dataset.npOutro;
  const detAberto = fundo.querySelector('.np-det')?.open;
  desenharForm(v.texto, v.contexto);
  if (detAberto) { const d = fundo.querySelector('.np-det'); if (d) d.open = true; }
}

async function enviar() {
  if (st.enviando || !fundo.querySelector('form')) return;
  const v = valores(), texto = v.texto.trim();
  if (!texto) { fundo.querySelector('textarea[name=texto]')?.focus(); return; }
  st.enviando = true; const bt = fundo.querySelector('[data-np-enviar]'); if (bt) { bt.disabled = true; bt.textContent = 'Enviando…'; }
  try {
    if (st.para !== 'eu') {
      const j = await CDu.mandarBola({ alvo: st.alvoOutro === 'pessoa' ? 'pessoa' : 'claude', texto, usarCtx: v.usarCtx, missao: st.missao });
      st.criado = { para: st.para, titulo: j.texto, alvoOutro: st.alvoOutro };
    } else {
      const final = v.contexto.trim() ? `${texto}\n\n(Contexto: ${v.contexto.trim()})` : texto;
      const r = await ctx.criarPedido({ texto: final, alvo: st.alvo, convId: st.conv, projeto: v.projeto });
      st.criado = { para: 'eu', titulo: texto, alvo: st.alvo, projeto: r.conv?.projeto || v.projeto, convId: r.conv?.id ?? null, naFila: r.naFila, ligado: r.ligado, pausada: r.pausada, convTitulo: r.conv?.titulo || '' };
      if (st.bola) await CDu.bolaEncaminhada(st.bola.id);
    }
    desenharCriado();
    ctx.redesenharTopo?.();
  } catch (err) {
    ctx.toast({ titulo: 'Não consegui mandar', texto: err.message, cor: '#ef6a55' });
    if (bt) { bt.disabled = false; bt.textContent = st.para !== 'eu' ? `Enviar ao ${st.para}` : 'Enviar pedido'; }
  } finally { st.enviando = false; }
}

// Depois do envio: pedido criado, responsável e estado, com as etapas que vêm a seguir.
async function desenharCriado() {
  const c = st.criado;
  let resp, estado, cls, passos, dica;
  if (c.para === 'eu') {
    resp = `<img src="${await ctx.retrato('Orquestrador')}" alt=""><span><b>Sua assistente</b><small>executa com ${esc(nomeIa(c.alvo))} · projeto ${esc(c.projeto)}</small></span>`;
    [cls, estado] = c.pausada ? ['espera', 'Pausada: começa quando você tirar a pausa'] : !c.ligado ? ['espera', 'Esperando o seu PC ligar'] : c.naFila ? ['fila', 'Na fila: começa quando ela terminar o pedido atual'] : ['ok', 'Recebido · começa em instantes'];
    passos = ETAPAS; // as mesmas 4 etapas do cartão do pedido na conversa
    dica = 'Você recebe um aviso quando ficar pronto ou se ela precisar de uma decisão sua.';
  } else {
    resp = `<img src="${await ctx.retrato(c.para)}" alt=""><span><b>${esc(c.para)}</b><small>${c.alvoOutro === 'pessoa' ? 'ele mesmo' : 'pela assistente dele, se ele aceitar'}</small></span>`;
    [cls, estado] = ['fila', `Enviado: esperando o ${c.para} aceitar`];
    passos = ['Enviado', `${c.para} aceita`, 'Pronto'];
    dica = `Quando ${c.para} assumir ou encaminhar, aparece em Conversas › Dupla.`;
  }
  fundo.innerHTML = `<div class="np np-ok painel-px" role="dialog" aria-modal="true" aria-labelledby="npTit">
    <div class="np-cab"><h2 id="npTit">${ico('check')}Pedido criado</h2><button type="button" class="np-x" data-np="fechar" aria-label="Fechar">×</button></div>
    <p class="np-ok-tit">“${esc(primeiraFrase(c.titulo, 140))}”</p>
    <dl class="np-fatos">
      <div><dt>Responsável</dt><dd class="np-resp">${resp}</dd></div>
      <div><dt>Estado</dt><dd><span class="np-est ${cls}"><i></i>${esc(estado)}</span></dd></div>
    </dl>
    <ol class="np-passos" aria-label="Etapas do pedido">${passos.map((p, i) => `<li class="${i === 0 ? 'ok' : ''}">${esc(p)}</li>`).join('')}</ol>
    <p class="np-ajuda">${esc(dica)}</p>
    <div class="np-rodape"><button type="button" class="btn" data-np="outro">Outro pedido</button><button type="button" class="btn forte" data-np="acompanhar">Acompanhar pedido</button></div>
  </div>`;
  fundo.querySelector('[data-np=acompanhar]')?.focus();
}
// Pedido mandado direto (ex.: "Mandar" de uma sugestão do Hoje): mostra o mesmo "Pedido criado".
export function mostrarCriado(criado) {
  garantir(); st = { ...st, para: 'eu', criado: { para: 'eu', ...criado } };
  fundo.hidden = false; document.body.classList.add('np-aberto');
  desenharCriado();
}
