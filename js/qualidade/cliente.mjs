import { validarPeriodo, validarRelatorio } from './modelo.mjs';

export async function consultarQualidade(baseUrl, inicio, fim, { signal, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  validarPeriodo(inicio, fim);
  const url = new URL('api/qualidade', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.search = new URLSearchParams({ inicio, fim, janelas: 'true' }).toString();
  const controle = new AbortController();
  let expirou = false;
  const cancelar = () => controle.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(() => { expirou = true; controle.abort(); }, timeoutMs);
  try {
    const resposta = await fetchImpl(url, { signal: controle.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!resposta.ok) {
      if (resposta.status === 400) throw new Error('O período informado não foi aceito. Confira as datas e o limite de 31 dias.');
      throw new Error('A consulta de qualidade está indisponível. Tente novamente em instantes.');
    }
    return validarRelatorio(await resposta.json(), inicio, fim);
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (expirou) throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao serviço de qualidade. Confira se o backend está disponível.');
    if (erro instanceof SyntaxError) throw new Error('O serviço retornou uma resposta inválida. Tente novamente.');
    throw erro;
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', cancelar);
  }
}
