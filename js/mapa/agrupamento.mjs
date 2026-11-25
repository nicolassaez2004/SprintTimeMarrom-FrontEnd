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

// Grupo só fica âmbar se todas as posições forem antigas; misto ganha contorno
// âmbar. Assim ~3% de GPS sem atualização da fonte não pintam a cidade inteira.
export function classificarGrupo(total, antigos) {
  if (antigos === 0) return 'fresh';
  return antigos === total ? 'delayed' : 'fresh mixed';
}
