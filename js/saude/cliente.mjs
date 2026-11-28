// US30-T03B: chamada HTTP a GET /api/saude?mes=AAAA-MM (US30-T03A). Só consulta; não sonda nada.
import { requisitar, urlDaApi } from '../comum/http.mjs';
import { validarMes, validarSaude } from './modelo.mjs';

const MENSAGENS = {
  conexao: 'Não foi possível conectar à API para consultar a saúde. A própria API pode estar fora do ar.',
  formato: 'O serviço de saúde retornou uma resposta inválida. Tente novamente.',
};

export async function consultarSaude(baseUrl, mes, opcoes = {}) {
  validarMes(mes);
  const url = urlDaApi('api/saude', baseUrl);
  url.search = new URLSearchParams({ mes }).toString();
  return requisitar(url, async resposta => {
    if (resposta.status === 400) throw new Error('O mês informado não foi aceito. Escolha um mês válido que já começou.');
    if (resposta.status === 429) throw new Error('Muitas consultas seguidas. Aguarde alguns segundos e tente novamente.');
    if (!resposta.ok) throw new Error('A consulta de saúde está indisponível agora (o banco de dados pode estar fora). Tente novamente em instantes.');
    return validarSaude(await resposta.json(), mes);
  }, { ...opcoes, mensagens: MENSAGENS, headers: { Accept: 'application/json' } });
}
