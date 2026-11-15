// Modelo: transforma os eventos em "mesas" (estado de cada agente de cada pessoa).
import { tituloDe } from './config.js';

export const eventos = [];
let versao = 0;
export const mudou = () => versao++;
export const versaoAtual = () => versao;

// Linha do banco -> evento plano.
export function deLinha(l) {
  const d = l.dados || {};
  return { ...d, id: l.id, t: l.t ?? d.t, pessoa: l.pessoa ?? d.pessoa, agente: d.agente === 'Explore' ? 'explorador' : d.agente, texto: String(d.texto ?? '') };
}
export function adicionar(lista) {
  const ids = new Set(eventos.map((e) => e.id));
  for (const e of lista) if (e.id == null || !ids.has(e.id)) eventos.push(e);
  eventos.sort((a, b) => a.t - b.t);
  if (eventos.length > 5000) eventos.splice(0, eventos.length - 4000);
  mudou();
}

// Estados no vocabulário do "claude agents": precisa de você, trabalhando, pronto, livre.
// Cada estado tem cor E forma (glifo), para não depender só da cor.
export const ESTADOS = {
  alerta: { rot: 'precisa de você', cor: '#ffd23f', glifo: '!', ordem: 0 },
  erro: { rot: 'deu erro', cor: '#ef6a55', glifo: '×', ordem: 1 },
  trab: { rot: 'trabalhando', cor: '#f0973d', glifo: '…', ordem: 2 },
  fim: { rot: 'pronto', cor: '#4fbf82', glifo: '✓', ordem: 3 },
  espera: { rot: 'esperando você', cor: '#9a90a8', glifo: '·', ordem: 4 },
  livre: { rot: 'livre', cor: '#7d7590', glifo: 'z', ordem: 5 },
};
export function estadoDe(m) {
  if (!m?.ult) return { cls: 'livre', ...ESTADOS.livre };
  const e = m.ult;
  let cls = { inicio: 'trab', pedido: 'trab', atividade: 'trab', fim: 'fim', espera: 'espera', erro: 'erro', alerta: 'alerta' }[e.tipo] || 'trab';
  const idade = Date.now() - e.t;
  if (cls === 'trab' && idade > 30 * 60e3) cls = 'espera';
  if (cls === 'fim' && m.nome !== 'Orquestrador' && idade > 20 * 60e3) cls = 'livre';
  if (cls === 'fim' && m.nome === 'Orquestrador' && idade > 5 * 60e3) cls = 'espera';
  if (cls === 'erro' && idade > 60 * 60e3) cls = 'livre';
  if (cls === 'alerta' && idade > 2 * 3600e3) cls = 'espera';
  if (m.nome === 'Orquestrador' && e.texto === 'sessão fechada') cls = 'espera';
  return { cls, ...ESTADOS[cls] };
}

let cache = { v: -1 };
// pessoa -> nome do agente -> mesa
export function equipes() {
  if (cache.v === versao) return cache.dados;
  const dados = new Map();
  for (const e of eventos) {
    if (!e.agente || !e.pessoa) continue;
    if (!dados.has(e.pessoa)) dados.set(e.pessoa, new Map());
    const mesas = dados.get(e.pessoa);
    if (!mesas.has(e.agente)) mesas.set(e.agente, { k: `${e.pessoa}|${e.agente}`, pessoa: e.pessoa, nome: e.agente, titulo: tituloDe(e.agente), hist: [], miniaturas: [], nomes: [] });
    const m = mesas.get(e.agente);
    m.hist.push(e); if (m.hist.length > 80) m.hist.shift();
    m.ult = e;
    m.modo = e.tipo === 'atividade' ? e.modo || m.modo : null;
    if (e.tipo === 'inicio' || e.tipo === 'pedido') m.pedido = e;
    if (e.projeto && e.agente === 'Orquestrador') m.projeto = e.projeto;
    for (const mi of e.miniaturas || []) m.miniaturas = [{ ...mi, t: e.t }, ...m.miniaturas.filter((x) => x.caminho !== mi.caminho)].slice(0, 12);
    for (const n of e.nomes || []) m.nomes = [n, ...m.nomes.filter((x) => x !== n)].slice(0, 8);
  }
  cache = { v: versao, dados };
  return dados;
}
export const mesa = (pessoa, nome) => equipes().get(pessoa)?.get(nome);

// Todas as miniaturas (galeria), mais novas primeiro.
export function galeria() {
  const out = [];
  for (const e of eventos) for (const mi of e.miniaturas || []) out.push({ ...mi, t: e.t, pessoa: e.pessoa, agente: e.agente, texto: e.texto });
  const vistos = new Set();
  return out.reverse().filter((m) => !vistos.has(m.caminho) && vistos.add(m.caminho));
}

// "Enquanto você estava fora": o que mudou desde t.
export function resumoDesde(t) {
  const novos = eventos.filter((e) => e.t > t);
  const porPessoa = new Map();
  for (const e of novos) {
    if (!porPessoa.has(e.pessoa)) porPessoa.set(e.pessoa, { prontos: new Map(), erros: [], alertas: [], pedidos: 0, arquivos: 0 });
    const r = porPessoa.get(e.pessoa);
    if (e.tipo === 'fim' && e.agente !== 'Orquestrador') r.prontos.set(e.agente, e);
    if (e.tipo === 'erro') r.erros.push(e);
    if (e.tipo === 'alerta') r.alertas.push(e);
    if (e.agente === 'Orquestrador' && e.tipo === 'inicio') r.pedidos++;
    r.arquivos += (e.miniaturas || []).length;
  }
  return { total: novos.length, porPessoa };
}

// ---------- missões: cada pedido vira uma história (pedido › passos › resposta) ----------
let cacheMissoes = { v: -1 };
export function missoes() {
  if (cacheMissoes.v === versao) return cacheMissoes.lista;
  const lista = [], abertas = new Map();
  const nova = (e, chave, alvo) => {
    const m = { id: `${chave}|${e.t}`, pessoa: e.pessoa, sessao: e.sessao, projeto: e.projeto, alvo, origem: e.origem, pedido: e.texto, inicio: e.t, ultimo: e.t, passos: [], agentes: new Set(), miniaturas: [], nomes: [], alertas: 0, erros: 0, fim: null, resposta: null };
    lista.push(m); abertas.set(chave, m); return m;
  };
  for (const e of eventos) {
    const codex = e.agente === 'Codex' && (e.origem === 'vscode' || e.origem === 'site');
    const chave = codex ? `${e.pessoa}|codex|${e.sessao || ''}` : `${e.pessoa}|${e.sessao || ''}`;
    if (!codex && e.agente === 'Orquestrador' && e.tipo === 'inicio') { nova(e, chave, 'claude'); continue; }
    if (codex && (e.tipo === 'pedido' || e.tipo === 'inicio')) { nova(e, chave, 'codex'); continue; }
    const m = abertas.get(chave);
    if (!m) continue;
    m.ultimo = e.t;
    if (e.agente !== 'Orquestrador' && !codex) m.agentes.add(e.agente);
    for (const mi of e.miniaturas || []) m.miniaturas.push(mi);
    for (const n of e.nomes || []) if (!m.nomes.includes(n)) m.nomes.push(n);
    if (e.tipo === 'alerta') m.alertas++;
    if (e.tipo === 'erro') m.erros++;
    if ((e.agente === 'Orquestrador' && e.tipo === 'espera' && !codex) || (codex && (e.tipo === 'fim' || e.tipo === 'erro'))) {
      if (e.texto === 'sessão aberta') continue;
      m.fim = e.t; m.resposta = codex ? e.texto : e.resposta || null; abertas.delete(chave); continue;
    }
    if (e.agente === 'Orquestrador' && e.tipo === 'espera') continue;
    m.passos.push(e);
  }
  for (const m of lista) {
    const idade = Date.now() - m.ultimo;
    m.status = m.fim ? (m.erros && !m.resposta ? 'erro' : 'fim') : m.passos.at(-1)?.tipo === 'alerta' ? 'alerta' : idade < 30 * 60e3 ? 'trab' : 'espera';
    m.duracao = (m.fim || m.ultimo) - m.inicio;
  }
  lista.reverse();
  cacheMissoes = { v: versao, lista };
  return lista;
}
export function duracao(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

// ---------- quem é Claude, quem é GPT ----------
const FERRAMENTAS = new Set(['PixelLab', 'Blender', 'Render', 'Godot', 'HuggingFace']);
export function modeloDe(nome, agentesInfo = []) {
  if (nome === 'Codex') return { rotulo: 'GPT · Codex', familia: 'gpt' };
  if (FERRAMENTAS.has(nome)) return { rotulo: 'Ferramenta', familia: 'ferramenta' };
  if (nome === 'Orquestrador') return { rotulo: 'Claude', familia: 'claude' };
  const info = agentesInfo.find((a) => a.nome === nome);
  const m = String(info?.modelo || '').toLowerCase();
  const nomeModelo = /haiku/.test(m) ? 'Haiku' : /sonnet/.test(m) ? 'Sonnet' : /opus/.test(m) ? 'Opus' : /fable/.test(m) ? 'Fable' : '';
  return { rotulo: nomeModelo ? `Claude ${nomeModelo}` : 'Claude', familia: 'claude', descricao: info?.descricao };
}

export function ha(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'agora' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : new Date(t).toLocaleDateString('pt-BR');
}
export const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
