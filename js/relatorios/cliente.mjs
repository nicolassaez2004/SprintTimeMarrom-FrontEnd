// US21-T04-FE: GET /api/relatorios/associacoes?mes=AAAA-MM (US21-T04). Só consulta o relatório pronto.
import { requisitar, urlDaApi } from '../comum/http.mjs';
import { interpretarResposta, validarMes } from './modelo.mjs';

const MENSAGENS = {
  conexao: 'Não foi possível conectar ao serviço de relatórios. Confira se o backend está disponível.',
  formato: 'O serviço de relatórios retornou uma resposta inválida. Tente novamente.',
};

export async function consultarRelatorio(baseUrl, mes, opcoes = {}) {
  validarMes(mes);
  const url = urlDaApi('api/relatorios/associacoes', baseUrl);
  url.search = new URLSearchParams({ mes }).toString();
  return requisitar(url, async resposta => {
    const corpo = [200, 404, 409].includes(resposta.status) ? await resposta.json() : null;
    return interpretarResposta(resposta.status, corpo, mes);
  }, { ...opcoes, mensagens: MENSAGENS, headers: { Accept: 'application/json' } });
}
