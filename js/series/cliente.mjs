import { requisitar } from '../comum/http.mjs';
import { parametrosApi, validarResposta } from './modelo.mjs';

const MENSAGENS = {
  conexao: 'Não foi possível conectar ao serviço. Confira a conexão e tente novamente.',
  formato: 'O serviço retornou uma resposta inválida.',
};

export async function buscarSeries(base, filtros, pagina = 1, opcoes = {}) {
  const url = new URL('series', `${base.replace(/\/+$/, '')}/`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Endereço do serviço inválido.');
  url.search = parametrosApi(filtros, pagina).toString();
  return requisitar(url, async resposta => {
    if (resposta.status === 429) {
      const segundos = Number(resposta.headers.get('Retry-After'));
      const tentarEm = Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 60;
      throw Object.assign(new Error(`Muitas consultas. Aguarde ${tentarEm} segundos antes de tentar novamente.`), { tentarEm });
    }
    if (!resposta.ok) throw new Error('Não foi possível consultar as séries. Tente novamente em instantes.');
    const corpo = await resposta.json();
    if (opcoes.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    return validarResposta(corpo, filtros, pagina);
  }, { ...opcoes, mensagens: MENSAGENS, cache: 'no-store', headers: { Accept: 'application/json' } });
}
