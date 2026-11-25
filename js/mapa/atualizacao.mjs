export const LIMITE_DEFASAGEM_SEGUNDOS = 60;
// Coleta a cada 30 s + gravação + consulta: com 10 s a tela não soma outros 30 s
// de espera. Sem ciclo novo a API responde 304 (ETag), sem reenviar a frota.
export const INTERVALO_CONSULTA_MS = 10_000;

export function descreverUltimaColeta(ultimaColetaEm, agoraMs = Date.now()) {
  const defasagem = calcularDefasagemSegundos(ultimaColetaEm, agoraMs);
  if (defasagem === null) return { texto: 'Sem coleta registrada', desatualizada: true };
  const hora = new Date(Date.parse(ultimaColetaEm)).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const desatualizada = defasagem > LIMITE_DEFASAGEM_SEGUNDOS;
  const idade = defasagem < 60 ? `${Math.floor(defasagem)} s` : `${Math.floor(defasagem / 60)} min`;
  return { texto: `Última coleta às ${hora} (há ${idade})${desatualizada ? ' · coleta atrasada' : ''}`, desatualizada };
}

export function calcularDefasagemSegundos(coletadoEm, exibidoEmMs = Date.now()) {
  if (typeof coletadoEm !== 'string' || !coletadoEm) return null;
  const instanteColeta = Date.parse(coletadoEm);
  if (!Number.isFinite(instanteColeta) || instanteColeta > exibidoEmMs) return null;
  return (exibidoEmMs - instanteColeta) / 1000;
}

export function criarBuscaPosicoes(fetchImpl = fetch) {
  return async (url, { etagLocal, ...opcoes }) => {
    const resposta = await fetchImpl(url, {
      ...opcoes,
      // A primeira carga precisa do corpo e deve renovar o cache do navegador.
      cache: etagLocal ? 'no-cache' : 'reload',
    });
    if (resposta.status !== 304 || (etagLocal && resposta.headers.get('ETag') === etagLocal)) {
      return resposta;
    }

    // O navegador pode receber um 304 sem ter o corpo que ele valida.
    opcoes.signal?.throwIfAborted();
    return fetchImpl(url, { ...opcoes, cache: 'no-store' });
  };
}

export function criarCoordenadorDeRequisicoes(fetchImpl = fetch) {
  let sequenciaAtual = 0;
  let controladorAtual = null;

  return {
    iniciar(url, opcoes = {}) {
      controladorAtual?.abort();
      const controlador = new AbortController();
      controladorAtual = controlador;
      const id = ++sequenciaAtual;
      const promise = fetchImpl(url, { ...opcoes, signal: controlador.signal })
        .then((response) => ({ response }));
      return { id, promise };
    },
    eAtual(id) {
      return id === sequenciaAtual;
    },
    cancelar() {
      sequenciaAtual += 1;
      controladorAtual?.abort();
      controladorAtual = null;
    },
  };
}

export function criarEstadoPosicoes() {
  let veiculos = [];
  return {
    obter() {
      return veiculos;
    },
    substituir(novosVeiculos) {
      if (!Array.isArray(novosVeiculos)) throw new TypeError('A lista de veículos deve ser um array.');
      veiculos = novosVeiculos;
      return veiculos;
    },
  };
}
