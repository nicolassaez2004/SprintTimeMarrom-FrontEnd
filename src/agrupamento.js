export function agruparPosicoes(posicoes, projetar, limites, tamanhoCelula = 48) {
  const grupos = new Map();
  for (const veiculo of posicoes) {
    const { x, y } = projetar(veiculo);
    if (!Number.isFinite(x) || !Number.isFinite(y)
        || x < limites.minX || y < limites.minY || x >= limites.maxX || y >= limites.maxY) {
      continue;
    }
    const chave = Math.floor(x / tamanhoCelula) + ':' + Math.floor(y / tamanhoCelula);
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { somaLat: 0, somaLng: 0, veiculos: [] };
      grupos.set(chave, grupo);
    }
    grupo.somaLat += veiculo.latitude;
    grupo.somaLng += veiculo.longitude;
    grupo.veiculos.push(veiculo);
  }
  return Array.from(grupos.values(), grupo => ({
    latitude: grupo.somaLat / grupo.veiculos.length,
    longitude: grupo.somaLng / grupo.veiculos.length,
    veiculos: grupo.veiculos,
  }));
}
