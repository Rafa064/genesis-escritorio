// Modelo: transforma os eventos em "mesas" (estado de cada agente de cada pessoa).
import { tituloDe } from './config.js';
import { classificar } from './frentes.js';
import { conectorDe } from './tipos.js';
import { primeiraFrase } from './humano.js';

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
  // Sem repetidos: pelo id do banco e pelo "eid" que a ponte põe em cada evento (reenvio não duplica).
  const ids = new Set(eventos.map((e) => e.id)), eids = new Set(eventos.map((e) => e.eid).filter(Boolean));
  for (const e of lista) {
    if (e.id != null && ids.has(e.id)) continue;
    if (e.eid && eids.has(e.eid)) continue;
    eventos.push(e); if (e.eid) eids.add(e.eid);
  }
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
  // tarefa rodando em segundo plano: o turno acabou, mas o trabalho continua
  if (emSegundoPlano(m) && cls !== 'alerta' && cls !== 'erro') cls = 'trab';
  // outra cópia do mesmo agente (outra aba ou em paralelo) ainda trabalhando: a mesa continua ocupada
  if (ativos(m) > 0 && (cls === 'fim' || cls === 'espera' || cls === 'livre')) cls = 'trab';
  return { cls, ...ESTADOS[cls] };
}

export function emSegundoPlano(m) {
  const e = m?.ult; if (!e || m.nome !== 'Orquestrador') return false;
  if (m.fundo > 0 && Date.now() - (m.fundoT || 0) < 2 * 3600e3) return true;
  return e.tipo === 'espera' && Date.now() - e.t < 90 * 60e3 && /segundo plano|em background|rodando sozinh|te aviso quando (terminar|acabar)/i.test(e.resposta || '');
}

// Cada aba (sessão) do Claude Code de cada pessoa vira uma assistente própria.
let cacheAbas = { v: -1 };
export function abas(janela = 3 * 3600e3) {
  if (cacheAbas.v === versao) return cacheAbas.lista;
  const por = new Map();
  for (const e of eventos) {
    if (e.agente !== 'Orquestrador' || !e.sessao || !e.pessoa) continue;
    const k = `${e.pessoa}|aba|${e.sessao}`;
    let a = por.get(k);
    if (!a) { a = { k, aba: true, pessoa: e.pessoa, nome: 'Orquestrador', sessao: e.sessao, titulo: 'Assistente', hist: [], miniaturas: [], nomes: [], fundo: 0 }; por.set(k, a); }
    a.hist.push(e); if (a.hist.length > 80) a.hist.shift();
    a.ult = e; if (e.projeto) a.projeto = e.projeto; if (e.pasta) a.pasta = e.pasta;
    if (e.tipo === 'inicio') a.pedido = e;
    if (e.fundo) { a.fundo++; a.fundoT = e.t; }
    if (e.fimFundo) a.fundo = Math.max(0, a.fundo - 1);
    if (e.texto === 'sessão aberta') a.fundo = 0;
    for (const mi of e.miniaturas || []) a.miniaturas = [{ ...mi, t: e.t }, ...a.miniaturas].slice(0, 12);
  }
  const lista = [...por.values()].filter((a) => Date.now() - a.ult.t < janela && a.ult.texto !== 'sessão fechada').sort((x, y) => y.ult.t - x.ult.t);
  cacheAbas = { v: versao, lista };
  return lista;
}

// Quantas cópias deste agente estão trabalhando agora (uma por sessão + id do sub-agente).
export function ativos(m) {
  if (!m?.abertas) return 0;
  let n = 0; const agora = Date.now();
  for (const t of m.abertas.values()) if (agora - t < 30 * 60e3) n++;
  return n;
}
function acompanhar(m, e) {
  const aid = e.aid || e.id_agente || (typeof e.id === 'string' ? e.id : null);
  const s = e.sessao || '?';
  if (['inicio', 'pedido', 'atividade', 'alerta'].includes(e.tipo)) {
    if (aid) m.abertas.delete(`${s}|?`); // o "pedido" sem id vira a cópia com id quando ela começa
    m.abertas.set(aid ? `${s}|${aid}` : (m.abertas.size && [...m.abertas.keys()].some((k) => k.startsWith(s + '|') && !k.endsWith('|?')) ? null : `${s}|?`), e.t);
    m.abertas.delete(null);
  } else if (['fim', 'erro', 'espera'].includes(e.tipo)) {
    // Com id: fecha aquela cópia (e o "pedido" sem id, se não sobrou nenhuma). Sem id: fecha só o "pedido" sem id.
    if (aid) {
      m.abertas.delete(`${s}|${aid}`);
      if (![...m.abertas.keys()].some((k) => k.startsWith(s + '|') && !k.endsWith('|?'))) m.abertas.delete(`${s}|?`);
    } else m.abertas.delete(`${s}|?`);
  }
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
    if (!mesas.has(e.agente)) mesas.set(e.agente, { k: `${e.pessoa}|${e.agente}`, pessoa: e.pessoa, nome: e.agente, titulo: tituloDe(e.agente), hist: [], miniaturas: [], nomes: [], abertas: new Map() });
    const m = mesas.get(e.agente);
    if (e.agente !== 'Orquestrador') acompanhar(m, e);
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
    const m = { id: `${chave}|${e.t}`, pessoa: e.pessoa, sessao: e.sessao, projeto: e.projeto, pasta: e.pasta, alvo, origem: e.origem, pedido: e.texto, inicio: e.t, ultimo: e.t, passos: [], agentes: new Set(), miniaturas: [], nomes: [], alertas: 0, erros: 0, fim: null, resposta: null, plano: [] };
    lista.push(m); abertas.set(chave, m); return m;
  };
  for (const e of eventos) {
    const codex = e.agente === 'Codex' && (e.origem === 'vscode' || e.origem === 'site');
    const chave = codex ? `${e.pessoa}|codex|${e.sessao || ''}` : `${e.pessoa}|${e.sessao || ''}`;
    if (!codex && e.agente === 'Orquestrador' && e.tipo === 'inicio') { e._m = nova(e, chave, 'claude'); continue; }
    if (codex && (e.tipo === 'pedido' || e.tipo === 'inicio')) { e._m = nova(e, chave, 'codex'); continue; }
    const m = abertas.get(chave);
    if (!m) continue;
    e._m = m;
    m.ultimo = e.t;
    if (e.agente !== 'Orquestrador' && !codex) m.agentes.add(e.agente);
    for (const mi of e.miniaturas || []) m.miniaturas.push(mi);
    for (const n of e.nomes || []) if (!m.nomes.includes(n)) m.nomes.push(n);
    if (e.tipo === 'escalacao') for (const x of e.plano?.itens || []) { // a escalação vai somando (plano + "mais")
      const i = m.plano.findIndex((y) => y.tipo === x.tipo && y.nome === x.nome);
      if (i >= 0) m.plano[i] = { ...m.plano[i], ...x }; else m.plano.push({ ...x, t: e.t });
    }
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
    m.titulo = primeiraFrase(m.pedido, 110) || 'Pedido sem texto';
    m.frente = classificar(m);
    m.skills = [...new Set(m.passos.filter((e) => e.ferramenta === 'Skill').map((e) => String(e.alvo || '').split(':').pop()))].filter(Boolean);
    m.conectores = [...new Set(m.passos.map((e) => conectorDe(e.ferramenta)).filter(Boolean))];
  }
  lista.reverse();
  cacheMissoes = { v: versao, lista };
  return lista;
}
// Escalação ao vivo: o que a assistente planejou + o que de fato entrou em campo, com o estado de cada um.
// estado: planejado (ainda não começou) | trabalhando | pronto | usado (skill/conector já aberto) | erro
const PROGRAMAS_ESC = new Set(['Godot', 'Render', 'Codex', 'ffmpeg']);
export function escalacao(m) {
  if (!m) return [];
  const itens = new Map();
  const chave = (tipo, nome) => `${tipo}|${String(nome).toLowerCase()}`;
  const por = (tipo, nome) => itens.get(chave(tipo, nome));
  const add = (tipo, nome, extra = {}) => { const k = chave(tipo, nome); const x = itens.get(k) || { tipo, nome, estado: 'planejado', planejado: false }; itens.set(k, { ...x, ...extra }); return itens.get(k); };
  for (const p of m.plano || []) add(p.tipo === 'conector' ? 'conector' : p.tipo, p.nome, { por: p.por, novo: !!p.novo, planejado: true });
  // Cópia deste agente aberta NESTA sessão e ainda recente (30 min), olhando a mesma entrada.
  const ativoNaSessao = (nome) => { const mesa = equipes().get(m.pessoa)?.get(nome); if (!mesa?.abertas) return false; for (const [k, t] of mesa.abertas) if (k.startsWith((m.sessao || '?') + '|') && Date.now() - t < 30 * 60e3) return true; return false; };
  for (const e of m.passos) {
    if (e.agente !== 'Orquestrador' && e.agente) {
      const tipo = PROGRAMAS_ESC.has(e.agente) ? 'programa' : ['PixelLab', 'Blender', 'HuggingFace'].includes(e.agente) ? 'conector' : 'agente';
      const nome = tipo === 'conector' ? e.agente.toLowerCase().replace('huggingface', 'hf') : e.agente;
      const x = por(tipo, nome) || add(tipo, nome);
      x.estado = e.tipo === 'fim' ? 'pronto' : e.tipo === 'erro' ? 'erro' : 'trabalhando'; // chamado de novo depois de pronto = trabalhando de novo
      x.ult = e;
    }
    if (e.ferramenta === 'Skill' && e.alvo) { const nome = String(e.alvo).split(':').pop(); const x = por('skill', nome) || add('skill', nome); x.estado = 'usado'; }
    const con = conectorDe(e.ferramenta);
    if (con) { const k = String(e.ferramenta).split('__')[1]; const x = por('conector', k) || [...itens.values()].find((y) => y.tipo === 'conector' && conectorDe(`mcp__${y.nome}__x`) === con) || add('conector', k); x.estado = 'usado'; }
    // agente/skill NOVO criado nesta missão (arquivo .claude/agents/<nome>.md ou SKILL.md)
    if (/^(Write|Edit)$/.test(e.ferramenta || '') && e.arq) for (const x of itens.values()) {
      const alvo = x.tipo === 'agente' ? `agents/${x.nome}.md` : x.tipo === 'skill' ? `skills/${x.nome}/SKILL.md` : null;
      if (x.novo && alvo && e.arq.toLowerCase().endsWith(alvo.toLowerCase())) x.criado = true;
    }
  }
  for (const x of itens.values()) if (x.novo && x.criado && x.estado === 'planejado') x.estado = 'pronto';
  // quem ainda está "trabalhando" mas a missão acabou (ou a cópia já fechou) vira pronto
  for (const x of itens.values()) {
    if (x.tipo !== 'agente' || !x.ult) continue;
    if (!m.fim && ativoNaSessao(x.nome)) x.estado = 'trabalhando';                 // ainda tem cópia trabalhando nesta sessão
    else if (x.estado === 'trabalhando' && Date.now() - x.ult.t > 60e3) x.estado = 'pronto';
  }
  const ordem = { agente: 0, programa: 1, conector: 2, skill: 3, plugin: 4 };
  return [...itens.values()].sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || (b.planejado - a.planejado));
}
// Frente em que a mesa (agente) está trabalhando agora: a da missão do último passo dele.
export function frenteDaMesa(m) { missoes(); return m?.ult?._m?.frente || null; }

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
