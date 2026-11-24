// Ícones pixel 16x16 (mesmo traço dos ícones da barra de baixo): um jeito só de desenhar, sem emoji misturado.
// Cada um herda a cor do texto (fill: currentColor).
const P = {
  subir: 'M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-4v7H6V8H2V6h1V5h1V4h1V3h1V2h1z',
  lixo: 'M6 1h4v1h4v2H2V2h4zM3 5h10v10H3zM5 7h2v6H5zM9 7h2v6H9z',
  filme: 'M4 2h2v1h2v1h2v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H8v1H6v1H4z',
  terminal: 'M1 2h14v12H1zM2 4h12v9H2zM3 6h2v1h1v1h1v1H6v1H5v1H3v-1h1V9h1V8H4V7H3zM8 10h5v1H8z',
  cubo: 'M7 1h2v1h2v1h2v1h1v8h-1v1h-2v1H9v1H7v-1H5v-1H3v-1H2V4h1V3h2V2h2zM4 5v6h1v1h2V8H6V7H5V6zM9 8v4h2v-1h1V5h-1v1h-1v1H9z',
  globo: 'M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2zM7 3v3h2V3zM3 7v2h3V7zM10 7v2h3V7zM7 10v3h2v-3z',
  disco: 'M2 2h10v1h1v1h1v10H2zM4 3h6v3H4zM4 9h8v4H4z',
  alerta: 'M7 1h2v2h1v3h1v3h1v3h1v3H2v-3h1V9h1V6h1V3h1V1zM7 6v4h2V6zM7 11v2h2v-2z',
  lapis: 'M11 1h2v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H2v-4h1v-1h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1z',
  mao: 'M5 3h2v5h1V2h2v6h1V3h2v6h1V6h2v5h-1v2h-1v1h-1v1H6v-1H5v-1H4v-1H3v-2H2V8h2v1h1z',
  engrenagem: 'M7 1h2v2h2V2h2v2h-1v2h2v2h-2v2h1v2h-2v-1H9v3H7v-3H5v1H3v-2h1V8H1V6h3V4H3V2h2v1h2zM6 6v4h4V6z',
  check: 'M13 3h2v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-1H4v-1H3v-1H2V9h2v1h1v1h2v-1h1V9h1V8h1V7h1V6h1V5h1V4h1z',
  sol: 'M7 0h2v2H7zM7 14h2v2H7zM0 7h2v2H0zM14 7h2v2h-2zM2 2h2v2H2zM12 2h2v2h-2zM2 12h2v2H2zM12 12h2v2h-2zM6 4h4v1h1v1h1v4h-1v1h-1v1H6v-1H5v-1H4V6h1V5h1z',
  jornal: 'M1 2h12v1h2v11H1zM3 4v8h8V4zM4 5h6v2H4zM4 8h6v1H4zM4 10h4v1H4z',
  imagem: 'M1 2h14v12H1zM2 3v10h12V3zM10 4h2v2h-2zM3 12v-2h1V9h1V8h2v1h1v1h1V9h1V8h2v1h1v3z',
  ajuda: 'M5 1h6v1h1v1h1v4h-1v1h-1v1H9v2H7V8h1V7h1V6h1V4H9V3H7v1H6v2H3V3h1V2h1zM7 12h2v2H7z',
  quadro: 'M1 2h14v12H1zM2 4h12v9H2zM3 5h3v3H3zM7 5h2v6H7zM10 5h3v4h-3z',
  equipe: 'M3 2h3v3H3zM10 2h3v3h-3zM2 6h5v1h2V6h5v1h1v6H1V7h1z',
  chave: 'M3 3h5v1h1v2h6v2h-1v2h-2V8h-1v2H9V8H8v2H7v1H3v-1H2V4h1zM4 6v2h2V6z',
  pasta: 'M1 3h6v1h1v1h7v9H1zM2 6v7h12V6z',
  seta: 'M5 2h2v1h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1H9v1H8v1H7v1H5v-2h1v-1h1v-1h1V9h1V7H8V6H7V5H6V4H5z',
  pare: 'M3 3h10v10H3z',
  pontos: 'M1 7h3v3H1zM6.5 7h3v3h-3zM12 7h3v3h-3z',
};
export function ico(nome, cls = '') {
  const d = P[nome] || P.terminal;
  return `<svg class="pxi ${cls}" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;
}
