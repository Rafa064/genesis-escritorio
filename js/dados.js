// Modelo: transforma os eventos em "mesas" (estado de cada agente de cada pessoa).
import { tituloDe } from './config.js';

export const eventos = [];
let versao = 0;
export const mudou = () => versao++;
export const versaoAtual = () => versao;

// Linha do banco -> evento plano.
export function deLinha(l) {
  const d = l.dados || {};
  return { ...d, id: l.id, t: l.t ?? d.t, pessoa: l.pessoa ?? d.pessoa, agente: d.agente === 'Explore' ? 'explorador' : d.agente };
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

export function ha(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? 'agora' : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : new Date(t).toLocaleDateString('pt-BR');
}
export const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
