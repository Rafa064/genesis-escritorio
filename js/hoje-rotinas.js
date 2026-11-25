// Rotinas da equipe no painel "Hoje" (a ponte roda: escritorio/rotinas.mjs).
//   Teste da manhã · Programador: passou (vai para "Pronto hoje") ou quebrou ("Precisa de você", com o pedido de conserto).
//   Ideias de posts · Estrategista: 3 próximos posts a partir dos números públicos do canal,
//   cada uma uma linha com "Preparar pedido" (abre o editor do Hoje com o pedido pronto para o editor de vídeo).
// Fontes: estado.info.testeManha e estado.info.conteudo; no ?demo, os exemplos daqui.
const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export function dados(ctx) {
  const info = ctx.estados().get(ctx.eu()?.pessoa)?.info || {};
  const demo = ctx.DEMO ? exemplos() : {};
  return { teste: info.testeManha || demo.teste || null, conteudo: info.conteudo?.ideias?.length ? info.conteudo : demo.conteudo || null };
}

const chaveIdeia = (c, x) => `hojePost|${String(c.quando).slice(0, 10)}|${x.titulo}`;
export const ideiaEnviada = (c, x) => !!guardado(chaveIdeia(c, x), '');
export const marcarIdeia = (c, x) => guarda(chaveIdeia(c, x), String(Date.now()));

// Ideias de posts como linhas do Hoje (grupo "Ideias para depois"). "editor" e "linha" são os do Hoje.
export async function linhasIdeias(ctx, editando, editor, linha, quem) {
  const { esc } = ctx, c = dados(ctx).conteudo;
  if (!c) return [];
  return Promise.all(c.ideias.map((x, i) => {
    if (editando?.post === i) return editor(x.titulo, '🎬', 7);
    const env = ideiaEnviada(c, x);
    return linha({ quem, titulo: x.titulo, cls: env ? 'feito' : '',
      sub: `<span title="${esc(`Gancho: ${x.gancho}\nPor quê: ${x.porque}`)}">${x.formato === 'longo' ? 'vídeo' : 'Short'} de ${esc(x.duracao)}</span>`,
      botao: `<button class="btn hj-item-btn" data-post-preparar="${i}" title="Abre o pedido para o editor de vídeo; nada é enviado ainda">${env ? 'Ver de novo' : 'Preparar pedido'}</button>` });
  }));
}
export const pedidoDaIdeia = (x) => `${x.pedido}\n\n(Ideia do Estrategista: "${x.titulo}" · gancho: ${x.gancho})`;

// ---------- demonstração: ideias de verdade (rotinas.mjs rodar ideias-de-posts --seco, haiku, 25/11/2026) ----------
function exemplos() {
  const agora = Date.now(), cedo = (min) => new Date(agora - min * 60e3).toISOString();
  const quebrou = /[?&]teste=quebrou/.test(location.search);
  return {
    teste: quebrou
      ? { quando: cedo(140), ok: false, branch: 'main', commit: 'a5c0ec4 Vídeo 1 mês: luta nova', segundos: 131, codigo: 1, erros: ['SCRIPT ERROR: Invalid call. Nonexistent function \'dash\' in base \'Nil\'.', '   at: _on_ultimate (res://scripts/ultimate.gd:212)'], fim: [] }
      : { quando: cedo(140), ok: true, branch: 'main', commit: '6a78f7b Vídeo 1 mês', segundos: 124, codigo: 0, erros: [], fim: [] },
    conteudo: { quando: cedo(80), modelo: 'haiku', canal: { nome: 'GenesisProject', handle: '@GenesisSurvivor' },
      videos: [{ views: 108 }, { views: 190 }, { views: 244 }, { views: 187 }, { views: 242 }, { views: 54 }],
      ideias: [
        { tema: 'Short: o que eu escrevo pra IA (método, sem programar)', titulo: 'Eu não sei programar. Isso é tudo que eu escrevo pra IA fazer meu jogo', gancho: 'Texto grande sobre o print real do VS Code: "Eu não sei programar." Zoom nos arquivos de regras: "Isso aqui é tudo que eu escrevo."', duracao: '28 s', formato: 'short', porque: 'Os 6 vídeos públicos são só de jogo ou trailer e nenhum mostra o método. O melhor Short fez 244 views (11/dia), 43% acima da média de 171.', pedido: 'Editor, monta um Short vertical de 28 s, sem narração, com legenda grande em pedaços e uma família de fonte.\nCena 1 (0-2 s): "Eu não sei programar." sobre o print real do VS Code com a pasta do Genesis.\nCena 2 (2-15 s): prints reais com zoom: regras e skills no VS Code, a wiki e os commits no GitHub.\nCena 3 (15-25 s): gameplay real com o herói apanhando de verdade.\nFinal: "Vídeo completo no canal". Trilha lo-fi calma. Me manda o roteiro em texto antes de renderizar.' },
        { tema: 'Longo: contexto e skills, não um prompt só', titulo: 'Como eu faço um jogo com IA (sem saber programar): contexto e SKILLS, não um prompt só', gancho: 'Print do VS Code com as skills do projeto e a frase "Eu não sei programar, e esse jogo vai pra Steam."', duracao: '8 min', formato: 'longo', porque: 'O único vídeo longo, o trailer, fez 54 views (2,4/dia), 68% abaixo da média de 171: não tinha tema nem promessa. O canal ainda não tem um longo de método.', pedido: 'Editor, monta um vídeo 16:9 de uns 8 min, com capítulos e sem narração (gravo a voz depois).\nEstrutura: gancho de 5 s, o problema (prompt único que quebra o jogo), o contexto, as skills e agentes e o resultado no jogo.\nSó prints reais (VS Code, Godot, GitHub, Notion, wiki) com zoom. Trilha lo-fi estável. Roteiro em texto antes de renderizar.' },
        { tema: 'Short: pedi pra IA criar um chefe', titulo: 'Pedi pra IA criar um chefe pro meu jogo. Olha o que saiu', gancho: 'A conversa real com a IA pedindo o chefe, corte seco para o chefe entrando no Genesis: "Eu pedi isso, não programei nada."', duracao: '25 s', formato: 'short', porque: 'O Short da ultimate que você pilota fez 244 views (11/dia), contra 108 (5,1/dia) do Short só de gameplay da Caçadora: mecânica forte + método.', pedido: 'Editor, monta um Short vertical de 25 s sem narração, legenda grande e uma fonte só.\n0-3 s: print real da conversa pedindo o chefe e corte para o chefe entrando.\n3-18 s: luta real com o herói apanhando de verdade.\n18-25 s: o arquivo do chefe no VS Code e "Vídeo completo no canal". Trilha lo-fi. Roteiro antes de montar.' },
      ] },
  };
}
