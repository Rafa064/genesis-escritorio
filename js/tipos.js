// "Quem é quem": cada coisa que aparece no escritório tem um TIPO, com ícone, cor e explicação.
// Personagens (têm mesa): assistente, agente, IA externa, plugin, programa.
// Não-personagens (aparecem como etiqueta): skill (receita), conector.

export const TIPOS = {
  assistente: { icone: '👑', rot: 'Assistente', plural: 'Assistentes', cor: '#a785f0', curta: 'a chefe da equipe',
    explica: 'É com ela que você conversa. Ela entende o pedido, divide o trabalho e chama os agentes. Uma por pessoa.' },
  agente: { icone: '🤖', rot: 'Agente', plural: 'Agentes', cor: '#d97a4a', curta: 'especialista com mesa própria',
    explica: 'Um "funcionário" especialista (Editor de vídeo, Balanceador…). Só trabalha quando a assistente chama. Cada um tem um modelo (Haiku, Sonnet, Opus).' },
  ia: { icone: '🧠', rot: 'IA externa', plural: 'IAs externas', cor: '#3fb37f', curta: 'outra IA (GPT)',
    explica: 'IA de outra empresa (o Codex, da OpenAI). Usada para revisar, dar nota e como segunda opinião.' },
  plugin: { icone: '🔌', rot: 'Conector', plural: 'Conectores', cor: '#5aa9e6', curta: 'liga a IA a outro programa',
    explica: 'Um "cabo" (MCP) que deixa a IA usar outro programa ou site: PixelLab, Blender, Notion, Hugging Face. Não pensa sozinho: é usado por um agente.' },
  programa: { icone: '🛠️', rot: 'Programa', plural: 'Programas', cor: '#8a8fa6', curta: 'roda no PC',
    explica: 'Um programa do seu PC que a IA roda pelo terminal: Godot (o jogo), Render (Remotion, os vídeos).' },
  skill: { icone: '📘', rot: 'Skill', plural: 'Skills', cor: '#ffd23f', curta: 'receita que a IA segue',
    explica: 'Um manual de "como fazer" (ex.: video-do-jogo, balanceamento-com-bots). Não é um personagem: qualquer agente pode abrir a receita e seguir.' },
  pacote: { icone: '📦', rot: 'Plugin', plural: 'Plugins', cor: '#c9a34a', curta: 'pacote instalado no Claude Code',
    explica: 'Um pacote que traz skills, agentes e comandos prontos de uma vez (ex.: claude-code-setup).' },
};

const PLUGINS = new Set(['PixelLab', 'Blender', 'HuggingFace', 'Notion']);
const PROGRAMAS = new Set(['Godot', 'Render']);
export function tipoDe(nome) {
  if (nome === 'Orquestrador') return 'assistente';
  if (nome === 'Codex') return 'ia';
  if (PLUGINS.has(nome)) return 'plugin';
  if (PROGRAMAS.has(nome)) return 'programa';
  return 'agente';
}
export const infoTipo = (nome) => TIPOS[tipoDe(nome)];

// Nome amigável de um servidor MCP a partir do nome da ferramenta (mcp__pixellab__create_character).
const NOMES_MCP = { pixellab: 'PixelLab', blender: 'Blender', notion: 'Notion', hf: 'Hugging Face', 'hf-mcp-server': 'Hugging Face', claude_ai_notion: 'Notion', claude_ai_claude_docs: 'Claude Docs', 'claude-vscode': 'VS Code' };
export function conectorDe(ferramenta) {
  const m = /^mcp__(.+?)__/.exec(String(ferramenta || ''));
  if (!m) return null;
  const k = m[1].toLowerCase();
  return NOMES_MCP[k] || NOMES_MCP[k.replace(/^claude_ai_/, '')] || m[1].replace(/^claude_ai_/, '').replace(/[_-]+/g, ' ');
}
export const nomeConector = (k) => NOMES_MCP[String(k).toLowerCase()] || k;

// Descrição de skill escrita para a IA ("Use quando…") vira frase para gente.
export function descricaoHumana(d) {
  return String(d || '').replace(/^(use|usar|use this skill|use when|use quando|quando)\s*(quando|when|for|para)?\s*/i, '').replace(/^\w/, (c) => c.toUpperCase());
}

// Etiqueta HTML pequena do tipo (ícone + rótulo).
export const etiquetaTipo = (tipo, extra = '') => { const t = TIPOS[tipo]; return `<span class="tipo" style="--cor:${t.cor}" title="${t.rot}: ${t.curta}">${t.icone} ${t.rot}${extra ? ' · ' + extra : ''}</span>`; };
