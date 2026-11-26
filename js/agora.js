// Painel "Agora": o que a sua assistente está fazendo DE VERDADE (pedidos rodando na ponte),
// o que está na fila (e por quê) e o que terminou há pouco. Cada linha leva direto à conversa.
// Puro (sem DOM nem rede): app.js passa os pedidos (tabela comandos) e as conversas.

export const MAX_PARALELO = 4;   // igual ao da ponte (ponte.mjs): conversas rodando ao mesmo tempo
export const VERSAO_PONTE = 4;   // ponte com a fila nova; abaixo disso a página avisa para atualizar

// Por que um pedido "novo" ainda não começou.
export function motivoFila(c, { cmds, ligado, pausada, agora }) {
  if (pausada) return 'Pausada: começa quando você tirar a pausa (☰)';
  if (!ligado) return 'Esperando o seu PC ligar (a ponte está desligada)';
  const mesmaConversa = cmds.some((x) => x.id !== c.id && (x.conversa_id ?? null) === (c.conversa_id ?? null) && (x.status === 'rodando' || (x.status === 'novo' && x.id < c.id)));
  if (mesmaConversa) return 'Espera a vez nesta conversa (uma coisa por vez em cada conversa)';
  const rodando = cmds.filter((x) => x.status === 'rodando').length;
  if (rodando >= MAX_PARALELO) return `Espera uma vaga: já são ${rodando} conversas rodando juntas (máx. ${MAX_PARALELO})`;
  const espera = agora - new Date(c.criado).getTime();
  if (espera > 45e3) return 'Parado há mais de 45 s sem motivo: a ponte pode estar travada ou desatualizada (veja o aviso acima)';
  return 'Começa em instantes';
}

// cmds: [{ id, conversa_id, status, texto, criado, atualizado }] (mais novo primeiro ou em qualquer ordem)
// conversa(id) -> { nome, icone, cor } · ha(ms) -> "há 3 min" · esc(texto)
export function htmlAgora({ cmds = [], conversa, ha, esc, ligado = true, pausada = false, versaoPonte = null, agora = Date.now() }) {
  const ord = [...cmds].sort((a, b) => a.id - b.id);
  const rodando = ord.filter((c) => c.status === 'rodando');
  const fila = ord.filter((c) => c.status === 'novo');
  const feitos = ord.filter((c) => !['novo', 'rodando'].includes(c.status)).reverse().slice(0, 12);
  const linha = (c, extra, cls) => {
    const v = conversa(c.conversa_id);
    const txt = String(c.texto || '').replace(/\[\[anexo:[^\]]*\]\]/g, '📎').replace(/\s+/g, ' ').trim();
    return `<button type="button" class="ag-item ${cls}" data-agora-conv="${c.conversa_id ?? ''}" style="--cor:${v.cor}" title="Abrir a conversa">
      <span class="ag-ic">${v.icone}</span>
      <span class="ag-tx"><b>${esc(v.nome || 'Conversa')}</b><small>${esc(txt.slice(0, 110))}${txt.length > 110 ? '…' : ''}</small><em>${extra}</em></span>
      <span class="ag-ir" aria-hidden="true">›</span></button>`;
  };
  const aviso = versaoPonte != null && versaoPonte < VERSAO_PONTE
    ? `<p class="ag-aviso">⚠ A ponte deste PC está desatualizada (versão ${versaoPonte}). Pedidos em conversas diferentes podem travar um ao outro. No PC: <code>git pull</code> na pasta <code>genesis-estudio</code> e reinicie a ponte (☰ › Reiniciar ponte).</p>`
    : '';
  const secao = (titulo, n, corpo, vazio) => `<section class="ag-secao"><h3>${titulo}${n ? ` <i>${n}</i>` : ''}</h3>${corpo || `<p class="ag-vazio">${vazio}</p>`}</section>`;
  return `<div class="agora">${aviso}
    ${secao('<span class="ag-luz on"></span>Fazendo agora', rodando.length, rodando.map((c) => linha(c, `começou ${ha(new Date(c.atualizado || c.criado).getTime())}`, 'rodando')).join(''), 'Nada rodando agora.')}
    ${secao('<span class="ag-luz fila"></span>Na fila', fila.length, fila.map((c, i) => linha(c, `${i + 1}º · ${esc(motivoFila(c, { cmds: ord, ligado, pausada, agora }))}`, 'fila')).join(''), 'Fila vazia: o que você mandar começa na hora.')}
    ${secao('Terminou há pouco', 0, feitos.map((c) => linha(c, `${c.status === 'feito' ? '✓ pronto' : c.status === 'erro' ? '✕ deu erro' : '⊘ cancelado'} · ${ha(new Date(c.atualizado || c.criado).getTime())}`, 'feito ' + c.status)).join(''), 'Nada ainda.')}
    <p class="ag-rodape">Até ${MAX_PARALELO} conversas rodam juntas; dentro de uma mesma conversa é uma coisa por vez. Para fazer duas coisas ao mesmo tempo, use conversas diferentes (＋ Nova conversa).</p>
  </div>`;
}
