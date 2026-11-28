import assert from 'node:assert/strict';
import test from 'node:test';

import {
  corDoValor, descreverJanela, ehContexto, instanteDoCampo, legendaDa, rotuloDoValor, situacaoDa,
  urlDaVisualizacao, valorDaFeature,
} from '../../js/mapa/contexto.mjs';

const API = 'http://127.0.0.1:5000/';
const INSTANTE = '2026-11-20T09:00:00-03:00';

test('monta a consulta de clima e exige linha para o trânsito', () => {
  assert.equal(urlDaVisualizacao(API, 'chuva', { instante: INSTANTE }),
    'http://127.0.0.1:5000/mapas/clima?instante=2026-11-20T09%3A00%3A00-03%3A00');
  assert.equal(urlDaVisualizacao(API, 'temperatura', { instante: INSTANTE }).split('?')[0],
    'http://127.0.0.1:5000/mapas/clima');
  assert.equal(urlDaVisualizacao(API, 'transito', { instante: INSTANTE }), null);
  assert.equal(urlDaVisualizacao(API, 'transito', { instante: INSTANTE, linha: '8000-10' }),
    'http://127.0.0.1:5000/mapas/trafego?instante=2026-11-20T09%3A00%3A00-03%3A00&linha=8000-10');
  assert.equal(urlDaVisualizacao(API, 'onibus', { instante: INSTANTE }), null);
  assert.equal(ehContexto('onibus'), false);
});

test('momento do campo é horário de São Paulo; vazio é agora', () => {
  assert.equal(instanteDoCampo('2026-11-20T09:00'), INSTANTE);
  assert.equal(instanteDoCampo('', new Date('2026-11-28T01:00:00Z')), '2026-11-28T01:00:00.000Z');
  assert.throws(() => instanteDoCampo('20/11/2026 09:00'), /MOMENTO_INVALIDO/);
});

test('sem medição é cinza e nunca vira zero', () => {
  assert.equal(valorDaFeature('chuva', { chuva_mm: null }), null);
  assert.equal(valorDaFeature('chuva', { chuva_mm: 0 }), 0);
  assert.equal(corDoValor('chuva', null), '#9aa1a6');
  assert.notEqual(corDoValor('chuva', 0), corDoValor('chuva', null));
  assert.equal(rotuloDoValor('chuva', null), 'sem medição');
  assert.equal(rotuloDoValor('temperatura', 21.5), '21,5 °C');
  assert.equal(rotuloDoValor('transito', 18), '18 km/h');
});

test('faixas de cor e legenda de cada visualização', () => {
  assert.equal(corDoValor('chuva', 0), '#e8eef2');
  assert.equal(corDoValor('chuva', 3), '#4292c6');
  assert.equal(corDoValor('temperatura', 31), '#c8372d');
  assert.equal(corDoValor('transito', 8), '#c8372d');
  assert.equal(corDoValor('transito', 25), '#2a805e');
  const legenda = legendaDa('transito');
  assert.equal(legenda.at(-1).rotulo, 'Sem medição (não significa zero)');
  assert.equal(legenda.length, 5);
});

test('situações vazias explicam o motivo', () => {
  assert.equal(situacaoDa('transito', null, {}).titulo, 'Escolha uma linha');
  assert.equal(situacaoDa('chuva', { motivo: 'sem_estacoes', features: [] }).titulo, 'Ainda não há estações de clima');
  assert.equal(situacaoDa('transito', { motivo: 'linha_sem_trechos', features: [] }, { linha: 'x' }).titulo, 'Linha sem trechos');
  const semValor = { janela: { inicio: '2026-11-20T11:00:00Z', fim: '2026-11-20T12:00:00Z' },
    features: [{ properties: { chuva_mm: null } }] };
  assert.match(situacaoDa('chuva', semValor).detalhe, /20\/11, 08:00–09:00/);
  assert.equal(situacaoDa('chuva', { features: [{ properties: { chuva_mm: 0 } }] }), null);
  assert.equal(descreverJanela(null), '');
});
