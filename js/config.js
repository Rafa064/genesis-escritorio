// Configuração pública do escritório. A chave "publishable" do Supabase é feita para
// ficar no navegador: quem protege os dados é o login + as regras (RLS) do banco.
export const SUPABASE_URL = 'https://rpmrutzgbqukxqwydxjx.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_Hhok3TA33X6SU3CMu1TcRQ_N0DaiHTo';

// Ordem das salas de vidro: a 1ª pessoa fica à esquerda.
export const ORDEM_PESSOAS = ['Rafael', 'Kenny'];
export const COR_PESSOA = { Rafael: '#e0763a', Kenny: '#3a86e0' };

// Nomes amigáveis dos agentes no painel.
export const TITULOS = {
  Orquestrador: 'Assistente',
  'editor-de-video': 'Editor de vídeo',
  'criador-de-conteudo': 'Criadora de conteúdo',
  'artista-3d': 'Artista 3D',
  balanceador: 'Balanceador',
  explorador: 'Explorador',
  'revisor-godot': 'Revisor Godot',
  Codex: 'Codex',
  PixelLab: 'PixelLab',
  Blender: 'Blender',
  Render: 'Render',
  Godot: 'Godot',
};
// Fichas dos agentes (frontmatter de .claude/agents/<nome>.md: titulo, papel, entrega, nao_faz,
// cor, visual), que a ponte manda em estado.info.agentes. Valem mais que TITULOS/VISUAL.
export const FICHAS = new Map();
// Guarda as fichas de uma lista de agentes; devolve true se alguma mudou (para refazer retratos).
export function registrarFichas(agentes) {
  let mudou = false;
  for (const a of agentes || []) {
    if (!a?.nome || !a.ficha) continue;
    const j = JSON.stringify(a.ficha);
    if (JSON.stringify(FICHAS.get(a.nome)) !== j) { FICHAS.set(a.nome, a.ficha); mudou = true; }
  }
  return mudou;
}
export const fichaDe = (nome) => FICHAS.get(nome) || null;
export const tituloDe = (nome) => FICHAS.get(nome)?.titulo || TITULOS[nome] || nome;
