import { dataValida, hojeSP } from '../comum/formatacao.mjs';
import { dataHora, numeroPublicado } from '../series/modelo.mjs';

export const TIPOS_MAPA = Object.freeze({
  FREQUENCIA_OBSERVADA: 'Frequência observada', FREQUENCIA_PROGRAMADA: 'Frequência programada',
  PONTUALIDADE_VIAGENS: 'Pontualidade das saídas', CUMPRIMENTO_VIAGENS: 'Cumprimento das viagens',
  REGULARIDADE_INTERVALOS: 'Regularidade dos intervalos', ESPERA_ESTIMADA: 'Espera estimada', EXCESSO_ESPERA: 'Excesso de espera',
});
export const CORES = Object.freeze(['#deebf7', '#9ecae1', '#3182bd', '#08519c']);
export const COR_AUSENCIA = '#b7beb8';
export const CAMPOS_MAPA = ['escopo', 'base', 'linha', 'sentido', 'tipo', 'inicio', 'fim', 'versao_gtfs_id', 'versao_territorial_id', 'codigo'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const territorial = escopo => ['distrito', 'subprefeitura'].includes(escopo);
export const codigoFeicao = f => f.properties.parada ?? f.properties.trecho ?? f.properties.codigo;
export const nomeFeicao = f => f.properties.nome ?? (f.properties.trecho ? `Trecho ${f.properties.origem}–${f.properties.destino}` : codigoFeicao(f));

export function selecaoInicial(busca = '') {
  const args = new URLSearchParams(busca);
  const ontem = new Date(`${hojeSP()}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1);
  const dia = ontem.toISOString().slice(0, 10);
  const padrao = { escopo: 'parada', base: 'parada', linha: '', sentido: '0', tipo: 'FREQUENCIA_OBSERVADA',
    inicio: `${dia}T08:00`, fim: `${dia}T08:15`, versao_gtfs_id: '', versao_territorial_id: '', codigo: '' };
  return Object.fromEntries(CAMPOS_MAPA.map(c => [c, args.get(c) ?? padrao[c]]));
}

export function instanteSP(local) {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(local) || !dataValida(local.slice(0, 10))) {
    throw new Error('Informe data e hora válidas no horário de São Paulo.');
  }
  const civil = Date.parse(`${local}:00Z`);
  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let utc = civil, reconstituido;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formato.formatToParts(utc).map(({ type, value }) => [type, value]));
    reconstituido = Date.parse(`${p.year.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (reconstituido === civil) return new Date(utc).toISOString();
    utc += civil - reconstituido;
  }
  throw new Error('Esse horário não existe no fuso de São Paulo. Escolha outro horário.');
}

export function parametrosMapa(selecao, pagina = 1, { exigirRede = true } = {}) {
  const f = Object.fromEntries(CAMPOS_MAPA.map(c => [c, String(selecao[c] ?? '').trim()]));
  if (!['parada', 'trecho', 'distrito', 'subprefeitura'].includes(f.escopo)) throw new Error('Selecione a visualização do mapa.');
  if (territorial(f.escopo) && !['parada', 'trecho'].includes(f.base)) throw new Error('Escolha paradas ou trechos para a agregação.');
  if (!Object.hasOwn(TIPOS_MAPA, f.tipo)) throw new Error('Selecione um indicador disponível.');
  if (!['0', '1'].includes(f.sentido)) throw new Error('Selecione ida ou volta.');
  for (const campo of ['linha', 'codigo']) if (f[campo].length > 64 || /[\x00-\x1f\x7f]/.test(f[campo])) throw new Error('Confira os códigos de linha e local.');
  if ((exigirRede && !UUID.test(f.versao_gtfs_id)) || (f.versao_gtfs_id && !UUID.test(f.versao_gtfs_id))) throw new Error('Escolha a versão da rede antes de consultar.');
  if (f.versao_territorial_id && !UUID.test(f.versao_territorial_id)) throw new Error('A versão territorial salva no endereço é inválida. Limpe os filtros.');
  const inicio = instanteSP(f.inicio), fim = instanteSP(f.fim);
  if (Date.parse(fim) <= Date.parse(inicio)) throw new Error('O fim deve ser posterior ao início.');
  const args = new URLSearchParams({ escopo: f.escopo, sentido: f.sentido, tipo: f.tipo, inicio, fim, page: String(pagina), page_size: '100' });
  for (const c of ['linha', 'codigo', 'versao_gtfs_id', 'versao_territorial_id']) if (f[c]) args.set(c, f[c]);
  if (territorial(f.escopo)) args.set('base', f.base);
  return args;
}

function geometriaValida(g) {
  const ponto = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
    && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const linha = l => Array.isArray(l) && l.length >= 2 && l.every(ponto);
  const poligono = p => Array.isArray(p) && p.length > 0 && p.every(r => linha(r) && r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1]);
  return objeto(g) && (g.type === 'Point' ? ponto(g.coordinates) : g.type === 'LineString' ? linha(g.coordinates)
    : g.type === 'Polygon' ? poligono(g.coordinates) : g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(poligono));
}

export function validarMapa(corpo, filtros, pagina) {
  const erro = () => { throw new Error('O serviço retornou um mapa incompleto ou incompatível com os filtros.'); };
  if (!objeto(corpo) || corpo.type !== 'FeatureCollection' || !Array.isArray(corpo.features)
      || !objeto(corpo.legenda) || !objeto(corpo.legenda.ausencia) || !objeto(corpo.paginacao)) erro();
  const p = corpo.paginacao;
  if (p.page !== pagina || p.page_size !== 100 || !Number.isSafeInteger(p.total) || p.total < 0
      || corpo.features.length !== Math.max(0, Math.min(100, p.total - (pagina - 1) * 100))) erro();
  for (const f of corpo.features) {
    if (!objeto(f) || f.type !== 'Feature' || !geometriaValida(f.geometry) || !objeto(f.properties)) erro();
    const v = f.properties;
    if (v.escopo !== filtros.escopo || typeof codigoFeicao(f) !== 'string'
        || !(v.valor === null || (typeof v.valor === 'number' && Number.isFinite(v.valor)))
        || (v.valor !== null && (!v.unidade || v.ausencia || !v.inicio || !v.fim || !v.versao_conjunto))) erro();
    if (v.tipo != null && v.tipo !== filtros.tipo) erro();
    if (v.sentido != null && v.sentido !== filtros.sentido) erro();
    if (v.versao_gtfs_id != null && (typeof v.versao_gtfs_id !== 'string' || v.versao_gtfs_id.toLowerCase() !== filtros.versao_gtfs_id.toLowerCase())) erro();
    if (filtros.codigo && codigoFeicao(f) !== filtros.codigo) erro();
    if (v.inicio != null && (!Number.isFinite(Date.parse(v.inicio)) || !Number.isFinite(Date.parse(v.fim))
        || Date.parse(v.fim) <= Date.parse(v.inicio) || typeof v.versao_conjunto !== 'string' || !v.versao_conjunto
        || typeof v.unidade !== 'string' || !v.unidade)) erro();
    if (v.linha != null && filtros.linha && v.linha !== filtros.linha) erro();
    if (v.inicio != null && (Date.parse(v.fim) <= Date.parse(instanteSP(filtros.inicio))
        || Date.parse(v.inicio) >= Date.parse(instanteSP(filtros.fim)))) erro();
    if (territorial(filtros.escopo) && v.base_agregacao !== filtros.base) erro();
    if (v.valor === null && typeof v.ausencia !== 'string') erro();
    if ((filtros.escopo === 'parada' && f.geometry.type !== 'Point') || (filtros.escopo === 'trecho' && f.geometry.type !== 'LineString')
        || (territorial(filtros.escopo) && !['Polygon', 'MultiPolygon'].includes(f.geometry.type))) erro();
  }
  if (corpo.versao_territorial !== null && (!objeto(corpo.versao_territorial) || !UUID.test(corpo.versao_territorial.id)
      || typeof corpo.versao_territorial.fonte !== 'string')) erro();
  if (filtros.versao_territorial_id && corpo.versao_territorial?.id !== filtros.versao_territorial_id) erro();
  return corpo;
}

export function cortesPadrao(tipo) {
  return tipo.startsWith('FREQUENCIA') ? [2, 4, 8] : tipo === 'REGULARIDADE_INTERVALOS' ? [0.25, 0.5, 1]
    : ['ESPERA_ESTIMADA', 'EXCESSO_ESPERA'].includes(tipo) ? [5, 10, 20] : [25, 50, 75];
}
export function validarCortes(cortes) {
  if (cortes.some(v => typeof v === 'string' && !v.trim())) throw new Error('Preencha os três limites da legenda.');
  const n = cortes.map(Number);
  if (n.length !== 3 || !n.every(Number.isFinite) || !(n[0] < n[1] && n[1] < n[2])) throw new Error('Informe três limites numéricos em ordem crescente.');
  return n;
}
export function classeDaFeicao(f, cortes) {
  if (f.properties.valor === null) return { indice: null, cor: COR_AUSENCIA, rotulo: 'Sem resultado' };
  const i = cortes.findIndex(c => f.properties.valor < c);
  const indice = i === -1 ? 3 : i;
  return { indice, cor: CORES[indice], rotulo: ['Faixa baixa', 'Faixa intermediária 1', 'Faixa intermediária 2', 'Faixa alta'][indice] };
}
export function legendaFaixas(cortes, unidade) {
  const [a, b, c] = cortes.map(v => `${numeroPublicado(v, 6)} ${unidade ?? ''}`.trim());
  return [`Menor que ${a}`, `${a} a menos de ${b}`, `${b} a menos de ${c}`, `${c} ou mais`];
}

export function recortesDaPagina(corpo) {
  const semMedicao = corpo.features.filter(f => f.properties.inicio == null);
  const grupos = new Map();
  for (const f of corpo.features.filter(f => f.properties.inicio != null)) {
    const p = f.properties;
    const chave = JSON.stringify([p.tipo, p.unidade, p.sentido, p.inicio, p.fim, p.versao_gtfs_id, p.versao_conjunto, p.versao_correspondencia, p.versao_calculo]);
    if (!grupos.has(chave)) grupos.set(chave, { chave, unidade: p.unidade, inicio: p.inicio, fim: p.fim,
      titulo: `${dataHora(p.inicio)} a ${dataHora(p.fim)} · conjunto ${p.versao_conjunto.slice(0, 12)}`, features: [] });
    grupos.get(chave).features.push(f);
  }
  if (!grupos.size && semMedicao.length) grupos.set('sem-dados', { chave: 'sem-dados', unidade: null, titulo: 'Áreas sem resultado informado', features: [] });
  return [...grupos.values()].map(g => ({ ...g, features: [...g.features, ...semMedicao] }));
}

// US26: qualidade da coleta publicada com o indicador (qualidade_coleta); a coleta é global.
export function textoQualidade(q) {
  if (!objeto(q)) return { aviso: false, texto: 'Qualidade da coleta não informada para este resultado.' };
  if (q.percentual_falhas === null) {
    return { aviso: false, texto: `Qualidade da coleta indeterminada (${q.motivo ?? q.situacao}); o percentual de falhas não é zero nem conhecido.` };
  }
  const pct = `${numeroPublicado(q.percentual_falhas, 2)}%`, limite = `${numeroPublicado(q.limite_incompleto_percentual ?? 10, 2)}%`;
  return q.incompleto
    ? { aviso: true, texto: `Dado incompleto: ${pct} de falhas de coleta nesta janela, acima de ${limite}. Evite conclusões sobre o período.` }
    : { aviso: false, texto: `Coleta nesta janela: ${pct} de falhas (aviso somente acima de ${limite}).` };
}
export function qualidadeDoRecorte(features) {
  const medidas = features.filter(f => f.properties.inicio != null).map(f => f.properties.qualidade_coleta);
  const distintas = new Map(medidas.map(q => [JSON.stringify(objeto(q) ? [q.percentual_falhas, q.incompleto, q.situacao, q.motivo] : null), q]));
  if (distintas.size <= 1) return textoQualidade([...distintas.values()][0]);
  return { aviso: medidas.some(q => q?.incompleto === true),
    texto: 'A qualidade da coleta difere entre os locais desta janela; confira cada local na lista.' };
}

export const normalizarBusca = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
