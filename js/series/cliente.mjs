import { parametrosApi, validarResposta } from './modelo.mjs';

export async function buscarSeries(base, filtros, pagina = 1, { signal, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const url = new URL('series', `${base.replace(/\/+$/, '')}/`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Endereço do serviço inválido.');
  url.search = parametrosApi(filtros, pagina).toString();
  const controle = new AbortController();
  let expirou = false;
  const cancelar = () => controle.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const timer = setTimeout(() => { expirou = true; controle.abort(); }, timeoutMs);
  try {
    const resposta = await fetchImpl(url, { signal: controle.signal, credentials: 'omit',
      cache: 'no-store', headers: { Accept: 'application/json' } });
    if (resposta.status === 429) {
      const segundos = Number(resposta.headers.get('Retry-After'));
      const erro = new Error(`Muitas consultas. Aguarde ${Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 60} segundos antes de tentar novamente.`);
      erro.tentarEm = Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 60;
      throw erro;
    }
    if (!resposta.ok) throw new Error('Não foi possível consultar as séries. Tente novamente em instantes.');
    const corpo = await resposta.json();
    if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    return validarResposta(corpo, filtros, pagina);
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (expirou) throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    if (erro instanceof SyntaxError) throw new Error('O serviço retornou uma resposta inválida.');
    if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao serviço. Confira a conexão e tente novamente.');
    throw erro;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelar);
  }
}
