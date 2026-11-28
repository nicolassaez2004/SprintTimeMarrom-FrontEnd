// Opções de visualização do mapa ao vivo além dos ônibus: chuva e temperatura por estação
// (US06, GET /mapas/clima) e trânsito por trecho de uma linha (US08, GET /mapas/trafego).
// Funções puras: a tela (app.mjs) só desenha o que estas funções descrevem.

export const VISUALIZACOES = Object.freeze({
  onibus: { rotulo: 'Ônibus' },
  chuva: { rotulo: 'Chuva', unidade: 'mm', propriedade: 'chuva_mm', rota: '/mapas/clima' },
  temperatura: { rotulo: 'Temperatura', unidade: '°C', propriedade: 'temperatura_c', rota: '/mapas/clima' },
  transito: { rotulo: 'Trânsito', unidade: 'km/h', propriedade: 'velocidade_media_kmh', rota: '/mapas/trafego' },
});

const SEM_MEDICAO = '#9aa1a6';

// Faixas [limite superior exclusivo, cor, rótulo]; a última vale para o resto.
const FAIXAS = {
  chuva: [
    [0.000001, '#e8eef2', 'Sem chuva (0 mm)'],
    [2.5, '#9ecae1', 'Fraca (até 2,5 mm)'],
    [10, '#4292c6', 'Moderada (2,5–10 mm)'],
    [50, '#08519c', 'Forte (10–50 mm)'],
    [Infinity, '#54278f', 'Muito forte (50 mm ou mais)'],
  ],
  temperatura: [
    [15, '#2c7bb6', 'Abaixo de 15 °C'],
    [20, '#7fbfbf', '15–20 °C'],
    [25, '#f2d06b', '20–25 °C'],
    [30, '#f08a3c', '25–30 °C'],
    [Infinity, '#c8372d', '30 °C ou mais'],
  ],
  transito: [
    [10, '#c8372d', 'Muito lento (até 10 km/h)'],
    [15, '#f08a3c', 'Lento (10–15 km/h)'],
    [20, '#f2d06b', 'Moderado (15–20 km/h)'],
    [Infinity, '#2a805e', 'Livre (20 km/h ou mais)'],
  ],
};

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function ehContexto(visualizacao) {
  return visualizacao in FAIXAS;
}

// Valor do campo datetime-local (horário de São Paulo, sem horário de verão desde 2019) → ISO
// com fuso. Campo vazio = agora.
export function instanteDoCampo(valor, agora = new Date()) {
  if (!valor) return agora.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) throw new Error('MOMENTO_INVALIDO');
  return `${valor}:00-03:00`;
}

// Endereço da consulta, ou null quando falta a linha (trânsito é sempre por linha).
export function urlDaVisualizacao(apiBase, visualizacao, { instante, linha } = {}) {
  const config = VISUALIZACOES[visualizacao];
  if (!ehContexto(visualizacao)) return null;
  const parametros = new URLSearchParams({ instante });
  if (visualizacao === 'transito') {
    if (!linha) return null;
    parametros.set('linha', linha);
  }
  return `${apiBase.replace(/\/$/, '')}${config.rota}?${parametros}`;
}

export function valorDaFeature(visualizacao, propriedades) {
  const bruto = propriedades?.[VISUALIZACOES[visualizacao].propriedade];
  return bruto === null || bruto === undefined || !Number.isFinite(Number(bruto)) ? null : Number(bruto);
}

export function corDoValor(visualizacao, valor) {
  if (valor === null || valor === undefined) return SEM_MEDICAO;
  return FAIXAS[visualizacao].find(([limite]) => valor < limite)[1];
}

export function legendaDa(visualizacao) {
  return [...FAIXAS[visualizacao].map(([, cor, rotulo]) => ({ cor, rotulo })),
    { cor: SEM_MEDICAO, rotulo: 'Sem medição (não significa zero)' }];
}

export function rotuloDoValor(visualizacao, valor) {
  if (valor === null) return 'sem medição';
  return `${numero.format(valor)} ${VISUALIZACOES[visualizacao].unidade}`;
}

const MOTIVOS = {
  sem_estacoes: ['Ainda não há estações de clima', 'Nenhuma estação meteorológica foi coletada para esta fonte.'],
  sem_versao_gtfs_vigente: ['Sem rede GTFS para esta data', 'Não há versão do GTFS vigente no dia escolhido.'],
  versao_gtfs_ambigua: ['Rede GTFS ambígua', 'Há mais de uma versão do GTFS vigente no dia escolhido.'],
  linha_sem_trechos: ['Linha sem trechos', 'A linha escolhida não tem trechos na rede GTFS vigente.'],
};

// O que mostrar sobre a resposta: null quando há ao menos uma medição para desenhar.
export function situacaoDa(visualizacao, corpo, { linha } = {}) {
  if (visualizacao === 'transito' && !linha) {
    return { titulo: 'Escolha uma linha', detalhe: 'O trânsito é mostrado nos trechos de uma linha. Use o filtro LINHA.' };
  }
  if (!corpo) return null;
  if (corpo.motivo && MOTIVOS[corpo.motivo]) {
    const [titulo, detalhe] = MOTIVOS[corpo.motivo];
    return { titulo, detalhe };
  }
  const features = corpo.features ?? [];
  if (!features.some(f => valorDaFeature(visualizacao, f.properties) !== null)) {
    return {
      titulo: 'Sem medição neste momento',
      detalhe: `Nenhum valor de ${VISUALIZACOES[visualizacao].rotulo.toLowerCase()} na janela ${descreverJanela(corpo.janela)}. Sem medição não significa zero.`,
    };
  }
  return null;
}

const hora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

export function descreverJanela(janela) {
  if (!janela?.inicio || !janela?.fim) return '';
  return `${hora.format(new Date(janela.inicio))}–${hora.format(new Date(janela.fim)).split(' ').pop()}`;
}
