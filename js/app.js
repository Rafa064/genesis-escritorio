// Estúdio Genesis: liga mundo + dados + rede + interface.
import { ORDEM_PESSOAS, COR_PESSOA, tituloDe, registrarFichas, fichaDe } from './config.js';
import { T, MW, MH, SALAS, AGENTES_CONHECIDOS, tileDe } from './mapa.js';
import { criarMundo } from './mundo.js';
import { montarPersonagem, retrato } from './arte.js';
import { visualDe } from './personagens.js';
import { frase, passo, iconePasso, resumo, fases, primeiraFrase, categoria } from './humano.js';
import { JOGOS, SETORES, jogoPorId, setorPorId, todosJogos, frente, frentePorId, definirPastas } from './frentes.js';
import { TIPOS, tipoDe, etiquetaTipo, descricaoHumana, conectorDe, nomeConector } from './tipos.js';
import * as D from './dados.js';
import * as R from './rede.js';
import * as Hoje from './funcoes-hoje.js';
import * as LimHud from './limites-hud.js';
import { ligarComando } from './comando-ctx.js';
import * as CE from './comando-erros.js';
import * as CP from './comando-progresso.js';
import * as CDu from './comando-dupla.js';
import * as CB from './comando-barra.js';
import * as CA from './comando-aprovacao.js';
import * as Q from './questionario.js';
import * as MC from './mapa-cel.js';
import { ico } from './comando-icones.js';
import { plural, icoDeEmoji, icoPx, nomeProjeto, seloEstado } from './leitura.js';
import * as CT from './comando-topo.js';
import * as NP from './comando-pedido.js';
import * as PP from './pedido-pagina.js';
import * as A from './anexos.js';
import * as EQ from './equipe.js';
import * as CC from './chat-cel.js';
import { estadoPedido as estadoDoChat, pendentes } from './estado-pedido.js';
import * as CTG from './contagem.js';
import * as CI from './comando-ia.js';
import * as AG from './agora.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO = new URLSearchParams(location.search).has('demo');

let EU = null, mundo = null, membros = [], estados = new Map(), recados = [], presentes = new Map();
let conversas = [], conversaAtual = null, mensagens = [], aprovacoes = [], jornais = [], temSql2 = false;
let aba = guardado('aba', 'equipe'), filtroEquipe = 'todos', selecionado = null, missaoAberta = null;
// Pedidos de chat na fila ou rodando: id do comando -> id da conversa (cada aba tem o seu "ocupado").
const comandosAbertos = new Map();
const convOcupada = (id) => [...comandosAbertos.values()].some((c) => (c ?? null) === (id ?? null));
const algumaOcupada = (alvo) => [...comandosAbertos.values()].some((id) => !alvo || (conversas.find((c) => c.id === id)?.alvo || 'claude') === alvo);
const lembrarComandos = (lista) => { if (!lista) return; comandosAbertos.clear(); for (const c of lista) comandosAbertos.set(c.id, c.conversa_id ?? null); };
const pilha = []; // para o botão "voltar" da gaveta
// Filtros globais (valem para mapa, equipe, missões, histórico e quadro): '' = todos.
let filtroJogo = guardado('fJogo', ''), filtroSetor = guardado('fSetor', '');
const temFiltro = () => !!(filtroJogo || filtroSetor);
const passa = (fr) => (!filtroJogo || fr?.jogo === filtroJogo) && (!filtroSetor || fr?.setor === filtroSetor);
const nomeFiltro = () => [filtroJogo && `${jogoPorId(filtroJogo).icone} ${jogoPorId(filtroJogo).nome}`, filtroSetor && `${setorPorId(filtroSetor).icone} ${setorPorId(filtroSetor).nome}`].filter(Boolean).join(' · ');
function mudarFiltro(jogo, setor) { filtroJogo = jogo; filtroSetor = setor; guarda('fJogo', jogo); guarda('fSetor', setor); desenharHud(); desenharAba(); if (!$('#quadro').hidden) desenharQuadro(); }
if (aba === 'mural') aba = 'dupla';

// ======================= markdown simples (seguro: escapa tudo antes) =======================
function md(texto) {
  const blocos = String(texto ?? '').split(/```/);
  return blocos.map((b, i) => {
    if (i % 2) return `<pre><code>${esc(b.replace(/^\w*\n/, ''))}</code></pre>`;
    const linhas = esc(b).split('\n');
    let html = '', lista = null;
    for (const l of linhas) {
      const item = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(l);
      if (item) { if (!lista) { lista = /^\s*\d/.test(l) ? 'ol' : 'ul'; html += `<${lista}>`; } html += `<li>${inline(item[1])}</li>`; continue; }
      if (lista) { html += `</${lista}>`; lista = null; }
      if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    if (lista) html += `</${lista}>`;
    return html;
  }).join('');
}
const inline = (s) => s
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|\s)\*([^*]+)\*/g, '$1<i>$2</i>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
  .replace(/^#{1,4}\s*(.*)$/, '<b>$1</b>');

// ======================= login =======================
async function iniciar() {
  if (DEMO) return iniciarDemo();
  const s = await R.sessao();
  if (!s) { $('#carregando').hidden = true; mostrarLogin(); return; }
  try {
    $('#textoCarregando').textContent = 'Entrando…';
    EU = await R.quemSouEu();
    if (!EU?.pessoa) { $('#carregando').hidden = true; mostrarLogin(`Você entrou como ${EU?.email}, mas ainda não foi convidado. Peça para o outro te convidar (Ajustes › Convidar).`); return; }
    $('#textoCarregando').textContent = 'Carregando o escritório…';
    const tudo = await R.carregarTudo();
    membros = tudo.membros; recados = tudo.recados; temSql2 = tudo.temSql2;
    conversas = tudo.conversas || []; aprovacoes = tudo.aprovacoes || []; jornais = tudo.jornal || []; lembrarComandos(tudo.comandos); seloAgora();
    temQuadro = tudo.temQuadro; marcos = tudo.marcos || []; comentarios = tudo.comentarios || [];
    vinculos = new Map((tudo.vinculos || []).map((v) => [v.missao, v.marco_id]));
    for (const e of tudo.estado) { estados.set(e.pessoa, e); definirPastas(e.pessoa, e.info?.pastas); lerFichas(e); }
    D.adicionar(tudo.eventos.map(D.deLinha));
    idSincronizado = tudo.eventos.reduce((mx, e) => Math.max(mx, e.id || 0), 0);
    const maisVelho = tudo.eventos[0]?.t || Date.now();
    mundo = await criarMundo();
    const minhaSala = SALAS[Math.max(0, pessoas().indexOf(EU.pessoa))];
    await mundo.criarEu(EU.pessoa, [minhaSala.dono[0], minhaSala.dono[1] + 0.8]);
    await sincronizarMundo();
    R.conectar({ x: mundo.eu.x, y: mundo.eu.y, status: estados.get(EU.pessoa)?.status || 'disponivel' });
    ligarRede();
    conversaAtual = Number(guardado('conversa', '0')) || conversas[0]?.id || null;
    if (conversaAtual && !conversas.some((c) => c.id === conversaAtual)) conversaAtual = conversas[0]?.id || null;
    montarInterface();
    $('#carregando').hidden = true;
    mostrarResumo();
    desenharManchete();
    requestAnimationFrame(laco);
    // Só DEPOIS da interface montada: o resumo da semana (pedidos e entregas mais antigos), em segundo plano.
    // (Antes, se ele chegasse enquanto o escritório carregava, tentava desenhar painéis que ainda não existiam.)
    R.resumoDosDias(maisVelho).then((ev) => { if (ev.length) { D.adicionar(ev.map(D.deLinha)); agendarInterface(); } }).catch((e) => console.warn('resumo da semana:', e));
  } catch (e) {
    console.error(e);
    $('#textoCarregando').textContent = `Deu erro ao abrir: ${e.message}. O banco foi configurado (supabase/escritorio.sql)?`;
  }
}
function mostrarLogin(msg) {
  $('#login').hidden = false;
  if (msg) { $('#erroLogin').textContent = msg; $('#erroLogin').hidden = false; }
  $('#formEmail').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    try { await R.pedirCodigo(email); guarda('email', email); $('#formEmail').hidden = true; $('#avisoLink').hidden = false; $('#formCodigo').hidden = false; $('#codigo').value = ''; $('#codigo').focus(); $('#emailEnviado').textContent = email; $('#erroLogin').hidden = true; }
    catch (err) { $('#erroLogin').textContent = `Não consegui mandar: ${err.message}`; $('#erroLogin').hidden = false; }
  };
  $('#reenviar').onclick = () => { $('#formEmail').hidden = false; $('#avisoLink').hidden = true; $('#formCodigo').hidden = true; };
  $('#formCodigo').onsubmit = async (e) => {
    e.preventDefault();
    const cod = $('#codigo').value.replace(/\D/g, '');
    if (cod.length < 6) { $('#erroLogin').textContent = 'O código tem 6 dígitos (ou mais).'; $('#erroLogin').hidden = false; return; }
    try { await R.confirmarCodigo($('#email').value.trim() || guardado('email', ''), cod); location.replace(location.href.split('#')[0]); }
    catch (err) { $('#erroLogin').textContent = /expired|invalid/i.test(err.message) ? 'Código errado ou vencido. Confira o e-mail mais novo ou peça outro.' : 'Não consegui entrar: ' + err.message; $('#erroLogin').hidden = false; }
  };
  $('#email').value = guardado('email', '');
}

// ======================= quem está onde =======================
function pessoas() {
  const ps = new Set(membros.map((m) => m.pessoa)); if (EU?.pessoa) ps.add(EU.pessoa);
  for (const p of ORDEM_PESSOAS) ps.add(p);
  return [...ps].sort((a, b) => ((ORDEM_PESSOAS.indexOf(a) + 1) || 9) - ((ORDEM_PESSOAS.indexOf(b) + 1) || 9)).slice(0, 2);
}
const corPessoa = (p) => COR_PESSOA[p] || '#9a90a8';
const agentesInfo = (p) => estados.get(p)?.info?.agentes || [];
const modelo = (nome, p) => D.modeloDe(nome, agentesInfo(p));
const tagModelo = (nome, p) => { const m = modelo(nome, p); return `<span class="modelo ${m.familia}" title="${esc(m.descricao || '')}">${esc(m.rotulo)}</span>`; };
const vazioMesa = (p, nome) => ({ k: `${p}|${nome}`, pessoa: p, nome, titulo: tituloDe(nome), hist: [], miniaturas: [], nomes: [] });
// Onde cada um fica: a assistente na recepção da sala do dono; a EQUIPE (um boneco por cargo, dos
// dois devs: equipe.js) senta numa mesa da ala do setor dela quando trabalha e vai para a copa quando
// está livre; sub-agente de fora da equipe é visitante (só aparece enquanto trabalha).
const ocupacao = new Map(); // boneco -> id do lugar (para ninguém trocar de mesa à toa)
const TRABALHANDO = ['trab', 'semsinal', 'alerta', 'erro']; // sem sinal: ainda rodando (fica na mesa), só está calado
const cargosAgora = () => EQ.cargos(estados, EU?.pessoa);
// Estado de um cargo = a mesa (de quem for) mais urgente/recente entre o id do cargo e os apelidos dele.
function mesaDoCargo(c) {
  let melhor = null;
  for (const [, mesas] of D.equipes()) for (const m of mesas.values()) {
    if (EQ.cargoDe(m.nome, cargosAgora())?.id !== c.id) continue;
    let st = D.estadoDe(m);
    if (m.nome === 'Codex' && m.pessoa === EU.pessoa && algumaOcupada('codex')) st = { cls: 'trab', ...D.ESTADOS.trab };
    if (!melhor || st.ordem < melhor.st.ordem || (st.ordem === melhor.st.ordem && (m.ult?.t || 0) > (melhor.m.ult?.t || 0))) melhor = { m, st };
  }
  if (!melhor && c.id === 'critico' && algumaOcupada('codex')) melhor = { m: vazioMesa(EU.pessoa, 'Codex'), st: { cls: 'trab', ...D.ESTADOS.trab } };
  return melhor || { m: vazioMesa(EU.pessoa, c.id), st: D.estadoDe(null) };
}
// Para o painel Equipe: o que o cargo está fazendo agora (ou null = livre).
function estadoDoCargo(c) {
  const { m, st } = mesaDoCargo(c), vivo = TRABALHANDO.includes(st.cls);
  return { st, vivo, pessoa: vivo ? m.pessoa : '', acao: vivo && m.ult ? primeiraFrase(frase(m.ult), 80) : '' };
}
// Em andamento (uma definição só, contagem.js): por pedido, com as etapas e quem faz cada uma.
// tarefas = etapas sendo feitas; agentes = responsáveis diferentes que são agentes (ferramenta não conta).
// Quem espera você ou travou fica fora (está em "Precisa de você"). emAndamento = a lista que o Hoje mostra.
function responsavelAndamento(nome, tipo) {
  if (nome === 'Orquestrador' || EQ.daAssistente(nome)) return { id: 'Orquestrador', nome: 'Assistente', tipo: 'assistente' };
  const c = EQ.cargoDe(nome, cargosAgora());
  if (c) return { id: c.id, nome: c.nome, tipo: 'agente' };
  return { id: nome, nome: CURTO[nome] || tituloDe(nome), tipo: CTG.ehFerramenta(nome, tipo) ? 'ferramenta' : 'agente' };
}
function andamento() {
  const emAndamento = CTG.montarAndamento(D.missoes(), { escalacao: D.escalacao, responsavel: responsavelAndamento, acao: (x) => (x.ult ? primeiraFrase(frase(x.ult), 80) : '') });
  return { ...CTG.contarAndamento(emAndamento), emAndamento };
}
// "Ensinar" (Equipe): o pedido para a assistente criar a próxima skill do cargo abre no editor do Hoje (não sai sozinho).
function ensinarCargo(id) {
  const c = cargosAgora().find((x) => x.id === id); if (!c) return;
  const t = EQ.proximaDaTrilha(c);
  if (innerWidth <= 760) fecharEquipeVista();
  Hoje.preparar({ titulo: t ? `Ensinar habilidade: ${EQ.nomeSkill(t.nome)} · ${c.nome}` : `Próxima habilidade · ${c.nome}`, texto: EQ.pedidoEnsinar(c, t) });
}
function localizarCargo(id) {
  const b = mundo?.agentes.get(`cargo|${id}`);
  if (!b) return;
  abrirAgente(b); cam.alvo = [b.x, b.y - 10]; // abrirAgente solta a câmera; aqui ela vai até o boneco
}
function mesasDoMundo() {
  const ps = pessoas(), eq = D.equipes(), lista = [], usados = new Set();
  for (const l of mundo.planta.lugares) {
    const p = ps[l.equipe]; if (!p || l.codex) continue; // o Codex não tem mais boneco por pessoa: é o cargo Crítico
    const m = (l.nome === 'Orquestrador' ? D.abas().find((a) => a.pessoa === p) : null) || eq.get(p)?.get(l.nome) || vazioMesa(p, l.nome);
    let st = D.estadoDe(m).cls;
    if (l.assistente && p === EU.pessoa && algumaOcupada('claude')) st = 'trab';
    const fr = TRABALHANDO.includes(st) ? D.frenteDaMesa(m) : null;
    lista.push({ id: m.k, nome: l.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: p, m, anel: fr?.cor });
  }
  const pega = (k, niveis) => {
    for (const nivel of niveis) {
      const livres = nivel.filter((x) => !usados.has(x.id));
      const l = livres.find((x) => x.id === ocupacao.get(k)) || livres[0];
      if (l) { usados.add(l.id); ocupacao.set(k, l.id); return l; }
    }
    return null;
  };
  const A = mundo.planta.assentos;
  const naMesa = (id, setor, fr) => pega(id, [A.filter((a) => a.setor === setor && a.jogo === fr.jogo), A.filter((a) => a.setor === setor), A]);
  // ferramentas viram itens (voam até quem usa), não bonecos
  const ehFerramenta = (n) => ['conector', 'programa'].includes(tipoDe(n));
  const mesas = ps.flatMap((p) => [...(eq.get(p) || new Map()).values()].filter((m) => m.nome !== 'Orquestrador'));
  for (const m of mesas) if (ehFerramenta(m.nome) && !EQ.cargoDe(m.nome, cargosAgora())) lista.push({ id: m.k, nome: m.nome, item: true, status: D.estadoDe(m).cls, pessoa: m.pessoa, m });
  // A equipe: um boneco por cargo. Trabalhando = mesa da ala do setor dele; livre = copa (e a rotina dela).
  const equipe = cargosAgora().map((c) => ({ c, ...mesaDoCargo(c) }));
  for (const { c, m, st } of equipe.filter((x) => TRABALHANDO.includes(x.st.cls))) {
    const fr = D.frenteDaMesa(m) || frente('genesis', c.setor || 'criacao');
    const l = naMesa(`cargo|${c.id}`, c.setor || fr.setor, fr);
    if (l) lista.push({ id: `cargo|${c.id}`, nome: c.id, cargo: c, lugar: l, status: st.cls, ferramenta: m.modo, pessoa: m.pessoa, m, anel: fr.cor });
  }
  // Visitantes (sub-agente fora da equipe): só enquanto trabalham. As outras abas da assistente não viram
  // bonecos: no mapa ficam só os 6 cargos, os devs, uma assistente por dev e os visitantes.
  const visitas = mesas.filter((m) => !ehFerramenta(m.nome) && !EQ.cargoDe(m.nome, cargosAgora()) && !EQ.daAssistente(m.nome))
    .map((m) => ({ m, st: D.estadoDe(m).cls })).filter((x) => TRABALHANDO.includes(x.st)).sort((a, b) => (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
  for (const { m, st } of visitas) {
    const fr = D.frenteDaMesa(m) || frente('genesis', 'criacao');
    const l = naMesa(m.k, fr.setor, fr);
    if (l) lista.push({ id: m.k, nome: m.nome, lugar: l, status: st, ferramenta: m.modo, pessoa: m.pessoa, m, anel: fr.cor, visitante: !m.aba });
  }
  for (const { c, m, st } of equipe.filter((x) => !TRABALHANDO.includes(x.st.cls))) {
    const l = pega(`cargo|${c.id}`, [mundo.planta.copa]);
    if (l) lista.push({ id: `cargo|${c.id}`, nome: c.id, cargo: c, lugar: l, status: st.cls === 'fim' ? 'fim' : 'livre', ferramenta: null, pessoa: m.pessoa, m });
  }
  return lista;
}
let versaoMundo = -1;
async function sincronizarMundo() {
  if (versaoMundo === D.versaoAtual()) return;
  versaoMundo = D.versaoAtual();
  await mundo.sincronizarAgentes(mesasDoMundo());
}
setInterval(() => { if (mundo) { versaoMundo = -1; sincronizarMundo(); } }, 20e3);

// ======================= rede =======================
const contagemErros = new Map();
function ligarRede() {
  R.on('evento', (linha) => { const e = D.deLinha(linha); D.adicionar([e]); sincronizarMundo(); avisarEvento(e); agendarInterface(); });
  R.on('recado', (p) => {
    if (p.eventType === 'INSERT' && !recados.some((r) => r.id === p.new.id)) {
      recados.unshift(p.new);
      if (p.new.cor !== 'reacao' && p.new.cor !== 'bola-ok') balaoPessoa(p.new.pessoa, p.new.cor === 'missao' ? '📎 ' + (lerJson(p.new.texto).titulo || 'missão') : CDu.resumoRecado(p.new) ?? p.new.texto);
      if (p.new.pessoa !== EU.pessoa) {
        const r = p.new, txt = r.cor === 'reacao' ? `reagiu ${r.texto.split(' ')[0]}` : r.cor === 'missao' ? `compartilhou: ${lerJson(r.texto).titulo || 'uma missão'}` : CDu.resumoRecado(r) ?? r.texto;
        toast({ titulo: r.cor === 'reacao' ? `${r.pessoa} ${txt}` : `${r.pessoa} na conversa da dupla`, texto: r.cor === 'reacao' ? '' : txt, cor: corPessoa(r.pessoa), acao: () => abrirAba('dupla') });
        if (r.cor !== 'reacao') { som('recado'); notificar(`${r.pessoa} mandou mensagem`, txt); }
      }
    }
    if (p.eventType === 'DELETE') recados = recados.filter((r) => r.id !== p.old.id);
    if (aba === 'dupla') desenharDupla(); else agendarInterface();
    CDu.desenhar();
  });
  R.on('estado', (e) => { estados.set(e.pessoa, { ...estados.get(e.pessoa), ...e }); lerFichas(e); if (e.info?.pastas) { definirPastas(e.pessoa, e.info.pastas); D.mudou(); } agendarInterface(); if (aba === 'atencao') desenharAtencao(); });
  R.on('chat', (c) => {
    CE.viuMensagem(c); if (c.de === 'assistente') CE.viuResposta();
    // Vai para a lista da aba dela (a aberta ou uma já carregada antes): a aba volta de onde parou.
    const atual = (c.conversa_id ?? null) === conversaAtual, lista = atual ? mensagens : cacheMsgs.get(c.conversa_id);
    if (lista && !lista.some((m) => m.id === c.id)) {
      const minha = c.de === 'eu' && lista.find((x) => x.de === 'eu' && x.texto === c.texto && !x.id);
      if (minha) minha.id = c.id; else { lista.push(c); if (atual) desenharChat(); }
    }
    if (['assistente', 'erro'].includes(c.de) && c.conversa_id && !vendoConversa(c.conversa_id)) { naoVistas.add(c.conversa_id); salvarAbas(); desenharSeletorConversas(); }
    if (c.de === 'assistente' && (aba !== 'chat' || c.conversa_id !== conversaAtual)) { const cv = conversas.find((x) => x.id === c.conversa_id); toast({ titulo: `${cv?.alvo === 'codex' ? 'O Codex' : 'Sua assistente'} respondeu${cv ? ' · ' + cv.titulo : ''}`, texto: c.texto.slice(0, 140), cor: cv?.alvo === 'codex' ? '#3fb37f' : '#a785f0', acao: () => abrirConversa(c.conversa_id) }); som('fim'); notificar('Resposta da assistente', c.texto); }
  });
  R.on('comando', (c) => {
    if (c.tipo && c.tipo !== 'chat') return;
    if (['novo', 'rodando'].includes(c.status)) comandosAbertos.set(c.id, c.conversa_id ?? null); else comandosAbertos.delete(c.id);
    seloAgora(); if (aba === 'agora') desenharAgora();
    versaoMundo = -1; sincronizarMundo(); desenharSeletorConversas(); desenharChat(); desenharBarra();
  });
  R.on('conversa', (p) => {
    if (p.eventType === 'DELETE') conversas = conversas.filter((c) => c.id !== p.old.id);
    else conversas = [p.new, ...conversas.filter((c) => c.id !== p.new.id)].sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado));
    desenharSeletorConversas();
  });
  R.on('aprovacao', (a) => {
    aprovacoes = [...aprovacoes.filter((x) => x.id !== a.id), a].filter((x) => x.status === 'pendente');
    if (a.status === 'pendente') { som('alerta'); const dt = lerJson(a.detalhe), ag = dt.origem?.agente || dt.pedidoDe?.agente, f = (ag && ag !== 'Orquestrador' ? tituloDe(ag) + ': ' : '') + passo(a.ferramenta, null, dt); const tq = Q.ehQuestionario(a) ? 'Sua assistente tem perguntas antes de começar' : 'Pedido de permissão'; notificar(tq, Q.ehQuestionario(a) ? (Q.perguntasDe(a)[0]?.question || f) : f); toast({ titulo: tq, texto: Q.ehQuestionario(a) ? (Q.perguntasDe(a)[0]?.question || f) : f, cor: '#ffd23f', acao: () => abrirAba('atencao') }); }
    agendarInterface(); desenharChat();
  });
  R.on('marco', (p) => {
    if (p.eventType === 'DELETE') marcos = marcos.filter((x) => x.id !== p.old.id);
    else { const i = marcos.findIndex((x) => x.id === p.new.id); if (i >= 0) marcos[i] = p.new; else marcos.push(p.new); if (p.eventType === 'UPDATE' && p.new.coluna === 'feito' && p.old?.coluna !== 'feito') toast({ titulo: `🏁 Marco concluído: ${p.new.titulo}`, cor: '#4fbf82' }); }
    mudouMarcos(); desenharQuadro(); if (aba === 'marco') desenharMarco(); agendarInterface();
  });
  R.on('vinculo', (p) => { if (p.eventType === 'DELETE') vinculos.delete(p.old.missao); else vinculos.set(p.new.missao, p.new.marco_id); mudouMarcos(); desenharQuadro(); if (aba === 'marco') desenharMarco(); if (aba === 'missao') desenharMissao(); agendarInterface(); });
  R.on('comentario', (p) => {
    if (p.eventType === 'DELETE') comentarios = comentarios.filter((c) => c.id !== p.old.id);
    else if (!comentarios.some((c) => c.id === p.new.id)) { comentarios.push(p.new); if (p.new.pessoa !== EU.pessoa) { const mc = marcos.find((x) => x.id === p.new.marco_id); toast({ titulo: `${p.new.pessoa} comentou em 🏁 ${mc?.titulo || 'um marco'}`, texto: p.new.texto, cor: corPessoa(p.new.pessoa), acao: () => abrirMarco(p.new.marco_id) }); som('recado'); } }
    if (aba === 'marco') desenharMarco();
  });
  R.on('jornal', (j) => { if (!j?.dia) return; jornais = [j, ...jornais.filter((x) => x.dia !== j.dia)].sort((a, b) => b.dia.localeCompare(a.dia)); desenharManchete(); if (!$('#jornal').hidden) abrirJornal(j.dia); });
  R.on('presenca', (st) => { presentes = new Map(Object.entries(st).map(([k, v]) => [k, v[0]])); for (const p of mundo.pessoas.keys()) if (!presentes.has(p)) mundo.pessoas.delete(p); agendarInterface(); });
  R.on('conexao', (s) => { if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) setTimeout(ressincronizar, 4000); });
  R.on('chegou', (p) => { if (p !== EU.pessoa) { toast({ titulo: `${p} entrou no escritório`, cor: corPessoa(p) }); som('chegou'); } });
  R.on('pos', (d) => { if (d.pessoa && d.pessoa !== EU.pessoa) mundo.atualizarPessoa(d.pessoa, d); });
  R.on('pediuPosicao', () => R.enviarPos(posAtual(), true));
  R.on('emote', ({ pessoa, e }) => mostrarEmote(pessoa, e));
  R.on('aceno', ({ de, para }) => {
    if (para !== EU.pessoa) return;
    som('aceno'); mostrarEmote(de, '👋');
    toast({ titulo: `${de} acenou para você 👋`, texto: 'Clique para ir até ele.', cor: corPessoa(de), acao: () => irAtePessoa(de) });
    notificar(`${de} acenou para você`, 'Abra o escritório para ir até ele.');
  });
}
const lerJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const posAtual = () => ({ x: Math.round(mundo.eu.x), y: Math.round(mundo.eu.y), dir: mundo.eu.dir, skate: mundo.eu.skate, andando: mundo.eu.modo === 'andando' });

// Avisos em três níveis: interromper (som + notificação), marcar (toast), só registrar.
function avisarEvento(e) {
  const meu = e.pessoa === EU.pessoa, titulo = tituloDe(e.agente);
  if (e.tipo === 'alerta' && meu) {
    toast({ titulo: `${titulo} precisa de você`, texto: frase(e), cor: '#ffd23f', agente: e.agente, acao: () => abrirAba('atencao') });
    som('alerta'); notificar(`${titulo} precisa de você`, frase(e));
  } else if (e.tipo === 'erro' && meu) {
    const n = (contagemErros.get(e.agente) || 0) + 1; contagemErros.set(e.agente, n);
    if ([1, 3, 9, 27].includes(n)) { toast({ titulo: `${titulo} deu erro`, texto: frase(e), cor: '#ef6a55', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) }); som('erro'); }
  } else if (e.tipo === 'fim' && e.agente !== 'Orquestrador' && meu) {
    contagemErros.delete(e.agente);
    toast({ titulo: `${titulo} terminou`, texto: frase(e), cor: '#4fbf82', agente: e.agente, acao: () => localizar(`${e.pessoa}|${e.agente}`) });
    som('fim'); if (document.hidden) notificar(`${titulo} terminou`, frase(e));
  } else if (!meu && e.tipo === 'fim' && e.agente !== 'Orquestrador' && (e.miniaturas || []).length) {
    toast({ titulo: `${e.pessoa}: ${titulo} entregou`, texto: frase(e), cor: corPessoa(e.pessoa), acao: () => abrirAba('galeria') });
  }
}

// ======================= som, notificação, toast =======================
let audio = null;
function som(tipo) {
  if (guardado('som', '1') !== '1') return;
  try {
    audio ||= new AudioContext();
    const notas = { alerta: [880, 660, 880], erro: [220, 180], fim: [660, 990], aceno: [523, 659, 784], recado: [740, 988], chegou: [392, 523] }[tipo] || [600];
    notas.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.09;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.14);
    });
  } catch {}
}
function notificar(titulo, corpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { new Notification(titulo, { body: String(corpo || '').slice(0, 140), tag: titulo, icon: 'icones/icone-180.png' }); } catch {}
}
const retratos = new Map();
// Fichas dos agentes (nome bonito, cor, visual) chegam no estado da ponte; se mudarem, refaz os retratos.
function lerFichas(e) { if (registrarFichas(e?.info?.agentes)) retratos.clear(); }
async function retratoDe(nome) {
  if (!retratos.has(nome)) retratos.set(nome, montarPersonagem(visualDe(nome)).then((f) => retrato(f, 48).toDataURL()));
  return retratos.get(nome);
}
async function toast({ titulo, texto, cor, agente, acao }) {
  const el = document.createElement('div');
  el.className = 'toast'; el.style.setProperty('--cor', cor || 'var(--borda)');
  el.innerHTML = `${agente ? `<img src="${await retratoDe(agente)}" alt="">` : ''}<div><b>${esc(titulo)}</b>${texto ? `<span>${esc(String(texto).slice(0, 160))}</span>` : ''}</div>`;
  el.onclick = () => { acao?.(); el.remove(); };
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
  setTimeout(() => el.remove(), 7000);
}

// ======================= mundo: câmera, entrada, laço =======================
const tela = $('#tela'), g = tela.getContext('2d');
let zoom = innerWidth <= 760 ? 0 : Number(guardado('zoom', '0')) || 0, VW = 480, VH = 270; // no celular sempre abre na visão geral
const cam = { x: 0, y: 0, alvo: null };
// Celular em pé: a visão geral mostra o andar quase inteiro (zoom < 1; mapa-cel.js calcula e monta o resto).
const zoomGeral = (w, h) => (w <= 760 && h > w ? MC.zoomGeral(w, h) : 1);
// Mudar zoom e câmera de fora (chips de setor e ficha do mapa-cel.js). z = 0: visão geral.
function vistaMapa(z, alvo) { zoom = z; dimensionar(); cam.alvo = alvo || null; }
function dimensionar() {
  const p = $('#palco'), w = p.clientWidth, h = p.clientHeight;
  if (!w || !h) return;
  // no celular (em pé), o mapa preenche a altura da tela; dá para arrastar para os lados
  const geral = zoomGeral(w, h);
  if (!zoom) zoom = w >= 1500 ? 3 : w <= 760 ? geral : 2;
  zoom = Math.max(geral, Math.min(5, zoom));
  tela.classList.toggle('suave', zoom < 1);
  VW = Math.ceil(w / zoom); VH = Math.ceil(h / zoom);
  tela.width = VW; tela.height = VH;
  tela.style.width = `${VW * zoom}px`; tela.style.height = `${VH * zoom}px`;
  $('#camada').style.setProperty('--z', zoom);
}
addEventListener('resize', dimensionar);
const mudarZoom = (d) => { zoom += d; guarda('zoom', zoom); dimensionar(); };

const teclas = new Set();
const digitando = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (digitando()) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (!$('#login').hidden || !mundo) return;
  if (!$('#jornal').hidden) { if (e.key === 'Escape') $('#jornal').hidden = true; return; }
  if (!$('#ajuda').hidden) { if (e.key === 'Escape' || e.key === '?') $('#ajuda').hidden = true; return; }
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { teclas.add(k); cam.alvo = null; if (k.startsWith('arrow')) e.preventDefault(); }
  else if (k === 'e' || k === 'enter') interagir();
  else if (k === '/') { e.preventDefault(); if (document.body.classList.contains('chat-aberto')) $('#entrada').focus(); else NP.abrirNovoPedido({}); }
  else if (k === 'tab') { e.preventDefault(); if ($('#equipeVista').hidden) abrirEquipeVista(); else fecharEquipeVista(); }
  else if (k === 'c') { e.preventDefault(); abrirAba('chat'); setTimeout(() => $('#entrada').focus(), 0); }
  else if (k === 'h') alternarAba('missoes');
  else if (k === 'g') alternarAba('galeria');
  else if (k === 'm') { alternarAba('dupla'); setTimeout(() => aba === 'dupla' && $('#textoRecado').focus(), 0); }
  else if (k === 'l') alternarAba('historico');
  else if (k === 'f') alternarAba('agora');
  else if (k === 'i') alternarAba('catalogo');
  else if (k === 'b') { if ($('#quadro').hidden) abrirQuadro(); else fecharQuadro(); }
  else if (k === 'j') abrirJornal();
  else if (k === '?' || k === '/') abrirAjuda();
  else if (k === 'q') acenarParaOutro();
  else if (k === 'k') irAtePessoa(outraPessoa());
  else if (k === '+' || k === '=') mudarZoom(1);
  else if (k === '-') mudarZoom(-1);
  else if (k === 'escape') { if (!$('#equipeVista').hidden && $('#gaveta').classList.contains('conversa')) fecharEquipeVista(); else fecharGaveta(); }
  else if (/^[1-6]$/.test(k)) fazerEmote(['👋', '✅', '❓', '☕', '🎉', '🔥'][Number(k) - 1]);
});
addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
addEventListener('blur', () => teclas.clear());

function telaParaMundo(ev) { const r = tela.getBoundingClientRect(); return [(ev.clientX - r.left) / zoom + cam.x, (ev.clientY - r.top) / zoom + cam.y]; }
const boneconoPonto = (x, y) => [...mundo.agentes.values()].filter((b) => Math.abs(b.x - x) < (zoom < 2 ? 13 : 9) && y > b.y - 32 && y < b.y + 6).sort((a, b) => b.y - a.y)[0];
// Pontos de interesse do mapa: mural (lousa) e jornal (mesa do salão).
const PONTOS = [
  { id: 'mural', x: 15 * T, y: 2.4 * T, raio: 26, texto: 'abrir a conversa da dupla (mural)', acao: () => abrirAba('dupla') },
  { id: 'jornal', x: 19 * T, y: 5.2 * T, raio: 30, texto: 'ler o Diário do Estúdio', acao: () => abrirJornal() },
];
const dedos = new Map(); let gesto = null;
tela.addEventListener('pointerdown', (ev) => {
  if (!mundo) return;
  tela.focus();
  dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (dedos.size === 2) { const [a, b] = [...dedos.values()]; gesto = { pinca: Math.hypot(a.x - b.x, a.y - b.y), zoom }; return; }
  gesto = { x0: ev.clientX, y0: ev.clientY, cx: cam.x + VW / 2, cy: cam.y + VH / 2, moveu: false, ev };
  try { tela.setPointerCapture(ev.pointerId); } catch {}
});
tela.addEventListener('pointermove', (ev) => {
  if (!dedos.has(ev.pointerId) || !gesto) return;
  dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (gesto.pinca && dedos.size === 2) {
    const [a, b] = [...dedos.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const alvo = Math.max(1, Math.min(4, Math.round(gesto.zoom * d / gesto.pinca * 4) / 4));
    if (alvo !== zoom) { const centro = [cam.x + VW / 2, cam.y + VH / 2]; zoom = alvo; guarda('zoom', zoom); dimensionar(); if (centro.every(Number.isFinite)) cam.alvo = centro; }
    return;
  }
  if (gesto.pinca) return; // pinça com 3 dedos ou no meio da troca: não arrasta
  const dx = ev.clientX - gesto.x0, dy = ev.clientY - gesto.y0;
  if (!gesto.moveu && Math.hypot(dx, dy) < 10) return;
  gesto.moveu = true;
  const alvo = [gesto.cx - dx / zoom, gesto.cy - dy / zoom];
  if (alvo.every(Number.isFinite)) cam.alvo = alvo;
});
const soltar = (ev) => {
  dedos.delete(ev.pointerId);
  const g = gesto; if (!dedos.size) gesto = null;
  // Saiu um dedo da pinça: o arrasto recomeça do dedo que ficou (sem pulo e sem virar toque).
  if (g?.pinca && dedos.size === 1) { const [d] = [...dedos.values()]; gesto = { x0: d.x, y0: d.y, cx: cam.x + VW / 2, cy: cam.y + VH / 2, moveu: true, ev: null }; return; }
  if (!g || g.pinca || g.moveu || ev.type === 'pointercancel') return;
  tocarMapa(g.ev);
};
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);
function tocarMapa(ev) {
  const [x, y] = telaParaMundo(ev);
  const b = boneconoPonto(x, y) || (innerWidth <= 760 ? MC.agenteNoToque(x, y) : null);
  if (b) { MC.abrirFicha(b); return; } // cartão do boneco (cargo, pedido, última ação); "Ver detalhes" abre o painel
  if (innerWidth <= 760 && MC.tocarGeral(x, y)) return;
  if (mundo.tocarItem?.(x, y)) return; // ferramenta (item) no mapa: cartão do que está fazendo
  const ponto = PONTOS.find((p) => Math.hypot(p.x - x, p.y - y) < 18);
  if (ponto) { ponto.acao(); return; }
  const outro = [...mundo.pessoas.values()].find((p) => Math.abs(p.x - x) < 9 && y > p.y - 30 && y < p.y + 3);
  if (outro) { toast({ titulo: outro.pessoa, texto: 'Aperte Q para acenar.', cor: corPessoa(outro.pessoa) }); return; }
  cam.alvo = null;
  mundo.irAte(x, y);
}
$('#miniTela').addEventListener('pointerdown', (ev) => {
  if (!mundo) return;
  const r = ev.target.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * MW * T, y = (ev.clientY - r.top) / r.height * MH * T;
  cam.alvo = null;
  if (!mundo.irAte(x, y)) cam.alvo = [x, y];
});
$('#zoomMais').onclick = () => mudarZoom(1);
$('#zoomMenos').onclick = () => mudarZoom(-1);

let perto = null, pontoPerto = null;
function maisPerto() {
  let melhor = null, dmin = 26;
  for (const b of mundo.agentes.values()) { const d = Math.hypot(b.x - mundo.eu.x, (b.y - mundo.eu.y) * 1.2); if (d < dmin) { dmin = d; melhor = b; } }
  return melhor;
}
function interagir() {
  if (perto) {
    if (perto.pessoa === EU.pessoa && (perto.lugar.assistente || perto.lugar.codex)) { abrirChatCom(perto.lugar.codex ? 'codex' : 'claude'); return; }
    abrirAgente(perto); return;
  }
  pontoPerto?.acao();
}

let antes = performance.now(), ultimaPosEnviada = '';
function laco(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
  if (!document.hidden && mundo) {
    if (!tela.width || tela.width !== VW) dimensionar();
    let dx = 0, dy = 0;
    if (teclas.has('a') || teclas.has('arrowleft')) dx -= 1;
    if (teclas.has('d') || teclas.has('arrowright')) dx += 1;
    if (teclas.has('w') || teclas.has('arrowup')) dy -= 1;
    if (teclas.has('s') || teclas.has('arrowdown')) dy += 1;
    mundo.atualizar(dt, { dx, dy, skate: teclas.has('shift') });
    const p = posAtual(), assinatura = `${p.x},${p.y},${p.dir},${p.skate},${p.andando}`;
    if (assinatura !== ultimaPosEnviada) { ultimaPosEnviada = assinatura; R.enviarPos(p); }
    const [ax, ay] = cam.alvo || (zoom < 1 ? MC.centroGeral(VW) : [mundo.eu.x, mundo.eu.y - 10]); // visão geral: onde estão os bonecos
    const meioX = (MW * T - VW) / 2, meioY = (MH * T - VH) / 2;
    const tx = Math.max(Math.min(0, meioX), Math.min(Math.max(MW * T - VW, meioX), ax - VW / 2));
    // No celular a barra de setores (em cima) e o pedido (embaixo) cobrem o mapa: a câmera usa só a faixa útil.
    const mg = MC.margens(), mT = mg.topo / zoom, mB = mg.baixo / zoom, minY = -mT, maxY = MH * T - VH + mB;
    const ty = maxY < minY ? (zoom < 1 ? minY : (minY + maxY) / 2) : Math.max(minY, Math.min(maxY, ay - mT - (VH - mT - mB) / 2));
    cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
    const c = { x: Math.round(cam.x), y: Math.round(cam.y) };
    mundo.desenhar(g, c, VW, VH);
    // o jornal em cima da mesa do salão (pisca quando há edição nova)
    const jx = 19 * T - c.x - 5, jy = 4.6 * T - c.y;
    g.fillStyle = '#1b1a26'; g.fillRect(jx - 1, jy - 1, 12, 9); g.fillStyle = '#f4ecd8'; g.fillRect(jx, jy, 10, 7); g.fillStyle = '#2a2318'; g.fillRect(jx + 1, jy + 1, 8, 1); g.fillRect(jx + 1, jy + 3, 4, 1); g.fillRect(jx + 6, jy + 3, 3, 3);
    if (jornalNovo() && Math.floor(agora / 500) % 2) { g.fillStyle = '#ffd23f'; g.fillRect(jx + 4, jy - 7, 2, 4); g.fillRect(jx + 4, jy - 2, 2, 1); }
    mundo.desenharMinimapa($('#miniTela').getContext('2d'), 160, 112, c, VW, VH);
    perto = maisPerto();
    pontoPerto = perto ? null : PONTOS.find((pt) => Math.hypot(pt.x - mundo.eu.x, pt.y - mundo.eu.y) < pt.raio) || null;
    rotulos(c);
  }
  requestAnimationFrame(laco);
}

// Nomes, balões e emojis por cima do canvas (reaproveitando elementos).
const camada = $('#camada'), poolRotulos = new Map();
const CURTO = { 'editor-de-video': 'Editor', 'criador-de-conteudo': 'Criadora', 'revisor-godot': 'Revisor', 'artista-3d': 'Artista 3D' };
let hoverId = null;
tela.addEventListener('pointermove', (ev) => { if (!mundo) return; const [x, y] = telaParaMundo(ev); hoverId = boneconoPonto(x, y)?.id || null; tela.style.cursor = hoverId || PONTOS.some((p) => Math.hypot(p.x - x, p.y - y) < 18) ? 'pointer' : 'crosshair'; });
function rotulo(id, cls) { let el = poolRotulos.get(id); if (!el) { el = document.createElement('div'); camada.appendChild(el); poolRotulos.set(id, el); } if (el.className !== cls) el.className = cls; el.dataset.v = '1'; return el; }
const colocar = (el, x, y, c, cima = false) => { el.style.transform = `translate(calc(${Math.round((x - c.x) * zoom)}px - 50%), calc(${Math.round((y - c.y) * zoom)}px - ${cima ? '100%' : '0px'}))`; };
function nomeBase(b) {
  if (b.cargo) return b.cargo.curto;
  if (b.m?.aba && !b.lugar.assistente) return tituloAgente(b.m);
  if (b.lugar.assistente) return b.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${b.pessoa}`;
  if (b.lugar.codex) return b.pessoa === EU.pessoa ? 'Codex · GPT' : `Codex de ${b.pessoa}`;
  if (b.visitante) return `${CURTO[b.nome] || tituloDe(b.nome)} (visita)`;
  return CURTO[b.nome] || tituloDe(b.nome === '*' ? 'agente' : b.nome);
}
// No mapa: ícone do tipo (👑 assistente, 🤖 agente, 🧠 GPT, 🔌 conector, 🛠️ programa) + ícone da frente quando está trabalhando.
function nomeNoMapa(b) {
  const nome = b.m?.nome || b.nome, tipo = b.lugar.assistente ? 'assistente' : b.lugar.codex ? 'ia' : b.cargo ? 'agente' : tipoDe(nome);
  const fr = ['trab', 'alerta', 'erro'].includes(b.status) ? D.frenteDaMesa(b.m) : null;
  return `${TIPOS[tipo].icone} ${nomeBase(b)}${fr ? ' · ' + fr.icone : ''}`;
}
// Crachá no mapa: agente (ou aba da assistente) que nasceu de uma aba do chat leva a cor dela (pela sessão do Claude).
function corCracha(b) {
  if (b.pessoa !== EU.pessoa || b.lugar.assistente || b.lugar.codex) return null;
  const s = b.m?.ult?.sessao || b.m?.sessao; if (!s) return null;
  const cv = conversas.find((c) => c.sessao && c.alvo !== 'codex' && String(c.sessao).startsWith(s));
  return cv ? visualAba(cv).cor : null;
}
const foraDoFiltro = (b) => temFiltro() && !passa(D.frenteDaMesa(b.m));
const cachePq = { v: -1, mapa: new Map() };
function porqueCurto(m) {
  if (cachePq.v !== D.versaoAtual()) { cachePq.v = D.versaoAtual(); cachePq.mapa.clear(); }
  if (!cachePq.mapa.has(m.k)) {
    const pq = D.porqueDe(m), cv = pq && m.pessoa === EU.pessoa ? conversaDaSessao(pq.sessao) : null;
    const quem = !pq ? '' : cv ? `${visualAba(cv).icone} ${visualAba(cv).nome || cv.titulo}` : !pq.chamou || pq.chamou === 'Orquestrador' ? 'assistente' : tituloDe(pq.chamou);
    cachePq.mapa.set(m.k, pq && (pq.motivo || pq.pedido) ? `💬 ${quem}: ${primeiraFrase(pq.motivo || pq.pedido.descricao || frase(pq.pedido).replace(/^.*? pediu: /, ''), 70)}` : '');
  }
  return cachePq.mapa.get(m.k);
}
function rotulos(c) {
  for (const el of poolRotulos.values()) el.dataset.v = '';
  const visivel = (x, y) => x > c.x - 30 && x < c.x + VW + 30 && y > c.y - 10 && y < c.y + VH + 50;
  // Um balão aberto por vez: o boneco selecionado; senão o que está sob o mouse; senão o mais perto de você.
  // Os outros mostram só o ícone de estado (desenhado no canvas), sem nome nem fala.
  const todosB = [...mundo.agentes.values()];
  const focoB = todosB.find((b) => b.m?.k === selecionado && visivel(b.x, b.y)) || todosB.find((b) => hoverId === b.id) || (perto && !mundo.semIcones && todosB.includes(perto) ? perto : null); // com etiquetas, o balão só sai no mouse
  let balaoAberto = false;
  for (const b of mundo.agentes.values()) {
    if (!visivel(b.x, b.y)) continue;
    const sel = b.m?.k === selecionado, foco = b === focoB;
    const cel = innerWidth <= 760;
    const minhaAssist = b.lugar.assistente && b.pessoa === EU.pessoa;
    const etq = mundo.semIcones; // com as etiquetas (mapa-cel.js), cargo e estado já estão em cima de cada boneco
    if (etq && !foco) continue;
    if (!(foco || (minhaAssist && !focoB && algumaOcupada('claude'))) && zoom < 3) continue;
    const fam = modelo(b.m?.nome || b.nome, b.pessoa).familia;
    const cracha = corCracha(b);
    if (!etq && (foco || !cel || zoom >= 3)) { // no celular, a assistente "pensando" mostra só o balãozinho (sem crachá por cima das placas)
      const el = rotulo(b.id + 'n', `nome${b === perto || hoverId === b.id ? ' perto' : ''}${sel ? ' sel' : ''}${fam === 'gpt' ? ' gpt' : ''}${b.lugar.assistente ? ' claude-assist' : ''}${foraDoFiltro(b) && !foco ? ' fora' : ''}${cracha ? ' cracha' : ''}`);
      if (cracha && el.style.getPropertyValue('--cracha') !== cracha) el.style.setProperty('--cracha', cracha);
      const nome = nomeNoMapa(b);
      if (el.textContent !== nome) el.textContent = nome;
      colocar(el, b.x, b.y + 2, c);
    }
    const recente = b.m?.ult && Date.now() - b.m.ult.t < 8 * 60e3;
    let fala = '', curta = false;
    if (foco && b.m?.ult) fala = primeiraFrase(frase(b.m.ult), 80);
    else if (!focoB && minhaAssist && algumaOcupada('claude')) { fala = 'pensando…'; curta = true; }
    // Balão "por quê" na baia (só no mouse/perto; selecionado, o "por quê" já está na lateral).
    const pq = foco && !sel && b.m?.ult && b.m.nome !== 'Orquestrador' ? porqueCurto(b.m) : '';
    // perto da borda, o balão entra para dentro da tela (não corta)
    const xb = Math.min(Math.max(b.x, c.x + 124 / zoom), c.x + VW - 124 / zoom);
    if (pq) { const q = rotulo(b.id + 'q', 'porque-mapa'); if (q.textContent !== pq) q.textContent = pq; colocar(q, xb, b.y + 14, c); }
    if (fala) {
      if (!curta) balaoAberto = true;
      const f = rotulo(b.id + 'f', `fala ${b.status}${curta ? ' curta' : ''}`);
      if (f.textContent !== fala) f.textContent = fala;
      colocar(f, curta ? b.x : xb, (b.topo ?? b.y - 31) - (b.modo === 'sentado' && b.lugar.dir === 'cima' ? 30 : 14) - (mundo.semIcones ? 18 : 0), c, true); // acima da etiqueta
    }
  }
  mundo.calado = balaoAberto; // com um balão aberto, as conversas de corredor (vida.js) esperam
  // placas das alas, das fileiras (jogo) e da copa
  for (const [i, p] of mundo.planta.placas.entries()) {
    if (!visivel(p.x, p.y) || (innerWidth <= 760 && p.jogo)) continue;
    const apagada = (p.setor && filtroSetor && p.setor !== filtroSetor) || (p.jogo && filtroJogo && p.jogo !== filtroJogo);
    const el = rotulo('placa' + i, `placa${p.setor ? ' ' + p.setor : ''}${p.jogo ? ' jogo' : ''}${p.copa ? ' copa' : ''}${apagada ? ' fora' : ''}`);
    const txt = p.jogo ? `${jogoPorId(p.jogo).icone}` : p.texto;
    if (el.textContent !== txt) { el.textContent = txt; el.title = p.jogo ? jogoPorId(p.jogo).nome : ''; }
    if (p.jogo) el.style.setProperty('--cor', jogoPorId(p.jogo).cor);
    colocar(el, p.x, p.y, c);
  }
  const gente = [...mundo.pessoas.values()]; if (mundo.eu) gente.push(mundo.eu);
  for (const p of gente) {
    if (!mundo.juntos?.has(p.pessoa)) { // ao lado da própria assistente, o nome vai na etiqueta dela (mapa-cel.js)
      const el = rotulo('g' + p.pessoa, 'nome gente'); el.style.setProperty('--cor', corPessoa(p.pessoa));
      const n = p === mundo.eu ? `${p.pessoa} (você)` : p.pessoa;
      if (el.textContent !== n) el.textContent = n;
      colocar(el, p.x, p.y + 2, c);
    }
    const fl = falasPessoa.get(p.pessoa);
    if (fl && fl.ate > Date.now()) {
      const b = rotulo('fp' + p.pessoa, 'fala-pessoa'); b.style.setProperty('--cor', corPessoa(p.pessoa));
      if (b.textContent !== fl.texto) b.textContent = fl.texto;
      colocar(b, p.x, p.y - 36, c, true);
    }
    const em = emotes.get(p.pessoa);
    if (em && em.ate > Date.now()) { const e = rotulo('e' + p.pessoa, 'emoji'); if (e.textContent !== em.e) e.textContent = em.e; e.style.left = `${Math.round((p.x - c.x) * zoom)}px`; e.style.top = `${Math.round((p.y - 36 - c.y) * zoom)}px`; }
  }
  for (const [id, el] of poolRotulos) if (!el.dataset.v) { el.remove(); poolRotulos.delete(id); }
  const dica = $('#dica');
  let html = '';
  if (perto && !digitando()) {
    if (perto.pessoa === EU.pessoa && perto.lugar.assistente) html = '<b>E</b> conversar com a sua assistente (Claude)';
    else if (perto.pessoa === EU.pessoa && perto.lugar.codex) html = '<b>E</b> conversar com o Codex (GPT)';
    else html = `<b>E</b> ver o trabalho de ${esc(nomeBase(perto))}`;
  } else if (pontoPerto && !digitando()) html = `<b>E</b> ${esc(pontoPerto.texto)}`;
  dica.hidden = !html;
  if (html && dica.innerHTML !== html) dica.innerHTML = html;
}

// ======================= emotes, acenos, ir até =======================
const emotes = new Map(), falasPessoa = new Map();
function balaoPessoa(pessoa, texto) { const t = String(texto || '').replace(/\s+/g, ' ').trim(); if (!t) return; falasPessoa.set(pessoa, { texto: t.length > 90 ? t.slice(0, 88) + '…' : t, ate: Date.now() + Math.min(12000, 4000 + t.length * 90) }); }
function mostrarEmote(pessoa, e) { emotes.set(pessoa, { e, ate: Date.now() + 2600 }); const el = poolRotulos.get('e' + pessoa); if (el) { el.remove(); poolRotulos.delete('e' + pessoa); } }
function fazerEmote(e) { mostrarEmote(EU.pessoa, e); R.emote(e); }
const outraPessoa = () => pessoas().find((p) => p !== EU.pessoa);
function acenarParaOutro() {
  const o = outraPessoa(); if (!o) return;
  if (!presentes.has(o)) { toast({ titulo: `${o} não está no escritório agora`, texto: 'Mande uma mensagem na conversa da dupla.', cor: corPessoa(o), acao: () => abrirAba('dupla') }); return; }
  R.acenar(o); fazerEmote('👋'); toast({ titulo: `Você acenou para ${o}`, cor: corPessoa(o) });
}
function teleportar(px, py) {
  for (let i = 0; i < 14; i++) mundo.particulas.push({ x: mundo.eu.x + Math.random() * 16 - 8, y: mundo.eu.y - Math.random() * 20, v: 1 });
  const [tx, ty] = tileDe(px, py);
  for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x > 0 && y > 0 && x < MW && y < MH && !mundo.planta.solido[y][x]) { mundo.eu.x = x * T + 8; mundo.eu.y = y * T + 12; mundo.eu.caminho = null; cam.alvo = null; R.enviarPos(posAtual(), true); return; }
  }
}
function irAtePessoa(p) {
  if (!p) return;
  const outro = mundo.pessoas.get(p);
  if (outro) teleportar(outro.x + 14, outro.y);
  else { const s = SALAS[pessoas().indexOf(p)]; if (s) teleportar(s.dono[0] * T, (s.dono[1] + 1.5) * T); }
}

// No PC a lateral (conversas, atividade…) pode ser recolhida: o mapa ocupa a tela toda; a alça reabre.
function ligarAlternaLateral() {
  if ($('#alternaLateral')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'alternaLateral'; b.className = 'alterna-lateral';
  const marcar = () => { const fechada = $('#gaveta').classList.contains('fechada'); b.classList.toggle('fechada', fechada); b.innerHTML = fechada ? '<span aria-hidden="true">‹</span> Conversas' : '<span aria-hidden="true">›</span> Fechar'; b.title = fechada ? 'Abrir a lateral (conversas e detalhes)' : 'Fechar a lateral (o mapa fica maior)'; b.setAttribute('aria-label', b.title); };
  const recolher = () => { $('#gaveta').classList.add('fechada'); $('#gaveta').classList.remove('min'); marcarChatAberto(); marcarNav(); setTimeout(dimensionar, 0); };
  b.onclick = () => {
    if ($('#gaveta').classList.contains('fechada')) { guarda('lateralPC', 'aberta'); abrirAba(guardado('abaConversa', 'dupla')); }
    else { guarda('lateralPC', 'fechada'); recolher(); }
  };
  new MutationObserver(marcar).observe($('#gaveta'), { attributes: true, attributeFilter: ['class'] });
  marcar(); $('#palco').appendChild(b);
  // No PC o escritório abre inteiro: o chat começa fechado — ou minimizado, se a pessoa o deixou assim.
  setTimeout(() => { if (innerWidth > 760) { if (guardado('lateralPC', 'fechada') === 'min' && ['chat', 'dupla'].includes(aba)) minimizarChat(true, false); else recolher(); } }, 0);
}
// ---------- Chat no PC: fechado, minimizado (só o cartão do pedido no alto; dá para andar pelo mapa) ou aberto no centro ----------
function minimizarChat(sim, guardar = true) {
  $('#gaveta').classList.toggle('min', !!sim);
  if (guardar) guarda('lateralPC', sim ? 'min' : 'aberta');
  marcarChatAberto(); desenharJanelaChat(); setTimeout(dimensionar, 0);
}
function desenharJanelaChat() {
  const el = $('#janelaChat'); if (!el || !EU) return;
  const min = $('#gaveta').classList.contains('min');
  const conv = conversas.find((c) => c.id === conversaAtual);
  const m = aba === 'chat' && conv ? missaoDaConversa(conv) : null;
  el.innerHTML = min
    ? `<b class="jc-tit">${aba === 'dupla' ? '✉ Dupla' : '✦ Assistente'}</b><span class="espaco"></span><button type="button" class="btn mini" data-jc="abrir">Abrir conversa</button><button type="button" class="btn mini" data-jc="fechar" title="Fechar" aria-label="Fechar">×</button>`
    : `${aba === 'chat' ? CC.botaoDupla() : ''}<span class="espaco"></span><button type="button" class="btn mini" data-jc="min" title="Minimizar: fica só o cartão do pedido e você anda pelo escritório" aria-label="Minimizar">▁</button><button type="button" class="btn mini" data-jc="fechar" title="Fechar (Esc)" aria-label="Fechar">×</button>`;
  CC.medirJanela(el);
  desenharCabPC(conv, m);
}
// PC: cabeçalho da conversa abaixo das abas (nome · pendências · Detalhes), js/chat-cel.js.
function desenharCabPC(conv = conversas.find((c) => c.id === conversaAtual), m = conv ? missaoDaConversa(conv) : null) {
  const s = conv ? seloAba(conv.id) : null;
  CC.desenharCabecalhoPC($('#cabConvPC'), { v: conv ? visualAba(conv) : null, selo: s?.[2] === 'voce' ? [s[0], pendentes(s[3])] : s, gpt: conv?.alvo === 'codex', detalhes: !!m });
}
$('#cabConvPC').onclick = (e) => { if (e.target.closest('[data-jc]')) $('#janelaChat').onclick(e); };
$('#janelaChat').onclick = (e) => {
  const k = e.target.closest('[data-jc]')?.dataset.jc; if (!k) return;
  if (k === 'min') minimizarChat(true);
  else if (k === 'abrir') minimizarChat(false);
  else if (k === 'fechar') { guarda('lateralPC', 'fechada'); fecharGaveta(); }
  else if (k === 'detalhes') { const m = missaoDaConversa(conversas.find((c) => c.id === conversaAtual)); fecharEquipeVista(); fecharQuadro(); PP.abrir({ conv: conversaAtual, missao: m?.id || null }); }
};
// Minimizado, "Ver resultado" abre a conversa grande (com o histórico); os detalhes do pedido ficam no botão de cima dela.
$('#hudChat').addEventListener('click', (e) => { if ($('#gaveta').classList.contains('min') && e.target.closest('[data-cp="pagina"]')) { e.stopPropagation(); minimizarChat(false); } }, true);
/// ======================= gaveta =======================
const ABAS_ATIVIDADE = ['atencao', 'missoes', 'historico'];
const TITULO_ABA = { equipe: 'Equipe', agente: 'Agente', atencao: 'Pedidos', missoes: 'Pedidos', missao: 'Passo a passo', pedido: 'Pedido', historico: 'Pedidos', galeria: 'Galeria', chat: 'Sua assistente', dupla: 'Conversa da dupla', catalogo: 'Quem é quem', item: 'Detalhe', mais: 'Mais', ajustes: 'Perfil e ajustes', marco: 'Marco', agora: 'Agora: fazendo e fila' };
function abrirAba(nome, empilhar = false) {
  if (nome === 'mural') nome = 'dupla';
  if (nome === 'equipe' || nome === 'catalogo') { abrirEquipeVista(); return; }
  if (empilhar && aba !== nome && !$('#gaveta').classList.contains('fechada')) pilha.push(aba); else if (!empilhar) pilha.length = 0;
  aba = nome; if (!['agente', 'missao', 'pedido'].includes(nome)) guarda('aba', nome);
  $('#gaveta').classList.remove('fechada');
  $$('[data-painel]').forEach((s) => { s.hidden = s.dataset.painel !== nome; });
  if (['chat', 'dupla'].includes(nome)) guarda('abaConversa', nome);
  try { if (nome === 'chat' && chatCarregadoDe === conversaAtual) rolarPendente = -1; } catch {} // abrir a conversa = ver a última coisa (try: pode rodar antes das variáveis existirem)
  if (ABAS_ATIVIDADE.includes(nome)) guarda('abaAtividade', nome);
  $('#segAtividade').hidden = !ABAS_ATIVIDADE.includes(nome);
  $$('[data-seg]').forEach((b) => b.classList.toggle('on', b.dataset.seg === nome));
  $('#tituloAba').textContent = TITULO_ABA[nome];
  $('#voltarGaveta').hidden = !pilha.length;
  $('#gaveta').classList.toggle('folha', nome === 'agente');
  $('#gaveta').classList.toggle('conversa', ['chat', 'dupla'].includes(nome));                         // no celular: ficha na metade de baixo
  $('#gaveta').classList.toggle('grande', ['chat', 'dupla', 'pedido'].includes(nome));                 // no PC: janela no centro
  $('#gaveta').classList.remove('min');                                                                  // abrir de propósito = aberto inteiro
  $('#gaveta').classList.toggle('raiz', !pilha.length && !['agente', 'missao', 'marco', 'item', 'pedido'].includes(nome));
  desenharAba(); marcarChatAberto(); marcarNav(); desenharJanelaChat(); if (EU) desenharPendencias();
  setTimeout(dimensionar, 0);
}
// No PC, com o painel do chat aberto, a caixa de pedido é a de baixo da conversa (a barra central some).
const marcarChatAberto = () => {
  document.body.classList.toggle('chat-aberto', aba === 'chat' && !$('#gaveta').classList.contains('fechada') && !$('#gaveta').classList.contains('min'));
  // Com a Atividade aberta, as decisões já estão na tela: o aviso do topo passa para o próximo assunto.
  const emAtiv = emAtividade();
  if (document.body.classList.contains('em-atividade') !== emAtiv) { document.body.classList.toggle('em-atividade', emAtiv); desenharPendencias(); }
};
const emAtividade = () => aba === 'atencao' && !$('#gaveta').classList.contains('fechada');
function alternarAba(nome) { if (aba === nome && !$('#gaveta').classList.contains('fechada')) fecharGaveta(); else abrirAba(nome); }
function fecharGaveta() {
  if (innerWidth > 760 && EU) { const c = guardado('abaConversa', 'dupla'); if (aba !== c) { abrirAba(c); return; } } $('#gaveta').classList.add('fechada'); $('#gaveta').classList.remove('min'); marcarChatAberto(); marcarNav(); setTimeout(dimensionar, 0); }
$('#fecharGaveta').onclick = fecharGaveta;
$('#voltarGaveta').onclick = () => { const a = pilha.pop(); if (a) { const resto = [...pilha]; abrirAba(a); pilha.push(...resto); $('#voltarGaveta').hidden = !pilha.length; } };

// ---------- barra de navegação: uma só, 4 destinos (no PC em cima, no celular embaixo) ----------
// Escritório · Conversas · Atividade · Mais (Quadro, Equipe, Hoje, Diário, Galeria e Ajuda moram no Mais).
// No PC o mapa/quadro/equipe ficam no meio e a gaveta ao lado: os dois destinos acendem.
// No celular a gaveta cobre a tela: acende só o que está por cima.
const NAV_DA_ABA = { chat: 'conversas', dupla: 'conversas', atencao: 'atividade', missoes: 'atividade', missao: 'atividade', pedido: 'atividade', historico: 'atividade', galeria: 'mais', mais: 'mais', marco: 'mais', item: 'mais', agora: 'agora' };
function marcarNav() {
  const centro = !$('#equipeVista').hidden || !$('#quadro').hidden ? 'mais' : 'mapa';
  const aberta = !$('#gaveta').classList.contains('fechada');
  const painel = aberta ? NAV_DA_ABA[aba] : null;
  const cel = innerWidth <= 760;
  $$('#nav [data-nav]').forEach((b) => b.classList.toggle('on', cel && aberta ? b.dataset.nav === painel : b.dataset.nav === centro || b.dataset.nav === painel));
}
function irPara(destino) {
  const cel = innerWidth <= 760, aberta = !$('#gaveta').classList.contains('fechada');
  if (destino === 'mapa') { fecharQuadro(); fecharEquipeVista(); if (cel) fecharGaveta(); }
  else if (destino === 'quadro') { if (cel && aberta) fecharGaveta(); if ($('#quadro').hidden) abrirQuadro(); else if (!cel) fecharQuadro(); }
  else if (destino === 'equipe') { if ($('#equipeVista').hidden || (cel && aberta)) abrirEquipeVista(); else if (!cel) fecharEquipeVista(); }
  else if (destino === 'conversas') { if (NAV_DA_ABA[aba] === 'conversas' && aberta && cel) fecharGaveta(); else abrirAba(guardado('abaConversa', 'dupla')); }
  else if (destino === 'atividade') { if (NAV_DA_ABA[aba] === 'atividade' && aberta) fecharGaveta(); else abrirAba(guardado('abaAtividade', 'atencao')); }
  else if (destino === 'mais') { if (aba === 'mais' && aberta) fecharGaveta(); else abrirAba('mais'); }
  else if (destino === 'sugestoes') { if (aba === 'hoje' && aberta) fecharGaveta(); else Hoje.abrirEm('sugestoes'); }
  else if (destino === 'agora') { if (aba === 'agora' && aberta) fecharGaveta(); else abrirAba('agora'); }
  marcarNav();
}
$('#nav').onclick = (e) => { const b = e.target.closest('[data-nav]'); if (b) irPara(b.dataset.nav); };

let pendenteUI = false;
let montada = false; // nada de redesenhar painéis antes da interface existir (carregamento lento no celular)
function agendarInterface() { if (!montada || pendenteUI) return; pendenteUI = true; setTimeout(() => { pendenteUI = false; desenharTopo(); desenharHud(); desenharHudMapa(); desenharBarra(); if (aba === 'chat') desenharHudChat(); CDu.desenhar(); if (!$('#equipeVista').hidden) desenharEquipeVista(); if (!['chat', 'dupla'].includes(aba)) desenharAba(); }, 150); }
setInterval(agendarInterface, 15e3);

function montarInterface() {
  $('#barra').onclick = (e) => { const b = e.target.closest('[data-emote]'); if (b) fazerEmote(b.dataset.emote); };
  $('#btnAcenar').onclick = acenarParaOutro;
  $('#btnIrAte').onclick = () => irAtePessoa(outraPessoa());
  $('#formChat').onsubmit = (e) => { e.preventDefault(); enviarChat(); };
  $('#entrada').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(); } };
  // Anexos: 📎, colar um print (Ctrl+V) ou arrastar o arquivo para a conversa.
  const avisoAnexo = (texto) => toast({ titulo: 'Anexo', texto, cor: '#ef6a55' });
  const pegarAnexos = (fs) => { if (fs?.length) { A.adicionar([...fs], avisoAnexo); A.desenharPendentes($('#anexosPend')); marcarTexto(); } };
  $('#btnAnexo').onclick = () => $('#arqAnexo').click();
  $('#arqAnexo').onchange = (e) => { pegarAnexos(e.target.files); e.target.value = ''; };
  $('#entrada').addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); pegarAnexos(fs); } });
  $('#formChat').addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); $('#formChat').classList.add('soltar'); } });
  $('#formChat').addEventListener('dragleave', () => $('#formChat').classList.remove('soltar'));
  $('#formChat').addEventListener('drop', (e) => { $('#formChat').classList.remove('soltar'); if (e.dataTransfer?.files?.length) { e.preventDefault(); pegarAnexos(e.dataTransfer.files); } });
  $('#anexosPend').onclick = (e) => { const b = e.target.closest('[data-tirar-anexo]'); if (b) { A.tirar(Number(b.dataset.tirarAnexo)); A.desenharPendentes($('#anexosPend')); marcarTexto(); } };
  // O Enviar só fica laranja com texto escrito: antes disso a ação principal da tela pode ser outra (ex.: Decidir).
  $('#entrada').addEventListener('input', marcarTexto);
  $('#cmpFila').onclick = async (e) => {
    if (!e.target.closest('[data-fila-agora]')) return;
    if (!$('#entrada').value.trim()) { toast({ titulo: 'Escreva o pedido primeiro', texto: 'Depois toque de novo para interromper o atual e começar este.', cor: '#ffd23f' }); $('#entrada').focus(); return; }
    try { await pararConversa(conversaAtual); await enviarChat(); } catch (err) { toast({ titulo: 'Não consegui interromper', texto: err.message, cor: '#ef6a55' }); }
  };
  // "Sobre: X · Alterar" (no compositor da conversa) abre a lista de conversas; o perfil abre perfil e ajustes.
  // Celular: "Responder" abre o compositor; o seletor troca de conversa; "‹ Voltar" volta ao escritório.
  CC.ligarCompositor($('#formChat'), $('#entrada'));
  CC.ligarCabecalhoERodape($('#formChat'), $('#msgs'), $('#hudChat'), $('#seletorConvCel'));
  $('#seletorConvCel').onclick = () => { const el = $('#listaAbasFechadas'); el.hidden = !el.hidden; if (!el.hidden) desenharAbasFechadas(); desenharSeletorConversas(); };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-voltar-cel]')) irPara('mapa'); });
  $('#cmpSobre').onclick = (e) => { if (!e.target.closest('[data-cmp-alterar]')) return; const el = $('#listaAbasFechadas'); el.hidden = !el.hidden; if (!el.hidden) { desenharAbasFechadas(); el.scrollIntoView({ block: 'nearest' }); } };
  $('#perfilTopo').onclick = () => { if (aba === 'ajustes' && !$('#gaveta').classList.contains('fechada')) fecharGaveta(); else abrirAba('ajustes'); };
  $('#btnNovaConversa').onclick = () => novaAbaDireto();
  $('#cancelarConversa').onclick = () => { $('#formNovaConversa').hidden = true; };
  $('#formNovaConversa').onsubmit = (e) => { e.preventDefault(); criarConversa(); };
  ligarAbasConversa();
  $('#btnMaisConversa').onclick = menuConversa;
  $('#formRecado').onsubmit = (e) => { e.preventDefault(); enviarDupla(); };
  $('#textoRecado').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarDupla(); } };
  $('#rapidasDupla').innerHTML = RAPIDAS.map((r) => `<button type="button" data-rapida="${esc(r)}">${esc(r)}</button>`).join('');
  $('#rapidasDupla').onclick = (e) => { const b = e.target.closest('[data-rapida]'); if (b) enviarDupla(b.dataset.rapida); };
  $('#fecharResumo').onclick = () => { $('#resumo').hidden = true; };
  $('#fecharLightbox').onclick = () => { $('#lightbox').hidden = true; $('#conteudoLightbox').innerHTML = ''; };
  $('#fecharJornal').onclick = () => { $('#jornal').hidden = true; };
  $('#edicoesJornal').onchange = (e) => abrirJornal(e.target.value);
  $('#gerarJornal').onclick = async () => { try { await R.pedirJornal(); toast({ titulo: 'Pedi a edição de hoje', texto: 'A ponte escreve em ~1 min (precisa estar ligada).', cor: '#f4ecd8' }); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#buscaMissoes').oninput = () => desenharMissoes();
  document.addEventListener('click', (e) => { const sg = e.target.closest('[data-seg]'); if (sg) abrirAba(sg.dataset.seg); });
  $('#filtrosQuadroCel').onclick = () => { $('#quadroFiltros').classList.toggle('abertos'); desenharQuadro(); };
  $('#pedidosCel').onclick = () => abrirAba('missoes');
  ligarHud(); ligarQuadro();
  if (guardado('quadro', '')) abrirQuadro();
  $('#btnAjuda').onclick = abrirAjuda;
  $('#fecharAjuda').onclick = () => { $('#ajuda').hidden = true; };
  // Tutorial = um "?" pequeno no canto do mapa (sempre à mão); tocar abre a explicação, "Entendi" recolhe de novo.
    if (matchMedia('(pointer: coarse)').matches || innerWidth <= 760) $('#boasVindas span').innerHTML = 'Quem está <b>sentado</b> está trabalhando · <b>toque</b> num boneco para ver o que faz · <b>arraste</b> para andar pelo mapa · o botão amarelo <b>precisam de você</b>, no topo, mostra o que espera a sua decisão';
  const bv = (abrir) => { $('#boasVindas').classList.toggle('aberto', abrir); $('#bvChip').setAttribute('aria-expanded', abrir); };
  $('#bvChip').onclick = () => bv(!$('#boasVindas').classList.contains('aberto'));
  $('#fecharBoasVindas').onclick = () => { bv(false); guarda('boasVindas', '1'); };
  $('#boasVindas').hidden = false;
  ligarAlternaLateral();
  dimensionar();
  // No celular a primeira tela é o MAPA; o Resumo abre como folha no ✋ do topo.
  if (innerWidth <= 760) { abrirAba('atencao'); fecharGaveta(); } else abrirAba(guardado('abaConversa', 'dupla'));
  ligarVistaNoBody();
  registrarSw();
  abrirDeUrl(new URL(location.href));
  $('#buscaEquipe').oninput = (e) => { buscaEq = e.target.value; desenharEquipeVista(); };
  $('#filtrosEquipe').onclick = (e) => { const p = e.target.closest('[data-fpes]'), t = e.target.closest('[data-ftipo]'); if (p) filtroPesEq = p.dataset.fpes; if (t) filtroTipoEq = t.dataset.ftipo; if (p || t) desenharEquipeVista(); };
  $('#equipeCorpo').onclick = (e) => {
    const ir = e.target.closest('[data-eqaba-ir]'); if (ir) { abaEq = ir.dataset.eqabaIr; guarda('abaEq2', abaEq); desenharEquipeVista(); return; }
    if (e.target.closest('[data-revisar-permissao]')) { if (innerWidth <= 760) fecharEquipeVista(); MC.irResumo('esperando'); return; } // as decisões, como o "Revisar decisões" do Hoje
    const ag = e.target.closest('.eqa-card[data-k]'); if (ag) { fecharEquipeVista(); localizar(ag.dataset.k); return; }
    const en = e.target.closest('[data-ensinar]'); if (en) { ensinarCargo(en.dataset.ensinar); return; }
    if (e.target.closest('.cg-det')) return; // abrir os detalhes do cartão não leva ao mapa
    const vm = e.target.closest('[data-cargo-mapa]'); if (vm) { fecharEquipeVista(); localizarCargo(vm.dataset.cargoMapa); return; }
    if (EQ.alternarCargo(e.target, innerWidth <= 760)) return; // celular: tocar no cartão compacto abre/fecha
    const cg = e.target.closest('[data-cargo]'); if (cg) { fecharEquipeVista(); localizarCargo(cg.dataset.cargo); return; }
    const c = e.target.closest('[data-item]'); if (!c) return; const [t, ...n] = c.dataset.item.split('|'); const x = itensEquipe().find((i) => i.k === c.dataset.item); abrirItem(t, x ? x.nome : n.join('|')); };
  ligarEscalacao($('#hudChat')); ligarEscalacao($('#hudMapa')); ligarEscalacao($('#detalheMissao'));
  ligarComandoNoApp();
  desenharTopo(); desenharHud(); desenharHudMapa(); ligarBarra(); ligarHoje(); ligarMapaCel();
  montada = true;
  setInterval(() => { if (!document.hidden) guarda('visto', Date.now()); }, 30e3);
}

// ---------- glossário: um "?" ao lado do termo; tocar abre a explicação de 1 linha ----------
const GLOSSARIO = {
  'sub-agente': 'Um ajudante especialista (ex.: Editor de vídeo) que a assistente chama para uma parte do trabalho. Ele faz e devolve um relatório.',
  skill: 'Uma receita de "como fazer" que a IA abre e segue. Não é um personagem: qualquer agente pode usar.',
  marco: 'Um objetivo grande do quadro (ex.: Trailer de lançamento). Os pedidos do dia a dia se penduram nele sozinhos.',
  'escalação': 'A lista de quem a assistente vai chamar (agentes, skills, programas) e por quê, anunciada antes de começar.',
  'aprovação': 'A IA quer fazer algo que pode ter risco (rodar um comando, gastar créditos) e espera o seu Permitir ou Negar.',
  'sem sinal': 'Ainda está rodando, mas faz mais de 5 min que não manda notícia. Não quer dizer que terminou.',
  ponte: 'O programa no seu PC que manda para cá o que as IAs estão fazendo. Bolinha verde: ligada.',
};
const glo = (termo) => `<button type="button" class="glo" data-glo="${esc(termo)}" aria-label="O que é ${esc(termo)}?">?</button>`;
// Captura antes dos outros cliques: o "?" não abre o cartão em que está.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-glo]'), pop = $('#glossario');
  if (!b) { if (!pop.hidden && !e.target.closest('#glossario')) pop.hidden = true; return; }
  e.preventDefault(); e.stopPropagation();
  if (!pop.hidden && pop.dataset.termo === b.dataset.glo) { pop.hidden = true; return; }
  pop.dataset.termo = b.dataset.glo;
  pop.innerHTML = `<b>${esc(b.dataset.glo)}</b> ${esc(GLOSSARIO[b.dataset.glo] || '')}`;
  pop.hidden = false;
  const r = b.getBoundingClientRect(), w = Math.min(300, innerWidth - 32);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2)) + 'px';
  const h = pop.offsetHeight;
  pop.style.top = (r.bottom + 8 + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
}, true);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#glossario').hidden = true; $('#folhaAprov').hidden = true; } });

// ---------- topo ----------
async function desenharTopo() {
  const html = [];
  for (const p of pessoas()) {
    const st = estados.get(p) || {};
    const on = presentes.has(p) || p === EU.pessoa;
    const ponte = st.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3;
    const status = presentes.get(p)?.status || st.status || 'disponivel';
    const det = [on ? (status === 'focado' ? 'focado' : 'no site') : 'fora do site', st.branch ? `⎇ ${st.branch}` : '', ponte ? (st.info?.ausente ? 'PC parado' : 'PC ligado') : 'PC desligado (as IAs dele não estão rodando)'].filter(Boolean).join(' · ');
    html.push(`<div class="pessoa ${on ? 'on' : ''} ${status === 'focado' ? 'focado' : ''} ${ponte ? '' : 'pc-off'}" data-ir="${esc(p)}" title="${esc(det + (st.commit ? ' · último commit: ' + st.commit : ''))}"><img src="${await retratoDe(p)}" alt=""><span class="ponto"></span>${esc(p)}${ponte ? '' : '<span class="zz" title="PC desligado">💤</span>'}</div>`);
  }
  $('#gente').innerHTML = html.join('');
  $('#gente').onclick = (e) => { const d = e.target.closest('[data-ir]'); if (d && d.dataset.ir !== EU.pessoa) irAtePessoa(d.dataset.ir); };
  const todos = todosAgentes();
  const dp = decisoesPendentes(), nDec = dp.n, erros = todos.filter((a) => a.m.pessoa === EU.pessoa && a.st.cls === 'erro').length;
  const novosRecados = recados.filter((r) => r.cor !== 'reacao' && new Date(r.criado).getTime() > Number(guardado('recadosVistos', '0')) && r.pessoa !== EU.pessoa).length;
  for (const el of $$('[data-badge-dupla]')) { el.hidden = !novosRecados || aba === 'dupla'; el.textContent = `${novosRecados} nova${novosRecados > 1 ? 's' : ''}`; }
  ultPend.erros = erros; ultPend.contagem = dp.contagem; ultPend.lista = dp.lista;
  desenharPendencias(nDec, novosRecados);
  await desenharPerfil();
  document.title = nDec ? `(${nDec}) Estúdio Genesis` : 'Estúdio Genesis';
}
// Linha 1 do topo: você (rosto, nome) + o projeto e se o seu PC está ligado. Toque abre perfil e ajustes.
async function desenharPerfil() {
  const el = $('#perfilTopo'); if (!el || !EU) return;
  const st = estados.get(EU.pessoa) || {}, ligada = pcLigado(EU.pessoa);
  const projeto = st.projeto || st.info?.projetos?.[0]?.nome || 'sem projeto';
  const html = `<img src="${await retratoDe(EU.pessoa)}" alt=""><span class="pf-txt"><b>${esc(EU.pessoa)}</b><small><i class="pf-pc ${ligada ? 'on' : 'off'}"></i>${esc(projeto)}${ligada ? '' : ' · PC desligado'}</small></span><span class="pf-seta" aria-hidden="true">▾</span>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  el.title = `Você: ${EU.pessoa} · projeto ${projeto}${st.branch ? ' · branch ' + st.branch : ''} · PC ${ligada ? 'ligado (as IAs do seu PC estão conectadas)' : 'desligado'}. Toque para perfil e ajustes.`;
  el.classList.toggle('pc-off', !ligada);
}
// Linha 2 do topo: UM aviso, o mais importante agora (decisões › conflito › pedido do Kenny › travou).
// Os outros ficam num "+N" ao lado. Sem nada esperando, a linha some e o mapa ganha o espaço.
let ultPend = { alertas: 0, recados: 0, erros: 0, contagem: CTG.contarPendencias() };
function desenharPendencias(alertas = ultPend.alertas, novos = aba === 'dupla' ? 0 : ultPend.recados) {
  if (!EU) return;
  ultPend = { ...ultPend, alertas, recados: novos };
  const naoVistasN = naoVistas.size + novos;
  const outro = outraPessoa() || 'a dupla', itens = [];
  if (alertas && !emAtividade()) itens.push({ k: 'atencao', nivel: 'urgente', ic: 'mao', txt: CTG.textoDecisoes(ultPend.contagem), sub: alertas > 1 ? 'Os agentes esperam você para seguir' : 'O agente espera você para seguir', acao: 'Resolver' });
  for (const c of CDu.conflitosAbertos()) itens.push({ k: 'conflito', nivel: 'aviso', ic: 'alerta', txt: c.arq ? `Conflito com o ${outro}` : 'Combine com ' + outro, sub: c.arq ? c.arqNome : c.curto, acao: 'Combinar' });
  const bolas = CDu.bolasParaMim();
  if (bolas) itens.push({ k: 'bola', nivel: 'aviso', ic: 'seta', txt: `${outro} mandou ${bolas > 1 ? `${bolas} pedidos` : 'um pedido'} para você`, sub: 'Assuma ou encaminhe à sua assistente', acao: 'Ver' });
  if (ultPend.erros) itens.push({ k: 'atencao', nivel: 'aviso', ic: 'alerta', txt: `${ultPend.erros > 1 ? `${ultPend.erros} pedidos seus travaram` : 'Um pedido seu travou'}`, sub: 'Veja o que houve e tente de novo', acao: 'Ver' });
  // Uma faixa só; fila, fazendo e custo ficam no "Resumo" recolhido (o mapa começa mais alto).
  const and = andamento();
  CT.desenharAviso($('#statusTopo'), itens, { calmo: `Nada esperando você${and.tarefas || and.agentes ? ` · ${CTG.textoAndamento(and)}` : ''}`, numerosHtml: () => { const r = MC.resumoAtual(); return r ? Hoje.htmlNumerosDia(r, { custo: true }) : ''; }, aoNumero: (q) => MC.irResumo(q) });
  document.body.classList.toggle('sem-aviso', false);
  const pc = $('#pontoConversas'); if (pc) { pc.hidden = !naoVistasN; pc.title = `${naoVistasN} resposta(s) que você ainda não viu`; }
  $('#statusTopo').onclick = (e) => {
    const b = e.target.closest('[data-aviso]'); if (!b) return;
    CT.fecharLista();
    const k = b.dataset.aviso;
    if (k === 'resumo') { CT.alternar(); return; }
    if (k === 'conflito' || k === 'bola') { fecharEquipeVista(); fecharQuadro(); abrirAba('dupla'); setTimeout(() => $(k === 'conflito' ? '#coordDupla .cd-conf' : '#coordDupla .cd-bolas')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250); return; }
    const aberta = !$('#gaveta').classList.contains('fechada');
    if (aberta && aba === 'atencao') { fecharGaveta(); return; } // segundo toque fecha a folha
    abrirAba('atencao');
  };
}
function todosAgentes() {
  const out = [];
  for (const [p, mesas] of D.equipes()) for (const m of mesas.values()) if (m.nome !== 'Orquestrador' || !D.abas().some((a) => a.pessoa === p)) out.push({ m, st: D.estadoDe(m) });
  for (const a of D.abas()) out.push({ m: a, st: D.estadoDe(a) });
  for (const p of pessoas()) for (const nome of [...AGENTES_CONHECIDOS, 'Orquestrador', 'Codex']) if (nome !== '*' && !D.mesa(p, nome)) { const v = vazioMesa(p, nome); out.push({ m: v, st: D.estadoDe(v) }); }
  return out;
}

// ---------- abas ----------
function desenharAba() {
  if (!mundo || $('#gaveta').classList.contains('fechada')) return;
  ({ equipe: desenharEquipe, agente: desenharAgente, atencao: desenharAtencao, missoes: desenharMissoes, missao: desenharMissao, historico: desenharHistorico, galeria: desenharGaleria, chat: desenharChatCompleto, dupla: desenharDupla, item: desenharItem, mais: desenharMais, ajustes: desenharAjustes, marco: desenharMarco, hoje: () => Hoje.desenhar(), pedido: () => PP.desenhar(), agora: desenharAgora })[aba]?.();
}
function filtros(el, atual, opcoes, fn) {
  el.innerHTML = opcoes.map(([v, t]) => `<button data-f="${esc(v)}" class="${v === atual ? 'on' : ''}">${esc(t)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) fn(b.dataset.f); };
}
const pastaCurta = (a) => String(a.pasta || a.projeto || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'outra aba';
const ehRecepcao = (m) => !m.aba || D.abas().find((a) => a.pessoa === m.pessoa) === m;
const tituloAgente = (m) => { const c = m.nome !== 'Orquestrador' && EQ.cargoDe(m.nome, cargosAgora()); if (!c) return tituloSemCargo(m); return c.id === m.nome ? c.nome : `${c.nome} · ${tituloSemCargo(m)}`; };
const tituloSemCargo = (m) => m.nome === 'Orquestrador' ? (!ehRecepcao(m) ? `Assistente · ${pastaCurta(m)}` : m.pessoa === EU.pessoa ? 'Sua assistente' : `Assistente de ${m.pessoa}`) : m.nome === 'Codex' ? (m.pessoa === EU.pessoa ? 'Codex' : `Codex de ${m.pessoa}`) : m.titulo || tituloDe(m.nome);
// Etiquetas: tipo (👑 🤖 🧠 🔌 🛠️) + modelo só para quem pensa (Claude Haiku, GPT) + frente atual.
function etiquetasDe(m) {
  const tipo = tipoDe(m.nome), mod = modelo(m.nome, m.pessoa);
  const fr = ['trab', 'alerta', 'erro', 'fim'].includes(D.estadoDe(m).cls) ? D.frenteDaMesa(m) : null;
  return `${etiquetaTipo(tipo)}${['agente', 'assistente'].includes(tipo) && mod.rotulo !== 'Claude' ? ` <span class="modelo claude" title="Modelo de IA">${esc(mod.rotulo.replace('Claude ', ''))}</span>` : ''}${fr ? ` ${chipFrente(fr)}` : ''}`;
}
const chipFrente = (f, extra = '') => `<span class="chip-frente" style="--cor:${f.cor}" title="${esc(f.descricao)}">${icoDeEmoji(f.icone)} ${esc(f.nome)}${extra}</span>`;
async function linhaAgente({ m, st }) {
  let texto = D.emSegundoPlano(m) ? '⏳ Rodando uma tarefa em segundo plano' : m.ult ? primeiraFrase(frase(m.ult), 120) : modelo(m.nome, m.pessoa).descricao || TIPOS[tipoDe(m.nome)].curta;
  const sobre = m.ult && m.nome !== 'Orquestrador' && m.pedido && st.cls !== 'livre' ? primeiraFrase(frase(m.pedido).replace(/^.*? pediu: /, ''), 90) : '';
  return `<div class="ag ${selecionado === m.k ? 'sel' : ''}" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}">
    <img src="${await retratoDe(m.nome)}" alt="">
    <div><div class="n">${esc(tituloAgente(m))} <small>${esc(m.pessoa)}</small></div><div class="etqs">${etiquetasDe(m)}</div><div class="t">${esc(texto)}</div>${sobre ? `<div class="t sobre">Missão: ${esc(sobre)}</div>` : ''}</div>
    <div class="q" style="--cor:${st.cor}"><i>${st.glifo}</i><br>${m.ult ? D.ha(m.ult.t) : ''}</div></div>`;
}
async function desenharEquipe() {
  filtros($('#filtroEquipe'), filtroEquipe, [['todos', 'Todos'], ...pessoas().map((p) => [p, p]), ['t:agente', '🤖 Agentes'], ['t:fora', '🔌 Conectores e programas'], ['t:ia', '🧠 GPT']], (f) => { filtroEquipe = f; desenharEquipe(); });
  const lista = todosAgentes().filter((a) => {
    const t = tipoDe(a.m.nome);
    if (filtroEquipe === 't:agente' && !['agente', 'assistente'].includes(t)) return false;
    if (filtroEquipe === 't:fora' && !['conector', 'programa'].includes(t)) return false;
    if (filtroEquipe === 't:ia' && t !== 'ia') return false;
    if (!filtroEquipe.startsWith('t:') && filtroEquipe !== 'todos' && a.m.pessoa !== filtroEquipe) return false;
    if (temFiltro() && !passa(D.frenteDaMesa(a.m))) return false;
    return true;
  });
  const grupos = [['Precisa de você', ['alerta', 'erro'], 'alerta'], ['Trabalhando', ['trab', 'semsinal'], 'trab'], ['Entregou', ['fim'], 'fim'], ['Planejado', ['planejado'], 'planejado'], ['Livre', ['espera', 'livre'], 'livre']];
  let html = '';
  for (const [nome, cls, chave] of grupos) {
    const itens = lista.filter((a) => cls.includes(a.st.cls)).sort((a, b) => (b.m.pessoa === EU.pessoa) - (a.m.pessoa === EU.pessoa) || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
    if (!itens.length) continue;
    html += `<div class="grupo" style="--cor:${D.ESTADOS[chave].cor}"><i>${D.ESTADOS[chave].glifo}</i>${nome} · ${itens.length}</div>`;
    html += (await Promise.all(itens.map(linhaAgente))).join('');
  }
  $('#listaEquipe').innerHTML = avisoFiltro() + (html || `<div class="vazio">${temFiltro() ? 'Ninguém trabalhando aqui agora.' : 'Ninguém por aqui ainda.'}</div>`);
  $('#listaEquipe').onclick = (e) => { if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro(); const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k); };
}
const avisoFiltro = () => temFiltro() ? `<div class="aviso-filtro" style="--cor:${filtroJogo ? jogoPorId(filtroJogo).cor : setorPorId(filtroSetor).cor}">Só <b>${esc(nomeFiltro())}</b><button data-tirar-filtro title="Ver tudo">× ver tudo</button></div>` : '';
function tirarFiltro() { mudarFiltro('', ''); }

// ---------- Resumo (caixa de entrada): precisa de você › travou › rodando › pronto ----------
// É a primeira tela no celular: responde "alguém precisa de mim? o que ficou pronto? o que travou?".
const pcLigado = (p) => { const st = estados.get(p); return !!st?.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3; };
const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIphoneSemApp = () => /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
async function cartaoAvisos() {
  const st = estados.get(EU.pessoa) || {}, info = st.info || {};
  const ligado = pcLigado(EU.pessoa);
  const linhaPc = ligado
    ? `<span class="pc on">🖥️ Seu PC está ligado${info.ausente ? ' · parado há mais de 5 min' : ''}</span>`
    : `<span class="pc off">💤 Seu PC está desligado ou sem a ponte${st.ponte_visto ? ' (visto ' + D.ha(new Date(st.ponte_visto).getTime()) + ')' : ''}: pedidos pelo chat ficam esperando</span>`;
  let notif = '';
  const minhaInscricao = await inscricaoAtual();
  const temNoPc = (info.push || []).some((x) => x.endpoint === minhaInscricao?.endpoint);
  if (!pushSuportado()) notif = ehIphoneSemApp() ? '<p class="dica-av">Para receber avisos no iPhone: Safari › Compartilhar › <b>Adicionar à Tela de Início</b> e abra pelo ícone.</p>' : '';
  else if (Notification.permission === 'denied') notif = '<p class="dica-av">As notificações estão bloqueadas nos ajustes deste aparelho.</p>';
  else if (!info.vapid) notif = `<p class="dica-av">${ligado ? 'Sua ponte ainda é a versão antiga (sem avisos). Ela atualiza ao reiniciar.' : 'Ligue a ponte no PC para ativar os avisos.'}</p>`;
  else if (!temNoPc) notif = '<button class="btn forte" id="ativarPush">🔔 Avisar neste aparelho</button>';
  else notif = '<span class="ok-av">🔔 Avisos ligados neste aparelho <button class="link" id="testarPush">testar</button> · <button class="link" id="desligarPush">desligar</button></span>';
  return `<div class="cartao-av">${linhaPc}
    <label class="chave-longe"><input type="checkbox" id="chkLonge" ${info.longe ? 'checked' : ''} ${ligado ? '' : 'disabled'}><span><b>Estou longe do PC</b><small>avisa tudo no celular e deixa aprovar daqui${info.longe ? '' : ' (liga sozinho com o PC parado 5 min)'}</small></span></label>
    ${notif}</div>`;
}
async function desenharAtencao() {
  const el = $('#listaAtencao');
  $('#listaAprovacoes').innerHTML = '';
  const meus = (a) => a.m.pessoa === EU.pessoa;
  const todos = todosAgentes();
  const { n: nDec, alertas: alerta } = decisoesPendentes();
  const travou = todos.filter((a) => a.st.cls === 'erro').sort((a, b) => meus(b) - meus(a));
  const rodando = todos.filter((a) => a.st.cls === 'trab' || a.st.cls === 'semsinal').sort((a, b) => meus(b) - meus(a) || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
  const doze = Date.now() - 12 * 3600e3;
  const prontos = D.missoes().filter((m) => m.fim && m.fim > doze && m.status === 'fim' && (m.resposta || m.miniaturas.length)).slice(0, 12);
  const sec = (ic, t, n, corpo, cls = '') => `<section class="cx ${cls}"><h3>${ic} ${t}${n != null ? ` <small>${n}</small>` : ''}</h3>${corpo}</section>`;
  let html = PP.htmlLista(); // seus pedidos (cada um abre a página do pedido), depois as decisões e os avisos
  if (aprovacoes.length || alerta.length) html += sec(icoPx('cadeado'), `${nDec === 1 ? 'Uma decisão precisa' : `${nDec} decisões precisam`} de você ${glo('aprovação')}`, null, '<p class="ap3-intro">Cada cartão é uma decisão: leia o que acontece e escolha. Nada é feito sem o seu toque.</p>' + aprovacoes.map(cartaoAprovacao).join('') + (await Promise.all(alerta.map(linhaAgente))).join(''), 'urgente');
  html += await cartaoAvisos();
  if (travou.length) html += sec(icoPx('xis'), 'Travou', travou.length, (await Promise.all(travou.map(linhaAgente))).join(''));
  html += sec(icoPx('engrenagem'), 'Rodando agora', rodando.length, rodando.length ? (await Promise.all(rodando.slice(0, 8).map(linhaCompacta))).join('') + (rodando.length > 8 ? `<button class="link" data-ir-aba="equipe">ver os ${rodando.length}</button>` : '') : '<div class="vazio">Ninguém trabalhando agora.</div>', 'cx-rodando');
  html += sec(icoPx('check'), 'Pronto nas últimas 12 h', prontos.length, prontos.length ? (await Promise.all(prontos.map(cartaoPronto))).join('') : '<div class="vazio">Nada entregue ainda.</div>');
  el.innerHTML = html;
  ligarAprovacoes(el);
  const antes = el.onclick;
  el.onclick = (e) => {
    if (e.target.closest('[data-decide],[data-ap-sel],[data-ap-confirmar],[data-ap-dec],[data-ap-mudar]')) return antes?.(e);
    if (e.target.closest('.ap3')) return;
    const ia = e.target.closest('[data-ir-aba]'); if (ia) return abrirAba(ia.dataset.irAba, true);
    const mi = e.target.closest('[data-missao]'); if (mi) return PP.abrir({ missao: mi.dataset.missao });
    const d = e.target.closest('[data-k]'); if (d) localizar(d.dataset.k);
  };
  $('#ativarPush')?.addEventListener('click', ativarPush);
  $('#desligarPush')?.addEventListener('click', desligarPush);
  $('#testarPush')?.addEventListener('click', () => { const r = navigator.serviceWorker?.ready; r?.then((reg) => reg.showNotification('Estúdio Genesis', { body: 'Assim chegam os avisos. Os de verdade vêm da sua ponte, mesmo com o app fechado.', icon: 'icones/icone-180.png' })); });
  $('#chkLonge')?.addEventListener('change', async (e) => {
    const quer = e.target.checked, gravar = () => R.mudarCampoInfo('longe', quer);
    try { await gravar(); conferirGravado((info) => !!info.longe === quer, gravar); toast({ titulo: e.target.checked ? 'Modo longe ligado' : 'Modo longe desligado', texto: e.target.checked ? 'Avisos e aprovações vêm para cá.' : 'Volta ao normal (liga sozinho com o PC parado).', cor: '#4fbf82' }); }
    catch (err) { e.target.checked = !e.target.checked; toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  });
}
async function linhaCompacta({ m, st }) {
  const fr = D.frenteDaMesa(m);
  const texto = D.emSegundoPlano(m) ? '⏳ tarefa em segundo plano' : m.ult ? primeiraFrase(frase(m.ult), 90) : '';
  const n = D.ativos(m);
  return `<div class="ag-c" data-k="${esc(m.k)}" style="--cor:${corPessoa(m.pessoa)}"><img src="${await retratoDe(m.nome)}" alt=""><div><b>${esc(tituloAgente(m))}${n > 1 ? ` <small class="x2">×${n}</small>` : ''}</b> <small>${esc(m.pessoa)}${fr ? ' · ' + fr.icone + ' ' + esc(fr.nome) : ''}</small><span>${esc(texto)}</span></div><i style="--cor:${st.cor}">${m.ult ? D.ha(m.ult.t) : ''}</i></div>`;
}
async function cartaoPronto(m) {
  const fr = m.frente;
  const urls = m.miniaturas.length ? await R.urlsMiniaturas(m.miniaturas.slice(0, 3).map((x) => x.caminho)).catch(() => []) : [];
  return `<button class="pronto" data-missao="${esc(m.id)}" style="--cor:${fr.cor}">
    <span class="p-top">${fr.icone} ${esc(fr.nome)} · ${esc(m.pessoa)} · ${D.ha(m.fim)}</span>
    <b>${esc(m.titulo)}</b>
    ${m.resposta ? `<span class="p-txt">${esc(primeiraFrase(m.resposta, 160))}</span>` : ''}
    ${urls.filter(Boolean).length ? `<span class="p-minis">${urls.filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</span>` : ''}</button>`;
}
// Pedido de autorização: o cartão (comando-aprovacao.js) explica o que vai acontecer; aqui só o contexto.
function infoAprovacao(a) {
  const { origem, pedidoDe, ...campos } = lerJson(a.detalhe);
  const cv = conversas.find((c) => c.id === a.conversa_id);
  const agente = origem?.agente || pedidoDe?.agente || null;
  const projeto = origem?.projeto || pedidoDe?.projeto || cv?.projeto || '';
  const quem = !agente || agente === 'Orquestrador' ? 'A assistente' : `O ${tituloDe(agente)}`;
  const mi = origem?.sessao ? D.missoes().find((m) => m.pessoa === EU.pessoa && m.sessao && origem.sessao.startsWith(m.sessao)) : null;
  const dentroHtml = cv ? `conversa <span class="pq-aba" style="--cor:${visualAba(cv).cor}">${esc(visualAba(cv).icone)} ${esc(visualAba(cv).nome || cv.titulo)}</span>` : origem?.terminal ? `terminal${mi ? ` · pedido “${esc(primeiraFrase(mi.titulo, 60))}”` : ''}` : '';
  return { quem, projeto, dentroHtml, convId: cv ? cv.id : null, pedido: cv ? (visualAba(cv).nome || cv.titulo) : mi ? primeiraFrase(mi.titulo, 60) : '', origemTxt: origem?.terminal ? 'Veio do terminal do PC' : 'Veio do chat do escritório', quando: D.ha(new Date(a.criado).getTime()), passoTxt: passo(a.ferramenta, null, campos) };
}
// Decisões já tomadas aqui, por pedido de autorização ({ [ação]: 'sim' | 'nao' | 'listar' }); a resposta
// vai para a ponte quando todas as ações do pedido tiverem decisão.
const escolhasAprov = new Map();
// Numeração por PEDIDO (não por comando): "decisão 2 de 3 deste pedido" soma as autorizações da mesma conversa.
function ordemNoPedido(a) {
  if (a.conversa_id == null) return null;
  const mesmas = aprovacoes.filter((x) => x.conversa_id === a.conversa_id && !lerJson(x.detalhe).origem?.terminal);
  let base = 0; for (const x of mesmas) { if (x.id === a.id) break; base += CA.nDecisoes(x); }
  return { base, total: mesmas.reduce((s, x) => s + CA.nDecisoes(x), 0) };
}
function cartaoAprovacao(a) { return CA.html(a, { ...infoAprovacao(a), ordem: ordemNoPedido(a) }, escolhasAprov.get(a.id) || {}); }
// Quantas decisões esperam você: uma por ação de cada autorização + alertas sem autorização correspondente.
function decisoesPendentes() {
  const meus = todosAgentes().filter((a) => a.m.pessoa === EU.pessoa && a.st.cls === 'alerta');
  const comAprov = new Set(aprovacoes.map((a) => { const j = lerJson(a.detalhe); return j.origem?.agente || j.pedidoDe?.agente; }).filter(Boolean));
  const alertas = meus.filter((a) => !comAprov.has(a.m.nome));
  // A conta em si fica em contagem.js (fonte única do topo e do Hoje). Pedido = a conversa; do terminal, o agente.
  const pedidoDe = (a) => { if (a.conversa_id != null) return 'c' + a.conversa_id; const j = lerJson(a.detalhe); return 't' + (j.origem?.agente || j.pedidoDe?.agente || a.id); };
  // Para o Hoje listar os pedidos: nome do pedido, a próxima decisão (a 1ª que falta) e quem espera.
  const semHtml = (s) => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; };
  const daAprov = (a) => {
    const info = infoAprovacao(a), x = CA.explicar(a, info), feitas = escolhasAprov.get(a.id) || {};
    const prox = x.acoes.find((_, i) => !(i in feitas)), j = lerJson(a.detalhe), quem = j.origem?.agente || j.pedidoDe?.agente || 'Orquestrador';
    return { titulo: info.pedido || `${tituloDe(quem)} no terminal`, proxima: semHtml(prox?.t), quem };
  };
  const decisoes = [
    ...aprovacoes.map((a) => ({ pedido: pedidoDe(a), n: CA.nDecisoes(a) - Object.keys(escolhasAprov.get(a.id) || {}).length, ...daAprov(a) })),
    ...alertas.map((a) => ({ pedido: 'a' + (a.m.sessao || a.m.nome), n: 1, titulo: a.m.ult?._m?.titulo ? primeiraFrase(a.m.ult._m.titulo, 70) : tituloDe(a.m.nome), proxima: a.m.ult ? primeiraFrase(frase(a.m.ult), 90) : 'Responder ao agente', quem: a.m.nome })),
  ];
  const contagem = CTG.contarPendencias({ decisoes });
  return { n: contagem.decisoes, alertas, contagem, lista: CTG.listarPedidos(decisoes) };
}

// ---------- notificações no aparelho (Web Push mandado pela ponte do PC) ----------
let registroSw = null;
async function registrarSw() {
  if (!('serviceWorker' in navigator) || DEMO) return null;
  try { registroSw = await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { console.warn('sw:', e); }
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.abrir) { abrirDeUrl(new URL(e.data.abrir)); ressincronizar(); } });
  return registroSw;
}
async function inscricaoAtual() { try { const r = registroSw || await navigator.serviceWorker?.getRegistration(); return await r?.pushManager?.getSubscription(); } catch { return null; } }
const b64paraBytes = (b) => { const s = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function ativarPush() {
  try {
    const chave = estados.get(EU.pessoa)?.info?.vapid;
    if (!chave) throw new Error('A ponte do PC ainda não mandou a chave de avisos. Deixe ela ligada e tente de novo.');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão negada neste aparelho.');
    if (!registroSw) await registrarSw();
    const reg = await navigator.serviceWorker.ready; // inscrever só com o service worker ativo
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) { await sub.unsubscribe(); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64paraBytes(chave) });
    const j = sub.toJSON(), aparelho = /iphone/i.test(navigator.userAgent) ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computador';
    const gravar = async () => { const i = await R.lerMeuInfo(); await R.mudarCampoInfo('push', [...(i.push || []).filter((x) => x.endpoint !== j.endpoint), { endpoint: j.endpoint, keys: j.keys, aparelho, desde: new Date().toISOString() }].slice(-5)); };
    await gravar();
    conferirGravado((info) => (info.push || []).some((x) => x.endpoint === j.endpoint), gravar);
    toast({ titulo: '🔔 Avisos ligados', texto: 'Quando você estiver longe do PC, os avisos chegam aqui mesmo com o app fechado.', cor: '#4fbf82' });
  } catch (e) { toast({ titulo: 'Não consegui ligar os avisos', texto: e.message, cor: '#ef6a55' }); }
  desenharAtencao();
}
// A ponte regrava o estado.info a cada minuto (lendo antes o que é do site). Se as duas gravações
// cruzarem, a do site pode se perder: confere depois de alguns segundos e grava de novo se sumiu.
function conferirGravado(ok, gravar, tentativas = 3) {
  setTimeout(async () => {
    try {
      const info = await R.lerMeuInfo();
      if (!ok(info) && tentativas > 0) { await gravar(); conferirGravado(ok, gravar, tentativas - 1); }
    } catch {}
  }, 8000);
}
async function desligarPush() {
  const sub = await inscricaoAtual();
  if (sub) { const i = await R.lerMeuInfo().catch(() => ({})); await R.mudarCampoInfo('push', (i.push || []).filter((x) => x.endpoint !== sub.endpoint)).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  desenharAtencao();
}
function abrirDeUrl(u) {
  const a = u.searchParams.get('aba');
  if (!a) return;
  if (a === 'quadro') return abrirQuadro();
  fecharQuadro(); abrirAba(a);
}

// ---------- volta do celular: busca o que chegou enquanto o app dormia ----------
let escondidoDesde = 0, ressincronizando = false, ultimaReconexao = 0, idSincronizado = 0;
async function ressincronizar() {
  if (DEMO || ressincronizando || !EU) return;
  ressincronizando = true;
  try {
    const ultimo = D.eventos.at(-1)?.t || Date.now() - 3600e3;
    // Cursor da última sincronização COMPLETA (eventos avulsos do tempo real não o adiantam).
    const n = await R.novidadesDesde(ultimo, idSincronizado);
    idSincronizado = n.eventos.reduce((mx, e) => Math.max(mx, e.id || 0), idSincronizado);
    D.adicionar(n.eventos.map(D.deLinha));
    if (n.recados) recados = n.recados;
    for (const e of n.estado) { estados.set(e.pessoa, e); definirPastas(e.pessoa, e.info?.pastas); lerFichas(e); }
    if (n.aprovacoes) aprovacoes = n.aprovacoes;
    if (n.conversas) conversas = n.conversas;
    lembrarComandos(n.comandos); seloAgora();
    if (n.jornal) jornais = n.jornal;
    if (n.marcos) { marcos = n.marcos; vinculos = new Map((n.vinculos || []).map((v) => [v.missao, v.marco_id])); comentarios = n.comentarios || comentarios; mudouMarcos(); if (!$('#quadro').hidden) desenharQuadro(); }
    desenharSeletorConversas();
    if (!['joined', 'joining'].includes(R.estadoCanal()) && Date.now() - ultimaReconexao > 30e3) { ultimaReconexao = Date.now(); R.reconectarTabelas(); }
    versaoMundo = -1; sincronizarMundo(); agendarInterface();
    if (['chat', 'dupla', 'atencao'].includes(aba)) desenharAba();
    chatCarregadoDe = undefined; cacheMsgs.clear(); // as conversas recarregam na próxima vez que forem abertas
    if (aba === 'chat') desenharChatCompleto();
  } catch (e) { console.warn('ressincronizar:', e); }
  ressincronizando = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) escondidoDesde = Date.now();
  else if (escondidoDesde && Date.now() - escondidoDesde > 2e3) ressincronizar();
});
addEventListener('online', () => ressincronizar());
// Redesenha onde houver cartões de autorização (Atividade, folha do pedido, topo).
function redesenharAprovacoes() { agendarInterface(); desenharChat(); if (aba === 'atencao') desenharAtencao(); if (!$('#folhaAprov').hidden) abrirAutorizacoes(); }
function ligarAprovacoes(el) {
  // Questionário (AskUserQuestion): formulário com as respostas no lugar do Autorizar/Recusar (questionario.js).
  const achar = (id) => aprovacoes.find((x) => x.id === id);
  el.oninput = (e) => Q.digitar(e, achar);
  el.onclick = async (e) => {
    if (await Q.clique(e, { achar, toast, enviar: async (a, status, detalhe) => { if (!DEMO) await R.decidir(a.id, status, detalhe); aprovacoes = aprovacoes.filter((x) => x.id !== a.id); redesenharAprovacoes(); } })) return;
    // Uma decisão por cartão (comando-aprovacao.js): guarda aqui e responde à ponte quando o pedido estiver completo.
    const dec = e.target.closest('[data-ap-dec],[data-ap-mudar]');
    if (dec) {
      const card = dec.closest('[data-ap]'), id = Number(card.dataset.ap), i = Number(card.dataset.apI), a = aprovacoes.find((x) => x.id === id); if (!a) return;
      const esc0 = { ...(escolhasAprov.get(id) || {}) };
      if (dec.dataset.apMudar != null) { delete esc0[i]; escolhasAprov.set(id, esc0); return redesenharAprovacoes(); }
      esc0[i] = dec.dataset.apDec; escolhasAprov.set(id, esc0);
      const total = CA.nDecisoes(a), feitas = Object.values(esc0);
      if (feitas.length < total) { redesenharAprovacoes(); if (dec.dataset.apDec) CC.irProximaDecisao(el); return toast({ titulo: dec.dataset.apDec === 'sim' ? 'Anotado: autorizado' : 'Anotado: recusado', texto: `Falta${total - feitas.length > 1 ? 'm' : ''} ${total - feitas.length} decis${total - feitas.length > 1 ? 'ões' : 'ão'} neste pedido: veja a próxima logo abaixo.`, cor: '#f4ecd8' }); }
      const tudoSim = feitas.every((v) => v === 'sim'), tudoNao = feitas.every((v) => v === 'nao');
      try {
        if (!DEMO) await R.decidir(id, tudoSim ? 'permitido' : 'negado');
        aprovacoes = aprovacoes.filter((x) => x.id !== id); escolhasAprov.delete(id);
        if (!tudoSim && !tudoNao || feitas.includes('listar')) await mandarNaConversa(CA.recadoDecisoes(a, esc0), a.conversa_id);
        redesenharAprovacoes();
        toast(tudoSim ? { titulo: 'Autorizado', texto: 'Ela segue o pedido. Você acompanha no cartão do pedido.', cor: '#4fbf82' }
          : tudoNao ? { titulo: 'Recusado', texto: 'Ela não faz isso. Se quiser, diga na conversa o que pode.', cor: '#f0973d' }
          : { titulo: 'Decisões enviadas', texto: 'Ela recebe o que pode e o que não pode fazer, e segue o pedido.', cor: '#4fbf82' });
      } catch (err) { escolhasAprov.set(id, esc0); toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
      return;
    }
    // Várias ações num pedido só: cada uma tem o seu botão; o "Autorizar…" de baixo confirma o que foi marcado.
    const sel = e.target.closest('[data-ap-sel]');
    if (sel) {
      const card = sel.closest('[data-ap]'), a = aprovacoes.find((x) => x.id === Number(card.dataset.ap)); if (!a) return;
      sel.setAttribute('aria-pressed', sel.getAttribute('aria-pressed') !== 'true');
      const marc = [...card.querySelectorAll('[data-ap-sel][aria-pressed=true]')].map((x) => Number(x.dataset.apSel));
      const r = CA.rotuloConfirmar(a, marc), bt = card.querySelector('[data-ap-confirmar]');
      bt.className = r.cls; bt.textContent = r.txt; bt.disabled = !!r.off;
      card.querySelector('.ap-parcial').hidden = !marc.length || marc.length === card.querySelectorAll('[data-ap-sel]').length;
      return;
    }
    const conf = e.target.closest('[data-ap-confirmar]');
    const b = conf || e.target.closest('[data-decide]'); if (!b) return;
    const card = b.closest('[data-ap]'), id = Number(card.dataset.ap), a = aprovacoes.find((x) => x.id === id);
    const marc = conf ? [...card.querySelectorAll('[data-ap-sel][aria-pressed=true]')].map((x) => Number(x.dataset.apSel)) : [];
    const todas = conf && marc.length === card.querySelectorAll('[data-ap-sel]').length;
    const decisao = conf ? (todas ? 'permitido' : 'negado') : b.dataset.decide;
    const parcial = conf && !todas && marc.length > 0;
    const sim = decisao === 'permitido';
    try {
      if (!DEMO) await R.decidir(id, decisao);
      aprovacoes = aprovacoes.filter((x) => x.id !== id);
      if (parcial && a) await mandarNaConversa(CA.recadoParcial(a, marc), a.conversa_id);
      agendarInterface(); desenharChat(); if (aba === 'atencao') desenharAtencao();
      if (!$('#folhaAprov').hidden) abrirAutorizacoes();
      toast(parcial ? { titulo: 'Autorizado só em parte', texto: 'Ela recebe a recusa e, em seguida, o recado com o que pode fazer.', cor: '#4fbf82' }
        : { titulo: sim ? 'Autorizado' : 'Não autorizado', texto: sim ? 'Ela segue o pedido. Você acompanha no cartão do pedido.' : 'Ela não faz essa parte. Se quiser, diga na conversa o que pode.', cor: sim ? '#4fbf82' : '#f0973d' });
    }
    catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  };
}
// Manda um texto numa conversa (mesmo que não seja a aberta). Se ela estiver ocupada, entra na fila.
async function mandarNaConversa(texto, convId) {
  const lista = convId === conversaAtual ? mensagens : cacheMsgs.get(convId);
  lista?.push({ de: 'eu', texto, conversa_id: convId });
  if (DEMO) { comandosAbertos.set(-Date.now(), convId ?? null); return; }
  const cmd = await R.pedir(texto, temSql2 ? convId : null, iaDe(convId));
  pedidoEnviado(cmd, convId);
}
// "Decidir" no cartão do pedido: as autorizações desta conversa numa folha só, com espaço para ler.
function abrirAutorizacoes() {
  const folha = $('#folhaAprov'), lista = aprovacoes.filter((a) => !lerJson(a.detalhe).origem?.terminal && a.conversa_id === conversaAtual);
  if (!lista.length) { folha.hidden = true; return; }
  // Mesma contagem do cartão do pedido: decisões (uma por ação) que ainda faltam neste pedido; questionário = perguntas.
  const soPerguntas = lista.every(Q.ehQuestionario), nDec = lista.reduce((s, a) => s + CA.nDecisoes(a) - Object.keys(escolhasAprov.get(a.id) || {}).length, 0);
  $('#tituloFolhaAprov').textContent = soPerguntas ? 'Sua assistente tem perguntas' : !nDec ? 'Tudo decidido neste pedido' : `${nDec > 1 ? `${nDec} decisões` : 'Uma decisão'} neste pedido`;
  $('#listaFolhaAprov').innerHTML = lista.map(cartaoAprovacao).join('');
  ligarAprovacoes($('#listaFolhaAprov'));
  folha.hidden = false;
  $('#listaFolhaAprov').scrollTop = 0;
}
$('#fecharFolhaAprov').onclick = () => { $('#folhaAprov').hidden = true; };
$('#folhaAprov').addEventListener('click', (e) => { if (e.target.id === 'folhaAprov') $('#folhaAprov').hidden = true; });

// ---------- localizar e detalhe do agente ----------
function localizar(k) {
  const [p, nome] = k.split('|');
  const b = [...mundo.agentes.values()].find((x) => x.m?.k === k) || [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome));
  selecionado = k;
  if (b) cam.alvo = [b.x, b.y - 10];
  abrirAba('agente', true);
}
function abrirAgente(b) { selecionado = b.m?.k || `${b.pessoa}|${b.nome}`; cam.alvo = null; abrirAba('agente', aba !== 'agente'); }
// ---------- "por quê" do sub-agente: quem chamou, motivo, pedido completo e relatório (recolhidos) ----------
const recolhido = (titulo, texto, k) => {
  const t = String(texto || '').trim(); if (!t) return '';
  const previa = primeiraFrase(t, 140);
  return `<details class="pq-rec" data-k="${esc(k)}"><summary><b>${esc(titulo)}</b> <span>${esc(previa)}</span> <em>ver tudo (${t.length} caracteres)</em></summary><div class="pq-txt">${md(t)}</div></details>`;
};
// Conversa (aba do chat) de uma sessão do Claude: dá o nome e a cor de quem chamou.
const conversaDaSessao = (sessao) => sessao ? conversas.find((c) => c.sessao && c.alvo !== 'codex' && String(c.sessao).startsWith(sessao)) : null;
function quemChamouHtml(chamou, sessao, projeto, pessoa) {
  const cv = pessoa === EU.pessoa ? conversaDaSessao(sessao) : null;
  const quem = !chamou || chamou === 'Orquestrador' ? (pessoa === EU.pessoa ? 'A sua assistente' : `A assistente de ${pessoa}`) : tituloDe(chamou);
  const onde = cv ? `na aba <span class="pq-aba" style="--cor:${visualAba(cv).cor}">${esc(visualAba(cv).icone)} ${esc(visualAba(cv).nome || cv.titulo)}</span>` : `no terminal${projeto ? ' · ' + esc(projeto) : ''}${sessao ? ` <small>(sessão ${esc(sessao)})</small>` : ''}`;
  return `<b>${esc(quem)}</b>, ${onde}`;
}
function htmlNota(uso) {
  const n = D.notaFiscal(uso);
  return n ? `<div class="nota-fiscal" title="${esc(n.dica)}">${esc(n.texto)}</div>` : '<div class="nota-fiscal vazia" title="O Claude Code não mandou tempo nem tokens deste trabalho">⏱ 🪙 não medido</div>';
}
// lembra quais "Por quê" estão abertos (a lateral se redesenha sozinha)
const pqAbertos = new Set();
document.addEventListener('toggle', (e) => { const d = e.target; if (d?.dataset?.pqk) { if (d.open) pqAbertos.add(d.dataset.pqk); else pqAbertos.delete(d.dataset.pqk); } }, true);
function htmlPorque(m) {
  const pq = D.porqueDe(m); if (!pq) return '';
  const k = `${m.k}|${pq.inicio?.aid || pq.pedido?.ref || ''}`;
  const pedido = pq.pedido?.prompt || pq.pedido?.descricao || (pq.pedido ? frase(pq.pedido).replace(/^.*? pediu: /, '') : '');
  const rel = pq.fim ? pq.fim.relatorio || pq.fim.texto : '';
  // Recolhido: a lateral mostra primeiro a missão e o que ele faz agora; o contexto abre quando pedem.
  return `<details class="bloco porque" data-pqk="${esc(k)}" ${pqAbertos.has(k) ? 'open' : ''}><summary><h4>💬 Por quê (ver contexto)</h4>${pq.motivo ? `<span class="pq-resumo">${esc(primeiraFrase(pq.motivo, 70))}</span>` : ''}</summary>
    <div class="pq-linha"><span>Quem chamou</span><div>${quemChamouHtml(pq.chamou, pq.sessao, pq.projeto, m.pessoa)}${pq.missao ? ` · <a href="#" class="link-missao" data-abrir-missao="${esc(pq.missao.id)}">missão</a>` : ''}</div></div>
    <div class="pq-linha"><span>Motivo</span><div>${pq.motivo ? esc(pq.motivo) : '<i class="fraco">não declarado na escalação</i>'}</div></div>
    ${pq.pedido?.descricao || pq.inicio?.descricao ? `<div class="pq-linha"><span>Tarefa</span><div>${esc(pq.pedido?.descricao || pq.inicio?.descricao)}</div></div>` : ''}
    ${recolhido('Pedido completo', pedido, k + '|p') || '<div class="pq-linha"><span>Pedido</span><div><i class="fraco">não registrado (pedido antigo, de antes do hook novo)</i></div></div>'}
    ${pq.fim ? `${recolhido(pq.fim.tipo === 'erro' ? 'Erro' : 'Relatório final', rel, k + '|r')}${pq.fim.tipo === 'fim' ? htmlNota(pq.fim.uso) : ''}` : ''}
  </details>`;
}
async function desenharAgente() {
  let [p, nome] = (selecionado || '').split('|');
  const m = (nome === 'aba' ? D.abas().find((a) => a.k === selecionado) : null) || D.mesa(p, nome) || vazioMesa(p, nome);
  if (nome === 'aba') nome = 'Orquestrador';
  const st = D.estadoDe(m), mod = modelo(nome, p), meu = p === EU.pessoa, cg = nome !== 'Orquestrador' && EQ.cargoDe(nome, cargosAgora());
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const linhas = m.hist.filter((e) => e.texto !== 'esperando você').slice(-40).reverse();
  $('#detalheAgente').innerHTML = `
    <div class="det-topo"><img src="${await retratoDe(nome)}" alt=""><div><h3>${esc(tituloAgente(m))}</h3>
      <div class="etqs">${etiquetasDe(m)} <span class="sub">equipe de ${esc(p)}</span></div>
      <div class="estado" style="--cor:${st.cor}"><i>${st.glifo}</i>${st.rot}${m.ult ? ' · ' + D.ha(m.ult.t) : ''}</div></div></div>
    <div class="bloco explica so-pc-ficha" style="--cor:${TIPOS[tipoDe(nome)].cor}"><h4>${TIPOS[tipoDe(nome)].icone} O que é</h4>${esc(cg ? cg.papel : mod.descricao ? descricaoHumana(mod.descricao) : TIPOS[tipoDe(nome)].explica)}${cg ? `<div class="cg-ficha">Skills: ${cg.skills.map((s) => esc(s.nome)).join(', ') || 'nenhuma ainda'}${cg.apelidos.length ? ` · também atende por ${cg.apelidos.map((a) => esc(a.nome)).join(', ')}` : ''}</div>` : ''}</div>
    ${m.ult?._m ? `<div class="bloco"><h4>Missão atual</h4><a href="#" class="link-missao" data-abrir-missao="${esc(m.ult._m.id)}">${chipFrente(m.ult._m.frente)} ${esc(m.ult._m.titulo)}</a></div>` : m.pedido && nome !== 'Orquestrador' ? `<div class="bloco"><h4>Pedido</h4>${esc(frase(m.pedido))}</div>` : ''}
    ${htmlPorque(m)}
    ${m.ult && st.cls !== 'fim' ? `<div class="bloco"><h4>Agora</h4>${esc(frase(m.ult))}</div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : ''}
    <div class="linha"><button class="btn so-pc-ficha" id="irAoAgente">Ir até a mesa</button>${meu ? `<button class="btn forte" id="pedirAgente">${nome === 'Orquestrador' ? 'Conversar' : nome === 'Codex' ? 'Conversar com o Codex' : 'Pedir algo a este agente'}</button>` : ''}</div>
    ${linhas.length ? `<div class="bloco so-pc-ficha"><h4>O que andou fazendo</h4>${fases([...linhas].reverse()).reverse().slice(0, 25).map((f) => `<div class="etapa ${esc(f.tipo)}"><span class="h">${D.hora(f.t)}</span><span>${ICONE_CAT[f.cat] || '•'}</span><span>${esc(f.texto)}</span></div>`).join('')}</div>` : ''}`;
  $$('#detalheAgente [data-abrir-missao]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); abrirMissao(e.currentTarget.dataset.abrirMissao); }));
  $('#irAoAgente').onclick = () => { const b = [...mundo.agentes.values()].find((x) => x.pessoa === p && (x.m?.nome === nome || x.nome === nome)); if (b) teleportar(b.lugar.x + 24, b.lugar.y); };
  $('#pedirAgente')?.addEventListener('click', () => { if (nome === 'Codex') abrirChatCom('codex'); else { abrirChatCom('claude'); if (nome !== 'Orquestrador') { $('#entrada').value = `Use o sub-agente ${cg && nome === cg.id ? cg.apelidos.find((a) => a.nome !== 'Codex')?.nome || 'general-purpose' : nome} para: `; $('#entrada').focus(); } } });
  $$('#detalheAgente [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
}

// ---------- missões (agrupadas por frente) ----------
const ICONE_CAT = { ler: '📖', escrever: '✏️', cmd: '▶️', web: '🌐', chamar: '🤖', skill: '📘', mcp: '🔌', organizar: '🗒️', alerta: '⚠️', erro: '❌', entrega: '✅', outro: '•' };
let filtroMissoes = 'todos';
const frentesFechadas = new Set(lerJson(guardado('frentesFechadas', '[]')) || []);
function missoesFiltradas() {
  const busca = ($('#buscaMissoes')?.value || '').trim().toLowerCase();
  return D.missoes().filter((m) => {
    if (!passa(m.frente)) return false;
    if (filtroMissoes === 'abertas') { if (m.fim) return false; }
    else if (filtroMissoes !== 'todos' && m.pessoa !== filtroMissoes) return false;
    if (!busca) return true;
    return [m.pedido, m.resposta, m.projeto, m.frente.nome, ...m.agentes, ...m.skills, ...m.conectores, ...m.nomes, ...m.passos.map((e) => frase(e))].join(' ').toLowerCase().includes(busca);
  });
}
// "começou há 3 min" (aberto) ou "terminou há 15 min · levou 6 min" (fechado): o que cada tempo mede.
const haTxt = (t) => { const h = D.ha(t); return h === 'agora' ? 'agora' : /\d\/\d/.test(h) ? 'em ' + h : 'há ' + h; };
const quemPasso = (e) => (!e?.agente || e.agente === 'Orquestrador' ? 'Assistente' : tituloDe(e.agente));
function quandoMissao(m) { return m.fim ? `terminou ${haTxt(m.fim)} · levou ${D.duracao(m.duracao)}` : `começou ${haTxt(m.inicio)}`; }
async function cartaoMissao(m) {
  const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
  const rostos = await Promise.all([...m.agentes].slice(0, 6).map(async (a) => `<img src="${await retratoDe(a)}" title="${esc(TIPOS[tipoDe(a)].icone + ' ' + tituloDe(a))}" alt="">`));
  const linhas = resumo(m.passos).slice(0, 3);
  return `<div class="missao" data-mi="${esc(m.id)}" style="--cor:${st.cor}">
    <div class="cab"><span class="dono" style="--cor:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT</span>' : ''}${seloEstado(m.status)}<span class="espaco"></span><span>${quandoMissao(m)}</span></div>
    <div class="ped">${esc(m.titulo)}</div>
    ${!m.fim && m.passos.length ? `<div class="mi-agora"><b>${esc(quemPasso(m.passos.at(-1)))}</b> ${esc(primeiraFrase(frase(m.passos.at(-1)), 90).replace(/^./, (c) => c.toLowerCase()))}</div>` : linhas.length ? `<div class="resumo-linhas">${linhas.map((l) => `<div>${icoDeEmoji(l.icone)} ${esc(l.texto)}</div>`).join('')}</div>` : ''}
    ${m.resposta ? `<div class="res">↳ ${esc(primeiraFrase(m.resposta, 180))}</div>` : ''}
    ${rostos.length || m.skills.length || m.conectores.length || m.miniaturas.length ? `<div class="rostos">${rostos.join('')}${m.skills.slice(0, 2).map((s) => `<span class="tipo mini" style="--cor:${TIPOS.skill.cor}">📘 ${esc(s)}</span>`).join('')}${m.conectores.slice(0, 2).map((c) => `<span class="tipo mini" style="--cor:${TIPOS.conector.cor}">🔌 ${esc(c)}</span>`).join('')}${m.miniaturas.length ? `<span>▣ ${m.miniaturas.length}</span>` : ''}</div>` : ''}
  </div>`;
}
async function desenharMissoes() {
  filtros($('#filtroMissoes'), filtroMissoes, [['todos', 'Todas'], ...pessoas().map((p) => [p, p]), ['abertas', 'Em andamento']], (f) => { filtroMissoes = f; desenharMissoes(); });
  const lista = missoesFiltradas();
  const fr = temFiltro();
  if (!lista.length) { $('#listaMissoes').innerHTML = avisoFiltro() + '<div class="vazio">Nenhum pedido aqui ainda. Cada pedido que você manda (por aqui ou no PC) aparece nesta lista, separado por projeto.</div>'; return; }
  // Um bloco por frente; a frente com atividade mais recente vem primeiro.
  const grupos = new Map();
  for (const m of lista) { if (!grupos.has(m.frente.id)) grupos.set(m.frente.id, { f: m.frente, ms: [] }); grupos.get(m.frente.id).ms.push(m); }
  let html = avisoFiltro();
  for (const { f, ms } of grupos.values()) {
    const ativas = ms.filter((m) => !m.fim && m.status !== 'espera').length, fechado = !fr && frentesFechadas.has(f.id);
    html += `<div class="bloco-frente" style="--cor:${f.cor}"><button class="cab-frente" data-dobrar="${esc(f.id)}"><span class="ic">${icoDeEmoji(f.icone)}</span><b>${esc(f.nome)}</b><span class="cont">${plural(ms.length, 'pedido')}${ativas ? ` · <i>${ativas} em andamento</i>` : ''}</span><span class="espaco"></span>${fechado ? '▸' : '▾'}</button>`;
    if (!fechado) html += (await Promise.all(ms.slice(0, fr ? 60 : 6).map((m) => cartaoMissao(m)))).join('') + (!fr && ms.length > 6 ? `<button class="btn ver-mais" data-so-frente="${esc(f.id)}">Ver os ${ms.length} pedidos de ${esc(f.nome)}</button>` : '');
    html += '</div>';
  }
  $('#listaMissoes').innerHTML = html;
  $('#listaMissoes').onclick = (e) => {
    if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro();
    const dob = e.target.closest('[data-dobrar]');
    if (dob) { const id = dob.dataset.dobrar; if (frentesFechadas.has(id)) frentesFechadas.delete(id); else frentesFechadas.add(id); guarda('frentesFechadas', JSON.stringify([...frentesFechadas])); desenharMissoes(); return; }
    const so = e.target.closest('[data-so-frente]');
    if (so) { const f = frentePorId(so.dataset.soFrente); mudarFiltro(f.jogo, f.setor); return; }
    const d = e.target.closest('[data-mi]'); if (d) PP.abrir({ missao: d.dataset.mi });
  };
}
function abrirMissao(id) { missaoAberta = id; abrirAba('missao', true); }
// Uma tarefa, três visões: Escritório (o resumo de sempre), Linha do tempo (passos em ordem) e Árvore (quem chamou quem).
let vistaMissao = guardado('vistaMissao', 'escritorio');
const VISTAS_MISSAO = [['escritorio', 'Resumo'], ['linha', 'Linha do tempo'], ['arvore', 'Quem ajudou']];
const corAgente = (nome) => nome === 'Orquestrador' ? TIPOS.assistente.cor : fichaDe(nome)?.cor || TIPOS[tipoDe(nome)].cor;
const nomeAgente = (nome) => nome === 'Orquestrador' ? 'Assistente' : tituloDe(nome);
const ROT_TIPO_PASSO = { inicio: 'começou', pedido: 'pedido', fim: 'entregou', erro: 'erro', alerta: 'pediu permissão', escalacao: 'escalação', atividade: 'passo', espera: 'parou' };
const rotuloFerramenta = (e) => e.ferramenta === 'Skill' && e.alvo ? `Skill › ${String(e.alvo).split(':').pop()}` : String(e.ferramenta || '').startsWith('mcp__') ? `🔌 ${nomeConector(String(e.ferramenta).split('__')[1])} › ${String(e.ferramenta).split('__').pop()}` : e.ferramenta || ROT_TIPO_PASSO[e.tipo] || e.tipo || 'passo';
async function htmlLinhaTempo(m) {
  const fimT = m.fim || (m.status === 'trab' ? Date.now() : m.ultimo);
  const todos = [{ t: m.inicio, agente: 'Orquestrador', tipo: 'inicio', _pedido: true }, ...m.passos];
  const itens = todos.map((e, i) => ({ e, dur: Math.max(0, (todos[i + 1]?.t ?? fimT) - e.t) }));
  const maior = itens.reduce((a, b) => (b.dur > a.dur ? b : a), itens[0]);
  const LIMITE = 150, mostrar = itens.length > LIMITE ? [itens[0], ...itens.slice(-LIMITE + 1)] : itens;
  const linhas = await Promise.all(mostrar.map(async (x) => {
    const ag = x.e.agente || 'Orquestrador', lento = x === maior && maior.dur >= 1000 && itens.length > 1;
    const txt = x.e._pedido ? `Pedido: ${primeiraFrase(m.pedido, 110)}` : primeiraFrase(frase(x.e) || ROT_TIPO_PASSO[x.e.tipo] || '', 120);
    return `<li class="lt-passo ${lento ? 'lento' : ''} t-${esc(x.e.tipo || '')}" style="--cor:${corAgente(ag)}">
      <span class="lt-h">${D.hora(x.e.t)}</span><img src="${await retratoDe(ag)}" alt="">
      <div class="lt-txt"><div><b>${esc(nomeAgente(ag))}</b> <span class="lt-ferr">${iconePasso(x.e.ferramenta, x.e.modo)} ${esc(rotuloFerramenta(x.e))}</span></div><small>${esc(txt)}</small>${lento ? '<em class="lt-selo">⏳ passo mais demorado</em>' : ''}</div>
      <span class="lt-dur" title="Tempo até o próximo passo">${D.duracao(x.dur)}</span></li>`;
  }));
  const fim = m.fim ? `<li class="lt-passo t-resposta" style="--cor:${D.ESTADOS[m.status]?.cor || '#4fbf82'}"><span class="lt-h">${D.hora(m.fim)}</span><span class="lt-ic">✓</span><div class="lt-txt"><div><b>Resposta</b></div><small>${esc(primeiraFrase(m.resposta || 'terminou', 140))}</small></div><span class="lt-dur"></span></li>` : '';
  return `<p class="lt-resumo">${todos.length} passos em ${D.duracao(m.duracao)}${maior.dur >= 1000 && itens.length > 1 ? ` · o mais demorado foi de <b>${esc(nomeAgente(maior.e.agente || 'Orquestrador'))}</b> (${D.duracao(maior.dur)})` : ''}${itens.length > mostrar.length ? ` · mostrando o começo e os últimos ${LIMITE - 1}` : ''}</p>
    <ol class="linha-tempo">${linhas.join('')}${fim}</ol>`;
}
async function htmlArvore(m) {
  const itensEsc = m.alvo === 'codex' ? [] : D.escalacao(m);
  // Cada ajudante: passos, ferramentas usadas (com quantas vezes) e a nota de uso da entrega.
  const nos = new Map();
  const no = (nome) => { if (!nos.has(nome)) nos.set(nome, { nome, passos: 0, ferr: new Map(), uso: null, ult: null }); return nos.get(nome); };
  no(m.alvo === 'codex' ? 'Codex' : 'Orquestrador');
  for (const e of m.passos) {
    const x = no(e.agente || 'Orquestrador'); x.passos++; x.ult = e;
    if (e.ferramenta) { const k = rotuloFerramenta(e); x.ferr.set(k, (x.ferr.get(k) || 0) + 1); }
    if (e.tipo === 'fim' && e.uso) x.uso = e.uso;
  }
  for (const x of itensEsc) if ((x.tipo === 'agente' || x.tipo === 'programa') && ![...nos.keys()].some((n) => n.toLowerCase() === String(x.nome).toLowerCase())) no(x.nome);
  const EST_DA_MISSAO = { fim: 'pronto', erro: 'erro', semsinal: 'semsinal', trab: 'trabalhando', alerta: 'trabalhando' };
  const estadoNo = (nome, raiz) => raiz ? EST_DA_MISSAO[m.status] || 'pronto' : itensEsc.find((x) => String(x.nome).toLowerCase() === nome.toLowerCase())?.estado || 'pronto';
  const folhas = (x) => x.ferr.size ? `<ul class="arv-ferr">${[...x.ferr].sort((a, b) => b[1] - a[1]).map(([f, n]) => `<li>${esc(f)}${n > 1 ? ` <small>×${n}</small>` : ''}</li>`).join('')}</ul>` : '<ul class="arv-ferr"><li class="fraco">nenhuma ferramenta registrada</li></ul>';
  const cab = async (x, raiz) => {
    const est = estadoNo(x.nome, raiz), [g, r] = ROT_EST[est] || ROT_EST.pronto;
    const nota = raiz ? `⏱ ${D.duracao(m.duracao)} no total` : (D.notaFiscal(x.uso)?.texto || (est === 'planejado' ? 'ainda não começou' : '⏱ 🪙 não medido'));
    return `<summary style="--cor:${corAgente(x.nome)}"><img src="${await retratoDe(x.nome)}" alt=""><span class="arv-nome"><b>${esc(nomeAgente(x.nome))}</b><small>${plural(x.passos, 'passo')} · ${esc(nota)}</small></span><i class="arv-est est-${est}">${g} ${r}</i></summary>`;
  };
  const [raiz, ...filhos] = [...nos.values()];
  const filhosHtml = await Promise.all(filhos.map(async (x) => `<li><details class="arv-no" open>${await cab(x, false)}${folhas(x)}</details></li>`));
  const skills = itensEsc.filter((x) => x.tipo === 'skill' || x.tipo === 'conector');
  return `<p class="lt-resumo">Toque num nome para recolher ou abrir. A nota de uso (tempo e tokens) vem da entrega de cada ajudante (sub-agente ${glo('sub-agente')}).</p>
    <details class="arv-no raiz" open>${await cab(raiz, true)}${folhas(raiz)}
      ${filhosHtml.length ? `<ul class="arv-filhos">${filhosHtml.join('')}</ul>` : '<p class="fraco arv-vazio">Fez tudo sozinha, sem chamar ajudantes.</p>'}
      ${skills.length ? `<div class="arv-skills">${skills.map((x) => `<span class="tipo" style="--cor:${TIPOS[x.tipo].cor}">${TIPOS[x.tipo].icone} ${esc(nomeBonito(x.tipo, x.nome))}</span>`).join('')} ${glo('skill')}</div>` : ''}
    </details>`;
}
async function desenharMissao() {
  const m = D.missoes().find((x) => x.id === missaoAberta);
  if (!m) { $('#detalheMissao').innerHTML = '<div class="vazio">Pedido não encontrado (talvez seja antigo demais: carregue mais dias no Histórico).</div>'; return; }
  const st = D.ESTADOS[m.status] || D.ESTADOS.espera;
  const cabecalho = `
    <div class="etqs">${chipFrente(m.frente)}<span class="dono" style="--cor:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${m.alvo === 'codex' ? '<span class="modelo gpt">GPT · Codex</span>' : ''}<span class="sub">${esc(nomeProjeto(m.projeto || ''))}${m.origem ? ` · pelo ${m.origem === 'vscode' ? 'VS Code' : 'site'}` : ''}</span></div>
    <h3 class="titulo-missao">${esc(m.titulo)}</h3>
    <div class="estado" style="--cor:${st.cor}" data-r4="1" title="Começou ${new Date(m.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}">${seloEstado(m.status)} ${quandoMissao(m)}</div>
    <div class="seg-conversas vistas-missao" role="tablist" aria-label="Como ver a missão">${VISTAS_MISSAO.map(([v, t]) => `<button type="button" role="tab" data-vista-missao="${v}" class="${v === vistaMissao ? 'on' : ''}" aria-selected="${v === vistaMissao}">${t}</button>`).join('')}</div>`;
  const ligarVistas = () => { $('#detalheMissao .vistas-missao').onclick = (e) => { const b = e.target.closest('[data-vista-missao]'); if (!b) return; vistaMissao = b.dataset.vistaMissao; guarda('vistaMissao', vistaMissao); desenharMissao(); }; };
  if (vistaMissao !== 'escritorio') {
    $('#detalheMissao').innerHTML = cabecalho + (vistaMissao === 'linha' ? await htmlLinhaTempo(m) : await htmlArvore(m));
    ligarVistas(); return;
  }
  const urls = await R.urlsMiniaturas(m.miniaturas.map((x) => x.caminho)).catch(() => []);
  const fs = fases(m.passos);
  const linhasFases = await Promise.all(fs.map(async (f) => `<div class="etapa ${esc(f.tipo)}"><span class="h">${D.hora(f.t)}</span><img src="${await retratoDe(f.agente)}" title="${esc(tituloDe(f.agente))}" alt=""><span><b>${esc(f.agente === 'Orquestrador' ? 'Assistente' : tituloDe(f.agente))}</b> <span class="sub2">${ICONE_CAT[f.cat] || ''} ${esc(f.texto)}</span></span></div>`));
  const quem = await Promise.all([...m.agentes].map(async (a) => `<div class="quem-linha"><img src="${await retratoDe(a)}" alt=""><b>${esc(tituloDe(a))}</b>${etiquetaTipo(tipoDe(a))}</div>`));
  const res = resumo(m.passos);
  const escalacaoHtml = m.alvo === 'codex' ? '' : await htmlEscalacao(m);
  $('#detalheMissao').innerHTML = cabecalho + `
    ${!m.fim && m.passos.length ? `<div class="bloco agora-missao"><h4>Agora</h4><p>${esc(quemPasso(m.passos.at(-1)))}: ${esc(frase(m.passos.at(-1)))}</p></div>` : ''}
    ${m.resposta ? `<div class="bloco destaque"><h4>${icoPx('check')} Resultado</h4><div class="msg assistente" style="box-shadow:none;background:none;padding:0;max-width:100%">${md(m.resposta)}</div></div>` : ''}
    ${res.length && m.fim ? `<div class="bloco"><h4>Em resumo</h4><div class="resumo-linhas grande">${res.map((l) => `<div>${icoDeEmoji(l.icone)} ${esc(l.texto)}</div>`).join('')}</div></div>` : ''}
    ${escalacaoHtml}
    ${temQuadro ? (() => { const mc = marcoDaMissao(m); const op = marcos.filter((x) => x.coluna !== 'feito' || x === mc); return `<div class="linha-marco"><span class="lm-rot">Marco</span> <select id="marcoDaMissao"><option value="">${mc ? '' : 'sem marco'}</option>${op.map((x) => `<option value="${x.id}" ${x === mc ? 'selected' : ''}>${jogoPorId(x.jogo).icone} ${esc(x.titulo)}</option>`).join('')}<option value="nenhum">não é de marco nenhum</option></select>${mc ? `<a href="#" id="verMarco">ver marco ›</a><span class="sub">${comoPendurou(m)}</span>` : ''}</div>`; })() : ''}
    ${quem.length || m.skills.length || m.conectores.length ? `<div class="bloco"><h4>Quem e o quê ajudou</h4>${quem.join('')}
      ${m.skills.map((s) => `<div class="quem-linha"><span class="ic-grande">📘</span><b>${esc(s)}</b>${etiquetaTipo('skill')}</div>`).join('')}
      ${m.conectores.map((c) => `<div class="quem-linha"><span class="ic-grande">🔌</span><b>${esc(c)}</b>${etiquetaTipo('conector')}</div>`).join('')}</div>` : ''}
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${m.miniaturas.map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : m.nomes.length ? `<div class="bloco"><h4>Arquivos citados</h4>${m.nomes.map(esc).join(' · ')}</div>` : ''}
    <div class="bloco"><h4>Pedido completo</h4>${esc(m.pedido)}</div>
    <div class="linha"><button class="btn" id="compartilharMissao">✉ Mandar para a dupla</button>${m.pessoa === EU.pessoa && m.alvo === 'claude' ? '<button class="btn" id="continuarMissao">✦ Continuar com a assistente</button>' : ''}</div>
    <details class="bloco tecnico"><summary>Passo a passo (${fs.length} fases, ${m.passos.length} passos)</summary>${linhasFases.join('') || '<div class="sub" style="text-align:left">Sem passos registrados.</div>'}</details>`;
  $$('#detalheMissao [data-mini]').forEach((el) => { el.onclick = () => abrirMidia(m.miniaturas[Number(el.dataset.mini)], urls[Number(el.dataset.mini)], m.pessoa); });
  $('#compartilharMissao').onclick = () => compartilharMissao(m);
  ligarVistas();
  $('#verMarco')?.addEventListener('click', (e) => { e.preventDefault(); abrirMarco(marcoDaMissao(m).id); });
  $('#marcoDaMissao')?.addEventListener('change', async (e) => {
    const v = e.target.value, id = v === 'nenhum' ? null : Number(v) || null;
    try { if (DEMO) { vinculos.set(m.id, id); mudouMarcos(); desenharMissao(); } else if (!v) await R.desvincular(m.id); else await R.vincular(m.id, id); }
    catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#continuarMissao')?.addEventListener('click', () => { abrirChatCom('claude'); setTimeout(() => { $('#entrada').value = `Sobre "${m.titulo}": `; $('#entrada').focus(); }, 50); });
}

// ---------- histórico: por dia e por frente ----------
let periodoHist = guardado('periodoHist', '7'), pessoaHist = 'todos', carregandoMais = false;
async function desenharHistorico() {
  const el = $('#filtroHistorico');
  el.innerHTML = [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['0', 'Tudo']].map(([v, t]) => `<button data-p="${v}" class="${v === periodoHist ? 'on' : ''}">${t}</button>`).join('') + '<span class="sep-f"></span>' + [['todos', 'Os dois'], ...pessoas().map((p) => [p, p])].map(([v, t]) => `<button data-pe="${esc(v)}" class="${v === pessoaHist ? 'on' : ''}">${esc(t)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.p) { periodoHist = b.dataset.p; guarda('periodoHist', periodoHist); } if (b.dataset.pe) pessoaHist = b.dataset.pe; desenharHistorico(); };
  const desde = periodoHist === '0' ? 0 : periodoHist === '1' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(periodoHist) * 86400e3;
  const lista = D.missoes().filter((m) => m.inicio >= desde && (pessoaHist === 'todos' || m.pessoa === pessoaHist) && passa(m.frente));
  const placar = new Map();
  for (const m of lista) { const p = placar.get(m.frente.id) || { f: m.frente, n: 0, ms: 0 }; p.n++; p.ms += m.duracao; placar.set(m.frente.id, p); }
  let html = avisoFiltro();
  html += `<div class="placar">${[...placar.values()].sort((a, b) => b.n - a.n).map((p) => `<button class="placar-item" data-frente-h="${esc(p.f.id)}" style="--cor:${p.f.cor}"><span>${icoDeEmoji(p.f.icone)}</span><b>${p.n}</b><small><strong>${p.n === 1 ? 'pedido' : 'pedidos'}</strong> · ${esc(p.f.nome)}<br>${D.duracao(p.ms)} de trabalho</small></button>`).join('') || '<div class="vazio">Nada neste período.</div>'}</div>`;
  const dias = new Map();
  for (const m of lista) { const d = new Date(m.inicio).toDateString(); if (!dias.has(d)) dias.set(d, []); dias.get(d).push(m); }
  const hojeS = new Date().toDateString(), ontem = new Date(Date.now() - 86400e3).toDateString();
  for (const [d, ms] of dias) {
    const nomeDia = d === hojeS ? 'Hoje' : d === ontem ? 'Ontem' : new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    const entregas = ms.reduce((s, m) => s + m.miniaturas.length, 0), erros = ms.filter((m) => m.status === 'erro').length;
    html += `<div class="dia"><div class="cab-dia"><b>${esc(nomeDia)}</b><span>${plural(ms.length, 'pedido')}${entregas ? ` · ${plural(entregas, 'resultado')}` : ''}${erros ? ` · ${erros} com erro` : ''}</span></div>`;
    const porFrente = new Map(); for (const m of ms) { if (!porFrente.has(m.frente.id)) porFrente.set(m.frente.id, []); porFrente.get(m.frente.id).push(m); }
    for (const [, mf] of porFrente) {
      const f = mf[0].frente;
      html += `<div class="hist-frente" style="--cor:${f.cor}"><div class="hf-nome">${icoDeEmoji(f.icone)} ${esc(f.nome)}</div>${mf.map((m) => { const st = D.ESTADOS[m.status] || D.ESTADOS.espera; return `<button class="hist-item" data-mi="${esc(m.id)}"><span class="h">${D.hora(m.inicio)}</span><span class="g" style="--cor:${st.cor}">${st.glifo}</span><span class="tx"><b style="color:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</b> ${esc(m.titulo)}${m.resposta ? `<small>↳ ${esc(primeiraFrase(m.resposta, 110))}</small>` : ''}</span></button>`; }).join('')}</div>`;
    }
    html += '</div>';
  }
  if (!DEMO) html += `<div class="linha" style="justify-content:center"><button class="btn" id="maisAntigo">${carregandoMais ? 'Carregando…' : 'Carregar dias mais antigos'}</button></div>`;
  $('#listaHistorico').innerHTML = html;
  $('#listaHistorico').onclick = async (e) => {
    if (e.target.closest('[data-tirar-filtro]')) return tirarFiltro();
    const pf = e.target.closest('[data-frente-h]');
    if (pf) { const f = frentePorId(pf.dataset.frenteH); if (filtroJogo === f.jogo && filtroSetor === f.setor) mudarFiltro('', ''); else mudarFiltro(f.jogo, f.setor); return; }
    const d = e.target.closest('[data-mi]'); if (d) { abrirMissao(d.dataset.mi); return; }
    if (e.target.id === 'maisAntigo' && !carregandoMais) {
      carregandoMais = true; desenharHistorico();
      try {
        const n = await R.eventosAntes(D.eventos[0]?.t || Date.now());
        D.adicionar(n.map(D.deLinha));
        if (!n.length) toast({ titulo: 'Não há nada mais antigo', cor: '#9a90a8' }); else { periodoHist = '0'; guarda('periodoHist', '0'); }
      } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
      carregandoMais = false; desenharHistorico();
    }
  };
}

// ---------- HUD em cima do mapa: filtros (jogo/setor) + faixa "Agora" (quem está trabalhando) ----------
function quemTrabalha() {
  const out = [];
  for (const a of todosAgentes()) {
    let cls = a.st.cls;
    if (a.m.nome === 'Orquestrador' && a.m.pessoa === EU.pessoa && algumaOcupada()) cls = 'trab';
    if (!TRABALHANDO.includes(cls)) continue;
    const fr = D.frenteDaMesa(a.m);
    if (temFiltro() && !passa(fr)) continue;
    out.push({ ...a, cls, fr });
  }
  return out.sort((a, b) => (b.cls === 'alerta') - (a.cls === 'alerta') || (b.m.ult?.t || 0) - (a.m.ult?.t || 0));
}
function htmlFiltros() {
  const jogos = todosJogos().filter((j) => j.id !== 'estudio' || D.missoes().some((m) => m.frente.jogo === 'estudio'));
  const chip = (tipo, id, icone, nome, cor, on) => `<button class="fh ${on ? 'on' : ''}" data-f${tipo}="${esc(id)}" style="--cor:${cor}"><span class="ic">${icone}</span><span class="nm">${esc(nome)}</span></button>`;
  return `<div class="filtros-hud">${chip('j', '', '◎', 'Tudo', '#9a90a8', !temFiltro())}${jogos.map((j) => chip('j', j.id, j.icone, j.curto || j.nome, j.cor, filtroJogo === j.id)).join('')}<span class="sep-h"></span>${SETORES.map((x) => chip('s', x.id, x.icone, x.nome, x.cor, filtroSetor === x.id)).join('')}</div>`;
}
function cliqueFiltro(e) {
  const j = e.target.closest('[data-fj]'), s = e.target.closest('[data-fs]');
  if (j) { mudarFiltro(j.dataset.fj === filtroJogo ? '' : j.dataset.fj, j.dataset.fj === '' ? '' : filtroSetor); return true; }
  if (s) { mudarFiltro(filtroJogo, s.dataset.fs === filtroSetor ? '' : s.dataset.fs); return true; }
  return false;
}
let agoraAberto = false; // lista do contador aberta por cima do mapa
async function desenharHud() {
  if (!EU) return;
  const ativos = quemTrabalha();
  const cartoes = await Promise.all(ativos.slice(0, 12).map(async ({ m, cls, fr }) => {
    const acao = D.emSegundoPlano(m) ? 'Rodando uma tarefa em segundo plano' : cls === 'semsinal' ? 'sem sinal há um tempo' : m.ult ? primeiraFrase(frase(m.ult), 70) : 'pensando…';
    const marco = marcoDaMissao(m.ult?._m);
    const desde = m.pedido?.t || m.ult?.t;
    const icone = cls === 'alerta' ? '⚠️' : cls === 'erro' ? '❌' : ICONE_CAT[categoria(m.ult || {})] || '⚙️';
    const quanto = desde ? D.ha(desde) : '';
    const titulo = `${tituloAgente(m)} (${m.pessoa})${fr ? ' · ' + fr.nome : ''}${marco ? ' · 🏁 ' + marco.titulo : ''}: ${acao}`;
    return `<button class="agora-card ${cls}" data-k="${esc(m.k)}" style="--cor:${fr?.cor || '#9a90a8'};--pessoa:${corPessoa(m.pessoa)}" title="${esc(titulo)}">
      <img src="${await retratoDe(m.nome)}" alt="">
      <span class="ac-linha"><b>${esc(CURTO[m.nome] || tituloAgente(m))}</b> ${icone} ${esc(primeiraFrase(acao, 34))}${quanto ? ` <i>· ${quanto === 'agora' ? 'agora' : 'há ' + quanto}</i>` : ''}</span></button>`;
  }));
  // Faixa de cima = um contador ("11 trabalhando · 1 precisa de você"); tocar abre a lista por cima do mapa.
  const alertas = ativos.filter((a) => a.cls === 'alerta').length;
  const cont = `<button type="button" class="agora-tit" aria-expanded="${agoraAberto}" title="${agoraAberto ? 'Fechar a lista' : 'Ver quem está trabalhando em quê'}"><span class="ag-n">${ativos.length || 'ninguém'}</span> ${ativos.length ? (ativos.length > 1 ? 'IAs trabalhando no estúdio' : 'IA trabalhando no estúdio') : 'trabalhando agora'}<span class="ag-seta" aria-hidden="true">${agoraAberto ? '▴' : '▾'}</span></button>`;
  $('#frentes').innerHTML = htmlFiltros() + `<div class="agora contador ${agoraAberto ? 'aberto' : ''}">${cont}${agoraAberto ? `<div class="agora-lista">${cartoes.join('')}${ativos.length > 12 ? `<span class="agora-mais">+${ativos.length - 12} na Equipe</span>` : ''}</div>` : ''}</div>`;
}
function ligarHud() {
  $('#frentes').onclick = (e) => { if (cliqueFiltro(e)) return; if (e.target.closest('.agora-tit')) { agoraAberto = !agoraAberto; desenharHud(); return; } const c = e.target.closest('.agora-card'); if (c) { agoraAberto = false; desenharHud(); localizar(c.dataset.k); } };
}

// ======================= QUADRO DE MARCOS (kanban que substitui o Notion) =======================
// Cartão = um grande marco (ex.: "Trailer de lançamento", "Loja de classes").
// Os pedidos do dia a dia (missões) se penduram sozinhos no marco certo; dá para corrigir na mão.
const COLUNAS = [
  { id: 'ideias', nome: 'Ideias', icone: '💡' },
  { id: 'afazer', nome: 'A fazer', icone: '📋' },
  { id: 'fazendo', nome: 'Fazendo', icone: '⚙️' },
  { id: 'revisar', nome: 'Revisar', icone: '👀' },
  { id: 'feito', nome: 'Feito', icone: '✅' },
];
let marcos = [], vinculos = new Map(), comentarios = [], temQuadro = false, versaoMarcos = 0, marcoAberto = null, agruparPor = guardado('agrupar', ''), pessoaQuadro = null;
const mudouMarcos = () => { versaoMarcos++; cacheVinculo.v = -1; };

// ---------- pendurar pedidos nos marcos ----------
const PARADAS = new Set('para como isso esse essa este esta mais fazer quero agora deixa coloca colocar pode voce você tudo todo toda cada depois antes entao então melhor melhora melhorar ainda tambem também porque sobre dele dela pelo pela pelos pelas numa num uma umas uns dos das nos nas com sem que qual quais quando onde aqui jogo genesis cook'.split(' '));
const palavrasDe = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PARADAS.has(w)).map((w) => w.replace(/(oes|aes|s)$/, '')));
let cacheVinculo = { v: -1, mapa: new Map() };
function marcoDaMissao(m) {
  if (!m || !temQuadro) return null;
  const chave = `${D.versaoAtual()}|${versaoMarcos}`;
  if (cacheVinculo.v !== chave) cacheVinculo = { v: chave, mapa: new Map() };
  if (cacheVinculo.mapa.has(m.id)) return cacheVinculo.mapa.get(m.id);
  let achado = null;
  if (vinculos.has(m.id)) achado = marcos.find((x) => x.id === vinculos.get(m.id)) || null;           // na mão (null = nenhum)
  else {
    const cv = conversas.find((c) => c.marco_id && c.sessao && m.sessao && String(c.sessao).startsWith(m.sessao));
    if (cv) achado = marcos.find((x) => x.id === cv.marco_id) || null;                                 // conversa aberta pelo cartão
    else {                                                                                               // automático: palavras em comum
      const pm = palavrasDe(m.pedido), recente = Date.now() - 3 * 86400e3;
      // Só marcos que já existiam quando o pedido rodou (criar um cartão novo não reescreve o passado)
      // e que não estavam encerrados antes dele começar.
      const notas = marcos.filter((x) => x.coluna !== 'ideias' && x.jogo === m.frente.jogo
          && new Date(x.criado || 0).getTime() <= m.inicio + 60e3
          && (x.coluna !== 'feito' || (new Date(x.concluido || x.atualizado).getTime() > Math.max(recente, m.inicio))))
        .map((x) => {
          let n = x.setor === m.frente.setor ? 1 : 0;
          const chaves = palavrasDe(x.palavras), titulo = palavrasDe(`${x.titulo} ${x.descricao} ${(x.etapas || []).map((e) => e.t).join(' ')}`);
          for (const w of pm) { if (chaves.has(w)) n += 3; else if (titulo.has(w)) n += 1.5; }
          if (x.coluna === 'fazendo') n += 0.5;
          return { x, n };
        }).sort((a, b) => b.n - a.n);
      if (notas[0] && notas[0].n >= 3 && (!notas[1] || notas[0].n - notas[1].n >= 1)) achado = notas[0].x;
    }
  }
  cacheVinculo.mapa.set(m.id, achado);
  return achado;
}
const comoPendurou = (m) => vinculos.has(m.id) ? 'na mão' : conversas.some((c) => c.marco_id && c.sessao && String(c.sessao).startsWith(m.sessao)) ? 'pela conversa do cartão' : 'automático';
function resumoMarco(mc) {
  const ms = D.missoes().filter((m) => marcoDaMissao(m)?.id === mc.id);
  const hoje = new Date().setHours(0, 0, 0, 0);
  const agentes = quemTrabalhaTodos().filter((a) => a.m.ult?._m && marcoDaMissao(a.m.ult._m)?.id === mc.id);
  return { ms, hoje: ms.filter((m) => m.inicio >= hoje).length, agentes, alertas: ms.filter((m) => m.status === 'alerta').length, ult: ms[0]?.ultimo, minis: ms.flatMap((m) => m.miniaturas.map((mi) => ({ ...mi, pessoa: m.pessoa }))) };
}
function quemTrabalhaTodos() { return todosAgentes().filter((a) => TRABALHANDO.includes(a.st.cls)); }

// ---------- tela do quadro ----------
function abrirQuadro() {
  $('#equipeVista').hidden = true;
  $('#quadro').hidden = false; guarda('quadro', '1'); marcarNav();
  desenharQuadro();
}
function fecharQuadro() {
  $('#quadro').hidden = true; guarda('quadro', ''); marcarNav();
}
const passaMarco = (mc) => (!filtroJogo || mc.jogo === filtroJogo) && (!filtroSetor || mc.setor === filtroSetor) && (!pessoaQuadro || mc.responsavel === pessoaQuadro);
async function cartaoMarco(mc) {
  const r = resumoMarco(mc), j = jogoPorId(mc.jogo), s = setorPorId(mc.setor);
  const et = mc.etapas || [], feitas = et.filter((e) => e.feito).length;
  const atrasado = mc.prazo && mc.coluna !== 'feito' && new Date(mc.prazo + 'T23:59') < new Date();
  // Cartão enxuto: o que o dono decide — responsável, prazo e próximo passo (jogo/setor ficam na cor da borda e no detalhe).
  const prox = et.find((e) => !e.feito);
  const passo = mc.coluna === 'feito' ? '<div class="ct-prox ok">Concluído</div>'
    : prox ? `<div class="ct-prox"><b>Próximo: ${esc(primeiraFrase(prox.t, 70))}</b>${et.length > 1 ? `<span>etapa ${feitas + 1} de ${et.length}</span>` : ''}</div>`
    : '<div class="ct-prox sem-passo">+ Definir próximo passo</div>';
  const prazo = mc.prazo ? new Date(mc.prazo + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  return `<div class="cartao q2 ${r.agentes.length ? 'vivo' : ''} ${r.alertas ? 'atencao' : ''}" draggable="true" data-marco="${mc.id}" style="--cor:${j.cor};--setor:${s.cor}" title="${esc(`${j.nome} · ${s.nome}`)}">
    <div class="ct-tit">${mc.prioridade === 1 ? '<span class="ct-pri" title="Prioridade alta">Alta</span> ' : ''}${esc(mc.titulo)}</div>
    ${passo}
    ${r.alertas ? '<div class="ct-alerta">Precisa de você</div>' : ''}
    <div class="ct-rodape">${mc.responsavel ? `<span class="ct-resp" style="--pessoa:${corPessoa(mc.responsavel)}">${esc(mc.responsavel)}</span>` : '<span class="ct-resp vazio">sem responsável</span>'}${prazo ? `<span class="ct-prazo ${atrasado ? 'atrasado' : ''}">${atrasado ? 'atrasado · ' : 'prazo '}${prazo}</span>` : '<span class="ct-prazo sem">sem prazo</span>'}<span class="espaco"></span>${r.agentes.length ? `<span class="ct-vivo2" title="agentes trabalhando neste marco agora">● ${r.agentes.length} trabalhando</span>` : ''}</div>
  </div>`;
}
async function desenharQuadro() {
  if ($('#quadro').hidden) return;
  if (!temQuadro) {
    $('#quadroCorpo').innerHTML = `<div class="quadro-vazio"><h3>Falta ligar o quadro</h3><p>Rode o arquivo <code>supabase/escritorio-3.sql</code> no Supabase (SQL Editor › New query › colar › Run). É uma vez só.</p></div>`;
    return;
  }
  // Escopo primeiro ("Meus marcos" é o padrão); jogo, setor e faixas ficam recolhidos em "Filtrar".
  if (pessoaQuadro === null) pessoaQuadro = guardado('pessoaQuadro', EU.pessoa);
  let esc0 = $('#escopoQuadro');
  if (!esc0) {
    esc0 = document.createElement('div'); esc0.id = 'escopoQuadro'; esc0.className = 'q-escopo'; esc0.setAttribute('role', 'tablist');
    $('#quadro .quadro-topo h2').after(esc0);
    esc0.onclick = (e) => { const b = e.target.closest('[data-pq]'); if (b) { pessoaQuadro = b.dataset.pq; guarda('pessoaQuadro', pessoaQuadro); desenharQuadro(); } };
  }
  const outros = pessoas().filter((p) => p !== EU.pessoa);
  esc0.innerHTML = [[EU.pessoa, 'Meus marcos'], ...outros.map((p) => [p, `Do ${p}`]), ['', 'Todos']].map(([v, t]) => `<button role="tab" data-pq="${esc(v)}" class="${pessoaQuadro === v ? 'on' : ''}" aria-selected="${pessoaQuadro === v}">${esc(t)} <small>${marcos.filter((m) => (!v || m.responsavel === v) && m.coluna !== 'feito').length}</small></button>`).join('');
  const nFiltros = (filtroJogo ? 1 : 0) + (filtroSetor ? 1 : 0) + (agruparPor ? 1 : 0);
  $('#filtrosQuadroCel').innerHTML = `Filtrar${nFiltros ? ` <i class="q-nf">${nFiltros}</i>` : ''} ${$('#quadroFiltros').classList.contains('abertos') ? '▴' : '▾'}`;
  $('#filtrosQuadroCel').setAttribute('aria-expanded', $('#quadroFiltros').classList.contains('abertos'));
  $('#quadroFiltros').innerHTML = htmlFiltros() + '<div class="filtros">' + [['', 'Sem faixas'], ['jogo', 'Faixas por jogo'], ['setor', 'Faixas por setor']].map(([v, t]) => `<button data-ag="${v}" class="${agruparPor === v ? 'on' : ''}">${t}</button>`).join('') + '</div>';
  const lista = marcos.filter(passaMarco);
  const faixas = agruparPor === 'jogo' ? todosJogos().filter((j) => lista.some((m) => m.jogo === j.id)).map((j) => ({ id: j.id, nome: `${j.icone} ${j.nome}`, cor: j.cor, f: (m) => m.jogo === j.id }))
    : agruparPor === 'setor' ? SETORES.map((s) => ({ id: s.id, nome: `${s.icone} ${s.nome}`, cor: s.cor, f: (m) => m.setor === s.id }))
    : [{ id: '', nome: '', f: () => true }];
  let html = '';
  for (const fx of faixas) {
    if (fx.nome) html += `<div class="faixa-nome" style="--cor:${fx.cor}">${esc(fx.nome)}</div>`;
    if (!fx.nome || fx === faixas[0]) html += `<div class="nav-colunas">${COLUNAS.map((c) => `<button data-ir-coluna="${c.id}" class="${lista.some((m) => m.coluna === c.id) ? '' : 'zero'}">${c.nome} <b>${lista.filter((m) => m.coluna === c.id).length}</b></button>`).join('')}</div>`;
    html += '<div class="colunas-quadro">';
    for (const c of COLUNAS) {
      const doC = lista.filter((m) => m.coluna === c.id && fx.f(m)).sort((a, b) => (c.id === 'feito' ? new Date(b.concluido || b.atualizado) - new Date(a.concluido || a.atualizado) : a.prioridade - b.prioridade || a.ordem - b.ordem));
      const mostrar = c.id === 'feito' ? doC.slice(0, 8) : doC;
      html += `<div class="coluna" data-coluna="${c.id}" data-faixa="${esc(fx.id)}"><div class="col-cab"><span>${icoDeEmoji(c.icone)} ${c.nome}</span><b>${doC.length}</b>${c.id !== 'feito' ? `<button class="col-novo" data-novo="${c.id}" title="Novo marco em ${c.nome}">+</button>` : ''}</div>
        <div class="col-cartoes">${(await Promise.all(mostrar.map(cartaoMarco))).join('')}${doC.length > mostrar.length ? `<div class="sub">+${doC.length - mostrar.length} mais antigos</div>` : ''}${!doC.length ? '<div class="col-vazia">—</div>' : ''}</div></div>`;
    }
    html += '</div>';
  }
  // pedidos de hoje que não acharam marco (para pendurar na mão)
  const soltos = D.missoes().filter((m) => m.inicio > Date.now() - 2 * 86400e3 && passa(m.frente) && !marcoDaMissao(m) && !(vinculos.has(m.id) && vinculos.get(m.id) === null));
  if (soltos.length) html += `<details class="soltos"><summary>${plural(soltos.length, 'pedido')} dos últimos 2 dias sem marco <span class="sub">(tudo bem: só pendure o que fizer parte de um marco)</span></summary>${soltos.slice(0, 30).map((m) => `<div class="solto"><span class="chip-frente" style="--cor:${m.frente.cor}">${m.frente.icone}${m.frente.iconeSetor}</span><a href="#" data-abrir-missao="${esc(m.id)}">${esc(m.titulo)}</a><span class="sub">${esc(m.pessoa)} · ${D.ha(m.inicio)}</span><select data-pendurar="${esc(m.id)}"><option value="">pendurar em…</option>${marcos.filter((x) => x.coluna !== 'feito' && x.jogo === m.frente.jogo).map((x) => `<option value="${x.id}">${esc(x.titulo)}</option>`).join('')}<option value="nenhum">não é de marco nenhum</option></select></div>`).join('')}</details>`;
  $('#quadroCorpo').innerHTML = html || '';
  if (!marcos.length) $('#quadroCorpo').insertAdjacentHTML('afterbegin', '<div class="quadro-dica">Crie o primeiro marco no <b>+</b> de uma coluna. Só os grandes: “Trailer de lançamento”, “Loja de classes”, “Página da Steam”. Os pedidos do dia a dia se penduram sozinhos.</div>');
}
function ligarQuadro() {
  $('#novoMarco').onclick = () => abrirMarco(null, 'afazer');
  $('#quadroFiltros').onclick = (e) => {
    if (cliqueFiltro(e)) return;
    const p = e.target.closest('[data-pq]'), a = e.target.closest('[data-ag]');
    if (p) { pessoaQuadro = p.dataset.pq; desenharQuadro(); }
    if (a) { agruparPor = a.dataset.ag; guarda('agrupar', agruparPor); desenharQuadro(); }
  };
  const corpo = $('#quadroCorpo');
  corpo.onclick = (e) => {
    const n = e.target.closest('[data-novo]'); if (n) return abrirMarco(null, n.dataset.novo);
    const ic = e.target.closest('[data-ir-coluna]'); if (ic) { corpo.querySelector(`.coluna[data-coluna="${ic.dataset.irColuna}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); return; }
    const am = e.target.closest('[data-abrir-missao]'); if (am) { e.preventDefault(); return abrirMissao(am.dataset.abrirMissao); }
    const c = e.target.closest('[data-marco]'); if (c) abrirMarco(Number(c.dataset.marco));
  };
  corpo.onchange = async (e) => {
    const s = e.target.closest('[data-pendurar]'); if (!s || !s.value) return;
    try { await R.vincular(s.dataset.pendurar, s.value === 'nenhum' ? null : Number(s.value)); } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
  };
  // arrastar cartões entre colunas (no PC)
  corpo.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-marco]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.marco); c.classList.add('arrastando'); } });
  corpo.addEventListener('dragend', (e) => e.target.closest?.('[data-marco]')?.classList.remove('arrastando'));
  corpo.addEventListener('dragover', (e) => { const col = e.target.closest('[data-coluna]'); if (col) { e.preventDefault(); $$('.coluna.sobre').forEach((x) => x !== col && x.classList.remove('sobre')); col.classList.add('sobre'); } });
  corpo.addEventListener('drop', async (e) => {
    const col = e.target.closest('[data-coluna]'); $$('.coluna.sobre').forEach((x) => x.classList.remove('sobre'));
    const id = Number(e.dataTransfer.getData('text/plain')); if (!col || !id) return;
    e.preventDefault();
    const mc = marcos.find((x) => x.id === id); if (!mc) return;
    const mud = { id, coluna: col.dataset.coluna };
    if (agruparPor && col.dataset.faixa) mud[agruparPor] = col.dataset.faixa;
    await moverMarco(mc, mud);
  });
}
async function moverMarco(mc, mud) {
  if (mud.coluna === 'feito' && mc.coluna !== 'feito') mud.concluido = new Date().toISOString();
  if (mud.coluna && mud.coluna !== 'feito') mud.concluido = null;
  Object.assign(mc, mud); mudouMarcos(); desenharQuadro();
  try { await salvar(mud); if (mud.coluna === 'feito') { toast({ titulo: `🏁 Marco concluído: ${mc.titulo}`, cor: '#4fbf82' }); fazerEmote('🎉'); } }
  catch (err) { toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }); }
}
async function salvar(campos) {
  if (DEMO) { const mc = marcos.find((x) => x.id === campos.id); if (mc) Object.assign(mc, campos); else marcos.push({ ...campos, id: Date.now(), ordem: Date.now() / 1000, etapas: campos.etapas || [] }); mudouMarcos(); return marcos.find((x) => x.id === campos.id) || marcos.at(-1); }
  const d = await R.salvarMarco(campos);
  const i = marcos.findIndex((x) => x.id === d.id); if (i >= 0) marcos[i] = d; else marcos.push(d);
  mudouMarcos();
  return d;
}
// Muda as etapas sem atropelar quem gravou ao mesmo tempo: "mudar" recebe a lista mais nova do banco.
async function salvarEtapas(mc, mudar, novo) {
  mc.etapas = mudar([...(mc.etapas || [])]); // na tela já, antes do banco responder
  if (novo) return;
  if (DEMO) { mudouMarcos(); return; }
  const d = await R.mudarEtapas(mc.id, mudar);
  Object.assign(mc, d);
  const i = marcos.findIndex((x) => x.id === d.id); if (i >= 0) marcos[i] = d;
  mudouMarcos();
}
// Acha a etapa pelo texto (a lista do banco pode ter mudado de ordem); -1 se ela sumiu.
const indiceEtapa = (lista, i, t) => (lista[i]?.t === t ? i : lista.findIndex((e) => e.t === t));

// ---------- detalhe do marco (na gaveta) ----------
let rascunho = null;
function abrirMarco(id, coluna = 'afazer') {
  marcoAberto = id;
  rascunho = id ? null : { titulo: '', descricao: '', jogo: filtroJogo || 'genesis', setor: filtroSetor || 'criacao', coluna, responsavel: EU.pessoa, prioridade: 2, prazo: null, etapas: [], palavras: '', area: '', arquivos: '', branch: '' };
  abrirAba('marco', aba !== 'marco');
}
async function desenharMarco() {
  const mc = marcoAberto ? marcos.find((x) => x.id === marcoAberto) : rascunho;
  if (!mc) { $('#detalheMarco').innerHTML = '<div class="vazio">Marco não encontrado (foi apagado?).</div>'; return; }
  const novo = !mc.id, r = novo ? null : resumoMarco(mc), j = jogoPorId(mc.jogo);
  const opt = (lista, atual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const et = mc.etapas || [];
  const cms = novo ? [] : comentarios.filter((c) => c.marco_id === mc.id);
  const pend = novo ? [] : await Promise.all(r.ms.slice(0, 25).map(async (m) => { const st = D.ESTADOS[m.status] || D.ESTADOS.espera; return `<div class="pend"><span class="g" style="--cor:${st.cor}">${st.glifo}</span><a href="#" data-abrir-missao="${esc(m.id)}">${esc(m.titulo)}</a><span class="sub">${esc(m.pessoa)} · ${D.ha(m.inicio)} · ${comoPendurou(m)}</span><button class="mini-x" data-despendurar="${esc(m.id)}" title="Não é deste marco">×</button></div>`; }));
  const urls = novo || !r.minis.length ? [] : await R.urlsMiniaturas(r.minis.slice(0, 8).map((x) => x.caminho)).catch(() => []);
  const vivos = novo ? [] : await Promise.all(r.agentes.map(async (a) => `<div class="quem-linha"><img src="${await retratoDe(a.m.nome)}" alt=""><b>${esc(tituloAgente(a.m))}</b><span class="sub2">${esc(primeiraFrase(frase(a.m.ult), 80))}</span></div>`));
  $('#detalheMarco').innerHTML = `
    <div class="marco-form" style="--cor:${j.cor}">
      <input id="mTitulo" class="m-titulo" maxlength="200" placeholder="Nome do marco (ex.: Trailer de lançamento)" value="${esc(mc.titulo)}">
      <div class="m-grade">
        <label>Coluna<select id="mColuna">${opt(COLUNAS.map((c) => [c.id, `${c.icone} ${c.nome}`]), mc.coluna)}</select></label>
        <label>Jogo<select id="mJogo">${opt(todosJogos().map((x) => [x.id, `${x.icone} ${x.nome}`]), mc.jogo)}</select></label>
        <label>Setor<select id="mSetor">${opt(SETORES.map((x) => [x.id, `${x.icone} ${x.nome}`]), mc.setor)}</select></label>
        <label>Dono<select id="mResp">${opt([['', '—'], ...pessoas().map((p) => [p, p])], mc.responsavel)}</select></label>
        <label>Prioridade<select id="mPri">${opt([[1, '🔥 Alta'], [2, 'Normal'], [3, 'Baixa']], mc.prioridade)}</select></label>
        <label>Prazo<input id="mPrazo" type="date" value="${esc(mc.prazo || '')}"></label>
      </div>
      <textarea id="mDesc" rows="3" maxlength="4000" placeholder="O que é este marco? Quando ele está pronto?">${esc(mc.descricao)}</textarea>
      <div class="bloco"><h4>Etapas ${et.length ? `(${et.filter((e) => e.feito).length}/${et.length})` : ''}</h4>
        ${et.map((e, i) => `<label class="etapa-m ${e.feito ? 'feita' : ''}"><input type="checkbox" data-etapa="${i}" ${e.feito ? 'checked' : ''}><span>${esc(e.t)}</span>${e.por ? `<small>${esc(e.por)}</small>` : ''}<button type="button" class="mini-x" data-tirar-etapa="${i}">×</button></label>`).join('')}
        <form id="formEtapa" class="linha"><input id="novaEtapa" maxlength="200" placeholder="+ etapa (ex.: roteiro, gravação, edição…)"><button class="btn mini">+</button></form></div>
      <details class="bloco"><summary><h4 style="display:inline">Para pendurar sozinho e para as IAs</h4></summary>
        <label class="m-lin">Palavras-chave <input id="mPalavras" maxlength="300" placeholder="ex.: trailer, lançamento, steam" value="${esc(mc.palavras)}"></label>
        <p class="sub" style="text-align:left">Pedidos com estas palavras (no mesmo jogo) se penduram neste marco.</p>
        <label class="m-lin">Área <input id="mArea" maxlength="200" placeholder="ex.: HUD, inimigos, vídeo" value="${esc(mc.area)}"></label>
        <label class="m-lin">Arquivos <input id="mArquivos" maxlength="500" placeholder="ex.: scripts/ui/*, data/classes.json" value="${esc(mc.arquivos)}"></label>
        <label class="m-lin">Branch <input id="mBranch" maxlength="120" placeholder="ex.: gen-190-loja" value="${esc(mc.branch)}"></label>
        <p class="sub" style="text-align:left">As IAs olham Área/Arquivos/Branch para você e o Kenny não mexerem no mesmo lugar ao mesmo tempo.</p></details>
      <div class="linha">${novo ? '<button class="btn forte" id="criarMarco">Criar marco</button>' : `<button class="btn forte" id="mandarMarco">▶ Mandar para a assistente</button>`}</div>
    </div>
    ${novo ? '' : `
    ${vivos.length ? `<div class="bloco destaque"><h4>⚙️ Trabalhando nele agora</h4>${vivos.join('')}</div>` : ''}
    <div class="bloco"><h4>Pedidos pendurados (${r.ms.length})</h4>${pend.join('') || '<p class="sub" style="text-align:left">Nenhum ainda. Mande pelo botão acima, ou peça algo com as palavras-chave do marco.</p>'}</div>
    ${urls.filter(Boolean).length ? `<div class="bloco"><h4>Resultados</h4><div class="grade-galeria">${r.minis.slice(0, 8).map((mi, i) => urls[i] ? `<div class="mini-card" data-mini="${i}"><div class="${mi.video ? 'play' : ''}"><img src="${urls[i]}" alt=""></div><div>${esc(mi.nome)}</div></div>` : '').join('')}</div></div>` : ''}
    <div class="bloco"><h4>Comentários</h4>${cms.map((c) => `<div class="coment" style="--cor:${corPessoa(c.pessoa)}"><b>${esc(c.pessoa)}</b> <span class="sub2">${D.ha(new Date(c.criado).getTime())}</span><div>${esc(c.texto)}</div></div>`).join('')}
      <form id="formComent" class="linha"><input id="novoComent" maxlength="2000" placeholder="Comentar…"><button class="btn mini">Enviar</button></form></div>
    <p class="sub" style="text-align:left">Criado por ${esc(mc.criado_por || '?')} · ${D.ha(new Date(mc.criado).getTime())}${mc.concluido ? ` · concluído ${D.ha(new Date(mc.concluido).getTime())}` : ''} · <a href="#" id="apagarMarco" class="link-perigo">apagar marco</a></p>`}`;
  const el = $('#detalheMarco');
  const campo = { mTitulo: 'titulo', mColuna: 'coluna', mJogo: 'jogo', mSetor: 'setor', mResp: 'responsavel', mPri: 'prioridade', mPrazo: 'prazo', mDesc: 'descricao', mPalavras: 'palavras', mArea: 'area', mArquivos: 'arquivos', mBranch: 'branch' };
  el.onchange = async (e) => {
    const k = campo[e.target.id];
    if (k) {
      let v = e.target.value; if (k === 'prioridade') v = Number(v); if ((k === 'prazo' || k === 'responsavel') && !v) v = null;
      if (novo) { rascunho[k] = v; return; }
      if (k === 'titulo' && !v.trim()) return;
      if (k === 'coluna') return moverMarco(mc, { id: mc.id, coluna: v });
      mc[k] = v; try { await salvar({ id: mc.id, [k]: v }); desenharQuadro(); } catch (err) { toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }); }
      return;
    }
    const ch = e.target.closest('[data-etapa]');
    if (ch) { const i = Number(ch.dataset.etapa), t = mc.etapas?.[i]?.t, feito = ch.checked; await salvarEtapas(mc, (lista) => { const j = indiceEtapa(lista, i, t); if (j >= 0) lista[j] = { ...lista[j], feito, por: feito ? EU.pessoa : undefined }; return lista; }, novo).catch(() => {}); desenharMarco(); desenharQuadro(); }
  };
  el.onclick = async (e) => {
    const am = e.target.closest('[data-abrir-missao]'); if (am) { e.preventDefault(); return abrirMissao(am.dataset.abrirMissao); }
    const te = e.target.closest('[data-tirar-etapa]'); if (te) { e.preventDefault(); const i = Number(te.dataset.tirarEtapa), t = mc.etapas?.[i]?.t; await salvarEtapas(mc, (lista) => { const j = indiceEtapa(lista, i, t); if (j >= 0) lista.splice(j, 1); return lista; }, novo).catch(() => {}); desenharMarco(); return; }
    const dp = e.target.closest('[data-despendurar]'); if (dp) { if (DEMO) { vinculos.set(dp.dataset.despendurar, null); mudouMarcos(); desenharMarco(); } else R.vincular(dp.dataset.despendurar, null).catch((err) => toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' })); return; }
    const mi = e.target.closest('[data-mini]'); if (mi) { const i = Number(mi.dataset.mini); abrirMidia(r.minis[i], urls[i], r.minis[i].pessoa); }
  };
  $('#formEtapa').onsubmit = async (e) => {
    e.preventDefault(); const t = $('#novaEtapa').value.trim(); if (!t) return;
    await salvarEtapas(mc, (lista) => [...lista, { t, feito: false }], novo).catch((err) => toast({ titulo: 'Não salvei', texto: err.message, cor: '#ef6a55' }));
    desenharMarco(); setTimeout(() => $('#novaEtapa')?.focus(), 0); desenharQuadro();
  };
  $('#criarMarco')?.addEventListener('click', async () => {
    rascunho.titulo = $('#mTitulo').value.trim(); rascunho.descricao = $('#mDesc').value;
    if (!rascunho.titulo) { $('#mTitulo').focus(); return; }
    try { const d = await salvar(rascunho); marcoAberto = d.id; rascunho = null; desenharMarco(); desenharQuadro(); toast({ titulo: 'Marco criado', texto: d.titulo, cor: jogoPorId(d.jogo).cor }); }
    catch (err) { toast({ titulo: 'Não criei', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#apagarMarco')?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!confirm(`Apagar o marco “${mc.titulo}”? Os pedidos continuam no histórico.`)) return;
    try { if (DEMO) marcos = marcos.filter((x) => x !== mc); else await R.apagarMarco(mc.id); marcos = marcos.filter((x) => x.id !== mc.id); mudouMarcos(); fecharGaveta(); desenharQuadro(); } catch (err) { toast({ titulo: 'Não apaguei', texto: err.message, cor: '#ef6a55' }); }
  });
  $('#mandarMarco')?.addEventListener('click', () => mandarMarco(mc));
  $('#formComent')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('#novoComent').value.trim(); if (!t) return;
    try { if (DEMO) comentarios.push({ id: Date.now(), marco_id: mc.id, pessoa: EU.pessoa, texto: t, criado: new Date().toISOString() }); else await R.comentar(mc.id, t); $('#novoComent').value = ''; if (DEMO) desenharMarco(); } catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
  });
}
// Abre (ou reaproveita) uma conversa com a assistente presa a este marco.
async function mandarMarco(mc) {
  let cv = conversas.find((c) => c.marco_id === mc.id && c.alvo === 'claude');
  if (!cv && !DEMO) {
    const projs = estados.get(EU.pessoa)?.info?.projetos || [];
    const proj = projs.find((p) => jogoPorId(mc.jogo).id === 'cook' ? /cook/i.test(p.nome) : /genesis/i.test(p.nome))?.nome || projs[0]?.nome;
    try { cv = await R.novaConversa({ titulo: `🏁 ${mc.titulo}`, alvo: 'claude', projeto: proj, marco_id: mc.id }); conversas = [cv, ...conversas]; }
    catch (err) { toast({ titulo: 'Não abri a conversa', texto: err.message, cor: '#ef6a55' }); return; }
  }
  if (mc.coluna === 'afazer' || mc.coluna === 'ideias') moverMarco(mc, { id: mc.id, coluna: 'fazendo' });
  if (cv) await abrirConversa(cv.id); else abrirAba('chat');
  setTimeout(() => { $('#entrada').focus(); }, 50);
}

// ---------- galeria ----------
let filtroGaleria = 'todos';
async function desenharGaleria() {
  filtros($('#filtroGaleria'), filtroGaleria, [['todos', 'Todos'], ...pessoas().map((p) => [p, p])], (f) => { filtroGaleria = f; desenharGaleria(); });
  const itens = D.galeria().filter((x) => filtroGaleria === 'todos' || x.pessoa === filtroGaleria).slice(0, 60);
  if (!itens.length) { $('#gradeGaleria').innerHTML = '<div class="vazio" style="grid-column:1/-1">Os vídeos e imagens que os agentes entregarem aparecem aqui (a ponte faz as miniaturas).</div>'; return; }
  const urls = await R.urlsMiniaturas(itens.map((x) => x.caminho)).catch(() => []);
  $('#gradeGaleria').innerHTML = itens.map((x, i) => urls[i] ? `<div class="mini-card" data-i="${i}"><div class="${x.video ? 'play' : ''}"><img src="${urls[i]}" alt="" loading="lazy"></div><div>${esc(tituloDe(x.agente))} · ${esc(x.pessoa)} · ${D.ha(x.t)}</div></div>` : '').join('');
  $('#gradeGaleria').onclick = (e) => { const c = e.target.closest('[data-i]'); if (c) abrirMidia(itens[Number(c.dataset.i)], urls[Number(c.dataset.i)], itens[Number(c.dataset.i)].pessoa); };
}
async function abrirMidia(mi, url, pessoa) {
  let original = '';
  if (LOCAL && pessoa === EU.pessoa) {
    try { const lista = await (await fetch('/local/arquivos')).json(); const p = lista.reverse().find((c) => c.split(/[\\/]/).pop() === mi.nome); if (p) original = `/local/arquivo?p=${encodeURIComponent(p)}`; } catch {}
  }
  $('#conteudoLightbox').innerHTML = original && mi.video ? `<video class="lightbox-midia" src="${original}" controls autoplay></video>` : `<img class="lightbox-midia" src="${original || url}" alt=""><p class="sub">${esc(mi.nome)}${!original && mi.video ? ' · miniatura (o vídeo fica no PC de quem fez)' : ''}</p>`;
  $('#lightbox').hidden = false;
}

// ---------- chat: conversas (Claude ou Codex) em abas, como no VS Code ----------
const alvoAtual = () => conversas.find((c) => c.id === conversaAtual)?.alvo || 'claude';
// Cor e ícone de cada aba (tirados do id: a mesma conversa tem sempre o mesmo visual).
const CORES_ABA = ['#a785f0', '#3fb37f', '#f0973d', '#5aa9e6', '#ef6a8a', '#e8c547', '#5cc8b8', '#c77dd8'];
const ICONES_ABA = ['🦊', '🐙', '🦉', '🐢', '🐝', '🦋', '🐳', '🦎', '🐞', '🦜', '🌵', '🍄'];
// Nome dado pela IA começa com um emoji do assunto ("🎬 Review trailer"): ele vira o ícone da aba.
const EMOJI_INICIAL = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;
const visualAba = (c) => { const n = Math.abs(Number(c?.id) || 0), m = String(c?.titulo || '').match(EMOJI_INICIAL); return { cor: CORES_ABA[(n * 3) % CORES_ABA.length], icone: m ? m[1] : ICONES_ABA[n % ICONES_ABA.length], nome: m ? String(c.titulo).slice(m[0].length) : String(c?.titulo || '') }; };
const lerLista = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : null; } catch { return null; } };
let abasAbertas = lerLista('abasAbertas');                  // ids das abas na faixa (fechar só esconde)
const naoVistas = new Set(lerLista('abasNaoVistas') || []); // responderam e você ainda não viu
const cacheMsgs = new Map(), rolagens = new Map();          // mensagens e rolagem de cada aba (volta de onde parou)
const detalhesAbertos = new Set();                          // blocos "detalhes" que você abriu
let rolarPendente = null;
const salvarAbas = () => { try { localStorage.setItem('abasAbertas', JSON.stringify(abasAbertas || [])); localStorage.setItem('abasNaoVistas', JSON.stringify([...naoVistas])); } catch {} };
const vendoConversa = (id) => aba === 'chat' && !$('#gaveta').classList.contains('fechada') && conversaAtual === id && !document.hidden;
function abasVisiveis() {
  if (!abasAbertas) { abasAbertas = [...conversas].sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado)).slice(0, 5).reverse().map((c) => c.id); salvarAbas(); }
  if (conversaAtual && !abasAbertas.includes(conversaAtual)) { abasAbertas.push(conversaAtual); salvarAbas(); }
  return abasAbertas.map((id) => conversas.find((c) => c.id === id)).filter(Boolean);
}
// Selo: o mesmo estado do cartão do pedido (estado-pedido.js: precisa de você > fazendo), ou ✅ respondeu e você não viu.
function seloAba(id) {
  const ap = aprovacoes.filter((a) => a.conversa_id === id && !lerJson(a.detalhe).origem?.terminal);
  const nDec = ap.reduce((s, a) => s + CA.nDecisoes(a) - Object.keys(escolhasAprov.get(a.id) || {}).length, 0);
  const e = estadoDoChat({ nDec: ap.length ? Math.max(1, nDec) : 0, soPerguntas: ap.length > 0 && ap.every(Q.ehQuestionario), rodando: convOcupada(id) });
  if (e) return [e.ic, e.txt.charAt(0).toLowerCase() + e.txt.slice(1), e.k, Math.max(1, nDec)];
  if (naoVistas.has(id)) return ['✅', 'respondeu: você ainda não viu'];
  return null;
}
const nomeAlvo = (c) => (c.alvo === 'codex' ? 'Codex · GPT' : 'Claude');
function desenharSeletorConversas() {
  const faixa = $('#abasConversa'); if (!faixa) return;
  if (!temSql2) { faixa.innerHTML = '<span class="aba-conv on"><span class="nm">Conversa única (rode o SQL 2 para ter abas)</span></span>'; $('#btnNovaConversa').disabled = true; $('#btnMaisConversa').disabled = true; $('#btnAbasFechadas').disabled = true; return; }
  const lista = abasVisiveis();
  faixa.innerHTML = lista.length ? lista.map((c) => {
    const v = visualAba(c), selo = seloAba(c.id), on = c.id === conversaAtual;
    return `<button type="button" role="tab" aria-selected="${on}" class="aba-conv${on ? ' on' : ''}${c.alvo === 'codex' ? ' gpt' : ''}" data-conv="${c.id}" style="--cor:${v.cor}" title="${esc(v.nome || c.titulo)} · ${nomeAlvo(c)}${c.projeto ? ' · ' + esc(c.projeto) : ''}${selo ? ' · ' + selo[1] : ''} (duplo clique renomeia)"><span class="ic">${v.icone}</span><span class="nm">${esc(v.nome)}</span>${selo ? `<span class="selo">${selo[0]}</span>` : ''}<span class="x" data-fechar="${c.id}" title="Fechar aba (a conversa continua no histórico)">×</span></button>`;
  }).join('') : '<span class="vazio-abas">Nenhuma aba aberta: crie com o + ou reabra pelo 🕘</span>';
  // O 🕘 avisa se alguma aba fechada precisa de você.
  const fechadas = conversas.filter((c) => !abasAbertas.includes(c.id));
  $('#btnAbasFechadas').classList.toggle('aviso', fechadas.some((c) => seloAba(c.id)));
  desenharPendencias();
  $('#btnAbasFechadas').title = `Abas fechadas / histórico (${fechadas.length})`;
  const on = faixa.querySelector('.aba-conv.on');
  if (on) { const fr = faixa.getBoundingClientRect(), r = on.getBoundingClientRect(); if (r.left < fr.left) faixa.scrollLeft += r.left - fr.left - 8; else if (r.right > fr.right) faixa.scrollLeft += r.right - fr.right + 8; }
  if (!$('#listaAbasFechadas').hidden) desenharAbasFechadas();
  // Celular: no lugar das abas, um seletor com o nome inteiro e o estado da conversa aberta.
  const atual = conversas.find((c) => c.id === conversaAtual);
  // "Fazendo" já está no cartão do pedido logo abaixo; "precisa de você" vira a contagem única ("4 decisões pendentes").
  const seloAtual = atual ? seloAba(atual.id) : null;
  const seloCel = seloAtual?.[2] === 'voce' ? [seloAtual[0], pendentes(seloAtual[3])] : seloAtual?.[2] === 'fazendo' ? null : seloAtual;
  CC.desenharSeletor($('#seletorConvCel'), { v: atual ? visualAba(atual) : null, selo: seloCel, outras: Math.max(0, conversas.length - (atual ? 1 : 0)), aberta: !$('#listaAbasFechadas').hidden });
  desenharCabPC(atual);
}
function desenharAbasFechadas() {
  const el = $('#listaAbasFechadas');
  const lista = [...conversas].sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado)).slice(0, 80);
  el.innerHTML = `<div class="af-topo"><b>Em qual conversa?</b><button type="button" class="btn mini" data-af-fechar title="Fechar" aria-label="Fechar">×</button></div>
    <div class="af-acoes"><button type="button" class="btn af-cel" data-novo-pedido="">＋ Novo pedido</button><button type="button" class="btn af-cel" data-seg="dupla">✉ Dupla</button><button type="button" class="btn" data-af-nova>＋ Conversa nova</button>${conversaAtual ? '<button type="button" class="btn" data-af-renomear>Renomear ou apagar esta</button>' : ''}</div>` + (lista.length ? lista.map((c) => {
    const v = visualAba(c), selo = seloAba(c.id), atual = c.id === conversaAtual;
    return `<button type="button" class="af-item${atual ? ' aberta' : ''}" data-reabrir="${c.id}" style="--cor:${v.cor}"><span class="ic">${v.icone}</span><span class="nm">${esc(v.nome)}<small>${selo ? `<b class="af-est">${selo[0]} ${selo[1]}</b> · ` : ''}${atual ? 'aberta agora · ' : ''}${nomeAlvo(c)}${c.projeto ? ' · ' + esc(c.projeto) : ''} · ${D.ha(new Date(c.atualizado).getTime())}</small></span></button>`;
  }).join('') : '<p class="sub">Nenhuma conversa ainda.</p>');
}
function fecharAbaConversa(id) {
  const i = abasAbertas.indexOf(id); if (i < 0) return;
  abasAbertas.splice(i, 1); salvarAbas();
  if (id === conversaAtual) abrirConversa(abasAbertas[i] ?? abasAbertas[i - 1] ?? null);
  else desenharSeletorConversas();
}
async function renomearConversa(id) {
  const c = conversas.find((x) => x.id === id); if (!c) return;
  const novo = prompt('Novo nome da aba:', c.titulo);
  if (!novo?.trim()) return;
  try { if (!DEMO) await R.renomearConversa(c.id, novo.trim()); } catch (e) { toast({ titulo: 'Não renomeei', texto: e.message, cor: '#ef6a55' }); return; }
  c.titulo = novo.trim(); desenharSeletorConversas(); desenharBarra(); desenharChat();
}
function ligarAbasConversa() {
  const faixa = $('#abasConversa');
  faixa.onclick = (e) => {
    const x = e.target.closest('[data-fechar]'); if (x) { e.stopPropagation(); fecharAbaConversa(Number(x.dataset.fechar)); return; }
    const b = e.target.closest('[data-conv]'); if (b && Number(b.dataset.conv) !== conversaAtual) abrirConversa(Number(b.dataset.conv));
  };
  faixa.ondblclick = (e) => { const b = e.target.closest('[data-conv]'); if (b && !e.target.closest('[data-fechar]')) renomearConversa(Number(b.dataset.conv)); };
  // Botão do meio do mouse fecha a aba (como no VS Code).
  faixa.onauxclick = (e) => { const b = e.target.closest('[data-conv]'); if (b && e.button === 1) { e.preventDefault(); fecharAbaConversa(Number(b.dataset.conv)); } };
  $('#btnAbasFechadas').onclick = () => { const el = $('#listaAbasFechadas'); el.hidden = !el.hidden; if (!el.hidden) desenharAbasFechadas(); };
  $('#listaAbasFechadas').onclick = (e) => {
    if (e.target.closest('[data-af-fechar]')) { $('#listaAbasFechadas').hidden = true; return; }
    if (e.target.closest('[data-af-nova]')) { $('#listaAbasFechadas').hidden = true; novaAbaDireto(); return; }
    if (e.target.closest('[data-af-renomear]')) { $('#listaAbasFechadas').hidden = true; menuConversa(); return; }
    const b = e.target.closest('[data-reabrir]'); if (!b) return;
    $('#listaAbasFechadas').hidden = true; abrirConversa(Number(b.dataset.reabrir));
  };
  // Os "detalhes" que você abriu continuam abertos quando chega mensagem nova.
  $('#msgs').addEventListener('toggle', (e) => { const d = e.target; if (d.dataset?.k) { if (d.open) detalhesAbertos.add(d.dataset.k); else detalhesAbertos.delete(d.dataset.k); } }, true);
}
// Abrir no fim de verdade: o painel pode ainda estar abrindo (altura 0) e imagens/anexos crescem depois.
// Repete o "ir ao fim" por ~1,5 s, a menos que a pessoa role com o dedo ou o mouse nesse meio tempo.
let colarId = 0;
function colarNoFim(msgs, aoFim) {
  const meu = ++colarId; let mexeu = false;
  const parar = () => { mexeu = true; };
  msgs.addEventListener('wheel', parar, { once: true, passive: true }); msgs.addEventListener('touchmove', parar, { once: true, passive: true });
  aoFim();
  for (const ms of [0, 60, 200, 450, 900, 1500]) setTimeout(() => { if (meu === colarId && !mexeu && msgs.clientHeight) aoFim(); }, ms);
  requestAnimationFrame(() => { if (meu === colarId && !mexeu) aoFim(); });
}
function guardarRolagem() {
  const msgs = $('#msgs'); if (!msgs || chatCarregadoDe !== conversaAtual || aba !== 'chat') return;
  rolagens.set(conversaAtual, msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60 ? -1 : msgs.scrollTop);
}
async function carregarMensagens(id) {
  if (DEMO) { mensagens = cacheMsgs.get(id) || (id === conversaAtual ? mensagens : []); cacheMsgs.set(id, mensagens); return; }
  if (temSql2 && id == null) { mensagens = []; return; }
  const lista = await R.carregarChat(temSql2 ? id : null);
  if (conversaAtual !== id) return;   // trocou de aba enquanto carregava
  mensagens = lista; cacheMsgs.set(id, lista);
}
async function abrirConversa(id) {
  guardarRolagem();
  $('#listaAbasFechadas').hidden = true;
  conversaAtual = id; guarda('conversa', id || 0);
  if (id != null && abasAbertas && !abasAbertas.includes(id)) { abasAbertas.push(id); salvarAbas(); }
  const cv = conversas.find((c) => c.id === id); if (cv && cv.alvo !== alvoBarra) { alvoBarra = cv.alvo; guarda('alvoBarra', alvoBarra); }
  rolarPendente = -1; // abrir uma conversa sempre mostra a última coisa (pedido do Rafael, 26/11)
  const cache = cacheMsgs.get(id);
  mensagens = cache || []; chatCarregadoDe = cache ? id : undefined;
  desenharBarra();
  if (aba !== 'chat') abrirAba('chat');
  desenharSeletorConversas(); desenharChat();
  if (!cache) { try { await carregarMensagens(id); } catch { mensagens = []; } if (conversaAtual === id) { chatCarregadoDe = id; desenharChat(); } }
}
async function abrirChatCom(alvo) {
  abrirAba('chat');
  const recente = conversas.find((c) => c.alvo === alvo);
  if (recente) await abrirConversa(recente.id); else if (temSql2) mostrarNovaConversa(alvo);
  setTimeout(() => $('#entrada').focus(), 0);
}
function mostrarNovaConversa(alvo = 'claude') {
  if (!temSql2) { toast({ titulo: 'Falta o SQL 2', texto: 'Rode supabase/escritorio-2.sql para ter várias conversas.', cor: '#ffd23f' }); return; }
  $('#formNovaConversa').hidden = false;
  $$('#formNovaConversa input[name=alvo]').forEach((r) => { r.checked = r.value === alvo; });
  const projs = estados.get(EU.pessoa)?.info?.projetos || [];
  $('#projetoConversa').innerHTML = (projs.length ? projs : [{ nome: 'genesis-game' }]).map((p) => `<option>${esc(p.nome)}</option>`).join('');
  $('#tituloConversa').value = ''; $('#tituloConversa').focus();
}
// "＋ Nova conversa": abre uma aba nova na hora, vazia, com a mesma IA e o mesmo projeto da aba aberta
// (sem formulário no meio da conversa). O nome da aba vem sozinho do primeiro pedido (a ponte nomeia).
async function novaAbaDireto(alvo = alvoAtual()) {
  if (!temSql2 || DEMO) { mostrarNovaConversa(alvo); return; }
  $('#formNovaConversa').hidden = true;
  // Já existe uma aba nova vazia aberta? Usa ela em vez de criar outra igual.
  const vazia = conversas.find((c) => c.titulo === 'Conversa nova' && (c.alvo || 'claude') === alvo && abasAbertas?.includes(c.id) && cacheMsgs.has(c.id) && !cacheMsgs.get(c.id).length && !convOcupada(c.id));
  if (vazia) { if (aba !== 'chat') abrirAba('chat'); await abrirConversa(vazia.id); $('#entrada').focus(); return; }
  const atual = conversas.find((c) => c.id === conversaAtual);
  const projeto = atual?.projeto || estados.get(EU.pessoa)?.info?.projetos?.[0]?.nome || 'genesis-game';
  try {
    const c = await R.novaConversa({ titulo: 'Conversa nova', alvo, projeto });
    conversas = [c, ...conversas.filter((x) => x.id !== c.id)];
    if (aba !== 'chat') abrirAba('chat');
    await abrirConversa(c.id);
    $('#entrada').focus();
  } catch (e) { toast({ titulo: 'Não criei a conversa', texto: e.message, cor: '#ef6a55' }); }
}
async function criarConversa() {
  const titulo = $('#tituloConversa').value.trim() || 'Conversa nova';
  const alvo = $('#formNovaConversa input[name=alvo]:checked')?.value || 'claude';
  try {
    const c = await R.novaConversa({ titulo, alvo, projeto: $('#projetoConversa').value });
    conversas = [c, ...conversas.filter((x) => x.id !== c.id)];
    $('#formNovaConversa').hidden = true;
    await abrirConversa(c.id);
    $('#entrada').focus();
  } catch (e) { toast({ titulo: 'Não criei a conversa', texto: e.message, cor: '#ef6a55' }); }
}
async function menuConversa() {
  const c = conversas.find((x) => x.id === conversaAtual); if (!c) return;
  const novo = prompt('Novo nome da conversa (apague tudo e confirme para APAGAR a conversa):', c.titulo);
  if (novo === null) return;
  if (!novo.trim()) {
    if (confirm(`Apagar a conversa “${c.titulo}” e as mensagens dela?`)) {
      await R.apagarConversa(c.id); conversas = conversas.filter((x) => x.id !== c.id); cacheMsgs.delete(c.id); naoVistas.delete(c.id);
      const i = abasAbertas?.indexOf(c.id) ?? -1; if (i >= 0) abasAbertas.splice(i, 1); salvarAbas();
      abrirConversa(abasAbertas?.[Math.max(0, i - 1)] ?? null);
    }
    return;
  }
  await R.renomearConversa(c.id, novo.trim()); c.titulo = novo.trim(); desenharSeletorConversas(); desenharBarra(); desenharChat();
}
let chatCarregadoDe = undefined;
async function desenharChatCompleto() {
  desenharSeletorConversas();
  if (!DEMO && chatCarregadoDe !== conversaAtual) { const id = conversaAtual; try { await carregarMensagens(id); } catch {} if (conversaAtual === id) chatCarregadoDe = id; }
  desenharChat();
}
// Resposta limpa: em cada rodada (do seu pedido até o próximo), primeiro o texto final da assistente;
// as falas do meio, as ferramentas e os avisos de sistema ficam em "▸ detalhes" (recolhido). Erro fica sempre à vista.
function htmlRodada(rodada, gpt) {
  // Nota fiscal (tempo, tokens, modelo) que a ponte manda no fim do pedido: vira rodapé, não detalhe.
  const ehNota = (c) => c.de === 'sistema' && lerJson(c.texto)?.nota;
  const nota = rodada.filter(ehNota).map((c) => lerJson(c.texto).nota).at(-1);
  rodada = rodada.filter((c) => !ehNota(c));
  if (!rodada.length) return nota ? htmlNota(nota) : '';
  let final = -1;
  for (let i = rodada.length - 1; i >= 0; i--) if (rodada[i].de === 'assistente') { final = i; break; }
  const textoPasso = (c) => { const j = lerJson(c.texto); return j.ferramenta ? passo(j.ferramenta, null, j.entrada || {}) : c.texto; };
  const linhaDetalhe = (c) => (c.de === 'assistente' ? `<div class="det-fala">${md(c.texto)}</div>` : `<div class="det-passo">${esc(c.de === 'ferramenta' ? textoPasso(c) : c.texto)}</div>`);
  const detalhes = rodada.filter((c, i) => i !== final && c.de !== 'erro' && (final >= 0 || c.de !== 'sistema'));
  const k = String(rodada[0].id ?? rodada[0].texto?.slice(0, 40));
  const ultPasso = detalhes.filter((c) => c.de === 'ferramenta').at(-1);
  const blocoDet = detalhes.length ? `<details class="detalhes" data-k="${esc(k)}" ${detalhesAbertos.has(k) ? 'open' : ''}><summary>detalhes · ${detalhes.length}${ultPasso ? ` · ${esc(primeiraFrase(textoPasso(ultPasso), 50))}` : ''}</summary>${detalhes.map(linhaDetalhe).join('')}</details>` : '';
  const quem = `<span class="quem">${gpt ? 'Codex' : 'Assistente'}</span>`;
  let html = '';
  if (final >= 0) html += `<div class="msg assistente ${gpt ? 'gpt' : ''}">${quem}${md(rodada[final].texto)}${nota ? htmlNota(nota) : ''}${blocoDet}</div>`;
  else if (blocoDet) html += `<div class="msg assistente parcial ${gpt ? 'gpt' : ''}">${quem}${nota ? htmlNota(nota) : ''}${blocoDet}</div>`;
  for (const c of rodada) if (c.de === 'erro' || (final < 0 && c.de === 'sistema')) html += `<div class="msg ${c.de}">${esc(c.texto)}</div>`;
  return html;
}
function desenharChat() {
  if (aba !== 'chat' || !EU) return;
  const st = estados.get(EU.pessoa) || {};
  const conv = conversas.find((c) => c.id === conversaAtual);
  const gpt = (conv?.alvo || 'claude') === 'codex', ocupada = convOcupada(conversaAtual);
  if (conv && !$('#gaveta').classList.contains('fechada') && !document.hidden && naoVistas.delete(conv.id)) { salvarAbas(); desenharSeletorConversas(); }
  $('#alvoAtual').className = `alvo ${gpt ? 'gpt' : 'claude'}`; $('#alvoAtual').textContent = gpt ? 'Codex · GPT' : 'Claude';
  const ponte = st.ponte_visto && Date.now() - new Date(st.ponte_visto).getTime() < 150e3;
  $('#estadoPonte').innerHTML = CE.htmlEstado({ st, ponte, ocupada, conv, gpt });
  const msgs = $('#msgs'), noFim = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
  let html = '', rodada = [];
  const fechar = () => { if (rodada.length) html += htmlRodada(rodada, gpt); rodada = []; };
  for (const c of mensagens) {
    if (c.de === 'eu') { fechar(); const s = A.separar(c.texto); html += `<div class="msg eu">${esc(s.texto)}${A.htmlAnexos(s.anexos)}</div>`; continue; }
    rodada.push(c);
  }
  fechar();
  // No chat só as aprovações desta conversa (as do terminal ficam no Resumo).
  const pend = aprovacoes.filter((a) => !lerJson(a.detalhe).origem?.terminal && (!conv || a.conversa_id === conv.id || !a.conversa_id));
  html += pend.map(cartaoAprovacao).join('');
  msgs.innerHTML = html || `<div class="vazio">${conv ? `Conversa “${esc(conv.titulo)}” com ${gpt ? 'o Codex (GPT)' : 'a sua assistente (Claude)'}. Escreva abaixo o que você quer fazer.` : `Oi, ${esc(EU.pessoa)}! Escreva abaixo o que você quer fazer. Cada assunto vira uma conversa; várias podem rodar ao mesmo tempo.`}</div>`;
  ligarAprovacoes(msgs); CE.decorarErros(msgs); if (!DEMO) A.preencher(msgs, R.sb).catch(() => {});
  // "Ir ao fim" com decisões abertas = ir à primeira delas ("Decisão 1 de 4"), não à última.
  const aoFim = () => { const d = msgs.querySelector('.aprovacao:not(.decidida)'); msgs.scrollTop = d ? msgs.scrollTop + d.getBoundingClientRect().top - msgs.getBoundingClientRect().top - 6 : msgs.scrollHeight; };
  if (rolarPendente !== null && chatCarregadoDe === conversaAtual) { if (rolarPendente < 0) colarNoFim(msgs, aoFim); else msgs.scrollTop = rolarPendente; rolarPendente = null; }
  else if (noFim) aoFim();
  $('#estadoPonte').hidden = !$('#estadoPonte').innerHTML.trim();
  // Compositor: "Sobre: X · Alterar" + caixa + Enviar pedido (ou Enviar para a fila, quando ela está ocupada).
  $('#btnEnviar').textContent = ocupada ? 'Enviar para a fila' : 'Enviar';
  marcarTexto();
  const v = visualAba(conv);
  $('#formChat').style.setProperty('--cor-aba', conv ? v.cor : 'var(--borda-clara)');
  $('#cmpSobre').innerHTML = `<span class="cmp-rot">Na conversa:</span> <b class="cmp-conv">${conv ? `${esc(v.icone)} ${esc(v.nome || conv.titulo)}` : 'conversa nova'}</b>${gpt ? '<span class="cmp-quem">Codex</span>' : ''}${chipIa(gpt ? 'codex' : 'claude')}<button type="button" class="cmp-alterar" data-cmp-alterar>Trocar</button>`;
  const fila = $('#cmpFila');
  fila.hidden = !ocupada; fila.innerHTML = ocupada ? '<span>Ela está ocupada: o que você mandar entra na fila e começa depois.</span><button type="button" class="fila-agora" data-fila-agora>Interromper o atual e começar este</button>' : '';
  desenharHudChat();
}
// Interrompe o pedido de uma conversa (usado por "Interromper o atual e começar este").
async function pararConversa(id) {
  if (DEMO) { for (const [k, v] of comandosAbertos) if (v === id) comandosAbertos.delete(k); return; }
  const { error } = await R.parar(temSql2 ? id : null); if (error) throw error;
}
const marcarTexto = () => $('#formChat').classList.toggle('tem-texto', !!$('#entrada').value.trim() || A.temPendentes());
// Passo 2 do percurso: "Pedido recebido" (e se ele foi para a fila).
const avisarRecebido = (naFila) => toast({ titulo: 'Pedido recebido', texto: naFila ? 'Ela termina o pedido atual e começa o seu em seguida. Acompanhe no cartão do pedido.' : 'Acompanhe as etapas no cartão do pedido, no alto da conversa.', cor: '#4fbf82' });
// Marca a aba como ocupada assim que o pedido é aceito (antes do aviso do banco chegar).
const pedidoEnviado = (cmd, destino) => { if (cmd?.id) comandosAbertos.set(cmd.id, destino ?? null); versaoMundo = -1; sincronizarMundo(); desenharSeletorConversas(); };
async function enviarChat() {
  let t = $('#entrada').value.trim();
  if (!t && !A.temPendentes()) return;
  if (A.temPendentes()) {
    if (DEMO) { A.limpar(); A.desenharPendentes($('#anexosPend')); toast({ titulo: 'Anexo', texto: 'No modo demonstração o anexo não sobe.', cor: '#ef6a55' }); if (!t) return; }
    else {
      $('#btnEnviar').disabled = true;
      try { const marcas = await A.subirPendentes(R.sb); t = `${t || 'Veja o anexo.'}\n\n${marcas}`; A.limpar(); A.desenharPendentes($('#anexosPend')); }
      catch (e) { toast({ titulo: 'Não consegui subir o anexo', texto: e.message, cor: '#ef6a55' }); return; }
      finally { $('#btnEnviar').disabled = false; }
    }
  }
  if (temSql2 && !conversaAtual && !DEMO) {
    const c = await R.novaConversa({ titulo: primeiraFrase(A.separar(t).texto, 60), alvo: alvoBarra, projeto: estados.get(EU.pessoa)?.info?.projetos?.[0]?.nome }).catch(() => null);
    if (c) { conversas = [c, ...conversas]; conversaAtual = c.id; chatCarregadoDe = c.id; mensagens = []; cacheMsgs.set(c.id, mensagens); guarda('conversa', c.id); desenharSeletorConversas(); }
  }
  const destino = conversaAtual, lista = mensagens;
  $('#entrada').value = '';
  if (CC.ehCel()) CC.recolher($('#formChat'), $('#entrada'));
  lista.push({ de: 'eu', texto: t, conversa_id: destino });
  const naFila = convOcupada(destino);
  rolarPendente = -1; desenharChat();
  if (DEMO) { comandosAbertos.set(-Date.now(), destino); avisarRecebido(naFila); desenharChat(); desenharSeletorConversas(); return; }
  try { const cmd = await R.pedir(t, temSql2 ? destino : null, iaDe(destino)); pedidoEnviado(cmd, destino); avisarRecebido(naFila); desenharChat(); }
  catch (e) { toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); $('#entrada').value = t; $('#formChat').classList.add('aberto'); const i = lista.findIndex((m) => m.de === 'eu' && m.texto === t && !m.id); if (i >= 0) lista.splice(i, 1); desenharChat(); }
}

// ---------- conversa da dupla (usa a tabela de recados: msg, recado fixado, missão compartilhada, reação) ----------
const RAPIDAS = ['👀 Pode revisar?', '🚀 Subi na main', '📞 Bora call?', '🎧 Tô focado', '☕ Pausa', '✅ Feito!'];
const CORES_FIXADO = { amarelo: '#ffe58a', rosa: '#ffc2d4', azul: '#bfe0ff', verde: '#c8f0c4' };
const REACOES = ['👍', '❤️', '😂', '🔥', '✅', '👀'];
let reagindo = null;
async function mandarRecado(texto, cor) {
  if (DEMO) { recados.unshift({ id: Date.now(), pessoa: EU.pessoa, texto, cor, criado: new Date().toISOString() }); if (cor !== 'reacao' && cor !== 'bola-ok') balaoPessoa(EU.pessoa, cor === 'missao' ? '📎 ' + (lerJson(texto).titulo || '') : CDu.resumoRecado({ cor, texto }) ?? texto); desenharDupla(); return; }
  await R.recado(texto, cor);
}
async function enviarDupla(rapida) {
  const t = (rapida || $('#textoRecado').value).trim();
  if (!t) return;
  try { await mandarRecado(t.slice(0, 500), $('#chkFixar').checked && !rapida ? 'amarelo' : 'msg'); if (!rapida) { $('#textoRecado').value = ''; $('#chkFixar').checked = false; } }
  catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
}
async function compartilharMissao(m) {
  const card = JSON.stringify({ id: m.id, titulo: m.titulo.slice(0, 200), frente: m.frente.id, pessoa: m.pessoa, status: m.status });
  try { await mandarRecado(card, 'missao'); abrirAba('dupla'); toast({ titulo: 'Missão enviada para a dupla', texto: 'Escreva um comentário se quiser.', cor: '#4fbf82' }); setTimeout(() => $('#textoRecado').focus(), 50); }
  catch (err) { toast({ titulo: 'Não enviei', texto: err.message, cor: '#ef6a55' }); }
}
async function reagir(id, emoji) {
  const minha = recados.find((r) => r.cor === 'reacao' && r.pessoa === EU.pessoa && r.texto === `${emoji} ${id}`);
  try {
    if (minha) { if (DEMO) recados = recados.filter((r) => r !== minha); else await R.tirarRecado(minha.id); desenharDupla(); }
    else await mandarRecado(`${emoji} ${id}`, 'reacao');
  } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); }
}
const comMencao = (s) => esc(s).replace(/@(\p{L}+)/gu, '<b class="mencao">@$1</b>');
function desenharDupla() {
  if (aba !== 'dupla' || !EU) return;
  guarda('recadosVistos', Date.now()); for (const el of $$('[data-badge-dupla]')) el.hidden = true; desenharPendencias();
  const fixados = recados.filter((r) => CORES_FIXADO[r.cor]);
  $('#fixados').innerHTML = fixados.length ? `<details class="fixados" ${fixados.length <= 3 ? 'open' : ''}><summary>📌 Recados fixados (${fixados.length})</summary><div class="recados">${fixados.map((r, i) => `<div class="recado" style="--cor:${CORES_FIXADO[r.cor]};--r:${((i * 37) % 5) - 2}deg"><button data-tirar="${r.id}" title="Tirar do mural">×</button>${comMencao(r.texto)}<small>${esc(r.pessoa)} · ${D.ha(new Date(r.criado).getTime())}</small></div>`).join('')}</div></details>` : '';
  const reacoes = new Map();
  for (const r of recados.filter((x) => x.cor === 'reacao')) { const [e, id] = r.texto.split(' '); const k = `${id}`; if (!reacoes.has(k)) reacoes.set(k, new Map()); const m = reacoes.get(k); if (!m.has(e)) m.set(e, []); m.get(e).push(r.pessoa); }
  const msgs = recados.filter((r) => r.cor === 'msg' || r.cor === 'missao').slice().sort((a, b) => new Date(a.criado) - new Date(b.criado));
  const el = $('#msgsDupla'), noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  let html = '', diaAnt = '';
  for (const r of msgs) {
    const dia = new Date(r.criado).toDateString();
    if (dia !== diaAnt) { diaAnt = dia; html += `<div class="sep-dia">${dia === new Date().toDateString() ? 'Hoje' : new Date(r.criado).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>`; }
    const eu = r.pessoa === EU.pessoa;
    let corpo;
    if (r.cor === 'missao') {
      const c = lerJson(r.texto), f = frentePorId(c.frente) || frente('genesis', 'criacao'), existe = D.missoes().some((m) => m.id === c.id);
      corpo = `<button class="card-missao" data-abrir-missao="${esc(c.id || '')}" ${existe ? '' : 'disabled'} style="--cor:${f.cor}"><span class="cm-f">${f.icone} ${esc(f.nome)} · missão de ${esc(c.pessoa || '?')}</span><b>${esc(c.titulo || 'Missão')}</b><span class="cm-a">${existe ? 'Abrir a missão ›' : 'missão antiga (carregue no Histórico)'}</span></button>`;
    } else corpo = `<span class="txt">${comMencao(r.texto)}</span>`;
    const rs = reacoes.get(String(r.id));
    html += `<div class="bolha ${eu ? 'eu' : ''}" data-id="${r.id}" style="--cor:${corPessoa(r.pessoa)}">${eu ? '' : `<span class="quem">${esc(r.pessoa)}</span>`}${corpo}<span class="hora">${D.hora(new Date(r.criado).getTime())}</span>${rs ? `<div class="reacoes">${[...rs].map(([e, ps]) => `<button data-reagir="${esc(e)}" class="${ps.includes(EU.pessoa) ? 'minha' : ''}" title="${esc(ps.join(', '))}">${esc(e)} ${ps.length}</button>`).join('')}</div>` : ''}${reagindo === r.id ? `<div class="reacoes escolher">${REACOES.map((e) => `<button data-reagir="${e}">${e}</button>`).join('')}</div>` : ''}</div>`;}
  el.innerHTML = html || `<div class="vazio">Aqui é a conversa entre você e ${esc(outraPessoa() || 'a dupla')}. Mande um oi, use as respostas rápidas ou compartilhe uma missão (botão "Mandar para a dupla" dentro de cada missão).</div>`;
  if (noFim || !el.dataset.rolou) { el.scrollTop = el.scrollHeight; el.dataset.rolou = '1'; }
  el.onclick = (e) => {
    const am = e.target.closest('[data-abrir-missao]'); if (am) { abrirMissao(am.dataset.abrirMissao); return; }
    const rb = e.target.closest('[data-reagir]'); if (rb) { reagindo = null; reagir(Number(rb.closest('[data-id]').dataset.id), rb.dataset.reagir); return; }
    const b = e.target.closest('.bolha'); if (b) { const id = Number(b.dataset.id); reagindo = reagindo === id ? null : id; desenharDupla(); }
  };
  CDu.desenhar();
  $('#fixados').onclick = async (e) => { const b = e.target.closest('[data-tirar]'); if (b) { if (DEMO) { recados = recados.filter((r) => r.id !== Number(b.dataset.tirar)); desenharDupla(); } else await R.tirarRecado(Number(b.dataset.tirar)); } };
}

// ---------- quem é quem: o catálogo de agentes, skills, conectores e plugins ----------
let pessoaCatalogo = null;
// ======================= Barra de comando (um lugar só para pedir: Claude ou Codex) =======================
// Fica embaixo do mapa e das outras telas (some quando o painel do chat está aberto: lá a caixa fica embaixo
// da conversa). Manda para a aba aberta (ou a mais recente do alvo escolhido, ou uma nova com o "+")
// e mostra para qual aba vai, com a cor e o nome dela.
let alvoBarra = guardado('alvoBarra', 'claude') === 'codex' ? 'codex' : 'claude', novaNaBarra = false, projetoBarra = null;
function desenharBarra() {
  const f = $('#barraComando'); if (!f || !EU) return;
  $$('#bcAlvo [data-alvo]').forEach((b) => b.classList.toggle('on', b.dataset.alvo === alvoBarra));
  f.classList.toggle('gpt', alvoBarra === 'codex');
  const st = estados.get(EU.pessoa) || {}, ligado = pcLigado(EU.pessoa);
  const conv = conversaDaBarra();
  const ocupada = !!conv && convOcupada(conv.id);
  const [cor, txt] = CE.estadoBarra({ st, ligado, ocupada, alvo: alvoBarra });
  const v = visualAba(conv);
  // "Sobre: X · Alterar": para onde o pedido vai, numa linha; Alterar abre as Opções.
  $('#bcSobre').innerHTML = `<span class="cmp-rot">Na conversa:</span> <b class="cmp-conv">${conv ? `${esc(v.icone)} ${esc(v.nome || conv.titulo)}` : 'conversa nova'}</b>${alvoBarra === 'codex' ? '<span class="cmp-quem">Codex</span>' : ''}${chipIa(alvoBarra)}<button type="button" class="cmp-alterar" data-bc-alterar>Trocar</button>`;
  // Modelo e esforço (comando-ia.js): só regrava se mudou, para não fechar um <select> aberto.
  const ia = CI.htmlSelects(alvoBarra);
  if ($('#bcIa').dataset.html !== ia) { $('#bcIa').innerHTML = ia; $('#bcIa').dataset.html = ia; }
  // Estado só quando foge do normal (ocupada, PC desligado, login, limite).
  const normal = cor === '#4fbf82';
  $('#bcEstado').hidden = normal;
  $('#bcEstado').innerHTML = normal ? '' : `<i style="--cor:${cor}"></i><span>${esc(txt)}${ocupada ? '<button type="button" class="fila-agora" data-fila-agora>Interromper o atual e começar este</button>' : ''}</span>`;
  $('#bcEnviar').textContent = ocupada ? 'Enviar para a fila' : 'Enviar pedido';
  $('#bcContinuar').innerHTML = conv ? `Continuar <small>${esc(v.nome || conv.titulo)}</small>` : 'Continuar <small>nenhuma ainda</small>';
  $('#bcContinuar').disabled = !ultimaDoAlvo(alvoBarra) && !conversas.some((c) => c.id === conversaAtual && c.alvo === alvoBarra);
  $('#bcContinuar').classList.toggle('on', !novaNaBarra && !!conv);
  $('#bcProjeto').innerHTML = CB.htmlProjeto(conv);
  f.style.setProperty('--cor-aba', conv ? v.cor : '');
  $('#bcNova').classList.toggle('on', novaNaBarra || !conv);
}
// Modelo/esforço escolhidos para a IA da conversa (linha escondida para a ponte) e o chip "Opus · alto".
const iaDe = (convId) => CI.cabecalho(conversas.find((c) => c.id === convId)?.alvo || 'claude');
const chipIa = (alvo) => { const r = CI.rotulo(alvo); return r ? `<span class="cmp-quem cmp-ia" title="Modelo e esforço (troque em Opções ou em Novo pedido > Detalhes)">${esc(r)}</span>` : ''; };
const ultimaDoAlvo = (alvo) => [...conversas].filter((c) => c.alvo === alvo).sort((a, b) => new Date(b.atualizado) - new Date(a.atualizado))[0] || null;
let convForcada = null; // "Continuar" escolhido no Novo pedido
function conversaDaBarra() {
  if (convForcada != null) return conversas.find((c) => c.id === convForcada) || null;
  if (novaNaBarra) return null;
  const aberta = conversas.find((c) => c.id === conversaAtual);
  return aberta && aberta.alvo === alvoBarra ? aberta : ultimaDoAlvo(alvoBarra);
}
let enviandoBarra = false;
// abrir: false = quem chamou mostra o resultado (o painel Novo pedido); o chat não abre por cima.
async function enviarBarra({ abrir = true } = {}) {
  const caixa = $('#bcTexto'), texto = caixa.value.trim();
  if (!texto || enviandoBarra) return null;     // um envio por vez (Enter duplo não cria duas conversas)
  enviandoBarra = true; $('#bcEnviar').disabled = true;
  let enviado = false, res = null;
  try {
    let conv = null;
    if (temSql2) {
      conv = conversaDaBarra();
      if (!conv && !DEMO) {
        conv = await R.novaConversa({ titulo: primeiraFrase(texto, 60), alvo: alvoBarra, projeto: projetoBarra || CB.projetoNovo() || null });
        conversas = [conv, ...conversas];
      } else if (!conv && DEMO) { conv = { id: Date.now(), titulo: primeiraFrase(texto, 60), alvo: alvoBarra, projeto: projetoBarra || CB.projetoNovo(), atualizado: new Date().toISOString() }; conversas = [conv, ...conversas]; cacheMsgs.set(conv.id, []); }
    }
    const destino = conv?.id ?? null;           // capturado AGORA: trocar de conversa no meio não muda o destino
    const naFila = convOcupada(destino);
    novaNaBarra = false; projetoBarra = null; convForcada = null; mostrarOpcoesBarra(false);
    caixa.value = ''; caixa.style.height = '';
    if (abrir) {
      fecharEquipeVista(); fecharQuadro();
      if (destino !== conversaAtual) await abrirConversa(destino);
      abrirAba('chat'); abrirBarraCel(false);    // abre o painel mesmo se ele estava fechado (celular)
    }
    if (conversaAtual === destino) { mensagens.push({ de: 'eu', texto, conversa_id: destino }); desenharChat(); }
    else (cacheMsgs.get(destino))?.push({ de: 'eu', texto, conversa_id: destino });
    const cmd = DEMO ? null : await R.pedir(texto, temSql2 ? destino : null, CI.cabecalho(conv?.alvo || alvoBarra));
    enviado = true;
    if (DEMO) comandosAbertos.set(-Date.now(), destino);
    pedidoEnviado(cmd, destino);
    if (abrir) avisarRecebido(naFila);
    if (conv) { conv.atualizado = new Date().toISOString(); conversas = [conv, ...conversas.filter((c) => c.id !== conv.id)]; desenharSeletorConversas(); }
    const st = estados.get(EU.pessoa) || {};
    res = { conv, naFila, ligado: pcLigado(EU.pessoa), pausada: !!st.pausado };
  } catch (e) {
    if (!enviado) { caixa.value = texto; const i = mensagens.findIndex((m) => m.de === 'eu' && m.texto === texto && !m.id); if (i >= 0) mensagens.splice(i, 1); desenharChat(); }
    if (!abrir) { enviandoBarra = false; $('#bcEnviar').disabled = false; caixa.value = ''; throw e; }
    toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' });
  } finally { enviandoBarra = false; $('#bcEnviar').disabled = false; }
  desenharChat(); desenharBarra();
  return res;
}
// Novo pedido (comando-pedido.js): manda pela mesma máquina da barra, sem abrir o chat por cima.
async function criarPedido({ texto, alvo = 'claude', convId = null, projeto = null }) {
  alvoBarra = alvo === 'codex' ? 'codex' : 'claude'; guarda('alvoBarra', alvoBarra);
  convForcada = convId; novaNaBarra = convId == null; projetoBarra = projeto || null;
  $('#bcTexto').value = texto;
  const r = await enviarBarra({ abrir: false });
  if (!r) throw new Error('O pedido não saiu. Tente de novo.');
  return r;
}
// "Acompanhar pedido": abre a conversa onde ele está (com o cartão do pedido no alto).
async function acompanharPedido(convId) { fecharEquipeVista(); fecharQuadro(); if (convId != null && convId !== conversaAtual) await abrirConversa(convId); abrirAba('chat'); }
// Estado que importa antes de mandar (PC desligado, pausa, login, fila), em uma frase; '' quando está tudo normal.
function estadoPedido({ alvo = 'claude', convId = null }) {
  const st = estados.get(EU.pessoa) || {}, ocupada = convId != null && convOcupada(convId);
  const [cor, txt] = CE.estadoBarra({ st, ligado: pcLigado(EU.pessoa), ocupada, alvo });
  return cor === '#4fbf82' ? '' : txt === 'pausada' ? 'Sua assistente está pausada: o pedido espera você tirar a pausa.' : txt === 'PC desligado: espera a ponte' ? 'Seu PC está desligado: o pedido fica guardado e começa quando ele ligar.' : txt;
}
function abrirBarraCel(abrir) {
  document.body.classList.toggle('bc-aberta', !!abrir);
  if (abrir) $('#bcTexto').focus(); else mostrarOpcoesBarra(false);
}
// Opções do pedido (quem faz, conversa, projeto): recolhidas; o pedido em si é só escrever e enviar.
function mostrarOpcoesBarra(abrir) {
  const op = $('#bcOpcoes'); if (!op) return;
  op.hidden = !abrir; $('#bcOpcoesBtn').setAttribute('aria-expanded', !!abrir);
  $('#bcOpcoesBtn').classList.toggle('on', !!abrir);
  $('#barraComando').classList.toggle('com-opcoes', !!abrir);
}
// O que está no meio da tela (mapa, quadro ou equipe) vai para o <body>: o CSS esconde o que é só do mapa.
function ligarVistaNoBody() {
  const marcar = () => { document.body.dataset.vista = !$('#equipeVista').hidden ? 'equipe' : !$('#quadro').hidden ? 'quadro' : 'mapa'; };
  const obs = new MutationObserver(marcar);
  for (const el of [$('#equipeVista'), $('#quadro')]) obs.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  marcar();
}
function ligarBarra() {
  const f = $('#barraComando'); if (!f) return;
  f.onsubmit = (e) => { e.preventDefault(); enviarBarra(); };
  $('#bcTexto').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarBarra(); } };
  $('#bcTexto').oninput = (e) => { const t = e.target; t.style.height = ''; t.style.height = Math.min(t.scrollHeight, 132) + 'px'; };
  $('#bcAlvo').onclick = (e) => {
    const b = e.target.closest('[data-alvo]'); if (!b) return;
    alvoBarra = b.dataset.alvo; guarda('alvoBarra', alvoBarra);
    if (aba === 'chat' && !$('#gaveta').classList.contains('fechada')) { const c = ultimaDoAlvo(alvoBarra); if (c && c.id !== conversaAtual) abrirConversa(c.id); }
    desenharBarra(); $('#bcTexto').focus();
  };
  $('#bcNova').onclick = () => { novaNaBarra = true; desenharBarra(); };
  $('#bcContinuar').onclick = () => { novaNaBarra = false; desenharBarra(); };
  $('#bcOpcoesBtn').onclick = () => mostrarOpcoesBarra($('#bcOpcoes').hidden);
  $('#bcSobre').onclick = (e) => { if (e.target.closest('[data-bc-alterar]')) mostrarOpcoesBarra(true); };
  // Ocupada: em vez de esperar na fila, dá para interromper o pedido atual e começar este agora.
  $('#bcEstado').onclick = async (e) => {
    if (!e.target.closest('[data-fila-agora]')) return;
    if (!$('#bcTexto').value.trim()) { toast({ titulo: 'Escreva o pedido primeiro', texto: 'Depois toque de novo para interromper o atual e começar este.', cor: '#ffd23f' }); $('#bcTexto').focus(); return; }
    try { await pararConversa(conversaDaBarra()?.id ?? null); await enviarBarra(); } catch (err) { toast({ titulo: 'Não consegui interromper', texto: err.message, cor: '#ef6a55' }); }
  };
  // No celular a barra some quando a gaveta (tela cheia) está aberta: lá já tem a caixa da conversa.
  new MutationObserver(() => { document.body.classList.toggle('gaveta-aberta', !$('#gaveta').classList.contains('fechada')); marcarChatAberto(); }).observe($('#gaveta'), { attributes: true, attributeFilter: ['class'] });
  document.body.classList.toggle('gaveta-aberta', !$('#gaveta').classList.contains('fechada'));
  // Celular: a barra fica recolhida no botão "Pedir algo" e abre por cima do mapa só quando a pessoa quer pedir.
  $('#bcAbrir').onclick = () => NP.abrirNovoPedido({});
  // "＋ Novo pedido" em qualquer tela (Conversas, Dupla…): o mesmo painel.
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-novo-pedido]'); if (b) NP.abrirNovoPedido({ para: b.dataset.novoPedido || 'eu' }); });
  $('#bcFechar').onclick = () => abrirBarraCel(false);
  $('#tela').addEventListener('pointerdown', () => { if (!$('#bcTexto').value.trim()) abrirBarraCel(false); });
  CB.ligarProjeto(f);
  CI.ligar($('#bcIa'), () => { desenharBarra(); if (aba === 'chat') desenharChat(); });
  desenharBarra();
}
// Frente "comando e coordenação" (js/comando-*.js): o que os módulos podem ler e fazer.
function ligarComandoNoApp() {
  ligarComando({
    eu: () => EU, estado: (p) => estados.get(p), outra: () => outraPessoa(), corPessoa, retrato: retratoDe,
    presente: (p) => presentes.get(p), pcLigado, recados: () => recados, marcos: () => marcos, marcoDaMissao,
    conversaDaBarra, toast, abrirAba, abrirMissao, abrirMarco,
    ultimoPedido: () => mensagens.filter((m) => m.de === 'eu').at(-1)?.texto || '',
    enviarNoChat: (t) => { $('#entrada').value = t; return enviarChat(); },
    // Fora da conversa aberta, "preencher" abre o mesmo painel Novo pedido já com o texto.
    preencher: (t) => { const chat = aba === 'chat' && !$('#gaveta').classList.contains('fechada'); if (!chat) return NP.abrirNovoPedido({ texto: t }); const cx = $('#entrada'); cx.value = t; CC.abrir($('#formChat'), cx); cx.focus(); cx.dispatchEvent(new Event('input')); },
    novoPedido: (o) => NP.abrirNovoPedido(o), criarPedido, acompanharPedido, estadoPedido, conversas: () => conversas,
    projetoPadrao: () => CB.projetoNovo(), redesenharTopo: () => desenharTopo(),
    // Pede pela barra: alvo (claude/codex), conversa nova (com projeto) ou a do alvo.
    pedirNaBarra: (t, alvo, { nova = false } = {}) => { alvoBarra = alvo === 'codex' ? 'codex' : 'claude'; guarda('alvoBarra', alvoBarra); novaNaBarra = !!nova; $('#bcTexto').value = t; return enviarBarra(); },
    setNova: (v) => { novaNaBarra = !!v; }, desenharBarra,
    mudarAlvo: (a) => { alvoBarra = a; guarda('alvoBarra', a); desenharBarra(); abrirChatCom(a); },
    novaConversa: () => novaAbaDireto(),
    tirarPausa: async () => { if (DEMO) { const st = estados.get(EU.pessoa); if (st) st.pausado = false; } else await R.pausar(false); desenharChat(); desenharBarra(); },
    parar: () => {
      if (DEMO) { for (const [k, v] of comandosAbertos) if (v === conversaAtual) comandosAbertos.delete(k); desenharChat(); desenharBarra(); desenharSeletorConversas(); return toast({ titulo: 'Parei esta conversa', cor: '#f0973d' }); }
      R.parar(temSql2 ? conversaAtual : null).then(({ error }) => toast(error ? { titulo: 'Não consegui parar', texto: error.message, cor: '#ef6a55' } : { titulo: 'Pedi para parar', texto: 'A ponte para esta conversa em alguns segundos.', cor: '#f0973d' }));
    },
    mandarRecado, tirarRecado: async (r) => { if (DEMO) recados = recados.filter((x) => x !== r); else await R.tirarRecado(r.id); },
    abrirBola: (o) => CDu.abrirBola(o), abrirAutorizacoes, redesenharPedido: () => desenharHudChat(),
    // Página do pedido (pedido-pagina.js): ler um pedido inteiro e agir nele.
    abrirPedidoPagina: (r) => { fecharEquipeVista(); fecharQuadro(); PP.abrir(r); }, conversaAtual: () => conversaAtual,
    missaoDaConversa, convDaMissao: (m) => (m?.pessoa === EU.pessoa ? conversaDaSessao(m.sessao) : null) || null,
    mensagensDe: (id) => (id === conversaAtual ? mensagens : cacheMsgs.get(id)) || [], convOcupada,
    carregarMsgs: async (ids) => { if (DEMO) return; for (const id of ids) if (id != null && id !== conversaAtual && !cacheMsgs.has(id)) { try { cacheMsgs.set(id, await R.carregarChat(id)); } catch {} } },
    filaDe: (id) => Math.max(0, [...comandosAbertos.values()].filter((x) => x === id).length - 1),
    aprovacoesDe: (id) => aprovacoes.filter((a) => a.conversa_id === id && !lerJson(a.detalhe).origem?.terminal),
    pendDe: (id) => aprovacoes.filter((a) => a.conversa_id === id && !lerJson(a.detalhe).origem?.terminal).reduce((s, a) => s + CA.nDecisoes(a) - Object.keys(escolhasAprov.get(a.id) || {}).length, 0),
    cartaoAprovacao, ligarAprovacoes, visualAba, urlsMiniaturas: (l) => R.urlsMiniaturas(l), abrirMidia,
    responderPedido: async (id, t) => { const naFila = convOcupada(id); await mandarNaConversa(t, id); const c = conversas.find((x) => x.id === id); if (c) c.atualizado = new Date().toISOString(); avisarRecebido(naFila); desenharSeletorConversas(); agendarInterface(); },
    pararPedido: async (id) => { await pararConversa(id); desenharSeletorConversas(); agendarInterface(); },
  });
  CE.ligarAcoes($('#estadoPonte')); CE.ligarAcoes($('#msgs'));
  CP.ligarAgora($('#hudChat'), () => missaoDaConversa(conversas.find((c) => c.id === conversaAtual)));
  CDu.desenhar();
}

// ======================= HUD de escalação (quem a assistente chamou, ao vivo) =======================
// A assistente declara a escalação (escritorio/escalar.mjs); o que entra em campo de verdade também aparece.
// Estados: na escalação (planejado) → trabalhando → pronto. "novo" = algo que ela vai criar porque faltava.
const ICONE_TIPO_ESC = { agente: '🤖', skill: '📘', conector: '🔌', programa: '🛠️', plugin: '📦', assistente: '👑', ia: '🧠' };
const ROT_EST = { planejado: ['○', 'na escalação'], trabalhando: ['●', 'trabalhando'], semsinal: ['?', 'sem sinal'], pronto: ['✓', 'entregou'], usado: ['◇', 'aberta'], erro: ['×', 'deu erro'] };
const nomeBonito = (tipo, nome) => tipo === 'agente' ? tituloDe(nome) : tipo === 'conector' ? nomeConector(nome) : nome;
async function htmlEscalacao(m, { compacto = false, mapa = false } = {}) {
  const itens = D.escalacao(m);
  if (!itens.length) return compacto ? '' : '<div class="esc vazia">A escalação aparece aqui quando a assistente começar: ela diz quem vai chamar, quais skills vai usar e por quê.</div>';
  const linhas = await Promise.all(itens.map(async (x) => {
    const [g, r] = ROT_EST[x.estado] || ROT_EST.planejado;
    const rosto = x.tipo === 'agente' || x.tipo === 'programa' ? `<img src="${await retratoDe(x.nome)}" alt="">` : `<span class="esc-ic">${ICONE_TIPO_ESC[x.tipo] || '•'}</span>`;
    const selo = x.novo ? `<span class="selo-novo">${x.criado ? '✨ criado' : '✨ novo'}</span>` : '';
    const fora = !x.planejado && !compacto && (m.plano || []).length ? '<span class="fora-plano" title="Entrou sem estar na escalação">extra</span>' : '';
    return `<div class="esc-it est-${x.estado}" data-esc-tipo="${esc(x.tipo)}" data-esc-nome="${esc(x.nome)}" title="${esc(x.por || '')}">${rosto}<div class="esc-txt"><b>${esc(nomeBonito(x.tipo, x.nome))}</b>${selo}${fora}${x.por ? `<small>${esc(x.por)}</small>` : ''}</div><i>${g}<span> ${r}</span></i></div>`;
  }));
  const n = (...e) => itens.filter((x) => e.includes(x.estado)).length;
  // Placar honesto: só agente/programa que entregou de verdade conta como entrega (skill aberta não é entrega).
  const placar = [n('trabalhando') && `<em class="t">${n('trabalhando')} trabalhando</em>`, n('semsinal') && `<em class="s">${n('semsinal')} sem sinal</em>`, n('pronto') && `<em class="p">${n('pronto')} entregou</em>`, n('erro') && `<em class="e">${n('erro')} erro</em>`, n('planejado') && `<em>${n('planejado')} na fila</em>`].filter(Boolean).join('');
  return `<div class="esc ${compacto ? 'compacta' : ''}" data-missao="${esc(m.id)}">
    <div class="esc-cab"><span class="esc-rei">${mapa ? '👑' : ico('equipe')}</span><div class="esc-tit"><b>${mapa ? 'Escalação' : 'Equipe deste pedido'}${m.pessoa !== EU.pessoa ? ' · ' + esc(m.pessoa) : ''} ${glo('escalação')}</b><small>${esc(primeiraFrase(m.titulo, 80))}</small></div><span class="esc-placar">${placar}</span>${mapa ? `<button class="esc-abrir" data-abrir-missao="${esc(m.id)}" title="Abrir a missão">›</button><button class="esc-recolher" title="Recolher">${hudFechado ? '▴' : '▾'}</button>` : ''}</div>
    <div class="esc-arvore">${linhas.join('')}</div></div>`;
}
let hudFechado = guardado('hudFechado', '1') === '1'; // começa recolhido num chip (o mapa fica livre); tocar abre
function ligarEscalacao(el) {
  if (!el || el.dataset.escLigado) return;
  el.dataset.escLigado = '1';
  el.addEventListener('click', (e) => {
    if (e.target.closest('.esc-recolher')) { hudFechado = !hudFechado; guarda('hudFechado', hudFechado ? '1' : ''); desenharHudMapa(); return; }
    const am = e.target.closest('.esc-abrir'); if (am) { abrirMissao(am.dataset.abrirMissao); return; }
    const it = e.target.closest('[data-esc-nome]');
    if (it) { const t = it.dataset.escTipo, n = it.dataset.escNome; abrirItem(n === 'Codex' ? 'ia' : t, n); return; }
    const cab = e.target.closest('.esc-cab'), box = e.target.closest('[data-missao]');
    if (cab && box && !box.closest('#detalheMissao')) abrirMissao(box.dataset.missao);
  });
}
// Missão da conversa aberta no chat (pela sessão do Claude que a conversa guarda).
function missaoDaConversa(conv) {
  if (!conv?.sessao || conv.alvo === 'codex') return null;
  return D.missoes().find((m) => m.pessoa === EU.pessoa && m.sessao && String(conv.sessao).startsWith(m.sessao)) || null;
}
async function desenharHudChat() {
  const el = $('#hudChat'); if (!el || !EU) return;
  desenharJanelaChat();
  const conv = conversas.find((c) => c.id === conversaAtual), m = missaoDaConversa(conv), ocupada = convOcupada(conversaAtual);
  // Pendências desta conversa entram no mesmo cartão (com um resumo humano do que ela quer fazer).
  const daConv = aprovacoes.filter((a) => !lerJson(a.detalhe).origem?.terminal && conv && a.conversa_id === conv.id);
  const pend = daConv.flatMap((a) => { const ja = escolhasAprov.get(a.id) || {}; return CA.explicar(a, infoAprovacao(a)).acoes.map((y, i) => ({ id: a.id, titulo: y.t, i, q: Q.ehQuestionario(a) })).filter((x) => ja[x.i] == null); });
  const totalDec = daConv.reduce((s, a) => s + CA.nDecisoes(a), 0);
  const fila = Math.max(0, [...comandosAbertos.values()].filter((id) => id === conversaAtual).length - 1);
  const pedido = mensagens.filter((x) => x.de === 'eu').at(-1)?.texto || '';
  const html = CP.htmlAgora({ m, conv, ocupada, pend, totalDec, fila, pedido, titulo: conv ? visualAba(conv).nome : '', escalacaoHtml: m && (ocupada || !m.fim) ? await htmlEscalacao(m, { compacto: true }) : '' });
  if (!html) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false; el.innerHTML = html;
}
// Abre o pedido: a conversa onde ele nasceu (com o cartão) ou, se veio do terminal, o passo a passo.
function abrirPedido(id) {
  const m = D.missoes().find((x) => x.id === id);
  const c = m?.sessao && conversas.find((x) => x.alvo !== 'codex' && x.sessao && String(x.sessao).startsWith(m.sessao));
  if (c || m) { fecharEquipeVista(); fecharQuadro(); PP.abrir(c ? { conv: c.id } : { missao: m.id }); }
}
// Cartão sobre o mapa: a escalação da missão que está rodando (a sua primeiro).
async function desenharHudMapa() {
  const el = $('#hudMapa'); if (!el || !EU) return;
  const ativas = D.missoes().filter((m) => ['trab', 'alerta'].includes(m.status) && (m.plano.length || m.agentes.size));
  const m = ativas.find((x) => x.pessoa === EU.pessoa) || ativas[0];
  if (!m) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false; el.classList.toggle('fechado', hudFechado);
  el.onclick = (e) => { const b = e.target.closest('[data-pedido-abrir]'); if (b) { e.stopPropagation(); abrirPedido(b.dataset.pedidoAbrir); } };
  // Recolhido e é seu: vira o chip do pedido (etapa + pendência); tocar leva ao cartão na conversa.
  if (hudFechado && m.pessoa === EU.pessoa) {
    const conv = conversas.find((x) => x.alvo !== 'codex' && x.sessao && m.sessao && String(x.sessao).startsWith(m.sessao));
    const pend = aprovacoes.filter((a) => conv && a.conversa_id === conv.id).reduce((s, a) => s + CA.nDecisoes(a) - Object.keys(escolhasAprov.get(a.id) || {}).length, 0);
    el.classList.add('pedido');
    const a0 = pend ? aprovacoes.find((a) => conv && a.conversa_id === conv.id) : null;
    el.innerHTML = CP.htmlChipMapa({ m, pend, titulo: conv ? visualAba(conv).nome : '', decisao: a0 ? CA.explicar(a0, infoAprovacao(a0)).acoes[0]?.t : '' });
    return;
  }
  el.classList.remove('pedido');
  el.innerHTML = await htmlEscalacao(m, { compacto: true, mapa: true }) + (ativas.length > 1 && !hudFechado ? `<div class="esc-mais">+${ativas.length - 1} missão(ões) rodando · veja no Resumo</div>` : '');
}

// ======================= Equipe: tudo o que a assistente pode chamar =======================
const TIPO_EQ = TIPOS; // as chaves do código são as mesmas da tela (conector, plugin...)
const ORDEM_EQ = ['assistente', 'agente', 'ia', 'programa', 'conector', 'skill', 'plugin'];
const FILTROS_TIPO_EQ = [['', 'Tudo'], ['agente', '🤖 Agentes'], ['skill', '📘 Skills'], ['conector', '🔌 Conectores'], ['programa', '🛠️ Programas'], ['plugin', '📦 Plugins']];
const DESC_CONECTOR = { PixelLab: 'Gera pixel art, personagens animados, tiles, música e efeitos sonoros (gasta créditos: a assistente pergunta antes).', Blender: 'Controla o Blender: modela, importa e renderiza assets 3D.', Notion: 'Lê e escreve páginas e bancos do Notion.', 'Hugging Face': 'Busca modelos, datasets e Spaces de IA; roda alguns direto (ex.: gerar imagem).', 'Claude Docs': 'Documentos vivos do claude.ai.', 'VS Code': 'Integração com o editor (diagnósticos).' };
const PROGRAMAS_PADRAO = [{ nome: 'Godot', descricao: 'O motor do jogo: abre, roda e testa o Genesis pelo terminal.' }, { nome: 'Render', descricao: 'Remotion: monta e exporta os vídeos a partir de código.' }, { nome: 'Codex', descricao: 'IA da OpenAI (GPT): revisão crítica, nota de vídeo e arte, segunda opinião.' }];
const chaveItem = (tipo, nome) => `${tipo}|${String(tipo === 'conector' ? nomeConector(nome) : nome).toLowerCase()}`;
let filtroPesEq = '', filtroTipoEq = '', buscaEq = '', itemAberto = null;

function itensEquipe() {
  const mapa = new Map();
  const add = (tipo, nome, pessoa, c = {}) => {
    const k = chaveItem(tipo, nome);
    const x = mapa.get(k) || { k, tipo, nome, donos: new Set(), origens: new Set(), descricao: '', falta: new Set() };
    x.donos.add(pessoa);
    if (!x.ficha && c.ficha) { x.ficha = c.ficha; if (c.ficha.papel) x.descricao = c.ficha.papel; }
    if (!x.descricao && c.descricao) x.descricao = descricaoHumana(c.descricao);
    if (!x.modelo && c.modelo && c.modelo !== 'sessão') x.modelo = c.modelo;
    if (c.origem) x.origens.add(c.origem);
    if (c.instalado === false) x.falta.add(pessoa);
    mapa.set(k, x); return x;
  };
  for (const p of pessoas()) {
    const info = estados.get(p)?.info || {};
    add('assistente', 'Assistente', p, { descricao: TIPOS.assistente.explica });
    for (const a of info.agentes || []) add('agente', a.nome, p, a);
    for (const pr of info.programas || PROGRAMAS_PADRAO) add(pr.nome === 'Codex' ? 'ia' : 'programa', pr.nome, p, pr);
    for (const c of info.mcp || []) add('conector', c.nome, p, { ...c, descricao: DESC_CONECTOR[nomeConector(c.nome)] || '' });
    for (const s of info.skills || []) add('skill', s.nome, p, s);
    for (const pl of info.plugins || []) add('plugin', pl.nome, p, pl);
  }
  // quem já apareceu trabalhando mas não está na lista de ninguém (ex.: agente de outra pasta)
  for (const [p, mesas] of D.equipes()) for (const m of mesas.values()) {
    if (m.nome === 'Orquestrador') continue;
    const tipo = tipoDe(m.nome);
    const nome = tipo === 'conector' ? (m.nome === 'HuggingFace' ? 'hf' : m.nome.toLowerCase()) : m.nome;
    add(tipo, nome, p, mapa.has(chaveItem(tipo, nome)) ? {} : { origem: 'visto trabalhando' }); // junta o dono mesmo se já estava na lista de outro
  }
  return [...mapa.values()];
}
// Quais missões (30 dias) usaram cada item: um passe só por todas as missões.
let cacheUsoEq = { v: '' };
function usoEquipe() {
  const v = `${D.versaoAtual()}|${filtroPesEq}`;
  if (cacheUsoEq.v === v) return cacheUsoEq.mapa;
  const mapa = new Map(), desde = Date.now() - 30 * 86400e3;
  for (const m of D.missoes()) {
    if (m.inicio < desde || (filtroPesEq && m.pessoa !== filtroPesEq)) continue;
    const ks = new Set(['assistente|assistente']);
    for (const x of D.escalacao(m)) if (x.estado !== 'planejado') ks.add(chaveItem(x.nome === 'Codex' ? 'ia' : x.tipo, x.nome)); // só o que entrou em campo conta como uso
    for (const k of ks) { if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(m); }
  }
  cacheUsoEq = { v, mapa };
  return mapa;
}
// Estado ao vivo do item (agentes e programas têm mesa; skills/conectores: "em uso" numa missão rodando).
function estadoItem(x) {
  if (['agente', 'programa', 'ia', 'assistente'].includes(x.tipo)) {
    const nome = x.tipo === 'assistente' ? 'Orquestrador' : x.nome;
    let melhor = null;
    for (const p of x.donos) {
      if (filtroPesEq && p !== filtroPesEq) continue;
      const mesa = x.tipo === 'assistente' ? (D.abas().find((a) => a.pessoa === p) || D.mesa(p, nome)) : D.mesa(p, nome);
      if (!mesa?.ult) continue;
      const st = D.estadoDe(mesa);
      if (!melhor || st.ordem < melhor.st.ordem) melhor = { st, mesa, p };
    }
    return melhor;
  }
  const ativa = (usoEquipe().get(x.k) || []).find((m) => m.status === 'trab' || m.status === 'alerta');
  return ativa ? { st: { cls: 'trab', ...D.ESTADOS.trab, rot: 'em uso agora' }, missao: ativa } : null;
}
async function cartaoItem(x) {
  const info = TIPO_EQ[x.tipo], uso = (usoEquipe().get(x.k) || []).length, est = estadoItem(x);
  const rosto = ['agente', 'programa', 'ia', 'assistente'].includes(x.tipo) ? `<img src="${await retratoDe(x.tipo === 'assistente' ? 'Orquestrador' : x.nome)}" alt="">` : `<span class="eq-ic">${info.icone}</span>`;
  const vivo = est && ['trab', 'alerta', 'erro'].includes(est.st.cls);
  return `<button class="eq-card ${vivo ? 'vivo' : ''}" data-item="${esc(x.k)}" style="--cor:${info.cor}">
    ${rosto}<div class="eq-txt"><div class="eq-nome"><b>${esc(nomeBonito(x.tipo, x.nome))}</b>${x.modelo ? `<span class="modelo claude">${esc(/haiku|sonnet|opus|fable/i.exec(x.modelo)?.[0] || x.modelo)}</span>` : ''}</div>
    <p>${esc(x.descricao || info.curta)}</p>
    <div class="eq-rod">${[...x.donos].map((p) => `<span class="eq-dono" style="--cor:${corPessoa(p)}">${esc(p)}</span>`).join('')}<span class="eq-uso ${uso ? '' : 'nunca'}">${uso ? `${uso}× no mês` : 'sem uso no mês'}</span>${est ? `<span class="eq-est" style="--cor:${est.st.cor}"><i>${est.st.glifo}</i>${esc(est.st.rot)}</span>` : ''}</div></div></button>`;
}
function abrirEquipeVista() {
  if ($('#quadro') && !$('#quadro').hidden) { $('#quadro').hidden = true; guarda('quadro', ''); }
  $('#equipeVista').hidden = false; marcarNav(); desenharEquipeVista();
  if (innerWidth <= 760) $('#gaveta').classList.add('fechada');
}
function fecharEquipeVista() { if (!$('#equipeVista').hidden) { $('#equipeVista').hidden = true; marcarNav(); } }
let pendenteEq = false, deNovoEq = false; // se pedirem enquanto desenha, desenha de novo no fim (não perde o filtro)
let abaEq = guardado('abaEq2', 'cargos'); // 'abaEq2': a aba nova (Equipe) abre primeiro, mesmo para quem tinha outra guardada
// "Quem está trabalhando em quê": um cartão por agente ocupado (o que faz, para qual pedido/marco, desde quando).
async function htmlEquipeAgora() {
  const ativos = quemTrabalha();
  const alertas = ativos.filter((a) => a.cls === 'alerta');
  const linha = async ({ m, cls }) => {
    let acao = D.emSegundoPlano(m) ? 'Rodando uma tarefa em segundo plano' : cls === 'semsinal' ? 'Sem sinal há um tempo' : m.ult ? primeiraFrase(frase(m.ult), 90) : 'Pensando…';
    if (cls === 'alerta') acao = acao.replace(/^Quer permissão para:?\s*/i, 'Precisa da sua autorização para: ').replace(/: gerando /, ': gerar ');
    const ms = m.ult?._m, marco = marcoDaMissao(ms);
    const para = marco ? `Marco: ${marco.titulo}` : ms?.titulo ? `Pedido: ${ms.titulo}` : '';
    const desde = m.pedido?.t || m.ult?.t;
    const estado = cls === 'alerta' ? '<span class="eqa-est bloq">Precisa de você</span>' : cls === 'erro' ? '<span class="eqa-est bloq">Deu erro</span>' : cls === 'semsinal' ? '<span class="eqa-est">Sem sinal</span>' : '';
    return `<button class="eqa-card ${cls}" data-k="${esc(m.k)}" title="Ver no mapa e abrir o detalhe">
      <img src="${await retratoDe(m.nome)}" alt="">
      <span class="eqa-txt"><span class="eqa-nome"><b>${esc(tituloAgente(m))}</b><span class="eq-dono" style="--cor:${corPessoa(m.pessoa)}">${esc(m.pessoa)}</span>${estado}</span>
        <span class="eqa-acao">${esc(acao)}</span>
        <span class="eqa-meta">${para ? esc(primeiraFrase(para, 70)) + ' · ' : ''}${desde ? (D.ha(desde) === 'agora' ? 'agora' : 'há ' + D.ha(desde)) : ''}</span>
        ${cls === 'alerta' ? '<span class="btn forte eqa-acao-btn" data-revisar-permissao>Revisar autorização</span>' : ''}</span></button>`;
  };
  if (!ativos.length) return '<div class="eqa-vazio"><b>Ninguém trabalhando agora.</b><p>Quando você pedir algo, a assistente chama os agentes e eles aparecem aqui.</p></div>';
  const resto = ativos.filter((a) => a.cls !== 'alerta');
  return `<p class="eqa-resumo"><b>${esc(CTG.textoAndamento(andamento()))}</b> em andamento${alertas.length ? ` · <span class="bloq">${alertas.length} precisa${alertas.length > 1 ? 'm' : ''} de você</span>` : ''}</p>
    ${alertas.length ? `<h3 class="eqa-sec">Precisa de você</h3><div class="eqa-lista">${(await Promise.all(alertas.map(linha))).join('')}</div>` : ''}
    <h3 class="eqa-sec">Trabalhando</h3><div class="eqa-lista">${(await Promise.all(resto.map(linha))).join('')}</div>
    <p class="eqa-nota">Toque num cartão para ver o agente no mapa. Agentes, skills e conectores ficam em <button type="button" class="link" data-eqaba-ir="catalogo">Catálogo e ajustes</button>.</p>`;
}
async function desenharEquipeVista() {
  if (!EU || $('#equipeVista').hidden) return;
  if (pendenteEq) { deNovoEq = true; return; }
  pendenteEq = true;
  try {
    // Abas: "Quem está trabalhando em quê" (a decisão do dono) primeiro; o catálogo (agentes, skills, conectores…) fica na segunda.
    let abasEq = $('#abasEquipe');
    if (!abasEq) {
      abasEq = document.createElement('div'); abasEq.id = 'abasEquipe'; abasEq.className = 'eq-abas'; abasEq.setAttribute('role', 'tablist');
      $('#equipeVista .eq-topo h2').after(abasEq);
      abasEq.onclick = (e) => { const b = e.target.closest('[data-eqaba]'); if (b) { abaEq = b.dataset.eqaba; guarda('abaEq2', abaEq); desenharEquipeVista(); } };
    }
    abasEq.innerHTML = [['cargos', 'Quem é quem'], ['agora', 'Trabalhando agora'], ['catalogo', 'Catálogo<span class="so-pc"> e ajustes</span>']].map(([id, t]) => `<button role="tab" data-eqaba="${id}" class="${abaEq === id ? 'on' : ''}" aria-selected="${abaEq === id}">${t}</button>`).join('');
    $('#equipeVista').dataset.aba = abaEq;
    if (abaEq === 'agora') { $('#equipeCorpo').innerHTML = await htmlEquipeAgora(); return; }
    if (abaEq === 'cargos') { $('#equipeCorpo').innerHTML = await EQ.htmlCargos({ lista: cargosAgora(), estado: estadoDoCargo, retratoDe, esc, corPessoa, pessoas, andamento: andamento(), eu: EU?.pessoa }); return; }
    const pes = ['', ...pessoas()];
    $('#filtrosEquipe').innerHTML = `<div class="eq-grupo">${pes.map((p) => `<button data-fpes="${esc(p)}" class="${p === filtroPesEq ? 'on' : ''}">${p ? esc(p) : 'Os dois'}</button>`).join('')}</div><div class="eq-grupo">${FILTROS_TIPO_EQ.map(([t, r]) => `<button data-ftipo="${t}" class="${t === filtroTipoEq ? 'on' : ''}">${r}</button>`).join('')}</div>`;
    const q = buscaEq.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const uso = usoEquipe();
    const lista = itensEquipe().filter((x) => (!filtroPesEq || x.donos.has(filtroPesEq)) && (!filtroTipoEq || x.tipo === filtroTipoEq || (filtroTipoEq === 'programa' && x.tipo === 'ia'))
      && (!q || `${x.nome} ${nomeBonito(x.tipo, x.nome)} ${x.descricao}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
    const vivos = lista.filter((x) => { const e = estadoItem(x); return e && ['trab', 'alerta', 'erro'].includes(e.st.cls); }).length;
    let html = `<p class="eq-resumo">${lista.length} itens${vivos ? ` · <b>${vivos} trabalhando agora</b>` : ''} · a assistente escolhe daqui quem chamar em cada pedido (e cria o que faltar).</p>`;
    for (const tipo of ORDEM_EQ) {
      const doTipo = lista.filter((x) => x.tipo === tipo).sort((a, b) => (uso.get(b.k)?.length || 0) - (uso.get(a.k)?.length || 0) || a.nome.localeCompare(b.nome));
      if (!doTipo.length) continue;
      const info = TIPO_EQ[tipo];
      const termo = { agente: 'sub-agente', skill: 'skill' }[tipo];
      html += `<section class="eq-sec" style="--cor:${info.cor}"><h3>${info.icone} ${info.plural} <small>${doTipo.length}</small>${termo ? glo(termo) : ''}</h3><p class="eq-explica">${esc(info.explica)}</p><div class="eq-grade">${(await Promise.all(doTipo.map(cartaoItem))).join('')}</div></section>`;
    }
    $('#equipeCorpo').innerHTML = html + (lista.length ? '' : '<div class="vazio">Nada encontrado.</div>');
  } finally { pendenteEq = false; if (deNovoEq) { deNovoEq = false; desenharEquipeVista(); } }
}
function abrirItem(tipo, nome) { itemAberto = chaveItem(tipo, nome); abrirAba('item', true); }
async function desenharItem() {
  const x = itensEquipe().find((i) => i.k === itemAberto);
  if (!x) { $('#detalheItem').innerHTML = '<div class="vazio">Não achei este item no catálogo de ninguém (a ponte manda a lista quando liga).</div>'; return; }
  const info = TIPO_EQ[x.tipo], ms = (usoEquipe().get(x.k) || []).slice(0, 8), est = estadoItem(x);
  const rosto = ['agente', 'programa', 'ia', 'assistente'].includes(x.tipo) ? `<img class="it-rosto" src="${await retratoDe(x.tipo === 'assistente' ? 'Orquestrador' : x.nome)}" alt="">` : `<span class="it-ic" style="--cor:${info.cor}">${info.icone}</span>`;
  const linhasM = await Promise.all(ms.map(async (m) => { const e = D.escalacao(m).find((y) => chaveItem(y.nome === 'Codex' ? 'ia' : y.tipo, y.nome) === x.k); return `<button class="it-missao" data-abrir-missao="${esc(m.id)}" style="--cor:${m.frente.cor}"><span>${m.frente.icone} ${esc(m.pessoa)} · ${D.ha(m.inicio)}</span><b>${esc(m.titulo)}</b>${e?.por ? `<small>${esc(e.por)}</small>` : ''}</button>`; }));
  $('#detalheItem').innerHTML = `
    <div class="it-cab">${rosto}<div><h3>${esc(nomeBonito(x.tipo, x.nome))}</h3>${etiquetaTipo(x.tipo)}${x.modelo ? ` <span class="modelo claude">${esc(x.modelo)}</span>` : ''}</div></div>
    ${est ? `<div class="estado" style="--cor:${est.st.cor}"><i>${est.st.glifo}</i>${esc(est.st.rot)}${est.mesa?.ult ? ' · ' + esc(primeiraFrase(frase(est.mesa.ult), 90)) : ''}</div>` : ''}
    <p class="it-desc">${esc(x.descricao || info.explica)}</p>
    <div class="it-campos"><span><b>De quem</b>${[...x.donos].map((p) => `<span class="eq-dono" style="--cor:${corPessoa(p)}">${esc(p)}</span>`).join(' ')}</span>
      ${x.ficha?.entrega ? `<span><b>Entrega</b>${esc(x.ficha.entrega)}</span>` : ''}
      ${x.ficha?.nao_faz ? `<span><b>Não faz</b>${esc(x.ficha.nao_faz)}</span>` : ''}
      ${x.origens.size ? `<span><b>Onde está</b>${esc([...x.origens].join(', '))}</span>` : ''}
      ${x.falta.size ? `<span><b>Falta instalar</b>${esc([...x.falta].join(', '))}</span>` : ''}
      <span><b>Uso</b>${ms.length ? `${plural((usoEquipe().get(x.k) || []).length, 'pedido')} no mês` : 'nenhum pedido no mês'}</span></div>
    <p class="it-oque">${esc(info.explica)}</p>
    <div class="linha">${x.tipo !== 'assistente' ? '<button class="btn forte" id="pedirComItem">＋ Novo pedido usando isto</button>' : '<button class="btn forte" id="pedirComItem">✦ Falar com a assistente</button>'}${['agente', 'programa', 'ia'].includes(x.tipo) && est?.p ? '<button class="btn" id="verNoMapa">Ver no mapa</button>' : ''}</div>
    ${linhasM.length ? `<div class="bloco"><h4>Últimas missões</h4>${linhasM.join('')}</div>` : ''}`;
  $('#pedirComItem').onclick = () => pedirCom(x);
  $('#verNoMapa')?.addEventListener('click', () => { fecharEquipeVista(); fecharQuadro(); localizar(`${est.p}|${x.nome}`); });
  $('#detalheItem').onclick = (e) => { const b = e.target.closest('[data-abrir-missao]'); if (b) abrirMissao(b.dataset.abrirMissao); };
}
async function pedirCom(x) {
  const nome = nomeBonito(x.tipo, x.nome);
  const texto = { agente: `Use o agente ${x.nome} para: `, skill: `Use a skill ${x.nome} para: `, conector: `Use o conector ${nome} para: `, programa: `Use o ${nome} para: `, plugin: `Use o plugin ${x.nome} para: `, ia: '', assistente: '' }[x.tipo] || '';
  if (x.tipo === 'assistente') { fecharEquipeVista(); await abrirChatCom('claude'); setTimeout(() => $('#entrada')?.focus(), 120); return; }
  NP.abrirNovoPedido({ texto, alvo: x.tipo === 'ia' ? 'codex' : 'claude' });
}

// ---------- "Mais" (⋯): Diário, Galeria, Ajustes e Ajuda ----------
function desenharMais() {
  const j = jornais.find((x) => x.conteudo);
  const itens = [['quadro', 'quadro', 'Quadro', 'Os marcos do projeto: o que está em andamento e o que vem depois'], ['equipe', 'equipe', 'Equipe', 'Quem é quem: agentes, receitas e ferramentas'], ['limites', 'moeda', 'Limites e custo de IA', 'Quanto já usou do Claude e do ChatGPT: sessão, semana e mês'], ['jornal', 'jornal', 'Diário do Estúdio' + (jornalNovo() ? ' · novo' : ''), j ? j.conteudo.manchete : 'O jornal do dia'], ['galeria', 'imagem', 'Galeria', 'Vídeos e imagens entregues'], ['ajuda', 'ajuda', 'Ajuda', 'Como ler o escritório e os atalhos']];
  $('#listaMais').innerHTML = itens.filter(([id]) => !(innerWidth <= 760 && id === 'equipe')).map(([id, ic, t, d]) => `<button data-ir-aba="${id}"><span class="ic">${ico(ic)}</span><b>${t}</b><small>${d}</small></button>`).join('')
    + '<p class="mais-dica">Perfil, avisos e ajustes ficam no seu nome, no alto da tela.</p>';
  $('#listaMais').onclick = (e) => {
    const b = e.target.closest('[data-ir-aba]'); if (!b) return; const id = b.dataset.irAba;
    if (id === 'jornal') abrirJornal(); else if (id === 'ajuda') abrirAjuda(); else if (id === 'limites') Hoje.abrirEm('custo');
    else if (id === 'quadro' || id === 'equipe') { if (innerWidth <= 760) fecharGaveta(); if (id === 'quadro') { fecharEquipeVista(); abrirQuadro(); } else { fecharQuadro(); abrirEquipeVista(); } marcarNav(); }
    else abrirAba(id, true);
  };
}

// ---------- painel "Agora" (agora.js): o que está rodando de verdade, a fila e o que terminou ----------
let ultAgora = 0;
async function desenharAgora() {
  const el = $('#agoraCorpo'); if (!el || !EU) return;
  ultAgora = Date.now();
  let cmds = [];
  if (DEMO) cmds = [...comandosAbertos].map(([id, conversa_id], i) => ({ id: Math.abs(id), conversa_id, status: i ? 'novo' : 'rodando', texto: 'Pedido de demonstração', criado: new Date().toISOString() }));
  else try { cmds = await R.pedidosRecentes(); } catch (e) { el.innerHTML = `<p class="ag-vazio">Não consegui ler os pedidos agora (${esc(e.message)}).</p>`; return; }
  const st = estados.get(EU.pessoa) || {};
  const conversa = (id) => { const c = conversas.find((x) => x.id === id); return c ? visualAba(c) : { cor: '#888', icone: '💬', nome: id == null ? 'Conversa única' : 'Conversa apagada' }; };
  el.innerHTML = AG.htmlAgora({ cmds, conversa, ha: D.ha, esc, ligado: pcLigado(EU.pessoa), pausada: !!st.pausado, versaoPonte: st.info?.versaoPonte ?? null, agora: Date.now() });
  el.onclick = (e) => {
    const b = e.target.closest('[data-agora-conv]'); if (!b || b.dataset.agoraConv === '') return;
    abrirAba('chat'); abrirConversa(Number(b.dataset.agoraConv));
  };
}
// Selo do botão "Agora": quantos pedidos seus estão rodando ou na fila.
function seloAgora() {
  const n = comandosAbertos.size, b = $('#seloAgora'); if (!b) return;
  b.hidden = !n; b.textContent = n;
}
setInterval(() => { if (aba === 'agora' && !$('#gaveta').classList.contains('fechada') && Date.now() - ultAgora > 14e3) desenharAgora(); }, 15e3);

// ---------- painel "Hoje" (funcoes-hoje.js): sugestões do dia, fila por agente, custo de IA ----------
TITULO_ABA.hoje = 'Sugestões'; NAV_DA_ABA.hoje = 'sugestoes';
// "Mandar" de uma sugestão: vai pela barra de comando, numa conversa nova do alvo e projeto dela.
async function mandarPronto(texto, { alvo, projeto } = {}) {
  const ia = alvo === 'codex' ? 'codex' : alvo === 'claude' ? 'claude' : alvoBarra;
  try {
    const r = await criarPedido({ texto, alvo: ia, projeto });
    NP.mostrarCriado({ titulo: texto, alvo: ia, projeto: r.conv?.projeto || projeto || CB.projetoNovo(), convId: r.conv?.id ?? null, naFila: r.naFila, ligado: r.ligado, pausada: r.pausada });
  } catch (e) { toast({ titulo: 'Não consegui mandar', texto: e.message, cor: '#ef6a55' }); }
}
function ligarHoje() {
  Hoje.ligar({ DEMO, R, esc, toast, retratoDe, nomeAgente, corPessoa, pessoas, mandar: mandarPronto, resumoIr: (q) => MC.irResumo(q),
    contagens: () => { const and = andamento(); return { ...and, fazendo: and.tarefas, esperando: ultPend.alertas, pendencias: ultPend.contagem, pedidos: ultPend.lista || [] }; },
    eu: () => EU, estados: () => estados, marcos: () => marcos, conversas: () => conversas,
    abrir: () => abrirAba('hoje'), aberto: () => aba === 'hoje' && !$('#gaveta').classList.contains('fechada') });
  // HUD de limites de IA (Claude e Codex, sessão e semana) no canto do mapa: limites-hud.js
  LimHud.ligar({ DEMO, esc, corPessoa, retratoDe, pessoas, eu: () => EU, estados: () => estados, abrirEm: (s) => Hoje.abrirEm(s) });
}

// Escritório no celular (mapa-cel.js): visão geral, setores, indicadores e ficha de quem você toca.
function ligarMapaCel() {
  MC.ligar({ mundo: () => mundo, cam: () => cam, zoom: () => zoom, vista: vistaMapa, eu: () => EU, pessoas, retratoDe, nome: nomeBase,
    nomeAgente: (m) => EQ.cargoDe(m.nome, cargosAgora())?.nome || CURTO[m.nome] || tituloAgente(m), quemTrabalha, localizar, abrirAgente, abrirAba,
    abrirChat: (alvo) => abrirChatCom(alvo), pedir: () => abrirBarraCel(true), abrirCargo: abrirCargoNaEquipe, contagens: () => andamento() });
}
// "Ficha do cargo" (cartão do mapa): abre o painel Equipe e leva até o cartão desse cargo.
function abrirCargoNaEquipe(id) {
  if (abaEq !== 'cargos') { abaEq = 'cargos'; guarda('abaEq2', abaEq); }
  EQ.abrirCartao(id); // no celular o cartão já vem aberto
  abrirEquipeVista();
  let n = 0;
  const achar = () => {
    const el = [...document.querySelectorAll('#equipeVista [data-cargo]')].find((x) => x.dataset.cargo === id);
    if (!el) { if (++n < 30) setTimeout(achar, 100); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('cg-foco'); el.focus({ preventScroll: true });
    setTimeout(() => el.classList.remove('cg-foco'), 2600);
  };
  achar();
}

// ---------- jornal ----------
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const jornalNovo = () => { const j = jornais[0]; return !!j?.conteudo && j.dia === hoje() && guardado('jornalLido', '') !== j.dia; };
function desenharManchete() {
  $('#pontoMais').hidden = !jornalNovo();
  if (aba === 'mais') desenharMais();
}
function abrirJornal(dia) {
  const j = (dia ? jornais.find((x) => x.dia === dia) : jornais.find((x) => x.conteudo)) || null;
  $('#edicoesJornal').innerHTML = jornais.filter((x) => x.conteudo).map((x) => `<option value="${x.dia}" ${x === j ? 'selected' : ''}>${new Date(x.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</option>`).join('') || '<option>sem edições</option>';
  const c = j?.conteudo;
  if (!c) {
    $('#conteudoJornal').innerHTML = `<div class="cabeca-jornal"><div class="titulo">Diário do Estúdio</div></div><div class="vazio-j">${temSql2 ? 'A primeira edição sai amanhã cedo (depois das 7h), escrita pela ponte de quem estiver ligado. Ou peça agora no botão abaixo.' : 'Rode o supabase/escritorio-2.sql para ligar o jornal.'}</div>`;
  } else {
    if (j.dia === hoje()) guarda('jornalLido', j.dia);
    const data = new Date(j.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#conteudoJornal').innerHTML = `
      <div class="cabeca-jornal"><div class="titulo">Diário do Estúdio</div><div class="edicao"><span>${esc(data)}</span><span>Edição de ${esc(j.gerado_por || 'alguém')}</span><span>Genesis S/A (fictícia)</span></div></div>
      <h1>${esc(c.manchete)}</h1>${c.linha_fina ? `<p class="fina">${esc(c.linha_fina)}</p>` : ''}
      ${c.numeros?.length ? `<div class="numeros">${c.numeros.map((n) => `<div><b>${esc(n.valor)}</b><span>${esc(n.rotulo)}</span></div>`).join('')}</div>` : ''}
      <div class="colunas">${(c.secoes || []).map((s) => `<section><h3>${esc(s.titulo)}</h3>${(s.itens || []).map((i) => `<h4>${esc(i.titulo)}</h4><p>${esc(i.texto)}</p>`).join('')}</section>`).join('')}
      ${c.fofoca ? `<div class="fofoca"><b>Fofocas da firma</b><p>${esc(c.fofoca)}</p></div>` : ''}
      ${c.previsao ? `<section><h3>Previsão do tempo da empresa</h3><p><i>${esc(c.previsao)}</i></p></section>` : ''}</div>`;
  }
  $('#jornal').hidden = false;
  desenharManchete();
}

// ---------- ajuda e legenda ----------
function abrirAjuda() {
  const est = (c) => `<i style="--cor:${D.ESTADOS[c].cor}">${D.ESTADOS[c].glifo}</i><span><b>${D.ESTADOS[c].rot}</b></span>`;
  $('#conteudoAjuda').innerHTML = `
    <div class="ajuda-col">
      <h3>Quem é quem</h3>
      ${Object.keys(TIPOS).map((k) => `<p>${etiquetaTipo(k)} ${esc(TIPOS[k].curta)}</p>`).join('')}
      <h3>Frentes</h3>
      <p>Dois setores: ${SETORES.map((x) => `${x.icone} <b>${x.nome}</b> (${esc(x.descricao.toLowerCase())})`).join(' e ')}. Dois jogos: ${JOGOS.slice(0, 2).map((j) => `${j.icone} <b>${esc(j.nome)}</b>`).join(' e ')}. Cada missão cai sozinha no jogo e no setor certos.</p><p>No mapa, a ala da esquerda é Criação e a da direita é Marketing; cada fileira é um jogo. <b>Quem está sentado está trabalhando</b>; quem está livre fica na copa. A faixa <b>Agora</b> lista todo mundo que está trabalhando.</p>
      <p>Cada um tem uma sala de vidro com a assistente na recepção. As baias da sua equipe ficam do lado da sua sala.</p>
      <h3>Estados</h3>
      <div class="legenda">${est('alerta')}${est('erro')}${est('trab')}${est('semsinal')}${est('fim')}${est('planejado')}${est('livre')}</div>
      <p>Trabalhando, o boneco digita e a tela do PC anima. Livre, às vezes levanta para tomar café.</p>
      <h3>Onde ver as coisas (a barra)</h3>
      <p><b>🏢 Escritório</b>: o mapa. Clique num boneco para ver o que ele faz.</p>
      <p><b>💬 Conversas</b>: <b>Assistente</b> (uma aba por tarefa, com o Claude ou o Codex; aprovações com Permitir/Negar) e <b>Dupla</b> (vocês dois, com reações e recados fixados).</p>
      <p><b>◷ Atividade</b>: <b>Resumo</b> (precisa de você, travou, rodando, pronto; avisos no celular e modo <b>Estou longe do PC</b>), <b>Missões</b> (cada pedido por frente; abra uma para ver em Escritório, Linha do tempo ou Árvore) e <b>Histórico</b> (por dia).</p>
      <p><b>▥ Quadro</b>: os grandes marcos. <b>🧩 Equipe</b>: quem é quem (agentes, skills, conectores, programas).</p>
      <p><b>⋯ Mais</b>: Diário do Estúdio, Galeria, Ajustes e esta ajuda.</p>
      <p>No topo, sempre à vista: você e o projeto (quadradinho verde = seu PC ligado; toque para perfil e ajustes), o seu parceiro, <b>quantos estão trabalhando</b> e <b>quantas coisas precisam de você</b>. Um ponto laranja em Conversas = resposta que você ainda não viu. O <b>?</b> ao lado de um termo explica o que ele é.</p>
      <h3>Atalhos</h3>
      <p>Clique no chão para andar · <kbd>WASD</kbd> também anda</p>
      <p><kbd>Tab</kbd> equipe · <kbd>H</kbd> missões · <kbd>L</kbd> histórico · <kbd>C</kbd> assistente · <kbd>M</kbd> dupla · <kbd>G</kbd> galeria · <kbd>I</kbd> quem é quem · <kbd>J</kbd> diário · <kbd>?</kbd> esta ajuda</p>
      <p><kbd>+</kbd>/<kbd>−</kbd> zoom · <kbd>Esc</kbd> fecha</p>
    </div>`;
  $('#ajuda').hidden = false;
}

// ---------- ajustes ----------
function desenharAjustes() {
  const st = estados.get(EU.pessoa) || {};
  const notif = 'Notification' in window ? Notification.permission : 'indisponível';
  const info = st.info || {};
  const ligadaPc = pcLigado(EU.pessoa), projetoAtual = st.projeto || info.projetos?.[0]?.nome || 'sem projeto';
  $('#ajustes').innerHTML = `
    <div class="perfil-cab"><img src="${$('#perfilTopo img')?.src || ''}" alt=""><div><b>${esc(EU.pessoa)}</b><small>${esc(EU.email)}</small><span class="pf-linha"><i class="pf-pc ${ligadaPc ? 'on' : 'off'}"></i>Projeto ${esc(projetoAtual)}${st.branch ? ` · branch ${esc(st.branch)}` : ''} · PC ${ligadaPc ? 'ligado' : 'desligado'}</span></div></div>
    <div class="campo"><span>Seu status</span><select id="selStatus"><option value="disponivel">Disponível</option><option value="focado">Focado (não perturbe)</option><option value="ausente">Ausente</option></select></div>
    <div class="campo"><span>Avisos</span>
      <label class="chk"><input type="checkbox" id="chkSom" ${guardado('som', '1') === '1' ? 'checked' : ''}> som quando alguém precisa de você ou termina</label>
      <button class="btn" id="btnNotif" ${notif !== 'default' ? 'disabled' : ''}>${notif === 'granted' ? 'Notificações ligadas ✓' : notif === 'denied' ? 'Notificações bloqueadas no navegador' : 'Ligar notificações do navegador'}</button></div>
    <div class="campo"><span>Emergência</span><button class="btn ${st.pausado ? 'forte' : 'perigo'}" id="btnPausa">${st.pausado ? 'Tirar a pausa da assistente' : 'Pausar a assistente (ninguém manda pedidos)'}</button></div>
    <div class="campo"><span>Sua ponte</span><div class="sub" style="text-align:left">${st.ponte_visto ? `Vista ${D.ha(new Date(st.ponte_visto).getTime())} · projetos: ${esc((info.projetos || []).map((p) => p.nome).join(', ') || '—')} · ffmpeg: ${info.ffmpeg ? 'sim' : 'não'}` : 'Nunca ligada neste login.'}</div><button class="btn" id="btnReiniciarPonte" style="margin-top:6px">Reiniciar ponte</button></div>
    ${info.agentes?.length ? `<div class="campo"><span>Seus agentes</span>${info.agentes.map((a) => `<div class="sub" style="text-align:left;margin:3px 0">${tagModelo(a.nome, EU.pessoa)} <b>${esc(tituloDe(a.nome))}</b></div>`).join('')}</div>` : ''}
    <div class="campo"><span>Convidar</span><form id="formConvite" class="linha" style="margin:0"><input id="emailConvite" type="email" placeholder="email do Kenny" required style="flex:2;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><input id="nomeConvite" placeholder="Nome" value="Kenny" required style="flex:1;min-width:0;background:var(--painel2);color:var(--texto);border:0;box-shadow:inset 0 0 0 2px var(--borda-clara);padding:7px"><button class="btn">Convidar</button></form></div>
    <div class="campo"><span>No iPhone</span><div class="sub" style="text-align:left">Abra o site no Safari › Compartilhar › <b>Adicionar à Tela de Início</b>. Vira um app.</div></div>
    <div class="campo"><span>Atalhos</span><div class="sub" style="text-align:left">WASD/setas anda · Shift skate · clique no chão anda até lá · E fala · Tab equipe · H missões · L histórico · C assistente · M dupla · G galeria · I quem é quem · J diário · Q acena · K vai até o outro · 1–6 emotes · +/− zoom · Esc fecha</div></div>
    <div class="campo"><span>Créditos</span><div class="sub" style="text-align:left">Arte: <a href="https://github.com/pablodelucca/pixel-agents" target="_blank" rel="noopener" style="color:var(--laranja)">Pixel Agents</a> (MIT), personagens baseados em Metro City (JIK-A-4).</div></div>
    <div class="campo"><button class="btn" id="btnSair">Sair</button></div>`;
  $('#selStatus').value = st.status || 'disponivel';
  $('#selStatus').onchange = (e) => R.mudarStatus(e.target.value);
  $('#chkSom').onchange = (e) => guarda('som', e.target.checked ? '1' : '0');
  $('#btnNotif').onclick = async () => { await Notification.requestPermission(); desenharAjustes(); };
  $('#btnPausa').onclick = async () => { try { await R.pausar(!st.pausado); } catch (e) { toast({ titulo: 'Não deu', texto: e.message, cor: '#ef6a55' }); } };
  $('#formConvite').onsubmit = async (e) => { e.preventDefault(); try { await R.convidar($('#emailConvite').value, $('#nomeConvite').value.trim()); toast({ titulo: 'Convite feito', texto: 'Nenhum e-mail é enviado agora. Mande o link do site para a pessoa: ela entra com esse e-mail, recebe o código e já vira membro.', cor: '#4fbf82' }); } catch (err) { toast({ titulo: 'Não deu', texto: err.message, cor: '#ef6a55' }); } };
  $('#btnSair').onclick = async () => { await R.sair(); location.reload(); };
  $('#btnReiniciarPonte').onclick = async () => {
    if (DEMO || !confirm('Reiniciar a ponte? O que estiver rodando para, e ela volta em uns 20 segundos.')) return;
    const { error } = await R.reiniciarPonte();
    toast(error ? { titulo: 'Não consegui pedir', texto: error.message, cor: '#ef6a55' } : { titulo: 'Reiniciando a ponte', texto: 'Recarregue a página em uns 20 segundos.', cor: '#4fbf82' });
  };
}

// ======================= "enquanto você estava fora" =======================
function mostrarResumo() {
  const visto = Number(guardado('visto', '0'));
  guarda('visto', Date.now());
  if (!visto || Date.now() - visto < 20 * 60e3) return;
  const r = D.resumoDesde(visto);
  if (!r.total) return;
  const ms = D.missoes().filter((m) => m.inicio > visto);
  let html = `<p class="sub" style="text-align:left">Desde ${new Date(visto).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}:</p>`;
  for (const [p, x] of r.porPessoa) {
    const itens = [];
    const doP = ms.filter((m) => m.pessoa === p);
    if (doP.length) itens.push(`<li>${plural(doP.length, 'pedido')}: ${doP.slice(0, 3).map((m) => `“${esc(m.pedido.slice(0, 60))}”`).join(', ')}</li>`);
    if (x.alertas.length) itens.push(`<li>⚠ ${plural(x.alertas.length, 'pedido')} de atenção</li>`);
    for (const [ag, e] of x.prontos) itens.push(`<li>✓ <b>${esc(tituloDe(ag))}</b>: ${esc(frase(e).slice(0, 90))}</li>`);
    if (x.erros.length) itens.push(`<li>× ${plural(x.erros.length, 'erro')}, o último em ${esc(tituloDe(x.erros.at(-1).agente))}</li>`);
    if (x.arquivos) itens.push(`<li>${x.arquivos === 1 ? '1 resultado novo' : `${x.arquivos} resultados novos`} na galeria</li>`);
    if (itens.length) html += `<div class="res-pessoa" style="--cor:${corPessoa(p)}"><h3>${esc(p === EU.pessoa ? 'Sua equipe' : 'Equipe de ' + p)}</h3><ul>${itens.slice(0, 9).join('')}</ul></div>`;
  }
  if (jornalNovo()) html += '<p><button class="btn" id="resumoJornal">Ler o Diário de hoje</button></p>';
  $('#textoResumo').innerHTML = html;
  $('#resumo').hidden = false;
  $('#resumoJornal')?.addEventListener('click', () => { $('#resumo').hidden = true; abrirJornal(); });
}

// ======================= modo demonstração (?demo) =======================
async function iniciarDemo() {
  EU = { pessoa: 'Rafael', email: 'demo' };
  membros = [{ pessoa: 'Rafael' }, { pessoa: 'Kenny' }];
  temSql2 = true;
  const ag = Date.now(), ev = (min, pessoa, agente, tipo, texto, extra = {}) => ({ id: Math.random(), t: ag - min * 60e3, pessoa, agente, tipo, texto, sessao: pessoa === 'Rafael' ? 's1' : 's2', projeto: 'genesis-game', ...extra });
  D.adicionar([
    ev(50, 'Rafael', 'Orquestrador', 'inicio', 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex'),
    ev(49.5, 'Rafael', 'Orquestrador', 'escalacao', 'escalou', { plano: { modo: 'plano', itens: [{ tipo: 'agente', nome: 'editor-de-video', por: 'monta o Short no Remotion com cortes no compasso' }, { tipo: 'skill', nome: 'video-do-jogo', por: 'receita de vídeo do Genesis' }, { tipo: 'programa', nome: 'Render', por: 'exporta o vídeo' }, { tipo: 'programa', nome: 'Codex', por: 'dá a nota com folhas de quadros' }, { tipo: 'skill', nome: 'thumbnail-do-short', por: 'não existe receita de capa: vou criar', novo: true }] } }),
    ev(49, 'Rafael', 'Orquestrador', 'atividade', '', { ferramenta: 'Read', alvo: 'shots.json' }),
    ev(48, 'Rafael', 'editor-de-video', 'pedido', 'Orquestrador pediu: montar Short Raio + Fogo', { ref: 'r1', chamou: 'Orquestrador', descricao: 'montar Short Raio + Fogo', prompt: 'Monte o Short "Raio + Fogo = ?" no Remotion (1080x1920, ~19 s).\n\n- Use a trilha do menu (129 BPM) e corte no compasso.\n- Gancho em 2 s: o combo explodindo.\n- Só prints reais do jogo.\n\nDevolva o caminho do vídeo e a lista de cortes.' }),
    ev(47.9, 'Rafael', 'editor-de-video', 'inicio', 'começou', { aid: 'a1', ref: 'r1', chamou: 'Orquestrador', descricao: 'montar Short Raio + Fogo' }),
    ev(40, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Bash', alvo: 'Medir cortes ::: node tools/video/beatgrid.mjs', modo: 'executar' }),
    ev(12, 'Rafael', 'Codex', 'fim', 'Nota 8/10: o corte do compasso 3 atrasa; resto limpo.'),
    ev(5, 'Rafael', 'Orquestrador', 'atividade', '', { ferramenta: 'Write', alvo: 'SKILL.md', modo: 'escrever', arq: '.claude/skills/thumbnail-do-short/SKILL.md' }),
    ev(4, 'Rafael', 'Render', 'inicio', 'Orquestrador: npx remotion render ShortRaioFogo', { ferramenta: 'Bash', alvo: 'npx remotion render ShortRaioFogo' }),
    ev(3, 'Rafael', 'artista-3d', 'alerta', 'pediu permissão: generate_3d', { ferramenta: 'mcp__blender__generate_3d' }),
    ev(2, 'Rafael', 'editor-de-video', 'atividade', '', { aid: 'a1', ferramenta: 'Edit', alvo: 'ShortRaioFogo.tsx', modo: 'escrever' }),
    ev(30, 'Rafael', 'balanceador', 'fim', 'Dragão do Inverno: vida -10%, recarga do sopro 6 s', { relatorio: 'Dragão do Inverno ajustado em `data/enemies.json`:\n- vida -10%\n- recarga do sopro 6 s (era 4,5 s)', uso: { ms: 254000, entrada: 1200, saida: 3400, cacheCriado: 18000, cacheLido: 240000, modelos: ['claude-haiku-4-5'] } }),
    ev(9, 'Kenny', 'Orquestrador', 'inicio', 'Revise o dash do player e rode o teste'),
    ev(8, 'Kenny', 'revisor-godot', 'pedido', 'Orquestrador pediu: revisar player.gd'),
    ev(6, 'Kenny', 'Godot', 'erro', 'SCRIPT ERROR: Invalid call. Nonexistent function "dash" in base "Nil".'),
    ev(1, 'Kenny', 'revisor-godot', 'atividade', '', { ferramenta: 'Read', alvo: 'player.gd', modo: 'ler' }),
    ev(20, 'Kenny', 'explorador', 'fim', 'O dano é calculado em player.gd:strike() e enemy.gd:take_hit()'),
    ev(30, 'Kenny', 'Codex', 'pedido', 'Refatora o sistema de inventário do jogo novo', { origem: 'vscode', sessao: 'cx1', projeto: 'jogo-novo' }),
    ev(22, 'Kenny', 'Codex', 'fim', 'Separei Inventory em InventoryModel e InventoryView; 14 arquivos mudaram.', { origem: 'vscode', sessao: 'cx1', projeto: 'jogo-novo' }),
    ev(47, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Skill', alvo: 'video-do-jogo' }),
    ev(44, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Read', alvo: 'beats.json', modo: 'ler' }),
    ev(43, 'Rafael', 'editor-de-video', 'atividade', '', { ferramenta: 'Read', alvo: 'ShortRaioFogo.tsx', modo: 'ler' }),
    ev(15, 'Kenny', 'Orquestrador', 'inicio', 'Desenha o baú do inventário no PixelLab e coloca na tela', { sessao: 's3', projeto: 'jogo-novo' }),
    ev(14, 'Kenny', 'Orquestrador', 'atividade', '', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'Skill', alvo: 'hud-em-jogo' }),
    ev(13, 'Kenny', 'PixelLab', 'inicio', 'Orquestrador: create_image_pixflux', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'mcp__pixellab__create_image_pixflux', alvo: 'baú de madeira' }),
    ev(11, 'Kenny', 'PixelLab', 'fim', 'Imagem pronta: bau_128.png', { sessao: 's3', projeto: 'jogo-novo' }),
    ev(10, 'Kenny', 'Orquestrador', 'atividade', '', { sessao: 's3', projeto: 'jogo-novo', ferramenta: 'Edit', alvo: 'inventario.tscn', modo: 'escrever' }),
    ev(9.5, 'Kenny', 'Orquestrador', 'espera', 'esperando você', { sessao: 's3', projeto: 'jogo-novo', resposta: 'Baú desenhado (128 px) e colocado no canto da tela de inventário. Abre com a tecla I.' }),
    ev(200, 'Rafael', 'Orquestrador', 'inicio', 'Melhora o escritório: frentes, histórico e conversa da dupla', { sessao: 's4', projeto: 'genesis-estudio' }),
    ev(195, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'WebSearch', alvo: 'agent dashboard workstreams' }),
    ev(180, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'Edit', alvo: 'app.js', modo: 'escrever' }),
    ev(178, 'Rafael', 'Orquestrador', 'atividade', '', { sessao: 's4', projeto: 'genesis-estudio', ferramenta: 'Edit', alvo: 'frentes.js', modo: 'escrever' }),
    ev(170, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's4', projeto: 'genesis-estudio', resposta: 'Pronto: faixa de frentes no mapa, missões agrupadas, histórico por dia e a conversa da dupla.' }),
    ev(1500, 'Rafael', 'Orquestrador', 'inicio', 'Balanceia o Dragão do Inverno no Veterano com os bots', { sessao: 's5' }),
    ev(1490, 'Rafael', 'balanceador', 'pedido', 'Orquestrador pediu: rodar 30 partidas no Veterano', { sessao: 's5' }),
    ev(1480, 'Rafael', 'balanceador', 'atividade', '', { sessao: 's5', ferramenta: 'Bash', alvo: 'Bots jogando ::: godot --headless -s playtest_rodada.gd', modo: 'executar' }),
    ev(1440, 'Rafael', 'balanceador', 'fim', 'Taxa de vitória 38% → 52% com vida -10% e sopro a cada 6 s.', { sessao: 's5' }),
    ev(1438, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's5', resposta: 'Dragão do Inverno ajustado: vitória dos bots subiu de 38% para 52% no Veterano.' }),
  ]);
  estados.set('Rafael', { pessoa: 'Rafael', ponte_visto: new Date().toISOString(), branch: 'gen-186-trailer-v2', projeto: 'genesis-game', info: { projetos: [{ nome: 'genesis-game' }], ffmpeg: true, vapid: 'demo', push: [], longe: false, agentes: [{ nome: 'balanceador', modelo: 'haiku', descricao: 'Ajusta números de gameplay em data/.' }, { nome: 'explorador', modelo: 'haiku', descricao: 'Lê o projeto e responde perguntas sem mexer em nada.' }, { nome: 'revisor-godot', modelo: 'sonnet', descricao: 'Revisa código GDScript antes do commit.' }, { nome: 'editor-de-video', modelo: 'sonnet', descricao: 'Monta Shorts e trailers no Remotion com cortes no compasso.' }],
    skills: [{ nome: 'video-do-jogo', descricao: 'Use quando for gravar, montar ou renderizar um vídeo do Genesis', origem: 'projeto' }, { nome: 'balanceamento-com-bots', descricao: 'Use quando for balancear uma dificuldade com bots jogando', origem: 'projeto' }, { nome: 'hud-em-jogo', descricao: 'Use quando for desenhar ou mudar a HUD dentro da partida', origem: 'projeto' }],
    mcp: [{ nome: 'pixellab', origem: 'pessoal' }, { nome: 'blender', origem: 'pessoal' }, { nome: 'notion', origem: 'projeto' }], plugins: [{ nome: 'claude-code-setup', origem: 'claude-plugins-official', descricao: 'Recomenda automações do Claude Code (hooks, skills, MCP, sub-agentes).' }], programas: [{ nome: 'Godot', descricao: 'O motor do jogo: abre, roda e testa o Genesis pelo terminal.', instalado: true }, { nome: 'Render', descricao: 'Remotion: monta e exporta os vídeos a partir de código.' }, { nome: 'ffmpeg', descricao: 'Corta e converte vídeo e imagem; faz miniaturas.', instalado: true }, { nome: 'Codex', descricao: 'IA da OpenAI (GPT): revisão crítica e nota de vídeo/arte.', instalado: true }],
    equipe: EQ.equipeDemo(['orquestrar', 'wiki-genesis', 'kit-de-classe', 'cartas-de-classe', 'hud-em-jogo', 'balanceamento-com-bots', 'arte-de-menu', 'efeito-em-monstro', 'video-do-jogo', 'remotion-best-practices', 'salvar-vitoria']) } });
  estados.set('Kenny', { pessoa: 'Kenny', ponte_visto: new Date().toISOString(), branch: 'v0.2-loja-classes', projeto: 'genesis-game' });
  const quando = (min) => new Date(ag - min * 60e3).toISOString();
  recados = [
    { id: 1, pessoa: 'Kenny', texto: 'Reunião de sexta: decidir a loja de classes', cor: 'azul', criado: quando(900) },
    { id: 2, pessoa: 'Kenny', texto: 'Subi o fix do dash na main, pode puxar 🙏', cor: 'msg', criado: quando(40) },
    { id: 3, pessoa: 'Rafael', texto: 'Boa! Vou puxar depois do render do Short', cor: 'msg', criado: quando(38) },
    { id: 4, pessoa: 'Kenny', texto: JSON.stringify({ id: `Kenny|s3|${ag - 15 * 60e3}`, titulo: 'Desenha o baú do inventário no PixelLab e coloca na tela', frente: 'cook:criacao', pessoa: 'Kenny' }), cor: 'missao', criado: quando(9) },
    { id: 5, pessoa: 'Kenny', texto: 'Olha o baú do jogo novo @Rafael 👀', cor: 'msg', criado: quando(9) },
    { id: 6, pessoa: 'Rafael', texto: '🔥 4', cor: 'reacao', criado: quando(8) },
  ].reverse();
  const dia = (d) => new Date(ag + d * 86400e3).toISOString().slice(0, 10);
  temQuadro = true;
  marcos = [
    { id: 1, titulo: 'Short "Raio + Fogo = ?"', descricao: 'Short de 20 s para o YouTube mostrando o combo.', jogo: 'genesis', setor: 'marketing', coluna: 'fazendo', responsavel: 'Rafael', prioridade: 1, prazo: dia(2), etapas: [{ t: 'Roteiro', feito: true, por: 'Rafael' }, { t: 'Gravação', feito: true }, { t: 'Edição no compasso', feito: false }, { t: 'Nota do Codex', feito: false }], palavras: 'short, raio, fogo', area: 'vídeo', arquivos: 'tools/video/*', branch: 'gen-186-trailer-v2', ordem: 1, criado_por: 'Rafael', criado: quando(3000) },
    { id: 2, titulo: 'Dash do player', descricao: 'Dash com invencibilidade curta.', jogo: 'genesis', setor: 'criacao', coluna: 'fazendo', responsavel: 'Kenny', prioridade: 2, prazo: dia(-1), etapas: [{ t: 'Mecânica', feito: true }, { t: 'Teste automático', feito: false }], palavras: 'dash, player', area: 'player', arquivos: 'scripts/player/*', branch: 'v0.2-loja-classes', ordem: 2, criado_por: 'Kenny', criado: quando(5000) },
    { id: 3, titulo: 'Inventário do Cook', descricao: 'Baú, slots e arrastar ingredientes.', jogo: 'cook', setor: 'criacao', coluna: 'fazendo', responsavel: 'Kenny', prioridade: 1, prazo: dia(5), etapas: [{ t: 'Modelo e tela separados', feito: true }, { t: 'Baú', feito: false }, { t: 'Arrastar itens', feito: false }], palavras: 'inventário, baú', area: 'UI', arquivos: '', branch: '', ordem: 3, criado_por: 'Kenny', criado: quando(4000) },
    { id: 4, titulo: 'Trailer de lançamento', descricao: '60 s, para a página da Steam.', jogo: 'genesis', setor: 'marketing', coluna: 'afazer', responsavel: 'Rafael', prioridade: 1, prazo: dia(14), etapas: [], palavras: 'trailer, lançamento', area: '', arquivos: '', branch: '', ordem: 4, criado_por: 'Rafael', criado: quando(6000) },
    { id: 5, titulo: 'Página da Steam do Cook', descricao: '', jogo: 'cook', setor: 'marketing', coluna: 'ideias', responsavel: null, prioridade: 2, prazo: null, etapas: [], palavras: 'steam', area: '', arquivos: '', branch: '', ordem: 5, criado_por: 'Kenny', criado: quando(7000) },
    { id: 6, titulo: 'Balanceamento do Veterano', descricao: 'Taxa de vitória dos bots entre 45% e 55%.', jogo: 'genesis', setor: 'criacao', coluna: 'revisar', responsavel: 'Rafael', prioridade: 2, prazo: null, etapas: [{ t: 'Dragão do Inverno', feito: true }, { t: 'Morvane', feito: true }], palavras: 'balanceia, veterano, dragão', area: 'data/enemies.json', arquivos: '', branch: '', ordem: 6, criado_por: 'Rafael', criado: quando(9000) },
    { id: 7, titulo: 'Escritório virtual 2.0', descricao: '', jogo: 'estudio', setor: 'criacao', coluna: 'feito', responsavel: 'Rafael', prioridade: 2, prazo: null, etapas: [], palavras: '', area: '', arquivos: '', branch: '', ordem: 7, criado_por: 'Rafael', criado: quando(9000), concluido: quando(160) },
  ];
  comentarios = [{ id: 1, marco_id: 1, pessoa: 'Kenny', texto: 'O corte do compasso 2 ficou top!', criado: quando(30) }];
  D.adicionar([
    ev(3, 'Kenny', 'Orquestrador', 'inicio', 'Faz o baú do inventário abrir com animação', { sessao: 's6', projeto: 'jogo-novo' }),
    ev(2.5, 'Kenny', 'explorador', 'pedido', 'Orquestrador pediu: achar onde o baú abre', { sessao: 's6', projeto: 'jogo-novo' }),
    ev(0.4, 'Kenny', 'explorador', 'atividade', '', { sessao: 's6', projeto: 'jogo-novo', ferramenta: 'Grep', alvo: 'abrir_bau em scripts' }),
    ev(25, 'Rafael', 'Orquestrador', 'inicio', 'Refaz a voz do devlog com um filtro mais suave', { sessao: 's7', projeto: 'devlog_1mes', pasta: 'C:/Users/rafon/projetos/genesis-game/_video/devlog_1mes' }),
    ev(6, 'Rafael', 'Orquestrador', 'espera', 'esperando você', { sessao: 's7', projeto: 'devlog_1mes', pasta: 'C:/Users/rafon/projetos/genesis-game/_video/devlog_1mes', resposta: 'A rotina está rodando em segundo plano. Te aviso quando terminar.' }),
  ]);
  conversas = [{ id: 1, titulo: 'Short Raio + Fogo', alvo: 'claude', projeto: 'genesis-game', sessao: 's1-demo', atualizado: new Date().toISOString() }, { id: 2, titulo: 'Revisar o inventário', alvo: 'codex', projeto: 'genesis-game', atualizado: new Date().toISOString() }];
  conversaAtual = 1; chatCarregadoDe = 1;
  mensagens = [{ de: 'eu', texto: 'Faz o Short "Raio + Fogo = ?" e pede nota ao Codex' }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Read', entrada: { file_path: 'shots.json' } }) }, { de: 'ferramenta', texto: JSON.stringify({ ferramenta: 'Agent', entrada: { subagent_type: 'editor-de-video', description: 'montar Short' } }) }, { de: 'assistente', texto: 'Mandei o **Editor** montar o Short (~19 s, corte no compasso). Quando sair o render, peço a nota ao `Codex`.\n- trilha: menu 129 BPM\n- 5 cortes' }, { de: 'sistema', texto: JSON.stringify({ nota: { ms: 130000, custo: 0.42, entrada: 2100, saida: 9800, cacheCriado: 33000, cacheLido: 1200000, modelos: ['claude-opus-4-5', 'claude-haiku-4-5'] } }) }];
  cacheMsgs.set(1, mensagens); comandosAbertos.set(-1, 1); // demo: a aba 1 trabalhando
  // demo da frente "comando e coordenação": resultado pronto, erro de login, conflito e bolas com o Kenny
  conversas.push({ id: 3, titulo: '🏢 Frentes do escritório', alvo: 'claude', projeto: 'genesis-estudio', sessao: 's4', atualizado: new Date(ag - 170 * 60e3).toISOString() }, { id: 4, titulo: '🎬 Trailer v2', alvo: 'claude', projeto: 'genesis-game', atualizado: new Date(ag - 30 * 60e3).toISOString() });
  cacheMsgs.set(3, [{ de: 'eu', texto: 'Melhora o escritório: frentes, histórico e conversa da dupla' }, { de: 'assistente', texto: 'Pronto: faixa de frentes no mapa, missões agrupadas, histórico por dia e a conversa da dupla.' }]);
  cacheMsgs.set(4, [{ de: 'eu', texto: 'Renderiza o trailer v2 com a trilha nova' }, { de: 'erro', texto: '🔑 O login do Claude venceu neste PC (401). Rode claude e depois /login no terminal.' }]);
  D.adicionar([
    ev(20, 'Rafael', 'editor-de-video', 'atividade', '', { aid: 'a1', ferramenta: 'Edit', alvo: 'beatgrid.mjs', arq: 'tools/video/beatgrid.mjs', modo: 'escrever' }),
    ev(5, 'Kenny', 'Orquestrador', 'atividade', '', { ferramenta: 'Edit', alvo: 'beatgrid.mjs', arq: 'tools/video/beatgrid.mjs', modo: 'escrever' }),
    ev(240, 'Rafael', 'gerente', 'inicio', 'Sugestões do dia', { sessao: 'rot1' }), ev(238, 'Rafael', 'gerente', 'fim', '4 pedidos prontos para hoje no painel Hoje', { sessao: 'rot1' }),
    ev(1.5, 'Kenny', 'tradutor-de-falas', 'inicio', 'começou', { aid: 'v1', sessao: 's6', projeto: 'jogo-novo' }), ev(0.6, 'Kenny', 'tradutor-de-falas', 'atividade', '', { aid: 'v1', sessao: 's6', projeto: 'jogo-novo', ferramenta: 'Read', alvo: 'locale/en.json', modo: 'ler' }),
  ]);
  recados.unshift(
    { id: 9, pessoa: 'Kenny', texto: JSON.stringify({ id: 8, acao: 'feito' }), cor: 'bola-ok', criado: quando(60) },
    { id: 10, pessoa: 'Kenny', texto: JSON.stringify({ para: 'Rafael', alvo: 'claude', texto: 'Roda o balanceamento do Veterano de novo com o dash novo (já está na main)', ctx: 'marco Dash do player · branch v0.2-loja-classes · mexeu em player.gd', projeto: 'genesis-game' }), cor: 'bola', criado: quando(6) },
    { id: 11, pessoa: 'Rafael', texto: `🔥 Kenny|s3|${ag - 15 * 60e3}`, cor: 'reacao', criado: quando(7) },
  );
  recados.push({ id: 8, pessoa: 'Rafael', texto: JSON.stringify({ para: 'Kenny', alvo: 'pessoa', texto: 'Dá uma olhada no Short antes de eu subir?', ctx: 'marco Short "Raio + Fogo = ?" · branch gen-186-trailer-v2' }), cor: 'bola', criado: quando(120) });
  aprovacoes = [{ id: 7, ferramenta: 'AskUserQuestion', detalhe: JSON.stringify({ perguntas: [
    { question: 'Qual versão do trailer eu monto primeiro?', header: 'Formato', multiSelect: false, options: [{ label: 'Steam 1:30', description: 'Deitado, com a música do menu e o logo no fim' }, { label: 'Reels 15 s', description: 'Em pé, gancho nos 2 primeiros segundos' }, { label: 'Os dois', description: 'Leva o dobro do tempo de render' }] },
    { question: 'O que entra no vídeo?', header: 'Partes', multiSelect: true, options: [{ label: 'Gameplay novo', description: 'Gravo as cenas de novo com o bot' }, { label: 'Narração', description: 'Você grava depois' }, { label: 'Legendas' }] },
  ], pedidoDe: { agente: 'Orquestrador', projeto: 'genesis-game' } }), conversa_id: 1, criado: new Date(ag - 20e3).toISOString(), status: 'pendente' }, { id: 8, ferramenta: 'Bash', detalhe: JSON.stringify({ command: 'git push origin gen-186-trailer-v2 && rm -rf _video/tmp', description: 'Sobe a branch e limpa os temporários', arquivos: ['_video/tmp/corte1_raio.mp4', '_video/tmp/corte2_fogo.mp4', '_video/tmp/trilha_129bpm.wav', '_video/tmp/frames/ (412 imagens do render)'], pedidoDe: { agente: 'editor-de-video', projeto: 'genesis-game' } }), conversa_id: 1, criado: new Date(ag - 30e3).toISOString(), status: 'pendente' }, { id: 9, ferramenta: 'mcp__blender__generate_3d', detalhe: JSON.stringify({ prompt: 'espada do Gatuno, low poly', pedidoDe: { agente: 'artista-3d', projeto: 'genesis-game' } }), conversa_id: 1, criado: new Date(ag - 60e3).toISOString(), status: 'pendente' },
    { id: 10, ferramenta: 'Bash', detalhe: JSON.stringify({ command: 'npx remotion render ShortRaioFogo out/short-raio-fogo.mp4 --concurrency=4', description: 'Renderiza o Short', origem: { terminal: true, projeto: 'genesis-game', agente: 'editor-de-video' } }), conversa_id: null, criado: new Date(ag - 30e3).toISOString(), status: 'pendente' }];
  jornais = [{ dia: hoje(), gerado_por: 'Rafael', conteudo: { manchete: 'Short do Raio + Fogo leva 8/10 do Codex e sai do forno hoje', linha_fina: 'Editor de vídeo vira a madrugada; Revisor encontra um "dash" que não existe', numeros: [{ rotulo: 'commits', valor: '12' }, { rotulo: 'missões', valor: '7' }, { rotulo: 'renders', valor: '3' }], secoes: [{ titulo: 'Genesis', itens: [{ titulo: 'Dragão do Inverno mais justo', texto: 'O Balanceador cortou 10% da vida e a recarga do sopro caiu para 6 s.' }, { titulo: 'Dash fantasma', texto: 'O teste do Godot achou uma chamada a "dash" num objeto vazio. Kenny já subiu a correção.' }] }, { titulo: 'Marketing e YouTube', itens: [{ titulo: 'Raio + Fogo = ?', texto: 'O Short de 19 s com 5 cortes no compasso teve nota 8 do Codex. Falta ajustar o corte 3.' }] }, { titulo: 'Jogo novo', itens: [{ titulo: 'Inventário de cara nova', texto: 'O Codex separou modelo e tela do inventário em 14 arquivos.' }] }], fofoca: 'Fontes não confirmadas dizem que o Explorador passou mais tempo no café do que nas baias. Ele nega: “estava explorando o salão”.', previsao: 'Céu limpo com chance de merge à tarde.' } }];
  mundo = await criarMundo();
  await mundo.criarEu('Rafael', [6.5, 6.4]); // na própria sala, como no app de verdade (no corredor ele colava na placa da Criação)
  await sincronizarMundo();
  presentes.set('Kenny', { status: 'disponivel' });
  await mundo.atualizarPessoa('Kenny', { x: 33.5 * T, y: 6.4 * T, dir: 'baixo' });
  montarInterface();
  desenharManchete();
  $('#carregando').hidden = true;
  requestAnimationFrame(laco);
}

const mostrarErro = (e) => {
  console.error(e);
  const el = document.querySelector('#textoCarregando');
  // Mostra também onde foi (ex.: app.js:812), para dar para achar o erro sem estar logado como a pessoa.
  const onde = String(e?.stack || '').split('\n').map((l) => /(\w+\.js:\d+)/.exec(l)?.[1]).find(Boolean);
  if (el && !document.querySelector('#carregando').hidden) el.textContent = `Deu erro ao abrir: ${e?.message || e}${onde ? ` (${onde})` : ''}`;
};
addEventListener('error', (e) => mostrarErro(e.error || e.message));
addEventListener('unhandledrejection', (e) => mostrarErro(e.reason));
iniciar().catch(mostrarErro);
