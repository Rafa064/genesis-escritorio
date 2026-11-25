// Anexos do chat (imagens e PDF): 📎, colar (Ctrl+V) ou arrastar para a conversa.
// O arquivo sobe para o cofre privado "anexos" do Supabase (SQL 5) e a mensagem leva a marca
// [[anexo:caminho|nome]]; a ponte baixa o arquivo para o PC e entrega o caminho à assistente.
const MARCA = /\[\[anexo:([^|\]]+)\|([^\]]*)\]\]/g;
const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
const MAX = 20 * 1024 * 1024;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- na mensagem ----------
export function separar(texto) {
  const anexos = [];
  const limpo = String(texto || '').replace(MARCA, (_, caminho, nome) => { anexos.push({ caminho, nome }); return ''; }).trim();
  return { texto: limpo, anexos };
}
const ehImagem = (nome) => /\.(png|jpe?g|webp|gif)$/i.test(nome);
export function htmlAnexos(anexos) {
  if (!anexos.length) return '';
  return `<div class="anexos-msg">${anexos.map((a) => ehImagem(a.nome)
    ? `<a class="anexo-img" data-anexo="${esc(a.caminho)}" target="_blank" rel="noopener" title="${esc(a.nome)}"><img alt="${esc(a.nome)}"></a>`
    : `<a class="anexo-arq" data-anexo="${esc(a.caminho)}" target="_blank" rel="noopener">📄 ${esc(a.nome)}</a>`).join('')}</div>`;
}
// Links assinados (1 h) para as miniaturas: o cofre é privado.
const links = new Map();
export async function preencher(raiz, sb) {
  for (const el of raiz.querySelectorAll('[data-anexo]:not([href])')) {
    const c = el.dataset.anexo;
    let url = links.get(c);
    if (!url) { const { data } = await sb.storage.from('anexos').createSignedUrl(c, 3600); url = data?.signedUrl; if (!url) continue; links.set(c, url); }
    el.href = url; const img = el.querySelector('img'); if (img) img.src = url;
  }
}

// ---------- no compositor ----------
let pendentes = [];
export const temPendentes = () => pendentes.length > 0;
export function adicionar(arquivos, avisar) {
  for (const f of arquivos) {
    if (!TIPOS.includes(f.type)) { avisar(`“${f.name}” não vai: por enquanto só imagem (PNG, JPG, WEBP, GIF) e PDF.`); continue; }
    if (f.size > MAX) { avisar(`“${f.name}” passa de 20 MB.`); continue; }
    if (pendentes.length >= 6) { avisar('No máximo 6 anexos por mensagem.'); break; }
    pendentes.push({ arquivo: f, nome: f.name || `print-${Date.now()}.png`, previa: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' });
  }
}
export function desenharPendentes(el) {
  el.hidden = !pendentes.length;
  el.innerHTML = pendentes.map((p, i) => `<span class="anexo-pend">${p.previa ? `<img src="${p.previa}" alt="">` : '📄'}<small>${esc(p.nome)}</small><button type="button" data-tirar-anexo="${i}" aria-label="Tirar ${esc(p.nome)}">×</button></span>`).join('');
}
export function tirar(i) { const p = pendentes.splice(i, 1)[0]; if (p?.previa) URL.revokeObjectURL(p.previa); }
export function limpar() { pendentes.forEach((p) => p.previa && URL.revokeObjectURL(p.previa)); pendentes = []; }
// Sobe os pendentes e devolve as marcas para pôr no fim da mensagem.
export async function subirPendentes(sb) {
  if (!pendentes.length) return '';
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('entre de novo para mandar anexos');
  const marcas = [];
  for (const p of pendentes) {
    const nome = p.nome.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const caminho = `${user.id}/${Date.now()}-${nome}`;
    const { error } = await sb.storage.from('anexos').upload(caminho, p.arquivo, { contentType: p.arquivo.type });
    if (error) throw new Error(/bucket not found/i.test(error.message) ? 'falta rodar o SQL 5 (anexos) no Supabase' : error.message);
    marcas.push(`[[anexo:${caminho}|${p.nome.replace(/[|\]]/g, '_')}]]`);
  }
  return marcas.join('\n');
}
