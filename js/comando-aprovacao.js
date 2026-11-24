// Pedidos de autorização em linguagem de gente: o que vai acontecer, uma linha por ação, as perigosas
// separadas (em vermelho), botões com o verbo certo e o comando cru recolhido em "Detalhes técnicos".
// A decisão continua uma só (a ponte pergunta pela ferramenta inteira): o cartão diz isso com clareza.
import { esc, lerJson, nomeArq } from './comando-ctx.js';
import { ico } from './comando-icones.js';

const curto = (t, n = 60) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const code = (t) => `<code>${esc(curto(t, 48))}</code>`;
const args = (p) => p.split(/\s+/).slice(1).filter((x) => x && !x.startsWith('-')).map((x) => x.replace(/^["']|["']$/g, ''));

// Uma parte do comando ("git push origin x") vira uma ação com título, explicação e botão.
function acaoDoComando(p, descricao) {
  const s = p.trim();
  let m;
  if (/^git\s+push\b.*(\s--force\b|\s-f\b)/i.test(s)) return { ic: 'subir', t: 'Publicar no GitHub por cima (forçado)', d: 'Troca o que está no GitHub pela versão do seu PC. Pode apagar trabalho que o Kenny já subiu.', perigo: true, sim: 'Autorizar envio forçado' };
  if ((m = /^git\s+push\b(?:\s+(\S+))?(?:\s+(\S+))?/i.exec(s))) return { ic: 'subir', t: 'Publicar alterações no GitHub', d: `Envia ${m[2] ? `a branch ${code(m[2])}` : 'as versões salvas'} para o GitHub. Quem tem acesso ao projeto (o Kenny) passa a ver.`, sim: 'Autorizar publicação' };
  if (/^git\s+commit\b/i.test(s)) return { ic: 'disco', t: 'Salvar uma versão (commit)', d: 'Guarda as mudanças no histórico do projeto. Fica só no seu PC até alguém publicar.', sim: 'Autorizar commit' };
  if (/^git\s+(reset\s+--hard|clean\s|checkout\s+--\s|restore\s|branch\s+-D|stash\s+drop)/i.test(s)) return { ic: 'alerta', t: 'Desfazer mudanças no projeto', d: 'Joga fora mudanças que ainda não foram salvas. Não dá para recuperar depois.', perigo: true, sim: 'Autorizar e desfazer' };
  if (/^git\s+(pull|fetch|merge|rebase|checkout|switch)\b/i.test(s)) return { ic: 'terminal', t: 'Atualizar o projeto com o GitHub', d: 'Traz ou junta versões do projeto. Se houver conflito, ela avisa.', sim: 'Autorizar' };
  if (/^(rm|del|erase|rmdir|rd|unlink|Remove-Item|ri)\s/i.test(s)) {
    const alvos = args(s), pasta = /\s-\w*r|\s-Recurse|rmdir|\brd\b/i.test(s), tmp = alvos.length && alvos.every((a) => /te?mp|cache|\.tmp|out\b|build/i.test(a));
    return { ic: 'lixo', t: tmp ? 'Apagar arquivos temporários' : 'Apagar arquivos', d: `Apaga de vez ${alvos.length ? alvos.slice(0, 3).map(code).join(', ') + (alvos.length > 3 ? ` e mais ${alvos.length - 3}` : '') : 'arquivos'}${pasta ? ' (a pasta inteira, com tudo dentro)' : ''}. Não vai para a lixeira.`, perigo: true, sim: 'Autorizar exclusão' };
  }
  if ((m = /remotion\s+render\s+(\S+)(?:\s+(\S+))?/i.exec(s))) return { ic: 'filme', t: `Renderizar o vídeo ${m[1]}`, d: `Gera ${m[2] ? `o arquivo ${code(nomeArq(m[2]))}` : 'o vídeo final'}. Leva alguns minutos e deixa o PC mais lento enquanto isso.`, sim: 'Autorizar render' };
  if (/ffmpeg\b/i.test(s)) return { ic: 'filme', t: 'Converter ou cortar um vídeo', d: 'Usa o ffmpeg para gerar um arquivo novo de vídeo ou imagem.', sim: 'Autorizar' };
  if (/godot\b.*--headless/i.test(s)) return { ic: 'terminal', t: 'Rodar o jogo sem janela (teste)', d: 'Abre o jogo escondido para testar. Não muda nada no projeto.', sim: 'Autorizar teste' };
  if (/publicar\.mjs|npm\s+publish|gh\s+(pr\s+merge|release)|butler\s+push/i.test(s)) return { ic: 'globo', t: 'Publicar na internet', d: 'Coloca uma versão nova no ar, à vista de quem acessa.', perigo: true, sim: 'Autorizar publicação' };
  if (/^(npm|pnpm|yarn)\s+(i|install|add)\b|pip\s+install|winget\s+install/i.test(s)) return { ic: 'globo', t: 'Instalar pacotes', d: 'Baixa programas da internet para dentro do projeto.', sim: 'Autorizar instalação' };
  if (/\b(curl|wget|Invoke-WebRequest|iwr)\b/i.test(s)) return { ic: 'globo', t: 'Acessar a internet', d: 'Baixa ou manda dados por um endereço da internet.', sim: 'Autorizar acesso' };
  if ((m = /^(?:node|npx|python3?|py)\s+(\S+)/i.exec(s))) return { ic: 'terminal', t: `Rodar o programa ${nomeArq(m[1])}`, d: descricao ? `${esc(descricao)}.` : 'Um programa do projeto, no seu PC.', sim: 'Autorizar' };
  return { ic: 'terminal', t: 'Rodar um comando no PC', d: descricao ? `${esc(descricao)}.` : 'Um comando de terminal (veja em Detalhes técnicos).', sim: 'Autorizar comando' };
}

// Ferramentas que não são terminal.
function acaoDaFerramenta(ferr, campos, passoTxt) {
  const arq = campos.file_path || campos.notebook_path || '';
  if (/^(Edit|MultiEdit|NotebookEdit)$/.test(ferr)) return { ic: 'lapis', t: `Mudar o arquivo ${nomeArq(arq)}`, d: 'Altera partes do arquivo. Dá para desfazer pelo git.', sim: 'Autorizar mudança' };
  if (ferr === 'Write') return { ic: 'lapis', t: `Criar ou substituir ${nomeArq(arq)}`, d: 'Escreve o arquivo inteiro. Se ele já existir, o conteúdo antigo é trocado.', sim: 'Autorizar' };
  if (ferr === 'WebFetch') return { ic: 'globo', t: 'Abrir um site', d: `Lê a página ${code(campos.url || '')}.`, sim: 'Autorizar' };
  if (ferr === 'WebSearch') return { ic: 'globo', t: 'Pesquisar na internet', d: `Busca por “${esc(curto(campos.query, 60))}”.`, sim: 'Autorizar pesquisa' };
  if (ferr === 'Agent' || ferr === 'Task') return { ic: 'equipe', t: 'Chamar um ajudante', d: `${esc(campos.subagent_type || 'Um agente')} vai cuidar de: ${esc(curto(campos.description, 70))}.`, sim: 'Autorizar' };
  const mcp = /^mcp__(\w+?)__(\w+)/.exec(ferr);
  if (mcp) {
    const [, srv0, acao] = mcp, srv = ({ blender: 'Blender', pixellab: 'PixelLab', hf: 'Hugging Face', notion: 'Notion' })[srv0] || srv0, prompt = campos.prompt || campos.description || campos.text || '';
    const gera = /generate|create|render|animate/i.test(acao);
    if (/3d/i.test(acao)) return { ic: 'cubo', t: 'Gerar um modelo 3D com IA', d: `Pede ao ${esc(srv)} um modelo${prompt ? `: “${esc(curto(prompt, 70))}”` : ''}. Pode gastar créditos do serviço.`, sim: 'Autorizar geração' };
    if (gera) return { ic: 'imagem', t: `Criar com IA (${esc(srv)})`, d: `${prompt ? `“${esc(curto(prompt, 70))}”. ` : ''}Pode gastar créditos do serviço.`, sim: 'Autorizar geração' };
    return { ic: 'terminal', t: `Usar ${esc(srv)}`, d: esc(passoTxt || acao), sim: 'Autorizar' };
  }
  return { ic: 'terminal', t: `Usar ${esc(ferr)}`, d: esc(passoTxt || ''), sim: 'Autorizar' };
}

// Avisos que valem para o pedido inteiro (arquivo sensível, fora do projeto).
function avisosExtras(campos, projeto) {
  const cmd = String(campos.command || ''), out = [];
  if (/\.env\b|credential|secret|token|\.ssh|id_rsa/i.test(cmd + ' ' + (campos.file_path || ''))) out.push({ ic: 'chave', t: 'Mexe com arquivo de senha', d: 'Envolve um arquivo que guarda senhas ou chaves. Confira os detalhes técnicos.', perigo: true });
  if (projeto) {
    const caminhos = [campos.file_path, campos.notebook_path, campos.path, ...(cmd.match(/[A-Za-z]:[\\/][^\s"'`|;&]+/g) || [])].filter(Boolean).map((x) => String(x).replace(/\\/g, '/').toLowerCase());
    if (caminhos.some((x) => /^[a-z]:\//.test(x) && !x.includes('/' + String(projeto).toLowerCase()) && !/\/(temp|tmp)\//.test(x) && !/\.genesis-estudio|\.claude\//.test(x))) out.push({ ic: 'pasta', t: 'Mexe fora da pasta do projeto', d: `Toca em arquivos que não são de ${esc(projeto)}.`, perigo: true });
  }
  return out;
}

const minusc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const nomeAcao = (y) => y.sim.replace(/^Autorizar\s*(e\s+)?/, '') || minusc(y.t);
// Tudo o que o cartão (e o resumo do cartão do pedido) precisa saber.
export function explicar(a, { passoTxt = '', projeto = '' } = {}) {
  const { origem, cortado, pedidoDe, ...campos } = lerJson(a.detalhe);
  let acoes;
  if (campos.command) {
    const partes = String(campos.command).split(/\s*(?:&&|\|\||;)\s*/).map((x) => x.trim()).filter(Boolean);
    acoes = partes.map((p) => ({ ...acaoDoComando(p, partes.length === 1 ? campos.description : ''), cmd: p }));
    // Duas partes que viram a mesma ação genérica: junta numa só.
    acoes = acoes.filter((x, i) => !(x.t === 'Rodar um comando no PC' && acoes.findIndex((y) => y.t === x.t) !== i));
  } else acoes = [acaoDaFerramenta(a.ferramenta, campos, passoTxt)];
  const extras = avisosExtras(campos, projeto);
  const perigo = acoes.some((x) => x.perigo) || extras.length > 0;
  const titulo = acoes.length === 1 ? acoes[0].t : acoes.slice(0, -1).map((x, i) => (i ? minusc(x.t) : x.t)).join(', ') + ' e ' + minusc(acoes.at(-1).t);
  const sim = acoes.length === 1 ? acoes[0].sim : `Autorizar as ${acoes.length} ações`;
  return { acoes, extras, perigo, titulo, sim, campos, origem, cortado, pedidoDe };
}

// Recado mandado na conversa quando você autoriza só uma parte (a ponte decide a ferramenta inteira:
// ela recebe a recusa e, logo depois, este recado com o que pode fazer).
export function recadoParcial(a, escolhidas) {
  const x = explicar(a), sim = x.acoes.filter((_, i) => escolhidas.includes(i)), nao = x.acoes.filter((_, i) => !escolhidas.includes(i));
  return `Sobre a autorização que eu recusei agora: pode fazer só ${sim.map((y) => `“${y.t}” (${y.cmd})`).join(' e ')}. Não faça ${nao.map((y) => `“${y.t}”`).join(' nem ')}. Depois continue o pedido normalmente.`;
}
// Texto e cor do botão de confirmar, conforme o que está marcado (várias ações).
export function rotuloConfirmar(a, escolhidas) {
  const x = explicar(a), n = escolhidas.length, total = x.acoes.length;
  if (!n) return { txt: 'Marque acima o que pode', cls: 'btn', off: true };
  const perigo = escolhidas.some((i) => x.acoes[i]?.perigo);
  if (n === total) return { txt: `Autorizar as ${total} ações`, cls: perigo ? 'btn perigo-forte' : 'btn forte' };
  return { txt: n === 1 ? `Recusar e pedir só: ${nomeAcao(x.acoes[escolhidas[0]])}` : `Recusar e pedir só ${n} ações`, cls: perigo ? 'btn perigo-forte' : 'btn forte' };
}

// Cartão completo. info: { quem, projeto, dentroHtml, origemTxt, quando }.
// Uma ação: "Autorizar X" / "Não autorizar". Várias: cada uma com o seu botão (as perigosas em vermelho) e um "Confirmar".
export function html(a, info) {
  const x = explicar(a, info), varias = x.acoes.length > 1;
  const linha = (y, i) => `<li class="ap-acao${y.perigo ? ' perigo' : ''}"><span class="ap-ic">${ico(y.ic)}</span><div><b>${esc(y.t)}</b>${y.perigo ? '<em class="ap-tag-perigo">ação perigosa</em>' : ''}<span>${y.d}</span>
      ${varias && i != null ? `<button type="button" class="ap-sel${y.perigo ? ' perigo' : ''}" data-ap-sel="${i}" aria-pressed="false"><i aria-hidden="true"></i>Selecionar ${esc(nomeAcao(y))}</button>` : ''}</div></li>`;
  const idx = x.acoes.map((y, i) => [y, i]);
  const seguras = idx.filter(([y]) => !y.perigo), perigosas = idx.filter(([y]) => y.perigo);
  const tec = Object.entries(x.campos).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
  const conf = rotuloConfirmar(a, []);
  return `<div class="aprovacao ap2${x.perigo ? ' tem-perigo' : ''}${varias ? ' varias' : ''}" data-ap="${a.id}">
    <div class="ap-cab">${ico('mao')}<b>Precisa da sua autorização</b><small>${esc(info.quando || '')}</small></div>
    <p class="ap-quem"><b>${esc(info.quem)}</b> quer${varias ? ` fazer ${x.acoes.length} coisas` : ''}${info.projeto ? ` em <b>${esc(info.projeto)}</b>` : ''}${varias ? '. Autorize só o que pode:' : ':'}</p>
    ${seguras.length ? `<ol class="ap-acoes">${seguras.map(([y, i]) => linha(y, i)).join('')}</ol>` : ''}
    ${perigosas.length || x.extras.length ? `<ol class="ap-acoes ap-perigosas">${perigosas.map(([y, i]) => linha(y, i)).join('')}${x.extras.map((y) => linha(y, null)).join('')}</ol>` : ''}
    ${x.cortado ? '<p class="ap-nota ap-cortado">O pedido é grande demais e veio cortado. Confira no PC antes de autorizar.</p>' : ''}
    ${varias
      ? `<p class="ap-nota ap-parcial" hidden>Como é um comando só, ela recebe a recusa do comando inteiro e, logo depois, um recado na conversa dizendo o que pode fazer.</p>
         <div class="ap-botoes"><button class="${conf.cls}" data-ap-confirmar disabled>${esc(conf.txt)}</button><button class="btn" data-decide="negado">Não autorizar nada</button></div>`
      : `<div class="ap-botoes"><button class="btn ${x.perigo ? 'perigo-forte' : 'forte'}" data-decide="permitido">${esc(x.sim)}</button><button class="btn" data-decide="negado">Não autorizar</button></div>`}
    <details class="ap-det"><summary>Detalhes técnicos</summary>
      <p>${esc(info.origemTxt || '')}${info.dentroHtml ? ` · ${info.dentroHtml}` : ''} · ferramenta <code>${esc(a.ferramenta)}</code></p>
      <pre class="det">${esc(tec || a.ferramenta)}</pre></details>
  </div>`;
}
