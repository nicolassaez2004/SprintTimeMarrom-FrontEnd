import { baseDaApi, validarCatalogo, validarDicionario } from './modelo.mjs';

export class ArquivoIndisponivel extends Error {}

async function requisitar(url, { signal, fetchImpl = fetch, timeoutMs = 20000, method = 'GET' } = {}) {
  const controle = new AbortController();
  let expirou = false;
  const cancelar = () => controle.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(() => { expirou = true; controle.abort(); }, timeoutMs);
  try {
    const resposta = await fetchImpl(url, { method, signal: controle.signal, credentials: 'omit', cache: 'no-store',
      headers: { Accept: method === 'HEAD' ? 'application/vnd.apache.parquet' : 'application/json' } });
    if (method === 'HEAD' && resposta.status === 404) throw new ArquivoIndisponivel('Este arquivo não está disponível no momento. Atualize a lista de dias.');
    if (!resposta.ok) throw new Error('Não foi possível consultar o serviço de dados. Tente novamente em instantes.');
    if (method === 'HEAD') {
      if (resposta.headers.get('content-type')?.split(';')[0].trim() !== 'application/vnd.apache.parquet') {
        throw new Error('O serviço não confirmou o arquivo Parquet. Tente novamente.');
      }
      return;
    }
    return await resposta.json();
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (expirou) throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao serviço de dados. Confira a conexão e tente novamente.');
    if (erro instanceof SyntaxError) throw new Error('O serviço retornou uma resposta inválida. Tente atualizar.');
    throw erro;
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', cancelar);
  }
}

export async function consultarCatalogo(base, opcoes) {
  const origem = baseDaApi(base);
  const url = new URL('api/downloads/brutos/datas', origem.href.endsWith('/') ? origem : `${origem}/`);
  return validarCatalogo(await requisitar(url, opcoes), origem.href);
}
export async function consultarDicionario(url, opcoes) {
  return validarDicionario(await requisitar(url, opcoes));
}
// A conferência usa só os cabeçalhos. O próprio navegador recebe o anexo do backend.
export const verificarArquivo = (url, opcoes = {}) => requisitar(url, { ...opcoes, method: 'HEAD' });
