// Acompanhar um pedido em linguagem de gente: o que está fazendo agora, quem foi chamado, quanto falta;
// e, quando acaba, "o que mudou" + próximos passos com um toque.
import * as D from './dados.js';
import { frase, primeiraFrase } from './humano.js';
import { tituloDe } from './config.js';
import { ctx, esc, tempoDe, nomeArq } from './comando-ctx.js';

const EDITA = /^(Write|Edit|MultiEdit|NotebookEdit)$/;
const nomeItem = (x) => x.tipo === 'agente' ? tituloDe(x.nome) : x.nome;

// Arquivos que a missão escreveu ou editou (mais recentes primeiro, sem repetir).
export function arquivosMudados(m) {
  const vistos = new Set(), out = [];
  for (const e of [...(m?.passos || [])].reverse()) {
    if (!EDITA.test(e.ferramenta || '')) continue;
    const a = String(e.arq || e.alvo || '').trim(); if (!a) continue;
    const k = a.toLowerCase(); if (vistos.has(k)) continue;
    vistos.add(k); out.push(a);
  }
  return out;
}

// Próximos passos sugeridos pelo que aconteceu (texto pronto para mandar; você ainda pode editar).
export function proximosPassos(m) {
  const arqs = arquivosMudados(m), lista = [];
  const tem = (re) => arqs.some((a) => re.test(a)) || re.test(m.pedido || '');
  const video = tem(/\.(mp4|mov|tsx)$|remotion|short|trailer|v[ií]deo/i) || (m.miniaturas || []).some((x) => /\.(mp4|webm|gif)$/i.test(x.caminho || ''));
  if (tem(/\.(gd|tscn|tres)$|godot|player|inimigo|enemy/i)) lista.push({ rot: '🎮 Testar no jogo', texto: 'Rode o jogo (Godot headless) e os testes do que você mudou. Me diga em 2 linhas se algo quebrou.' });
  if (video) lista.push({ rot: '🎯 Nota do Codex', texto: 'Peça ao Codex uma nota de 0 a 10 do resultado, com críticas concretas, e corrija até passar de 8.' });
  lista.push({ rot: '💡 Como eu testo?', texto: 'Me explique em 3 linhas, para leigo, o que mudou e como eu testo.' });
  lista.push({ rot: '🏀 Mostrar pro ' + (ctx.outra?.() || 'outro'), bola: true });
  if (arqs.length) lista.push({ rot: '📦 Salvar (commit)', texto: 'Revise o que mudou, faça um commit com mensagem clara em português e me diga em qual branch ficou.' });
  if (!ctx.marcoDaMissao?.(m)) lista.push({ rot: '🏁 Pendurar num marco', missao: true });
  return lista.slice(0, 4);
}
const resumoMudou = (arqs, minis) => [arqs.length && `${arqs.length} arquivo${arqs.length > 1 ? 's' : ''}`, minis && `${minis} imagem/vídeo`].filter(Boolean).join(' e ') || 'nenhum arquivo';

// Cartão do pedido da conversa aberta. Devolve '' quando não há nada para mostrar.
export function htmlAgora({ m, conv, ocupada, escalacaoHtml = '' }) {
  const gpt = conv?.alvo === 'codex';
  const rodando = ocupada || (m && !m.fim && ['trab', 'alerta', 'semsinal'].includes(m.status));
  if (rodando) return htmlRodando(m, gpt, escalacaoHtml);
  if (m?.fim && m.status !== 'erro' && Date.now() - m.fim < 12 * 3600e3) return htmlPronto(m);
  return '';
}

function htmlRodando(m, gpt, escalacaoHtml) {
  const quem = gpt ? 'O Codex' : 'A assistente';
  if (!m) return `<div class="cp cp-rodando"><div class="cp-cab"><span class="cp-pulso"></span><b>${quem} está trabalhando</b><span class="cp-tempo">agora</span></div>
    <div class="cp-barra ind"><i></i></div><p class="cp-agora">Pensando no pedido… a resposta aparece aqui embaixo.</p>
    <div class="cp-acoes"><button type="button" class="btn mini" data-cp="parar">■ Parar</button></div></div>`;
  const itens = D.escalacao(m), ajudantes = itens.filter((x) => x.tipo === 'agente' || x.tipo === 'programa');
  const prontos = ajudantes.filter((x) => x.estado === 'pronto').length, total = ajudantes.length;
  const ult = m.passos.at(-1);
  const aprovNaTela = !!document.querySelector('#msgs .aprovacao');
  const alerta = aprovNaTela || m.status === 'alerta' || ult?.tipo === 'alerta';
  // Pedido de permissão na conversa: ele vem primeiro; o cartão encolhe para uma linha + botão.
  if (aprovNaTela) return `<div class="cp cp-rodando cp-alerta cp-curto"><div class="cp-cab"><span class="cp-pulso"></span><b>Precisa de você</b><span class="cp-tempo">há ${tempoDe(Date.now() - m.inicio)}</span></div>
    <button type="button" class="btn forte cp-aprovar" data-cp="aprovar">✋ Ver o que ela quer fazer</button>
    <div class="cp-acoes"><button type="button" class="btn mini" data-cp="parar">■ Parar</button><button type="button" class="btn mini" data-cp="missao" data-id="${esc(m.id)}">Passo a passo ›</button></div></div>`;
  const quemFaz = ult && ult.agente && ult.agente !== 'Orquestrador' ? `${tituloDe(ult.agente)}: ` : '';
  const agora = alerta ? '✋ Esperando você aprovar um passo (cartão abaixo)' : ult ? quemFaz + primeiraFrase(frase(ult), 90) : 'Lendo o pedido e montando o plano…';
  const pct = total ? Math.round((prontos / total) * 100) : 0;
  const falta = total ? (prontos === total ? 'todos entregaram: só falta a resposta final' : `${prontos} de ${total} ajudantes já entregaram`) : 'ainda montando quem vai ajudar';
  const trab = ajudantes.filter((x) => x.estado === 'trabalhando').map((x) => nomeItem(x));
  const ultT = Math.max(ult?.t || 0, m.ultimo || 0);
  return `<div class="cp cp-rodando ${alerta ? 'cp-alerta' : ''}">
    <div class="cp-cab"><span class="cp-pulso"></span><b>${alerta ? 'Precisa de você' : `${gpt ? 'O Codex' : 'A assistente'} está trabalhando`}</b><span class="cp-tempo">há ${tempoDe(Date.now() - m.inicio)}</span></div>
    <p class="cp-agora">${esc(agora)}<small class="cp-ult">última notícia ${ultT ? D.ha(ultT) : 'agora'}</small></p>
    ${alerta ? '<button type="button" class="btn forte cp-aprovar" data-cp="aprovar">✋ Ver o que ela quer fazer</button>' : ''}
    ${total ? `<div class="cp-barra"><i style="width:${pct}%"></i></div>` : ''}<p class="cp-falta">${esc(falta)}${trab.length ? ` · agora com ${esc(trab.slice(0, 2).join(' e '))}${trab.length > 2 ? ` +${trab.length - 2}` : ''}` : ''}</p>
    <div class="cp-acoes"><button type="button" class="btn mini" data-cp="parar" title="Para só esta conversa">■ Parar</button>${escalacaoHtml ? '<button type="button" class="btn mini" data-cp="escalacao">Quem faz o quê ▾</button>' : ''}<button type="button" class="btn mini" data-cp="missao" data-id="${esc(m.id)}">Passo a passo ›</button></div>
    ${escalacaoHtml ? `<div class="cp-esc" hidden>${escalacaoHtml}</div>` : ''}</div>`;
}

function htmlPronto(m) {
  const arqs = arquivosMudados(m), minis = (m.miniaturas || []).length;
  const entregas = D.escalacao(m).filter((x) => x.estado === 'pronto' && (x.tipo === 'agente' || x.tipo === 'programa'));
  const linhas = [];
  if (arqs.length) linhas.push(`<li>📝 <b>${arqs.length} arquivo${arqs.length > 1 ? 's' : ''}</b>: ${arqs.slice(0, 4).map((a) => `<code title="${esc(a)}">${esc(nomeArq(a))}</code>`).join(' ')}${arqs.length > 4 ? ` +${arqs.length - 4}` : ''}</li>`);
  if (minis) linhas.push(`<li>🖼 <b>${minis}</b> resultado${minis > 1 ? 's' : ''} novo${minis > 1 ? 's' : ''} na galeria</li>`);
  if (entregas.length) linhas.push(`<li>🤝 Entregaram: ${entregas.map((x) => esc(nomeItem(x))).join(', ')}</li>`);
  if (!linhas.length) linhas.push('<li>💬 Só respondeu (nenhum arquivo mudou)</li>');
  const passos = proximosPassos(m);
  const frase1 = primeiraFrase(m.resposta || '', 140);
  return `<div class="cp cp-pronto">
    <div class="cp-cab"><span class="cp-ok">✓</span><b>Pronto em ${tempoDe(m.duracao)}</b><span class="cp-tempo">${D.ha(m.fim)}</span></div>
    ${frase1 ? `<p class="cp-resumo">${esc(frase1)}</p>` : ''}
    <details class="cp-det"><summary>O que mudou: ${esc(resumoMudou(arqs, minis))}</summary><ul class="cp-mudou">${linhas.join('')}</ul></details>
    <div class="cp-acoes"><button type="button" class="btn mini" data-cp="missao" data-id="${esc(m.id)}">Ver resultado completo ›</button></div>
    <p class="cp-rot">Próximo passo <small>(toque para pôr na caixa)</small></p>
    <div class="cp-prox">${passos.map((p, i) => `<button type="button" class="cp-sug" data-cp-sug="${i}">${esc(p.rot)}</button>`).join('')}</div>
  </div>`;
}

// Liga os botões do cartão (uma vez por elemento). m() devolve a missão de agora.
export function ligarAgora(el, missaoAtual) {
  if (!el || el.dataset.cpLigado) return;
  el.dataset.cpLigado = '1';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cp],[data-cp-sug]'); if (!b) return;
    const m = missaoAtual();
    if (b.dataset.cp === 'parar') return ctx.parar();
    if (b.dataset.cp === 'escalacao') { const box = el.querySelector('.cp-esc'); if (box) { box.hidden = !box.hidden; b.textContent = box.hidden ? 'Quem faz o quê ▾' : 'Quem faz o quê ▴'; } return; }
    if (b.dataset.cp === 'missao') return ctx.abrirMissao(b.dataset.id);
    if (b.dataset.cp === 'aprovar') { document.querySelector('#msgs .aprovacao')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (b.dataset.cpSug != null && m) {
      const p = proximosPassos(m)[Number(b.dataset.cpSug)]; if (!p) return;
      if (p.bola) return ctx.abrirBola?.({ texto: `Dá uma olhada no que ficou pronto: ${primeiraFrase(m.titulo, 90)}`, missao: m });
      if (p.missao) return ctx.abrirMissao(m.id);
      ctx.preencher(p.texto);
    }
  });
}
