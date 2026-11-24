// US18-T03A-FE: espera estimada e excesso de espera lado a lado, sem confundi-los nem
// transformar ausência em zero. Cada valor vem da sua própria série em GET /series.
import { motivoLegivel } from './regularidade.mjs';

export const ESPERA = 'ESPERA_ESTIMADA';
export const EXCESSO = 'EXCESSO_ESPERA';

const numero = (valor, sinal = false) => new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2, signDisplay: sinal ? 'exceptZero' : 'auto' }).format(valor);

/** Busca a espera e, na mesma página e janelas, o excesso; uma falha invalida as duas. */
export async function buscarComExcesso(buscar, base, filtros, pagina, opcoes) {
  if (filtros.tipo !== ESPERA) return buscar(base, filtros, pagina, opcoes);
  const [espera, excesso] = await Promise.all([
    buscar(base, filtros, pagina, opcoes),
    buscar(base, { ...filtros, tipo: EXCESSO }, pagina, opcoes),
  ]);
  return parear(espera, excesso);
}

/** Junta cada janela da espera com o excesso da mesma janela. */
export function parear(espera, excesso) {
  const chave = p => `${p.inicio}|${p.fim}|${p.versao_conjunto}`;
  const porJanela = new Map(excesso.dados.map(p => [chave(p), p]));
  if (excesso.dados.length !== espera.dados.length || excesso.paginacao.total !== espera.paginacao.total
      || espera.dados.some(p => !porJanela.has(chave(p)))) {
    throw new Error('As respostas de espera e de excesso de espera não correspondem às mesmas janelas. Tente novamente.');
  }
  return {
    ...espera,
    dados: espera.dados.map(p => ({ ...p, excesso: porJanela.get(chave(p)) })),
    // Os gráficos mostram as duas séries, cada uma com o seu título e unidade.
    graficos: { ...espera, dados: [...espera.dados, ...excesso.dados], lacunas: [...espera.lacunas, ...excesso.lacunas] },
  };
}

/** Textos da célula de resultado: dois valores separados, unidade e motivo de cada ausência. */
export function detalheEspera(p) {
  const e = p.excesso;
  const programada = e?.qualidade?.espera_programada_min;
  return {
    espera: p.valor === null ? 'Espera estimada: sem resultado' : `Espera estimada: ${numero(p.valor)} ${p.unidade}`,
    motivoEspera: p.valor === null ? `Motivo: ${motivoLegivel(p.qualidade?.motivo) ?? 'não informado pela API'}` : null,
    excesso: e.valor === null ? 'Excesso de espera: sem resultado'
      : `Excesso de espera: ${numero(e.valor, true)} ${e.unidade}`,
    motivoExcesso: e.valor === null ? `Motivo: ${motivoLegivel(e.qualidade?.motivo) ?? 'não informado pela API'}` : null,
    programada: programada === null || programada === undefined ? null
      : `Espera programada: ${numero(programada)} ${e.unidade}`,
  };
}
