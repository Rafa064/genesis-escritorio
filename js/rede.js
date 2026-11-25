// Rede: login, dados e tempo real pelo Supabase (canal privado, só membros).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'estudio-genesis' } });
let canal = null, ouvintes = {}, euPessoa = null, euId = null;
export const on = (nome, fn) => { (ouvintes[nome] ??= []).push(fn); };
const emitir = (nome, ...a) => (ouvintes[nome] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });

// ---------- login ----------
export async function sessao() { const { data } = await sb.auth.getSession(); return data.session; }
export async function pedirCodigo(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.href.split('#')[0] } });
  if (error) throw error;
}
export async function confirmarCodigo(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}
export const sair = () => sb.auth.signOut();
export async function quemSouEu() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  euId = user.id;
  const { data } = await sb.from('membros').select('pessoa').eq('user_id', user.id).maybeSingle();
  euPessoa = data?.pessoa || null;
  return { id: user.id, email: user.email, pessoa: euPessoa };
}

// ---------- leituras ----------
export async function carregarTudo() {
  const [ev, rec, est, chat, mem] = await Promise.all([
    sb.from('eventos').select('id,t,pessoa,dados').order('t', { ascending: false }).limit(2500),
    sb.from('recados').select('*').order('criado', { ascending: false }).limit(500),
    sb.from('estado').select('*'),
    sb.from('chat').select('*').order('id', { ascending: false }).limit(120),
    sb.from('membros').select('pessoa,email'),
  ]);
  for (const r of [ev, rec, est, chat, mem]) if (r.error) throw r.error;
  // partes do SQL 2 (se ainda não rodou, a página funciona sem elas)
  const opcional = async (q) => { const r = await q; return r.error ? null : r.data; };
  const [conversas, aprovacoes, jornal, marcos, vinculos, comentarios, comandos] = await Promise.all([
    opcional(sb.from('conversas').select('*').order('atualizado', { ascending: false }).limit(200)),
    opcional(sb.from('aprovacoes').select('*').eq('status', 'pendente').order('id')),
    opcional(sb.from('jornal').select('*').order('dia', { ascending: false }).limit(10)),
    opcional(sb.from('marcos').select('*').order('ordem')),
    opcional(sb.from('marcos_missoes').select('*')),
    opcional(sb.from('marcos_comentarios').select('*').order('id').limit(2000)),
    comandosAbertos(),
  ]);
  return { comandos, eventos: ev.data.reverse(), recados: rec.data, estado: est.data, chat: chat.data.reverse(), membros: mem.data, conversas, aprovacoes, jornal, marcos, vinculos, comentarios, temSql2: conversas !== null, temQuadro: marcos !== null };
}

// Pedidos de chat ainda na fila ou rodando (para saber quais abas estão ocupadas).
export async function comandosAbertos() {
  const { data, error } = await sb.from('comandos').select('id,conversa_id,status,tipo').eq('tipo', 'chat').in('status', ['novo', 'rodando']).order('id').limit(50);
  return error ? null : data;
}

// Resumo leve dos últimos dias: só os eventos que contam a história (pedido, resposta, entrega, erro,
// escalação), sem cada passo. Vem em páginas de 1000 (o limite da API), mais antigos que "ate".
const TIPOS_RESUMO = ['inicio', 'pedido', 'espera', 'fim', 'erro', 'escalacao', 'alerta'];
export async function resumoDosDias(ate, dias = 7, maxPaginas = 6) {
  const desde = Date.now() - dias * 86400e3, out = [], vistos = new Set();
  let teto = ate, primeira = true;
  for (let i = 0; i < maxPaginas && teto >= desde; i++) {
    // <= no teto (menos na 1ª página) + ids já vistos: eventos no mesmo milissegundo da virada não se perdem
    let q = sb.from('eventos').select('id,t,pessoa,dados').in('dados->>tipo', TIPOS_RESUMO).gte('t', desde).order('t', { ascending: false }).order('id', { ascending: false }).limit(1000);
    q = primeira ? q.lt('t', teto) : q.lte('t', teto);
    const { data, error } = await q;
    if (error) throw error;
    const novos = data.filter((x) => !vistos.has(x.id));
    for (const x of novos) vistos.add(x.id);
    out.push(...novos);
    if (data.length < 1000 || !novos.length) break;
    teto = data.at(-1).t; primeira = false;
  }
  return out.sort((a, b) => a.t - b.t || a.id - b.id);
}

// Histórico: eventos mais antigos que t (para o botão "carregar dias mais antigos").
export async function eventosAntes(t, n = 2500) {
  const { data, error } = await sb.from('eventos').select('id,t,pessoa,dados').lt('t', t).order('t', { ascending: false }).limit(n);
  if (error) throw error;
  return data.reverse();
}

// Volta do celular (app suspenso) ou reconexão: busca o que chegou enquanto a página dormia.
export async function novidadesDesde(t, idDesde = 0) {
  const opcional = async (q) => { const r = await q; return r.error ? null : r.data; };
  // Eventos em páginas de 1000 (o limite da API) até chegar no presente.
  const eventos = [];
  let cursor = idDesde;
  for (let i = 0; i < 40; i++) {
    let q = sb.from('eventos').select('id,t,pessoa,dados').order('id', { ascending: true }).limit(1000);
    q = cursor ? q.gt('id', cursor) : q.gt('t', t - 60e3);
    const { data, error } = await q;
    if (error) throw error;
    eventos.push(...data);
    if (data.length < 1000) break;
    cursor = data.at(-1).id;
  }
  eventos.sort((a, b) => a.t - b.t);
  const [rec, est, apr, conversas, marcos, vinculos, comentarios, jornal, comandos] = await Promise.all([
    sb.from('recados').select('*').order('criado', { ascending: false }).limit(500),
    sb.from('estado').select('*'),
    opcional(sb.from('aprovacoes').select('*').eq('status', 'pendente').order('id')),
    opcional(sb.from('conversas').select('*').order('atualizado', { ascending: false }).limit(200)),
    opcional(sb.from('marcos').select('*').order('ordem')),
    opcional(sb.from('marcos_missoes').select('*')),
    opcional(sb.from('marcos_comentarios').select('*').order('id').limit(2000)),
    opcional(sb.from('jornal').select('*').order('dia', { ascending: false }).limit(10)),
    comandosAbertos(),
  ]);
  return { comandos, eventos, recados: rec.data, estado: est.data || [], aprovacoes: apr, conversas, marcos, vinculos, comentarios, jornal };
}
export async function lerMeuInfo() { const { data } = await sb.from('estado').select('info').eq('user_id', euId).maybeSingle(); return data?.info || {}; }
// O site grava no MEU estado.info só o que é dele (notificações e modo longe); a ponte preserva.
let temRpcInfo = null;
export async function mudarCampoInfo(chave, valor) {
  if (temRpcInfo !== false) {
    const { error } = await sb.rpc('info_do_site', { chave, valor });
    if (!error) { temRpcInfo = true; return; }
    if (!/PGRST202|function|not find/i.test(error.message + error.code)) throw error;
    temRpcInfo = false;
  }
  await mudarMeuInfo((i) => ({ ...i, [chave]: valor }));
}
export async function mudarMeuInfo(fn) {
  const { data, error } = await sb.from('estado').select('info').eq('user_id', euId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Sua ponte ainda não ligou nenhuma vez neste login.');
  const info = fn({ ...(data.info || {}) });
  const r = await sb.from('estado').update({ info }).eq('user_id', euId);
  if (r.error) throw r.error;
  return info;
}

// ---------- tempo real ----------
let canalTabelas = null;
export function reconectarTabelas() { if (canalTabelas) { sb.removeChannel(canalTabelas); canalTabelas = null; } ligarTabelas(); }
export const estadoCanal = () => canalTabelas?.state || 'fechado';
export function conectar({ x, y, status }) {
  ligarTabelas();
  ligarPresenca({ x, y, status });
}
function ligarTabelas() {
  canalTabelas = sb.channel('tabelas-' + Date.now())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, (p) => emitir('evento', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recados' }, (p) => emitir('recado', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estado' }, (p) => emitir('estado', p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat', filter: `user_id=eq.${euId}` }, (p) => emitir('chat', p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'comandos', filter: `user_id=eq.${euId}` }, (p) => emitir('comando', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas', filter: `user_id=eq.${euId}` }, (p) => emitir('conversa', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aprovacoes', filter: `user_id=eq.${euId}` }, (p) => emitir('aprovacao', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jornal' }, (p) => emitir('jornal', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marcos' }, (p) => emitir('marco', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marcos_missoes' }, (p) => emitir('vinculo', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marcos_comentarios' }, (p) => emitir('comentario', p))
    .subscribe((s) => emitir('conexao', s));
}
function ligarPresenca({ x, y, status }) {
  canal = sb.channel('escritorio', { config: { private: true, presence: { key: euPessoa }, broadcast: { self: false } } });
  canal
    .on('presence', { event: 'sync' }, () => emitir('presenca', canal.presenceState()))
    .on('presence', { event: 'join' }, ({ key }) => { emitir('chegou', key); })
    .on('presence', { event: 'leave' }, ({ key }) => emitir('saiu', key))
    .on('broadcast', { event: 'pos' }, ({ payload }) => emitir('pos', payload))
    .on('broadcast', { event: 'emote' }, ({ payload }) => emitir('emote', payload))
    .on('broadcast', { event: 'aceno' }, ({ payload }) => emitir('aceno', payload))
    .on('broadcast', { event: 'oi' }, () => emitir('pediuPosicao'))
    .subscribe(async (s) => {
      emitir('canal', s);
      if (s === 'SUBSCRIBED') { await canal.track({ pessoa: euPessoa, status, desde: Date.now() }); enviarPos({ x, y, dir: 'baixo' }, true); canal.send({ type: 'broadcast', event: 'oi', payload: {} }); }
    });
}
export const atualizarPresenca = (status) => canal?.track({ pessoa: euPessoa, status, desde: Date.now() });

// Posição: só quando muda, no máximo ~6 vezes por segundo (economiza a cota grátis).
let ultimaPos = 0, pendente = null, timer = null;
export function enviarPos(p, ja = false) {
  if (!canal) return;
  const manda = () => { canal.send({ type: 'broadcast', event: 'pos', payload: { pessoa: euPessoa, ...p } }); ultimaPos = Date.now(); pendente = null; };
  if (ja || Date.now() - ultimaPos > 160) { clearTimeout(timer); manda(); }
  else { pendente = p; clearTimeout(timer); timer = setTimeout(() => pendente && manda(), 170); }
}
export const emote = (e) => canal?.send({ type: 'broadcast', event: 'emote', payload: { pessoa: euPessoa, e } });
export const acenar = (para) => canal?.send({ type: 'broadcast', event: 'aceno', payload: { de: euPessoa, para } });

// ---------- ações ----------
export async function pedir(texto, conversa_id = null) {
  const extra = conversa_id ? { conversa_id } : {};
  const { data, error } = await sb.from('comandos').insert({ texto, tipo: 'chat', ...extra }).select().single();
  if (error) throw error;
  await sb.from('chat').insert({ comando_id: data.id, de: 'eu', texto, ...extra });
  if (conversa_id) await sb.from('conversas').update({ atualizado: new Date().toISOString() }).eq('id', conversa_id);
  return data;
}
export async function novaConversa({ titulo, alvo, projeto, marco_id }) {
  const { data, error } = await sb.from('conversas').insert({ titulo: titulo.slice(0, 120), alvo, projeto: projeto || null, ...(marco_id ? { marco_id } : {}) }).select().single();
  if (error) throw error;
  return data;
}
export const renomearConversa = (id, titulo) => sb.from('conversas').update({ titulo: titulo.slice(0, 120) }).eq('id', id);
export const apagarConversa = (id) => sb.from('conversas').delete().eq('id', id);
export async function carregarChat(conversa_id) {
  // As 400 MAIS RECENTES (em ordem): com ascending + limit, uma conversa longa parava nas antigas.
  const q = sb.from('chat').select('*').order('id', { ascending: false }).limit(400);
  const { data, error } = conversa_id ? await q.eq('conversa_id', conversa_id) : await q.is('conversa_id', null);
  if (error) throw error;
  return (data || []).reverse();
}
// Só decide o que ainda está pendente (se a ponte já deu por vencido, avisa em vez de fingir que valeu).
// detalhe (opcional): o questionário grava as respostas no mesmo campo (a ponte lê de lá).
export async function decidir(id, status, detalhe) { const { data, error } = await sb.from('aprovacoes').update({ status, decidido: new Date().toISOString(), ...(detalhe != null ? { detalhe } : {}) }).eq('id', id).eq('status', 'pendente').select('id'); if (error) throw error; if (!data?.length) throw new Error('Esse pedido já tinha vencido (ou você voltou ao PC e ele foi para a tela de lá).'); }
export const pedirJornal = () => sb.from('comandos').insert({ tipo: 'jornal' });
// Com conversa: a ponte para só aquela conversa (sem: para tudo).
export const parar = (conversa_id = null) => sb.from('comandos').insert({ tipo: 'parar', ...(conversa_id ? { conversa_id } : {}) });
export const reiniciarPonte = () => sb.from('comandos').insert({ tipo: 'parar', texto: 'reiniciar' });
export const conversaNova = () => sb.from('comandos').insert({ tipo: 'nova' });
export async function pausar(sim) { const { error } = await sb.from('estado').update({ pausado: sim }).eq('user_id', euId); if (error) throw error; }
export async function mudarStatus(status) { await sb.from('estado').update({ status }).eq('user_id', euId); atualizarPresenca(status); }
export async function recado(texto, cor) { const { error } = await sb.from('recados').insert({ texto, cor, pessoa: euPessoa }); if (error) throw error; }
export const tirarRecado = (id) => sb.from('recados').delete().eq('id', id);
export async function convidar(email, pessoa) { const { error } = await sb.from('convites').insert({ email: email.toLowerCase().trim(), pessoa }); if (error) throw error; }

// Miniaturas: links assinados (1 h), pedidos em lote e guardados.
const links = new Map();
export async function urlsMiniaturas(caminhos) {
  const faltam = caminhos.filter((c) => !links.has(c));
  if (faltam.length) {
    const { data } = await sb.storage.from('miniaturas').createSignedUrls(faltam, 3600);
    for (const d of data || []) if (d.signedUrl) links.set(d.path, d.signedUrl);
  }
  return caminhos.map((c) => links.get(c));
}

// ---------- quadro de marcos ----------
export async function salvarMarco(m) {
  const { id, ...campos } = m;
  campos.atualizado = new Date().toISOString();
  const q = id ? sb.from('marcos').update(campos).eq('id', id) : sb.from('marcos').insert(campos);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}
// Etapas: aplica a mudança na lista MAIS NOVA do banco e só grava se ninguém gravou no meio
// (filtro pelo "atualizado" lido); se alguém gravou, lê de novo (até 3 vezes). Assim duas pessoas
// (ou a IA pela ponte) marcando etapas juntas não apagam a marcação uma da outra.
export async function mudarEtapas(id, mudar) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const { data: m, error } = await sb.from('marcos').select('etapas,atualizado').eq('id', id).single();
    if (error) throw error;
    const etapas = mudar([...(m.etapas || [])]);
    const { data, error: e2 } = await sb.from('marcos').update({ etapas, atualizado: new Date().toISOString() }).eq('id', id).eq('atualizado', m.atualizado).select();
    if (e2) throw e2;
    if (data?.length) return data[0];
  }
  throw new Error('O marco mudou ao mesmo tempo em outro lugar. Tente de novo.');
}
export async function apagarMarco(id) { const { error } = await sb.from('marcos').delete().eq('id', id); if (error) throw error; }
export async function vincular(missao, marco_id) { const { error } = await sb.from('marcos_missoes').upsert({ missao, marco_id }); if (error) throw error; }
export async function desvincular(missao) { const { error } = await sb.from('marcos_missoes').delete().eq('missao', missao); if (error) throw error; }
export async function comentar(marco_id, texto) { const { error } = await sb.from('marcos_comentarios').insert({ marco_id, texto }); if (error) throw error; }
