import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { corDoTexto, letreiroDoVeiculo, listarLinhas } from '../../src/linhas.js';

const catalogo = JSON.parse(readFileSync(new URL('../../data/linhas-sptrans.json', import.meta.url)));

test('dois códigos direcionais da Olho Vivo aparecem como um letreiro público', () => {
  for (const [codigo, sentido] of [[1273, 1], [34041, 2]]) {
    assert.equal(letreiroDoVeiculo({ codigo_olho_vivo: codigo, sentido_olho_vivo: sentido }, catalogo), '8000-10');
  }
  assert.deepEqual(listarLinhas(catalogo, '8000-10'), [{ letreiro: '8000-10', cor: '#509E2F' }]);
  assert.equal(letreiroDoVeiculo({ codigo_olho_vivo: 1273, sentido_olho_vivo: 2 }, catalogo), null);
});

test('agrupa opções por cor e escolhe texto contrastante', () => {
  const linhas = listarLinhas({ linhas: { '10A-10': '#002F6C', '20-10': '#FFD100', '1-10': '#002F6C' } });
  assert.deepEqual(linhas.map(linha => linha.letreiro), ['1-10', '10A-10', '20-10']);
  assert.deepEqual(listarLinhas(catalogo, '8000', '#509E2F').map(linha => linha.letreiro), ['8000-1', '8000-10']);
  assert.deepEqual(listarLinhas(catalogo, '8000', '#002F6C'), []);
  assert.equal(corDoTexto('#002F6C'), '#ffffff');
  assert.equal(corDoTexto('#FFD100'), '#000000');
});

test('filtro usa os identificadores no formato da API (/posicoes/atuais)', () => {
  // A API devolve código e sentido Olho Vivo como texto; GTFS tem precedência.
  assert.equal(letreiroDoVeiculo({ codigo_olho_vivo: '1273', sentido_olho_vivo: '1', gtfs: null }, catalogo), '8000-10');
  assert.equal(letreiroDoVeiculo({ codigo_olho_vivo: '1273', sentido_olho_vivo: null, gtfs: null }, catalogo), null);
  const [routeId, letreiro] = Object.entries(catalogo.gtfs)[0];
  assert.equal(letreiroDoVeiculo({ codigo_olho_vivo: '1273', sentido_olho_vivo: '1', gtfs: { codigo: routeId } }, catalogo), letreiro);
  // Chaves ambíguas são excluídas do catálogo: nenhuma chave aponta para letreiro desconhecido.
  assert.ok(Object.values(catalogo.olho_vivo).every((l) => Object.hasOwn(catalogo.linhas, l)));
});
