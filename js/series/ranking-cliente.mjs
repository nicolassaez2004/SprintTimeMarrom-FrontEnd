import { requisitar, urlDaApi } from '../comum/http.mjs';
import { filtrosRanking, validarRanking } from './ranking-modelo.mjs';

export function buscarRanking(base, selecionados, opcoes = {}) {
  // Alias público já liberado pelo CORS atual do backend; mesma função/contrato.
  const filtros = filtrosRanking(selecionados), url = urlDaApi('api/atrasos/ranking', base);
  for (const [c, v] of Object.entries(filtros)) if (v) url.searchParams.set(c, v);
  return requisitar(url, async r => {
    if (r.status === 429) {
      const segundos = Number(r.headers.get('Retry-After'));
      const tentarEm = Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 60;
      throw Object.assign(new Error(`Limite de consultas atingido. Aguarde ${tentarEm} segundos.`), { tentarEm });
    }
    if (r.status === 409) {
      const corpo = await r.json();
      if (corpo?.erro?.codigo === 'METRICA_PENDENTE') throw new Error('O ranking ainda não está disponível: a métrica mensal aguarda definição pelo responsável pelos indicadores.');
    }
    if (!r.ok) throw new Error('Não foi possível consultar o ranking. Tente novamente em instantes.');
    const corpo = await r.json();
    if (opcoes.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    return validarRanking(corpo, filtros);
  }, { ...opcoes, cache: 'no-store', headers: { Accept: 'application/json' }, mensagens: {
    conexao: 'Não foi possível conectar ao serviço do ranking.', formato: 'O serviço retornou um ranking inválido.',
  } });
}
