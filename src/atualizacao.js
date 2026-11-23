export const LIMITE_DEFASAGEM_SEGUNDOS = 60;

export function calcularDefasagemSegundos(coletadoEm, exibidoEmMs = Date.now()) {
  if (typeof coletadoEm !== 'string' || !coletadoEm) return null;
  const instanteColeta = Date.parse(coletadoEm);
  if (!Number.isFinite(instanteColeta) || instanteColeta > exibidoEmMs) return null;
  return (exibidoEmMs - instanteColeta) / 1000;
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
