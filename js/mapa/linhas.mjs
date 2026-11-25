const porLetreiro = new Intl.Collator('pt-BR', { numeric: true });

export function letreiroDoVeiculo(linha, catalogo) {
  if (!linha) return null;
  const codigoGtfs = linha.gtfs?.codigo;
  if (codigoGtfs != null && Object.hasOwn(catalogo.gtfs, codigoGtfs)) {
    return catalogo.gtfs[codigoGtfs];
  }
  return catalogo.olho_vivo[linha.codigo_olho_vivo + ':' + linha.sentido_olho_vivo] ?? null;
}

const NOMES_CORES = {
  '#002F6C': 'Azul-marinho', '#006341': 'Verde-escuro', '#007E5E': 'Verde-petróleo',
  '#0082BA': 'Azul-claro', '#00B352': 'Verde-vivo', '#01A9A7': 'Turquesa',
  '#0455A1': 'Azul-cobalto', '#049FC3': 'Azul-ciano', '#133C8D': 'Azul-royal',
  '#509E2F': 'Verde-claro', '#782F40': 'Vinho', '#97A098': 'Cinza-esverdeado',
  '#9B3894': 'Roxo', '#C0C0C0': 'Cinza', '#CA016B': 'Rosa',
  '#D48500': 'Âmbar', '#DA291C': 'Vermelho', '#EE372F': 'Vermelho-vivo',
  '#F68368': 'Salmão', '#FF6600': 'Laranja-vivo', '#FF671F': 'Laranja',
  '#FFD100': 'Amarelo', '#FFFF00': 'Amarelo-vivo',
};

export function listarCores(catalogo) {
  return [...new Set(Object.values(catalogo.linhas).filter(Boolean))]
    .map(cor => ({ cor, nome: NOMES_CORES[cor] ?? cor }))
    .sort((a, b) => porLetreiro.compare(a.nome, b.nome));
}

export function listarLinhas(catalogo, busca = '', cor = '') {
  const consulta = busca.trim().toUpperCase();
  return Object.entries(catalogo.linhas)
    .filter(([letreiro, fundo]) => letreiro.includes(consulta) && (!cor || fundo === cor))
    .map(([letreiro, cor]) => ({ letreiro, cor }))
    .sort((a, b) => (a.cor ?? 'Z').localeCompare(b.cor ?? 'Z')
      || porLetreiro.compare(a.letreiro, b.letreiro));
}

export function corDoTexto(cor) {
  if (!cor) return '#1e2925';
  const [r, g, b] = cor.slice(1).match(/.{2}/g).map(hex => {
    const valor = Number.parseInt(hex, 16) / 255;
    return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#ffffff';
}
