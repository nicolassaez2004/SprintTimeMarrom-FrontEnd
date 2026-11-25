import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { caderno, conferirResposta, executar } from '../scripts/conferir_mapa_us24.mjs';

for (const q of caderno.consultas) {
  test(`US24-T04 referência manual: ${q.id}`, async () => {
    const corpo = JSON.parse(await readFile(new URL(`fixtures/${q.fixture}`, import.meta.url), 'utf8'));
    const resultados = conferirResposta(q, corpo);
    assert.equal(resultados.length, Math.max(1, q.casos.length));
  });
}

test('a conferência detecta valor, contagem e posição alterados, mesmo com GeoJSON válido', async () => {
  const q = caderno.consultas[0];
  const original = JSON.parse(await readFile(new URL(`fixtures/${q.fixture}`, import.meta.url), 'utf8'));
  for (const alterar of [p => { p.properties.valor = 1; }, p => { p.properties.contagens.numerador = 1; },
    p => { p.geometry.coordinates[0] += 0.001; }]) {
    const corpo = structuredClone(original); alterar(corpo.features.find(f => f.properties.parada === 'P0'));
    assert.throws(() => conferirResposta(q, corpo));
  }
});

test('resultado técnico sintético não equivale ao aceite operacional ou revisão', async () => {
  const r = await executar();
  assert.equal(r.divergencias_no_ensaio, 0);
  assert.equal(r.pode_mover_para_pronto, false);
  assert.equal(r.aceite, 'PENDENTE');
  assert.equal(r.revisao_por_outra_pessoa, 'PENDENTE');
  assert.match(r.frequencia_operacional_us15, /PENDENTE/);
});
