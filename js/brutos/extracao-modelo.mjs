// US28-T03B: validação do contrato de GET /extracoes/{id} (US28-T03A).
// O estado exibido é sempre o do servidor; aqui só se confere a forma da resposta.
import { somarDias } from '../comum/formatacao.mjs';
import { baseDaApi } from './modelo.mjs';

export const ESTADOS = {
  aguardando: { rotulo: 'Aguardando', texto: 'Pedido recebido e ainda não processado.' },
  processando: { rotulo: 'Processando', texto: 'Extração em andamento no servidor.' },
  pronto: { rotulo: 'Pronto', texto: 'Arquivo concluído e disponível para download.' },
  erro: { rotulo: 'Erro', texto: 'A extração falhou.' },
};
export const FINAIS = new Set(['pronto', 'erro']);
const INVALIDA = 'O serviço retornou uma resposta inválida para o pedido de extração.';

// Identificador opaco: só se restringe ao que é seguro num caminho de URL.
export const idValido = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

const texto = v => typeof v === 'string' && v.trim().length > 0;
const instante = v => texto(v) && /(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

export function linkDownload(valor, base, id) {
  const origem = baseDaApi(base);
  const url = texto(valor) ? new URL(valor, origem) : null;
  const caminhos = [`/api/extracoes/${id}/arquivo`, `/extracoes/${id}/arquivo`];
  if (!url || url.origin !== origem.origin || url.username || url.password || url.search || url.hash ||
      !caminhos.includes(url.pathname)) throw new Error(INVALIDA);
  return url.href;
}

export function validarPedido(corpo, base, idEsperado) {
  if (!corpo || !idValido(corpo.id) || (idEsperado && corpo.id !== idEsperado) || !(corpo.estado in ESTADOS) ||
      !texto(corpo.linha) || !texto(corpo.formato) || !instante(corpo.periodo?.inicio) ||
      !instante(corpo.periodo?.fim) || !instante(corpo.solicitado_em)) throw new Error(INVALIDA);
  const p = corpo.progresso;
  // Progresso só quando o servidor registrou um momento; nunca um percentual calculado aqui.
  const progresso = p && Number.isSafeInteger(p.registros) && p.registros >= 0 && instante(p.atualizado_em)
    ? { registros: p.registros, atualizado_em: p.atualizado_em } : null;
  let arquivo = null;
  if (corpo.estado === 'pronto') {
    const a = corpo.arquivo;
    if (!a || !texto(a.nome) || !Number.isSafeInteger(a.tamanho_bytes) || a.tamanho_bytes < 0) throw new Error(INVALIDA);
    arquivo = { nome: a.nome, tamanho_bytes: a.tamanho_bytes, sha256: texto(a.sha256) ? a.sha256 : null,
      download: linkDownload(a.download, base, corpo.id) };
  }
  return { id: corpo.id, estado: corpo.estado, linha: corpo.linha, formato: corpo.formato,
    periodo: { inicio: corpo.periodo.inicio, fim: corpo.periodo.fim }, solicitado_em: corpo.solicitado_em,
    mensagem: corpo.estado === 'erro' ? (texto(corpo.mensagem) ? corpo.mensagem : ESTADOS.erro.texto) : null,
    progresso, arquivo };
}

// Dias civis de São Paulo (UTC−03:00, sem horário de verão desde 2019); o último dia é inclusivo.
// As regras de período (máximo, encerramento) são do servidor e voltam como mensagem 400.
export function corpoSolicitacao({ linha, inicio, fim, formato }) {
  return { linha: String(linha ?? '').trim(), inicio: `${inicio}T00:00:00-03:00`,
    fim: `${somarDias(fim, 1)}T00:00:00-03:00`, formato };
}
