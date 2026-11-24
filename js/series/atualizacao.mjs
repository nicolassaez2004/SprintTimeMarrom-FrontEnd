// US23-T03: atualização de 15 min e consolidação informadas pela API (/series → atualizacao).
import { dataHora } from './modelo.mjs';

const instante = valor => typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
const opcional = valor => valor === null || instante(valor);
const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
export const INTERVALO_MS = 15 * 60 * 1000;
// Folga após a hora prevista, para a publicação da janela terminar.
export const FOLGA_MS = 60 * 1000;

/** Bloco `atualizacao` validado; null quando a API ainda não o informa. */
export function lerAtualizacao(corpo) {
  if (!objeto(corpo) || corpo.atualizacao === undefined) return null;
  const a = corpo.atualizacao;
  const invalida = () => { throw new Error('A resposta das séries informou a atualização de forma inválida. Tente novamente.'); };
  if (!objeto(a) || a.intervalo_minutos !== 15 || !objeto(a.consolidacao)
      || !opcional(a.proxima_atualizacao_prevista)) invalida();
  if (a.ultima_atualizacao !== null && (!objeto(a.ultima_atualizacao)
      || !['janela_inicio', 'janela_fim', 'publicada_em'].every(c => instante(a.ultima_atualizacao[c])))) invalida();
  const c = a.consolidacao;
  if (!['consolidado_ate', 'consolidado_em'].every(k => opcional(c[k]))
      || !(c.dia === null || /^\d{4}-\d{2}-\d{2}$/.test(c.dia))
      || !(c.no_prazo === null || typeof c.no_prazo === 'boolean')) invalida();
  for (const item of corpo.dados || []) {
    if (typeof item.consolidado !== 'boolean' || !opcional(item.consolidado_em ?? null)) invalida();
  }
  return a;
}

const dia = iso => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
  .format(new Date(`${iso}T12:00:00-03:00`));

/** Textos do painel. Só a resposta bem-sucedida altera "Atualizado em". */
export function textosAtualizacao(a) {
  if (!a) return { atualizacao: 'Horário da atualização não informado pela API', consolidacao: '' };
  const u = a.ultima_atualizacao;
  const atualizacao = u
    ? `Atualizado em ${dataHora(u.publicada_em)} · janela até ${dataHora(u.janela_fim)}${a.proxima_atualizacao_prevista ? ` · próxima prevista ${dataHora(a.proxima_atualizacao_prevista)}` : ''}`
    : 'Nenhuma atualização de 15 min publicada ainda';
  const c = a.consolidacao;
  const consolidacao = c.dia
    ? `Dia ${dia(c.dia)} consolidado em ${dataHora(c.consolidado_em)}${c.no_prazo === false ? ' (após o prazo das 06:00)' : ''}`
    : 'Nenhum dia consolidado ainda';
  return { atualizacao, consolidacao };
}

/** Milissegundos até consultar de novo: hora prevista + folga, entre 1 e 15 min. */
export function esperaAteProxima(a, agora = Date.now()) {
  const prevista = a?.proxima_atualizacao_prevista ? Date.parse(a.proxima_atualizacao_prevista) + FOLGA_MS : agora + INTERVALO_MS;
  return Math.min(INTERVALO_MS, Math.max(FOLGA_MS, prevista - agora));
}

export const rotuloPonto = item => item.consolidado === true ? 'Consolidado' : 'Provisório';
