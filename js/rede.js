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
  const [conversas, aprovacoes, jornal] = await Promise.all([
    opcional(sb.from('conversas').select('*').order('atualizado', { ascending: false }).limit(200)),
    opcional(sb.from('aprovacoes').select('*').eq('status', 'pendente').order('id')),
    opcional(sb.from('jornal').select('*').order('dia', { ascending: false }).limit(10)),
  ]);
  return { eventos: ev.data.reverse(), recados: rec.data, estado: est.data, chat: chat.data.reverse(), membros: mem.data, conversas, aprovacoes, jornal, temSql2: conversas !== null };
}

// Histórico: eventos mais antigos que t (para o botão "carregar dias mais antigos").
export async function eventosAntes(t, n = 2500) {
  const { data, error } = await sb.from('eventos').select('id,t,pessoa,dados').lt('t', t).order('t', { ascending: false }).limit(n);
  if (error) throw error;
  return data.reverse();
}

// ---------- tempo real ----------
export function conectar({ x, y, status }) {
  sb.channel('tabelas')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, (p) => emitir('evento', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recados' }, (p) => emitir('recado', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estado' }, (p) => emitir('estado', p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat', filter: `user_id=eq.${euId}` }, (p) => emitir('chat', p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'comandos', filter: `user_id=eq.${euId}` }, (p) => emitir('comando', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas', filter: `user_id=eq.${euId}` }, (p) => emitir('conversa', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'aprovacoes', filter: `user_id=eq.${euId}` }, (p) => emitir('aprovacao', p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jornal' }, (p) => emitir('jornal', p.new))
    .subscribe((s) => emitir('conexao', s));
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
export async function novaConversa({ titulo, alvo, projeto }) {
  const { data, error } = await sb.from('conversas').insert({ titulo: titulo.slice(0, 120), alvo, projeto: projeto || null }).select().single();
  if (error) throw error;
  return data;
}
export const renomearConversa = (id, titulo) => sb.from('conversas').update({ titulo: titulo.slice(0, 120) }).eq('id', id);
export const apagarConversa = (id) => sb.from('conversas').delete().eq('id', id);
export async function carregarChat(conversa_id) {
  const q = sb.from('chat').select('*').order('id', { ascending: true }).limit(400);
  const { data, error } = conversa_id ? await q.eq('conversa_id', conversa_id) : await q.is('conversa_id', null);
  if (error) throw error;
  return data;
}
export async function decidir(id, status) { const { error } = await sb.from('aprovacoes').update({ status, decidido: new Date().toISOString() }).eq('id', id); if (error) throw error; }
export const pedirJornal = () => sb.from('comandos').insert({ tipo: 'jornal' });
export const parar = () => sb.from('comandos').insert({ tipo: 'parar' });
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
