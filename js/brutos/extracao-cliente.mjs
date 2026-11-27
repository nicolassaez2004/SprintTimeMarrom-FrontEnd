// US28: pedido (POST /extracoes) e acompanhamento (GET /extracoes/{id}) das extrações.
import { requisitar, urlDaApi } from '../comum/http.mjs';
import { idValido, validarPedido } from './extracao-modelo.mjs';

export class PedidoNaoEncontrado extends Error {}

const MENSAGENS = {
  conexao: 'Não foi possível conectar ao serviço de dados. Confira a conexão e tente novamente.',
  formato: 'O serviço retornou uma resposta inválida. Tente novamente.',
};
const INDISPONIVEL = 'O serviço de extrações está indisponível no momento. Tente novamente em instantes.';
const NAO_ENCONTRADO = 'Pedido de extração não encontrado. Confira o código informado.';
const JSON_ = { Accept: 'application/json' };

export const solicitarExtracao = (base, corpo, opcoes = {}) => requisitar(urlDaApi('api/extracoes', base), async resposta => {
  // Só 202 confirma o registro do pedido; o arquivo ainda não existe.
  if (resposta.status === 202) return validarPedido(await resposta.json(), base);
  if (resposta.status === 400) {
    const erro = await resposta.json().catch(() => null);
    throw new Error(erro?.erro?.mensagem || 'Pedido inválido. Confira linha, período e formato.');
  }
  throw new Error(INDISPONIVEL);
}, { ...opcoes, mensagens: MENSAGENS, method: 'POST', cache: 'no-store',
  headers: { ...JSON_, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

export function consultarExtracao(base, id, opcoes = {}) {
  if (!idValido(id)) return Promise.reject(new PedidoNaoEncontrado(NAO_ENCONTRADO));
  return requisitar(urlDaApi(`api/extracoes/${encodeURIComponent(id)}`, base), async resposta => {
    if (resposta.status === 404) throw new PedidoNaoEncontrado(NAO_ENCONTRADO);
    if (resposta.status !== 200) throw new Error(INDISPONIVEL);
    return validarPedido(await resposta.json(), base, id);
  }, { ...opcoes, mensagens: MENSAGENS, method: 'GET', cache: 'no-store', headers: JSON_ });
}
