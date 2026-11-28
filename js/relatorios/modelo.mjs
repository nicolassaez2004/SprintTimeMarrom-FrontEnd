// US21-T04-FE: leitura da resposta de GET /relatorios/associacoes (US21-T04). Nada é recalculado:
// coeficientes, intervalos e amostra vêm prontos da API. Os textos descrevem associação, nunca causa.

export const VARIAVEIS = {
  chuva_10mm: { nome: 'Chuva', incremento: 'a cada 10 mm a mais de chuva no mês' },
  velocidade_kmh: { nome: 'Velocidade dos próprios ônibus (proxy de tráfego)', incremento: 'a cada 1 km/h a mais de velocidade' },
  intercepto: { nome: 'Intercepto', incremento: 'valor de referência do modelo (categorias de referência e variáveis em zero)' },
};

export const MODELOS = {
  principal: { titulo: 'Modelo principal', descricao: 'Chuva, com controles de linha e sentido, infraestrutura do trecho e mês do ano.' },
  secundario: { titulo: 'Modelo secundário', descricao: 'O principal mais a velocidade dos próprios ônibus, usada como aproximação do tráfego.' },
};

export const DESFECHOS = {
  AUMENTO_ATRASO_TRECHO_MENSAL: 'aumento médio de atraso no trecho (destino menos origem), por trecho e mês',
};

export const MOTIVOS_INVALIDO = {
  MATRIZ_SEM_POSTO_COMPLETO: 'as variáveis do modelo não puderam ser separadas umas das outras com os dados disponíveis',
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const finito = Number.isFinite;

export function validarMes(mes, atual) {
  if (typeof mes !== 'string' || !MES.test(mes)) throw new Error('Informe o mês no formato AAAA-MM.');
  if (atual && mes > atual) throw new Error('Escolha um mês que já começou.');
  return mes;
}

// Só aceita um relatório completo e coerente: coeficiente com intervalo de 95% e amostra.
export function validarPublicado(corpo, mes) {
  const invalido = () => { throw new Error('O serviço de relatórios retornou uma resposta inválida. Tente novamente.'); };
  if (!corpo || corpo.situacao !== 'PUBLICADO' || corpo.mes !== mes) invalido();
  if (!Array.isArray(corpo.fontes) || !corpo.fontes.length || !corpo.metodo || !corpo.resultado?.modelos || !corpo.revisao) invalido();
  if (Number.isNaN(Date.parse(corpo.registrado_em))) invalido();
  for (const nome of Object.keys(corpo.resultado.modelos)) {
    const modelo = corpo.resultado.modelos[nome];
    if (!Number.isInteger(modelo.observacoes) || !modelo.coeficientes || !Array.isArray(modelo.limitacoes)) invalido();
    for (const c of Object.values(modelo.coeficientes)) {
      if (!finito(c.coeficiente) || !Array.isArray(c.ic95) || c.ic95.length !== 2 || !c.ic95.every(finito) || c.ic95[0] > c.ic95[1]) invalido();
    }
  }
  return corpo;
}

// Situação da consulta para a tela: publicado, sem relatório ou inválido. Erros viram exceções.
export function interpretarResposta(status, corpo, mes) {
  if (status === 200) return { situacao: 'PUBLICADO', relatorio: validarPublicado(corpo, mes) };
  if (status === 404 && corpo?.situacao === 'NAO_ENCONTRADO') return { situacao: 'NAO_ENCONTRADO', mes };
  if (status === 409 && corpo?.situacao === 'INVALIDO') return { situacao: 'INVALIDO', mes, motivo: corpo.motivo ?? null };
  if (status === 400) throw new Error('O mês informado não foi aceito. Use o formato AAAA-MM.');
  if (status === 429) throw new Error('Muitas consultas seguidas. Aguarde alguns segundos e tente novamente.');
  throw new Error('A consulta de relatórios está indisponível agora. Tente novamente em instantes.');
}

// Frase de leitura de um coeficiente: associação com sentido, tamanho e incerteza; nunca "causa".
export function leituraCoeficiente(nome, coef, unidade, fmt) {
  const variavel = VARIAVEIS[nome] ?? { nome, incremento: `a cada unidade a mais de ${nome}` };
  if (nome === 'intercepto') return `Valor de referência do modelo: ${fmt(coef.coeficiente)} ${unidade}.`;
  const [a, b] = coef.ic95;
  if (a <= 0 && b >= 0) {
    return `${variavel.incremento[0].toUpperCase()}${variavel.incremento.slice(1)}, o intervalo de 95% vai de ${fmt(a)} a ${fmt(b)} ${unidade} e inclui zero: não há associação clara neste relatório.`;
  }
  const sentido = coef.coeficiente > 0 ? 'maior' : 'menor';
  return `${variavel.incremento[0].toUpperCase()}${variavel.incremento.slice(1)}, o aumento de atraso no trecho foi em média ${fmt(Math.abs(coef.coeficiente))} ${unidade} ${sentido} (intervalo de 95%: ${fmt(a)} a ${fmt(b)} ${unidade}). É uma associação observada, não prova de causa.`;
}

// Escala comum para desenhar os intervalos de um modelo (sem o intercepto), sempre incluindo o zero.
export function escalaIntervalos(coeficientes) {
  const valores = Object.entries(coeficientes).filter(([n]) => n !== 'intercepto').flatMap(([, c]) => c.ic95);
  if (!valores.length) return null;
  let min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  if (min === max) { min -= 1; max += 1; }
  const folga = (max - min) * 0.08;
  min -= folga; max += folga;
  return { min, max, posicao: v => ((v - min) / (max - min)) * 100 };
}

export const resumoHash = hash => (typeof hash === 'string' && hash.length > 12 ? `${hash.slice(0, 12)}…` : hash ?? '—');
