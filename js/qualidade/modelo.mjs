import { dataValida, hojeSP, horario, somarDias } from '../comum/formatacao.mjs';

export const SITUACOES = {
  COMPLETA: { texto: 'Completa', classe: 'complete' },
  COM_FALHAS: { texto: 'Com falhas', classe: 'with-failures' },
  INCOMPLETA: { texto: 'Incompleta', classe: 'incomplete' },
  SEM_DADOS: { texto: 'Sem dados', classe: 'no-data' },
  FORA_DO_MONITORAMENTO: { texto: 'Não observado', classe: 'unobserved' },
  PENDENTE: { texto: 'Ainda não ocorreu', classe: 'pending' },
};
export function validarPeriodo(inicio, fim, hoje = hojeSP()) {
  if (!dataValida(inicio) || !dataValida(fim)) throw new Error('Informe as duas datas válidas.');
  if (fim < inicio) throw new Error('A data final deve ser igual ou posterior à inicial.');
  if (fim > hoje) throw new Error('Selecione uma data final até hoje, no horário de São Paulo.');
  if ((Date.parse(`${fim}T00:00Z`) - Date.parse(`${inicio}T00:00Z`)) / 86400000 >= 31) throw new Error('Consulte no máximo 31 dias por vez.');
}
export const fimNoDia = (instante, dia) => Date.parse(instante) === Date.parse(dia.janelas.at(-1).fim) ? '24:00' : horario(instante);
export function causa(codigo) {
  if (codigo === 'SEM_CICLO_REGISTRADO') return 'Sem ciclos registrados';
  if (codigo === 'PROCESSO_INTERROMPIDO') return 'Processo de coleta interrompido';
  if (/Timeout|TEMPO_LIMITE/i.test(codigo)) return 'Tempo limite da consulta à fonte';
  if (/HTTP.?503/.test(codigo)) return 'API Olho Vivo indisponível (HTTP 503)';
  return String(codigo || 'Causa não informada');
}
export function recorteLacuna(lacuna, dia, observadoAte) {
  // Compatível também com a US13-T02: os instantes originais são preservados.
  const d0 = Date.parse(dia.janelas[0].inicio);
  const d1 = Date.parse(dia.janelas.at(-1).fim);
  const observado = Math.min(Date.parse(observadoAte), d1);
  return {
    inicio: new Date(Math.max(Date.parse(lacuna.inicio), d0)).toISOString(),
    fim: new Date(Math.min(lacuna.fim ? Date.parse(lacuna.fim) : observado, observado)).toISOString(),
    anterior: Date.parse(lacuna.inicio) < d0,
    seguinte: (lacuna.fim ? Date.parse(lacuna.fim) : Date.parse(observadoAte)) > d1,
    aberta: lacuna.fim === null,
  };
}
const instanteValido = valor => typeof valor === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(valor) && Number.isFinite(Date.parse(valor));
export function validarRelatorio(dados, inicio, fim) {
  const falhar = () => { throw new Error('O relatório recebido está incompleto ou em formato inesperado. Tente novamente.'); };
  if (!dados || dados.periodo?.fuso !== 'America/Sao_Paulo' || !instanteValido(dados.periodo.observado_ate) || !instanteValido(dados.gerado_em) || !Array.isArray(dados.dias)) falhar();
  const total = Math.round((Date.parse(`${fim}T00:00Z`) - Date.parse(`${inicio}T00:00Z`)) / 86400000) + 1;
  if (dados.dias.length !== total) falhar();
  dados.dias.forEach((dia, i) => {
    if (dia.data !== somarDias(inicio, i) || !Object.hasOwn(SITUACOES, dia.situacao) || !Array.isArray(dia.janelas) || dia.janelas.length !== 96 || !Array.isArray(dia.lacunas) || !dia.gtfs) falhar();
    for (const campo of ['ciclos_com_dados', 'ciclos_esperados', 'ciclos_registrados']) if (!Number.isInteger(dia[campo]) || dia[campo] < 0) falhar();
    if (dia.percentual_falhas !== null && (!Number.isFinite(dia.percentual_falhas) || dia.percentual_falhas < 0 || dia.percentual_falhas > 100)) falhar();
    for (const janela of dia.janelas) if (!Object.hasOwn(SITUACOES, janela.situacao) || !instanteValido(janela.inicio) || !instanteValido(janela.fim)) falhar();
    for (const lacuna of dia.lacunas) if (!instanteValido(lacuna.inicio) || (lacuna.fim !== null && !instanteValido(lacuna.fim))) falhar();
    if (!['VIGENTE', 'SEM_VERSAO_VIGENTE', 'AMBIGUA'].includes(dia.gtfs.situacao)) falhar();
    if (dia.gtfs.situacao === 'VIGENTE' && !dia.gtfs.versao?.id) falhar();
    if (dia.gtfs.situacao === 'AMBIGUA' && (!Array.isArray(dia.gtfs.candidatas) || dia.gtfs.candidatas.length < 2)) falhar();
    const versoes = dia.gtfs.situacao === 'VIGENTE' ? [dia.gtfs.versao] : dia.gtfs.situacao === 'AMBIGUA' ? dia.gtfs.candidatas : [];
    for (const versao of versoes) {
      if (typeof versao.id !== 'string' || !dataValida(versao.vigencia_inicio) ||
          (versao.vigencia_fim !== null && !dataValida(versao.vigencia_fim)) ||
          !instanteValido(versao.capturada_em) || !/^[0-9a-f]{64}$/i.test(versao.hash || '')) falhar();
    }
  });
  return dados;
}
