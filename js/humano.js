import { tituloDe } from './config.js';
// Traduz o que as IAs fazem para frases humanas, em português.
// Entrada: um evento (ferramenta + alvo) ou um passo do chat ({ ferramenta, entrada }).

const curto = (s, n = 70) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const arquivo = (s) => curto(String(s ?? '').split(/[\\/]/).pop(), 50);

// Comandos de terminal conhecidos -> o que eles significam no dia a dia do estúdio.
const COMANDOS = [
  [/smoke_test/i, 'Rodando o teste automático do jogo'],
  [/abilities_test/i, 'Testando as habilidades dos heróis'],
  [/augments_test/i, 'Testando o sorteio do level up'],
  [/tutorial_test/i, 'Testando o tutorial'],
  [/elements_v4_test/i, 'Testando os elementos'],
  [/ui_preview/i, 'Fotografando as telas do jogo'],
  [/playtest_rodada|playtest_/i, 'Colocando os bots para jogar (balanceamento)'],
  [/godot.*--import/i, 'Importando a arte no Godot'],
  [/godot.*--editor --quit/i, 'Atualizando o cache de classes do Godot'],
  [/\bgodot\b/i, 'Rodando o Godot'],
  [/remotion\s+render|render\.mjs/i, 'Renderizando o vídeo'],
  [/remotion\s+still/i, 'Tirando um quadro do vídeo'],
  [/\bffmpeg\b/i, 'Processando vídeo/imagem (ffmpeg)'],
  [/\bcodex\b.*exec|codex(\.cmd)?\s/i, 'Pedindo revisão ao Codex'],
  [/yt_analytics/i, 'Lendo as métricas do YouTube'],
  [/beatgrid|cuts\.mjs/i, 'Medindo os cortes no ritmo da música'],
  [/elevenlabs_sfx/i, 'Gerando efeitos sonoros'],
  [/elevenlabs_music/i, 'Gerando música'],
  [/blender/i, 'Rodando um script no Blender'],
  [/git\s+commit/i, 'Fazendo commit'],
  [/git\s+push/i, 'Enviando para o GitHub'],
  [/git\s+(pull|fetch)/i, 'Puxando novidades do GitHub'],
  [/git\s+(checkout|switch)\s+-b/i, 'Criando uma branch'],
  [/git\s+(checkout|switch)/i, 'Trocando de branch'],
  [/git\s+(status|diff|log|show)/i, 'Olhando o histórico do git'],
  [/git\s+worktree/i, 'Preparando uma cópia de trabalho (worktree)'],
  [/\bgh\s+pr/i, 'Mexendo num pull request'],
  [/npm (i|install|ci)\b/i, 'Instalando dependências'],
  [/npm (run )?test|vitest|jest/i, 'Rodando testes'],
  [/npm run build|vite build/i, 'Compilando'],
  [/\b(ls|dir|Get-ChildItem)\b/i, 'Olhando os arquivos de uma pasta'],
  [/\b(cat|type|Get-Content|head|tail)\b/i, 'Lendo um arquivo'],
  [/\b(rm|del|Remove-Item)\b/i, 'Apagando arquivos'],
  [/\b(cp|copy|Copy-Item|mv|move|Move-Item)\b/i, 'Movendo/copiando arquivos'],
  [/\bcurl\b|Invoke-WebRequest/i, 'Consultando um endereço da web'],
  [/\bnode\b/i, 'Rodando um script'],
  [/\bpython\b/i, 'Rodando um script Python'],
];
export function comandoHumano(cmd, descricao) {
  const c = String(cmd ?? '');
  for (const [re, frase] of COMANDOS) if (re.test(c)) return frase;
  if (descricao) return curto(descricao.charAt(0).toUpperCase() + descricao.slice(1), 80);
  return 'Rodando um comando no terminal';
}

const MCP = {
  pixellab: { create_character: 'Desenhando um personagem no PixelLab', animate_character: 'Animando um personagem no PixelLab', create_image_pixflux: 'Desenhando uma imagem no PixelLab', create_music: 'Compondo música no PixelLab', create_sound_effect: 'Criando um som no PixelLab', get_balance: 'Conferindo os créditos do PixelLab', '*': 'Usando o PixelLab' },
  blender: { look: 'Olhando a cena no Blender', execute_blender_code: 'Mexendo na cena do Blender', generate_3d: 'Gerando um modelo 3D', import_asset: 'Importando um modelo para o Blender', '*': 'Usando o Blender' },
  notion: { search: 'Procurando no Notion', fetch: 'Lendo uma página do Notion', 'update-page': 'Atualizando uma página do Notion', 'create-pages': 'Criando uma página no Notion', '*': 'Usando o Notion' },
  hf: { '*': 'Consultando o Hugging Face' },
};
function mcpHumano(ferramenta) {
  const m = /^mcp__(?:claude_ai_)?([^_]+(?:-[^_]+)*)__(.+)$/.exec(ferramenta);
  if (!m) return null;
  const servidor = m[1].toLowerCase().replace(/-mcp-server$/, ''), acao = m[2].replace(/^notion-/, '');
  const tabela = Object.entries(MCP).find(([k]) => servidor.startsWith(k))?.[1];
  if (!tabela) return `Usando ${m[1]} (${acao.replace(/_/g, ' ')})`;
  return tabela[acao] || tabela['*'];
}

// Frase principal de um passo. ferramenta: nome da ferramenta; alvo/entrada: o que ela recebeu.
export function passo(ferramenta, alvo, entrada = {}) {
  const t = String(ferramenta || '');
  const a = alvo ?? entrada.file_path ?? entrada.pattern ?? entrada.command ?? entrada.query ?? entrada.url ?? '';
  switch (t) {
    case 'Read': return `Lendo ${arquivo(a)}`;
    case 'Edit': case 'MultiEdit': return `Editando ${arquivo(a)}`;
    case 'Write': return `Escrevendo ${arquivo(a)}`;
    case 'NotebookEdit': return `Editando o notebook ${arquivo(a)}`;
    case 'Grep': return `Procurando “${curto(String(a).split(' em ')[0], 40)}” no código`;
    case 'Glob': return `Listando arquivos (${curto(a, 40)})`;
    case 'LS': return 'Olhando os arquivos de uma pasta';
    case 'WebSearch': return `Pesquisando na web: “${curto(a, 50)}”`;
    case 'WebFetch': return `Lendo a página ${curto(a, 40)}`;
    case 'Skill': return `Seguindo a receita “${curto(a, 40)}”`;
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'Organizando a lista de tarefas';
    case 'Agent': case 'Task': return `Chamando ${entrada.subagent_type || 'um ajudante'}${entrada.description ? ': ' + curto(entrada.description, 50) : ''}`;
    case 'Bash': case 'PowerShell': {
      const [desc, cmd] = String(a).includes(' ::: ') ? String(a).split(' ::: ') : [entrada.description, a];
      return comandoHumano(cmd, desc);
    }
    case 'AskUserQuestion': return 'Fazendo uma pergunta para você';
    case 'ToolSearch': return 'Procurando as ferramentas certas';
    case 'SendMessage': return 'Mandando recado para outro agente';
    case 'Artifact': return 'Publicando uma página';
    case 'Monitor': case 'ScheduleWakeup': return 'Esperando algo terminar';
  }
  return mcpHumano(t) || (t ? `Usando ${t}` : curto(a, 70));
}

// Frase de um evento do escritório.
export function frase(e) {
  if (!e) return '';
  if (e.tipo === 'atividade' && e.ferramenta) return passo(e.ferramenta, e.alvo);
  if (e.tipo === 'inicio' && e.ferramenta && e.ferramenta !== 'Agent') return passo(e.ferramenta, e.alvo) + (e.chamou && e.chamou !== 'Orquestrador' ? ` (a pedido de ${e.chamou})` : '');
  const t = String(e.texto ?? '');
  if (e.tipo === 'pedido') return t.replace(/^(\S+) pediu: /, (_, q) => `${q === 'Orquestrador' ? 'A assistente' : q} pediu: `);
  if (e.tipo === 'alerta') return alertaHumano(t);
  if (e.tipo === 'erro') return 'Deu erro: ' + primeiraFrase(t.replace(/^(SCRIPT )?ERROR:\s*/i, '').replace(/^não começou: /, 'não conseguiu começar: '), 140);
  if (e.tipo === 'fim' && e.agente !== 'Orquestrador') return (FORA.has(e.agente) ? 'Terminou: ' : 'Entregou: ') + primeiraFrase(t, 160);
  if (e.tipo === 'espera' && e.resposta) return `Respondeu: ${e.resposta}`;
  if (t === 'esperando você') return 'Esperando você';
  if (t === 'sessão aberta') return 'Abriu uma sessão';
  if (t === 'sessão fechada') return 'Fechou a sessão';
  if (t === 'começou') return 'Começou a trabalhar';
  if (t === 'recebeu o resultado de um sub-agente') return 'Recebeu o resultado de um ajudante';
  // eventos antigos (antes do tradutor): "Read arquivo", "lendo x"…
  const m = /^(Read|Edit|Write|Grep|Glob|Bash|PowerShell|WebFetch|WebSearch|Skill|mcp__\S+) (.*)$/.exec(t);
  if (m) return passo(m[1], m[2]);
  return t;
}

// Ícone curto do tipo de passo (para linhas do tempo).
export function iconePasso(ferramenta, modo) {
  const t = String(ferramenta || '');
  if (/^(Read|Grep|Glob|LS)$/.test(t) || modo === 'ler') return '👁';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t) || modo === 'escrever') return '✎';
  if (/^(Bash|PowerShell)$/.test(t)) return '▶';
  if (/^Web/.test(t)) return '🌐';
  if (/^(Agent|Task)$/.test(t)) return '👥';
  if (t.startsWith('mcp__')) return '🧩';
  return '•';
}

// ======================= menos "log", mais gente =======================
const FORA = new Set(['Render', 'Godot', 'PixelLab', 'Blender', 'HuggingFace', 'Codex']);
export function primeiraFrase(t, n = 160) {
  const s = String(t ?? '').replace(/[#*`>_]+/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.{40,}?[.!?])(\s|$)/.exec(s);
  return curto(m && m[1].length <= n ? m[1] : s, n);
}

// "pediu permissão: generate_3d ..." -> "Quer sua permissão para gerar um modelo 3D"
function acaoMcp(acao) {
  for (const tabela of Object.values(MCP)) if (tabela[acao]) return tabela[acao];
  return null;
}
export function alertaHumano(t) {
  const m = /^pediu permissão: (\S+)\s*(.*)$/.exec(t);
  if (!m) return t === 'precisa de você' ? 'Precisa de você' : t.replace(/^Claude needs your permission to use /i, 'Quer permissão para usar ');
  const [, ferr, resto] = m;
  const f = acaoMcp(ferr) || (/^(Bash|PowerShell)$/.test(ferr) ? comandoHumano(resto) : /^[A-Z]/.test(ferr) ? passo(ferr, resto) : `usar ${ferr.replace(/_/g, ' ')}`);
  return `Quer permissão para: ${f.charAt(0).toLowerCase() + f.slice(1)}`;
}

// Classe de cada passo: para juntar passos parecidos.
export function categoria(e) {
  const t = String(e.ferramenta || '');
  if (e.tipo === 'alerta') return 'alerta';
  if (e.tipo === 'erro') return 'erro';
  if (e.tipo === 'fim') return 'entrega';
  if (e.tipo === 'pedido') return 'chamar';
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(t)) return 'ler';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) return 'escrever';
  if (/^Web/.test(t)) return 'web';
  if (/^(Bash|PowerShell)$/.test(t)) return 'cmd';
  if (/^(Agent|Task)$/.test(t)) return 'chamar';
  if (t === 'Skill') return 'skill';
  if (t.startsWith('mcp__')) return 'mcp';
  if (/^(TodoWrite|TaskCreate|TaskUpdate)$/.test(t)) return 'organizar';
  return 'outro';
}
const lista = (xs, n = 3) => { const u = [...new Set(xs.filter(Boolean))]; return u.slice(0, n).join(', ') + (u.length > n ? ` e mais ${u.length - n}` : ''); };
const alvoArq = (e) => arquivo(String(e.alvo ?? '').split(' ::: ')[0]);
const vezes = (n) => (n > 1 ? ` (${n}×)` : '');

// Resumo da missão inteira em poucas linhas: [{ icone, texto }]
export function resumo(passos) {
  const por = {};
  for (const e of passos) (por[categoria(e)] ??= []).push(e);
  const out = [];
  if (por.chamar) out.push({ icone: '🤖', texto: `Chamou ${lista(por.chamar.map((e) => e.ferramenta ? '' : tituloDe(e.agente)), 4) || 'um ajudante'}` });
  if (por.skill) out.push({ icone: '📘', texto: `Seguiu a skill ${lista(por.skill.map((e) => e.alvo))}` });
  if (por.ler) out.push({ icone: '📖', texto: `Leu ${new Set(por.ler.map(alvoArq)).size} arquivo(s) e fez ${por.ler.filter((e) => /Grep|Glob/.test(e.ferramenta)).length} busca(s)`.replace(' e fez 0 busca(s)', '') });
  if (por.escrever) { const a = por.escrever.map(alvoArq); out.push({ icone: '✏️', texto: `Mudou ${new Set(a).size} arquivo(s): ${lista(a)}` }); }
  if (por.cmd) {
    const c = new Map(); for (const e of por.cmd) { const f = passo(e.ferramenta, e.alvo); c.set(f, (c.get(f) || 0) + 1); }
    const top = [...c].sort((a, b) => b[1] - a[1]).filter(([f]) => !/^(Lendo um arquivo|Olhando os arquivos|Olhando o histórico)/.test(f));
    if (top.length) out.push({ icone: '▶️', texto: top.slice(0, 3).map(([f, n]) => f + vezes(n)).join(' · ') });
  }
  if (por.mcp) out.push({ icone: '🔌', texto: lista(por.mcp.map((e) => passo(e.ferramenta, e.alvo)), 2) });
  if (por.web) out.push({ icone: '🌐', texto: `Pesquisou na web${vezes(por.web.length)}` });
  if (por.alerta) out.push({ icone: '⚠️', texto: `Pediu sua permissão${vezes(por.alerta.length)}` });
  if (por.erro) out.push({ icone: '❌', texto: `${por.erro.length} erro(s): ${primeiraFrase(frase(por.erro.at(-1)).replace(/^Deu erro: /, ''), 70)}` });
  return out;
}

// Linha do tempo "por fases": passos seguidos do mesmo agente e do mesmo tipo viram uma linha só.
export function fases(passos) {
  const out = [];
  for (const e of passos) {
    const cat = categoria(e), ult = out.at(-1);
    if (ult && ult.agente === e.agente && ult.cat === cat && ['ler', 'escrever', 'cmd', 'web', 'organizar', 'mcp'].includes(cat)) { ult.itens.push(e); ult.fim = e.t; continue; }
    out.push({ agente: e.agente, cat, itens: [e], t: e.t, fim: e.t, tipo: e.tipo });
  }
  for (const f of out) {
    const n = f.itens.length, a = f.itens.map(alvoArq);
    f.texto = f.cat === 'ler' && n > 1 ? `Leu ${new Set(a).size} arquivos: ${lista(a)}`
      : f.cat === 'escrever' && n > 1 ? `Mudou ${new Set(a).size} arquivo(s): ${lista(a)}`
      : f.cat === 'cmd' && n > 1 ? lista(f.itens.map((e) => passo(e.ferramenta, e.alvo)), 3)
      : f.cat === 'web' && n > 1 ? `Pesquisou na web ${n}×`
      : f.cat === 'organizar' ? 'Organizou a lista de tarefas'
      : frase(f.itens[0]);
  }
  return out;
}
