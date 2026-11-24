// Pedidos de autorização em linguagem de gente: o que vai acontecer, uma linha por ação, as perigosas
// separadas (em vermelho), botões com o verbo certo e o comando cru recolhido em "Detalhes técnicos".
// A decisão continua uma só (a ponte pergunta pela ferramenta inteira): o cartão diz isso com clareza.
import { esc, lerJson, nomeArq } from './comando-ctx.js';
import { ico } from './comando-icones.js';
import { nomeProjeto } from './leitura.js';

const curto = (t, n = 60) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const code = (t) => `<code>${esc(curto(t, 48))}</code>`;
// "gen-186-trailer-v2" → "trailer v2" (o número do card e os hífens ficam nos detalhes).
const versaoHumana = (b) => String(b).replace(/^(origin\/)?/, '').replace(/^[a-z]{2,5}-\d+-/i, '').replace(/[-_/]+/g, ' ').trim() || b;
// Para onde vai o efeito da ação, numa linha ("Destino").
function destino(y, projeto) {
  if (y.dest === 'github') return `Repositório ${projeto || 'do projeto'} no GitHub`;
  if (y.ic === 'globo' && /Publicar/.test(y.t)) return 'Internet (site público)';
  if (y.ic === 'globo') return 'Internet';
  if (y.ic === 'cubo' || y.ic === 'imagem') return 'Serviço de IA externo (gasta créditos)';
  if (y.ic === 'lixo') return `Arquivos do seu PC${projeto ? ` · ${projeto}` : ''}`;
  return `Seu PC${projeto ? ` · projeto ${projeto}` : ''}`;
}
const args = (p) => p.split(/\s+/).slice(1).filter((x) => x && !x.startsWith('-')).map((x) => x.replace(/^["']|["']$/g, ''));

// Uma parte do comando ("git push origin x") vira uma ação com título, explicação e botão.
function acaoDoComando(p, descricao) {
  const s = p.trim();
  let m;
  if (/^git\s+push\b.*(\s--force\b|\s-f\b)/i.test(s)) return { ic: 'subir', t: 'Publicar no GitHub por cima (forçado)', d: 'Troca o que está no GitHub pela versão do seu PC. Pode apagar trabalho que o Kenny já subiu.', perigo: true, sim: 'Autorizar envio forçado', nao: 'O GitHub continua como está.' };
  if ((m = /^git\s+push\b(?:\s+(\S+))?(?:\s+(\S+))?/i.exec(s))) return { ic: 'subir', t: m[2] ? `Publicar a versão “${versaoHumana(m[2])}” no GitHub` : 'Publicar alterações no GitHub', d: 'Quem tem acesso ao projeto (o Kenny) passa a ver e pode baixar essa versão.', dest: 'github', versao: m[2] || '', sim: 'Autorizar publicação', nao: 'Nada sai do seu PC. As mudanças continuam salvas aqui.' };
  if (/^git\s+commit\b/i.test(s)) return { ic: 'disco', t: 'Salvar uma versão (commit)', d: 'Guarda as mudanças no histórico do projeto. Fica só no seu PC até alguém publicar.', sim: 'Autorizar commit', nao: 'As mudanças continuam no PC, sem uma versão salva.' };
  if (/^git\s+(reset\s+--hard|clean\s|checkout\s+--\s|restore\s|branch\s+-D|stash\s+drop)/i.test(s)) return { ic: 'alerta', t: 'Desfazer mudanças no projeto', d: 'Joga fora mudanças que ainda não foram salvas. Não dá para recuperar depois.', perigo: true, sim: 'Autorizar e desfazer', nao: 'Nada é jogado fora.' };
  if (/^git\s+(pull|fetch|merge|rebase|checkout|switch)\b/i.test(s)) return { ic: 'terminal', t: 'Atualizar o projeto com o GitHub', d: 'Traz ou junta versões do projeto. Se houver conflito, ela avisa.', sim: 'Autorizar' };
  if (/^(rm|del|erase|rmdir|rd|unlink|Remove-Item|ri)\s/i.test(s)) {
    const alvos = args(s), pasta = /\s-\w*r|\s-Recurse|rmdir|\brd\b/i.test(s), tmp = alvos.length && alvos.every((a) => /te?mp|cache|\.tmp|out\b|build/i.test(a));
    return { ic: 'lixo', t: tmp ? 'Apagar arquivos temporários' : 'Apagar arquivos', d: `Apaga de vez ${alvos.length ? alvos.slice(0, 3).map(code).join(', ') + (alvos.length > 3 ? ` e mais ${alvos.length - 3}` : '') : 'arquivos'}${pasta ? ' (a pasta inteira, com tudo dentro)' : ''}. Não vai para a lixeira.`, perigo: true, sim: 'Excluir permanentemente', nao: 'Os arquivos ficam onde estão.', alvos, pasta };
  }
  if ((m = /remotion\s+render\s+(\S+)(?:\s+(\S+))?/i.exec(s))) return { ic: 'filme', t: `Renderizar o vídeo ${m[1]}`, d: `Gera ${m[2] ? `o arquivo ${code(nomeArq(m[2]))}` : 'o vídeo final'}. Leva alguns minutos e deixa o PC mais lento enquanto isso.`, sim: 'Autorizar render', nao: 'O vídeo não é gerado agora.' };
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
    if (/3d/i.test(acao)) return { ic: 'cubo', t: 'Gerar um modelo 3D com IA', d: `Pede ao ${esc(srv)} um modelo${prompt ? `: “${esc(curto(prompt, 70))}”` : ''}. Pode gastar créditos do serviço.`, sim: 'Autorizar geração', nao: 'Nenhum crédito é gasto.' };
    if (gera) return { ic: 'imagem', t: `Criar com IA (${esc(srv)})`, d: `${prompt ? `“${esc(curto(prompt, 70))}”. ` : ''}Pode gastar créditos do serviço.`, sim: 'Autorizar geração', nao: 'Nenhum crédito é gasto.' };
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

// Caminho de arquivo legível: quebra só nas barras e a observação "(412 imagens)" vai numa linha própria.
function caminho(f) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(f), nome = m ? m[1] : f, obs = m ? m[2] : '';
  return `<span class="ap3-cam"><code>${esc(nome).replace(/\//g, '/<wbr>')}</code>${obs ? `<small>${esc(obs)}</small>` : ''}</span>`;
}
// "Pedido “X” · decisão 2 de 3 deste pedido": info.ordem ({ base, total }) soma as autorizações do mesmo pedido.
function numero(info, n, i) {
  const o = info.ordem, tot = o ? o.total : n, k = (o ? o.base : 0) + i + 1, num = tot > 1 ? `decisão ${k} de ${tot} deste pedido` : '';
  if (info.pedido) return `<p class="ap3-pedido">${num ? `<span class="ap3-num">${num.charAt(0).toUpperCase()}${num.slice(1, num.indexOf(' deste') > 0 ? num.indexOf(' deste') : undefined)} ·</span> ` : ''}${info.convId != null ? `<button type="button" class="ap3-pedido-link" data-pp-conv="${esc(info.convId)}" title="Abrir a página do pedido">pedido <b>“${esc(info.pedido)}”</b> ›</button>` : `pedido <b>“${esc(info.pedido)}”</b>`}</p>`;
  return num ? `<p class="ap3-pedido">${num.charAt(0).toUpperCase()}${num.slice(1)}</p>` : '';
}
// Quantas decisões este pedido de autorização pede (uma por ação).
export const nDecisoes = (a) => explicar(a).acoes.length;

// Uma decisão por cartão: o que acontece se autorizar, o que acontece se recusar, Autorizar / Recusar.
// Um comando com várias ações vira vários cartões ("1 de 2"); a resposta vai à ponte quando todos forem decididos.
// info: { quem, projeto, dentroHtml, origemTxt, quando }. escolhas: { [i]: 'sim' | 'nao' } já marcadas aqui.
export function html(a, info, escolhas = {}) {
  const x = explicar(a, info), n = x.acoes.length;
  const lista = Array.isArray(x.campos.arquivos) ? x.campos.arquivos.map(String) : null;
  const decididas = Object.keys(escolhas).length;
  return x.acoes.map((y, i) => {
    const dec = escolhas[i], perigo = y.perigo || (i === 0 && x.extras.length > 0);
    const nao = (y.nao || 'Ela não faz isto e pergunta como seguir.') + (n > 1 ? ' O resto do pedido segue.' : '');
    // Exclusão: os arquivos aparecem ANTES de decidir (lista da ponte, ou o que o comando aponta).
    let arqs = '';
    if (y.ic === 'lixo') {
      const itens = lista?.length ? lista : (y.alvos || []);
      // Separa arquivos de pastas ("frames/ (412 imagens)") para a contagem não subestimar o que some.
      const ehPasta = (f) => /\/\s*(\(|$)/.test(f), pastas = itens.filter(ehPasta), arqsN = itens.length - pastas.length;
      const resumo = lista?.length ? [arqsN ? `${arqsN} arquivo${arqsN > 1 ? 's' : ''}` : '', ...pastas.map((p) => { const m = /\(([^)]+)\)/.exec(p); return `1 pasta${m ? ` (${m[1]})` : ''}`; })].filter(Boolean).join(' + ') : '';
      const raiz = (y.alvos || [])[0];
      arqs = `<div class="ap3-arqs"><p class="ap3-arqs-tit"><b>Exclusão permanente${raiz ? ` de <code>${esc(raiz)}</code>` : ''}</b><span>${resumo ? `${esc(resumo)} · ` : ''}${y.pasta ? 'a pasta inteira, com tudo dentro · ' : ''}não vai para a lixeira</span></p>
        <ul>${itens.slice(0, 8).map((f) => `<li class="${ehPasta(f) ? 'pasta' : ''}">${ico(ehPasta(f) ? 'pasta' : 'lapis')}${caminho(f)}</li>`).join('')}${itens.length > 8 ? `<li class="ap3-mais">e mais ${itens.length - 8}</li>` : ''}</ul>
        ${a.conversa_id != null && !dec ? '<button type="button" class="ap3-listar" data-ap-dec="listar">Ver a lista completa antes <small>(ela não apaga e pergunta de novo)</small></button>' : ''}</div>`;
    }
    const extras = i === 0 && x.extras.length ? `<ul class="ap3-extras">${x.extras.map((e) => `<li>${ico(e.ic)}<span><b>${esc(e.t)}.</b> ${e.d}</span></li>`).join('')}</ul>` : '';
    const falta = n - decididas;
    const estado = dec ? `<div class="ap3-feito ${dec}"><span>${ico(dec === 'sim' ? 'check' : 'pare')}<b>${dec === 'sim' ? 'Você autorizou' : dec === 'listar' ? 'Você pediu a lista antes' : 'Você recusou'}</b>${falta > 0 ? `<small class="ap3-falta">Ela segue depois de mais ${falta} decis${falta > 1 ? 'ões' : 'ão'} logo abaixo.</small>` : ''}</span><button type="button" class="ap3-mudar" data-ap-mudar>Mudar</button></div>`
      : `<div class="ap-botoes ap3-botoes"><button type="button" class="btn ${perigo ? 'perigo-forte' : 'forte'}" data-ap-dec="sim">${esc(y.sim)}</button><button type="button" class="btn ap3-recusar" data-ap-dec="nao">Recusar</button></div>`;
    return `<div class="aprovacao ap3${perigo ? ' perigo' : ''}${dec ? ' decidida' : ''}" data-ap="${a.id}" data-ap-i="${i}">
      ${numero(info, n, i)}
      <div class="ap3-cab"><span class="ap-ic">${ico(y.ic)}</span><div class="ap3-tit"><b>${esc(y.t)}</b><small class="ap3-dest"><span>Destino:</span> ${esc(destino(y, info.projeto))}</small></div></div>
      ${arqs}
      <dl class="ap3-conseq"><div class="sim"><dt>Se autorizar</dt><dd>${arqs ? 'Tudo o que está na lista acima é apagado de vez.' : y.d}</dd></div></dl>
      ${dec ? '' : `<p class="ap3-nao"><b>Se recusar</b> ${esc(nao)}</p>`}
      ${extras}
      ${x.cortado && i === 0 ? '<p class="ap-nota ap-cortado">O pedido veio cortado (grande demais). Confira no PC antes de autorizar.</p>' : ''}
      ${estado}
      <details class="ap-det"><summary>Detalhes técnicos</summary><p>Quem pediu: <b>${esc(info.quem)}</b>${info.quando ? ` · ${esc(info.quando)}` : ''}${y.versao ? ` · versão <code>${esc(y.versao)}</code>` : ''}</p><p>${esc(info.origemTxt || '')}${info.dentroHtml ? ` · ${info.dentroHtml}` : ''}</p><pre class="det">${esc(y.cmd || Object.entries(x.campos).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n') || a.ferramenta)}</pre></details>
    </div>`;
  }).join('');
}
// Recado mandado depois das decisões de um pedido com recusa (ou "ver a lista antes"): a ponte só
// aceita ou recusa o comando inteiro, então ela recebe a recusa e, logo depois, o que pode fazer.
export function recadoDecisoes(a, escolhas) {
  const x = explicar(a), sim = [], nao = [], listar = [];
  x.acoes.forEach((y, i) => (escolhas[i] === 'sim' ? sim : escolhas[i] === 'listar' ? listar : nao).push(y));
  const partes = ['Sobre a autorização que acabei de responder:'];
  if (sim.length) partes.push(`pode fazer ${sim.map((y) => `“${y.t}” (${y.cmd || a.ferramenta})`).join(' e ')}.`);
  if (nao.length) partes.push(`Não faça ${nao.map((y) => `“${y.t}”`).join(' nem ')}.`);
  if (listar.length) partes.push(`Antes de apagar ${listar.map((y) => (y.alvos || []).join(', ') || 'os arquivos').join(', ')}, me mostre a lista completa do que seria apagado (só listar, sem apagar nada) e peça de novo.`);
  partes.push('Depois continue o pedido normalmente.');
  return partes.join(' ');
}

// (Versão anterior: um cartão por pedido, com seleção de ações. Mantida para quem ainda a chamar.)
export function htmlAgrupado(a, info) {
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
