import { requisitar, urlDaApi } from '../comum/http.mjs';
import { baseDaApi, validarCatalogo, validarDicionario } from './modelo.mjs';

export class ArquivoIndisponivel extends Error {}

const PARQUET = 'application/vnd.apache.parquet';
const MENSAGENS = {
  conexao: 'Não foi possível conectar ao serviço de dados. Confira a conexão e tente novamente.',
  formato: 'O serviço retornou uma resposta inválida. Tente atualizar.',
};
const INDISPONIVEL = 'Não foi possível consultar o serviço de dados. Tente novamente em instantes.';

const obterJson = (url, opcoes = {}) => requisitar(url, resposta => {
  if (!resposta.ok) throw new Error(INDISPONIVEL);
  return resposta.json();
}, { ...opcoes, mensagens: MENSAGENS, method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } });

export async function consultarCatalogo(base, opcoes) {
  const origem = baseDaApi(base);
  return validarCatalogo(await obterJson(urlDaApi('api/downloads/brutos/datas', origem.href), opcoes), origem.href);
}
export async function consultarDicionario(url, opcoes) {
  return validarDicionario(await obterJson(url, opcoes));
}
// A conferência usa só os cabeçalhos. O próprio navegador recebe o anexo do backend.
export const verificarArquivo = (url, opcoes = {}) => requisitar(url, resposta => {
  if (resposta.status === 404) throw new ArquivoIndisponivel('Este arquivo não está disponível no momento. Atualize a lista de dias.');
  if (!resposta.ok) throw new Error(INDISPONIVEL);
  if (resposta.headers.get('content-type')?.split(';')[0].trim() !== PARQUET) {
    throw new Error('O serviço não confirmou o arquivo Parquet. Tente novamente.');
  }
}, { ...opcoes, mensagens: MENSAGENS, method: 'HEAD', cache: 'no-store', headers: { Accept: PARQUET } });
