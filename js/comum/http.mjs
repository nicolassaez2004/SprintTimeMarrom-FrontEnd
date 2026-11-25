// Consulta ao backend com tempo limite, cancelamento e erros legíveis.
// `ler` recebe a Response e decide status, formato e validação de cada serviço.
export async function requisitar(url, ler, { signal, fetchImpl = fetch, timeoutMs = 20000, mensagens = {}, ...init } = {}) {
  const controle = new AbortController();
  let expirou = false;
  const cancelar = () => controle.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const temporizador = setTimeout(() => { expirou = true; controle.abort(); }, timeoutMs);
  try {
    return await ler(await fetchImpl(url, { ...init, signal: controle.signal, credentials: 'omit' }));
  } catch (erro) {
    if (signal?.aborted) throw erro;
    if (expirou) throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    if (erro instanceof TypeError && mensagens.conexao) throw new Error(mensagens.conexao);
    if (erro instanceof SyntaxError && mensagens.formato) throw new Error(mensagens.formato);
    throw erro;
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', cancelar);
  }
}

// Junta um caminho relativo à base da API, com ou sem barra final.
export const urlDaApi = (caminho, base) => new URL(caminho, base.endsWith('/') ? base : `${base}/`);
