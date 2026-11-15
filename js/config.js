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
export const tituloDe = (nome) => TITULOS[nome] || nome;
