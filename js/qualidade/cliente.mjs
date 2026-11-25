import { requisitar, urlDaApi } from '../comum/http.mjs';
import { validarPeriodo, validarRelatorio } from './modelo.mjs';

const MENSAGENS = {
  conexao: 'Não foi possível conectar ao serviço de qualidade. Confira se o backend está disponível.',
  formato: 'O serviço retornou uma resposta inválida. Tente novamente.',
};

export async function consultarQualidade(baseUrl, inicio, fim, opcoes = {}) {
  validarPeriodo(inicio, fim);
  const url = urlDaApi('api/qualidade', baseUrl);
  url.search = new URLSearchParams({ inicio, fim, janelas: 'true' }).toString();
  return requisitar(url, async resposta => {
    if (resposta.status === 400) throw new Error('O período informado não foi aceito. Confira as datas e o limite de 31 dias.');
    if (!resposta.ok) throw new Error('A consulta de qualidade está indisponível. Tente novamente em instantes.');
    return validarRelatorio(await resposta.json(), inicio, fim);
  }, { ...opcoes, mensagens: MENSAGENS, headers: { Accept: 'application/json' } });
}
