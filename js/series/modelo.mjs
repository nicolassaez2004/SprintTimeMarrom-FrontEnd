import { dataValida } from '../qualidade/modelo.mjs';

export const TIPOS = Object.freeze({
  PONTUALIDADE_VIAGENS: 'Pontualidade das saídas',
  CUMPRIMENTO_VIAGENS: 'Cumprimento das viagens',
});
export const CAMPOS = ['linha', 'sentido', 'tipo', 'inicio', 'fim', 'hora_inicio', 'hora_fim'];
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const instante = v => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v));
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = v => typeof v === 'string' && v.length > 0;

export function lerSelecao(busca = '') {
  const args = new URLSearchParams(busca);
  return Object.fromEntries(CAMPOS.map(campo => [campo, args.get(campo) ?? (
    campo === 'sentido' ? '0' : campo === 'tipo' ? 'PONTUALIDADE_VIAGENS' : ''
  )]));
}

export function validarFiltros(filtros) {
  const f = Object.fromEntries(CAMPOS.map(campo => [campo, String(filtros[campo] ?? '').trim()]));
  if (!f.linha || f.linha.length > 64 || /[\x00-\x1f\x7f]/.test(f.linha)) throw new Error('Informe um código de linha válido.');
  if (!['0', '1'].includes(f.sentido)) throw new Error('Selecione ida ou volta.');
  if (!Object.hasOwn(TIPOS, f.tipo)) throw new Error('Selecione um indicador disponível.');
  for (const campo of ['inicio', 'fim']) {
    if (f[campo] && !dataValida(f[campo])) throw new Error('Confira as datas do período.');
  }
  if (f.inicio && f.fim && f.inicio > f.fim) throw new Error('A data final deve ser igual ou posterior à inicial.');
  if (Boolean(f.hora_inicio) !== Boolean(f.hora_fim)) throw new Error('Preencha as duas horas ou deixe ambas vazias para o dia inteiro.');
  if (f.hora_inicio && (!HORA.test(f.hora_inicio) || !HORA.test(f.hora_fim) || f.hora_inicio === f.hora_fim)) {
    throw new Error('Use horas diferentes e válidas. Para o dia inteiro, deixe as duas vazias.');
  }
  return f;
}

// Converte a meia-noite civil de São Paulo usando o fuso IANA, independente do navegador.
export function meiaNoiteSP(dia) {
  const [ano, mes, data] = dia.split('-').map(Number);
  const civil = Date.UTC(ano, mes - 1, data);
  let utc = civil;
  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formato.formatToParts(utc).map(({ type, value }) => [type, value]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    utc += civil - local;
  }
  return new Date(utc).toISOString();
}

export function parametrosApi(filtros, pagina = 1) {
  const f = validarFiltros(filtros);
  const args = new URLSearchParams({ linha: f.linha, sentido: f.sentido, tipo: f.tipo,
    page: String(pagina), page_size: '50' });
  if (f.inicio) args.set('inicio', meiaNoiteSP(f.inicio));
  if (f.fim) {
    const proximo = new Date(`${f.fim}T12:00:00Z`);
    proximo.setUTCDate(proximo.getUTCDate() + 1);
    args.set('fim', meiaNoiteSP(proximo.toISOString().slice(0, 10)));
  }
  if (f.hora_inicio) { args.set('hora_inicio', f.hora_inicio); args.set('hora_fim', f.hora_fim); }
  return args;
}

export function buscaDaSelecao(filtros, pagina = 1) {
  const args = new URLSearchParams();
  for (const campo of CAMPOS) if (filtros[campo]) args.set(campo, filtros[campo]);
  if (pagina > 1) args.set('page', String(pagina));
  return args.toString();
}

export function validarResposta(corpo, filtros, pagina) {
  const invalida = () => { throw new Error('A resposta das séries está incompleta ou fora dos filtros selecionados. Tente novamente.'); };
  if (!objeto(corpo) || !Array.isArray(corpo.dados) || !Array.isArray(corpo.lacunas)
      || !objeto(corpo.historico) || !objeto(corpo.consulta) || !objeto(corpo.paginacao)) invalida();
  const { page, page_size: tamanho, total } = corpo.paginacao;
  if (page !== pagina || tamanho !== 50 || !Number.isSafeInteger(total) || total < 0 || corpo.dados.length > tamanho) invalida();
  if (corpo.dados.length !== Math.max(0, Math.min(tamanho, total - (page - 1) * tamanho))) invalida();
  for (const chave of ['coleta_inicio', 'coleta_ultimo_ciclo', 'inicio_indicadores', 'fim_indicadores']) {
    if (corpo.historico[chave] !== null && !instante(corpo.historico[chave])) invalida();
  }
  const consulta = corpo.consulta;
  if (consulta.fuso !== 'America/Sao_Paulo' || consulta.lacunas_escopo !== 'PAGINA'
      || typeof consulta.lacunas_truncadas !== 'boolean'
      || consulta.criterio_periodo !== 'JANELAS_INTEIRAMENTE_CONTIDAS') invalida();
  for (const chave of ['inicio', 'fim']) if (consulta[chave] !== null && !instante(consulta[chave])) invalida();
  const args = parametrosApi(filtros, pagina);
  for (const chave of ['hora_inicio', 'hora_fim']) if (consulta[chave] !== (filtros[chave] || null)) invalida();
  for (const chave of ['inicio', 'fim']) {
    if (args.has(chave) && Date.parse(args.get(chave)) !== Date.parse(consulta[chave])) invalida();
  }
  for (const item of corpo.dados) {
    if (!objeto(item) || item.linha !== filtros.linha || item.sentido !== filtros.sentido || item.tipo !== filtros.tipo
        || !texto(item.id) || !texto(item.unidade) || !texto(item.versao_conjunto) || !texto(item.versao_gtfs_id)
        || !instante(item.inicio) || !instante(item.fim) || Date.parse(item.inicio) >= Date.parse(item.fim)
        || !(item.valor === null || (typeof item.valor === 'number' && Number.isFinite(item.valor)))
        || item.status !== (item.valor === null ? 'SEM_RESULTADO' : 'DISPONIVEL')
        || !objeto(item.qualidade) || !objeto(item.contagens)) invalida();
    if ((consulta.inicio && Date.parse(item.inicio) < Date.parse(consulta.inicio))
        || (consulta.fim && Date.parse(item.fim) > Date.parse(consulta.fim))) invalida();
  }
  for (const lacuna of corpo.lacunas) {
    if (!objeto(lacuna) || !instante(lacuna.inicio) || !instante(lacuna.fim)
        || Date.parse(lacuna.inicio) >= Date.parse(lacuna.fim)
        || !['SEM_PUBLICACAO', 'RESULTADO_NULO'].includes(lacuna.motivo)) invalida();
  }
  return corpo;
}

export const valorFormatado = (valor, unidade) => valor === null ? 'Sem resultado' :
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor)} ${unidade}`;
export const dataHora = valor => valor ? new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(valor)) : 'Ainda indisponível';
