import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPosicoes } from '../../src/agrupamento.js';

const limites = { minX: 0, minY: 0, maxX: 960, maxY: 480 };

test('mantém todos os veículos visíveis sem criar um marcador para cada um', () => {
  const veiculos = Array.from({ length: 11000 }, (_, i) => ({
    prefixo: String(i), latitude: i % 480, longitude: i % 960,
  }));
  const grupos = agruparPosicoes(veiculos, v => ({ x: v.longitude, y: v.latitude }), limites);
  assert.ok(grupos.length <= 200);
  assert.equal(grupos.reduce((total, grupo) => total + grupo.veiculos.length, 0), veiculos.length);
  assert.equal(new Set(grupos.flatMap(grupo => grupo.veiculos.map(v => v.prefixo))).size, veiculos.length);
});

test('recorta só o desenho e separa ônibus ao ampliar', () => {
  const posicoes = [{ latitude: 10, longitude: 10 }, { latitude: 11, longitude: 11 }, { latitude: 490, longitude: 2 }];
  const projetar = v => ({ x: v.longitude, y: v.latitude });
  const grupos = agruparPosicoes(posicoes, projetar, limites);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].latitude, 10.5);
  assert.deepEqual(grupos[0].veiculos, posicoes.slice(0, 2));
  const ampliados = agruparPosicoes(posicoes, v => ({ x: (v.longitude - 10) * 60, y: (v.latitude - 10) * 60 }), limites);
  assert.deepEqual(ampliados.map(grupo => grupo.veiculos.length), [1, 1]);
  assert.equal(posicoes.length, 3);
});
