import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepararGraficos, coordenadas } from '../js/series/grafico.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));
const corpo = pontos => ({ ...structuredClone(fixture), dados: pontos });
const ponto = (hora, valor, extras = {}) => ({ ...structuredClone(fixture.dados[0]),
  id: `ponto-${hora}`, inicio: `2026-11-20T${String(hora).padStart(2, '0')}:00:00Z`,
  fim: `2026-11-20T${String(hora + 1).padStart(2, '0')}:00:00Z`, valor, ...extras });

test('zero desenha uma amostra e null não vira ponto no eixo zero', () => {
  const [grupo] = prepararGraficos(fixture);
  assert.equal(grupo.numericos.length, 3);
  assert.equal(grupo.numericos[1].valor, 0);
  assert.equal(grupo.pontos.length, 4);
  assert.equal(grupo.segmentos.length, 3);
  assert.equal(coordenadas(grupo).y(0), coordenadas(grupo).base);
});

test('só intervalos contíguos são ligados, sem interpolar intervalo ausente', () => {
  const [grupo] = prepararGraficos(corpo([ponto(8, 10), ponto(9, 20), ponto(11, 30)]));
  assert.deepEqual(grupo.segmentos.map(s => s.length), [2, 1]);
  const { caminhos } = coordenadas(grupo);
  assert.equal(caminhos.length, 2);
  assert.ok(caminhos.every(c => c.startsWith('M ')));
});

test('resultado null interrompe o traço mesmo entre janelas contíguas', () => {
  const [grupo] = prepararGraficos(corpo([ponto(8, 10), ponto(9, null), ponto(10, 20)]));
  assert.deepEqual(grupo.segmentos.map(s => s.length), [1, 1]);
});

test('unidades diferentes nunca compartilham eixo ou passam por conversão', () => {
  const grupos = prepararGraficos(corpo([ponto(8, 10), ponto(9, 12, { unidade: 'min' })]));
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map(g => g.referencia.unidade), ['%', 'min']);
  assert.deepEqual(grupos.map(g => g.numericos[0].valor), [10, 12]);
});

for (const campo of ['versao_gtfs_id', 'versao_calculo', 'versao_correspondencia']) {
  test(`versões diferentes de ${campo} são apresentadas separadamente`, () => {
    const grupos = prepararGraficos(corpo([ponto(8, 10), ponto(9, 20, { [campo]: 'outra-versao' })]));
    assert.equal(grupos.length, 2);
  });
}

test('versões sobrepostas são preservadas sem média nem conexão', () => {
  const a = ponto(8, 10), b = { ...ponto(8, 20), id: 'revisao', versao_conjunto: 'outra-revisao' };
  const [grupo] = prepararGraficos(corpo([a, b, ponto(9, 30)]));
  assert.equal(grupo.sobrepostas, true);
  assert.deepEqual(grupo.segmentos.map(s => s.length), [1, 1, 1]);
  assert.deepEqual(grupo.numericos.map(p => p.valor), [10, 20, 30]);
});

test('grupo só com null não recebe escala nem zero fictício', () => {
  const [grupo] = prepararGraficos(corpo([ponto(8, null)]));
  assert.equal(grupo.minimo, null);
  assert.equal(grupo.maximo, null);
  assert.deepEqual(grupo.segmentos, []);
});

test('somente zeros continuam numéricos com escala válida', () => {
  const [grupo] = prepararGraficos(corpo([ponto(8, 0), ponto(9, 0)]));
  assert.equal(grupo.numericos.length, 2);
  assert.equal(grupo.maximo, 100);
  assert.ok(!coordenadas(grupo).caminhos[0].includes('NaN'));
});

test('redimensionar muda coordenadas sem alterar valores, filtros ou resposta', () => {
  const copia = structuredClone(fixture);
  const [grupo] = prepararGraficos(copia);
  assert.notDeepEqual(coordenadas(grupo, 900).caminhos, coordenadas(grupo, 300).caminhos);
  assert.deepEqual(copia, fixture);
});

test('valores negativos preservam sinal e ficam no domínio do eixo', () => {
  const [grupo] = prepararGraficos(corpo([ponto(8, -30, { unidade: 's' })]));
  assert.equal(grupo.minimo, -30);
  assert.equal(grupo.numericos[0].valor, -30);
  assert.equal(coordenadas(grupo).y(-30), coordenadas(grupo).base);
});

test('nenhum ponto não cria gráfico', () => assert.deepEqual(prepararGraficos(corpo([])), []));
