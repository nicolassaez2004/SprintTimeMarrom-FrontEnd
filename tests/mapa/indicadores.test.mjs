import assert from 'node:assert/strict';
import test from 'node:test';
import { avisoQualidadeIndicador, periodoMapa, resumoQualidadeMapa } from '../../js/mapa/indicadores.mjs';

test('o popup apresenta o motivo e o percentual enviados pela API', () => {
  assert.equal(avisoQualidadeIndicador({ incompleto: true, percentual_falhas: 13.33, motivo: 'SPTRANS_HTTP_503' }),
    'Dados incompletos: 13.33% de falhas. Motivo: SPTRANS_HTTP_503.');
});

test('qualidade desconhecida permanece explícita e taxa não é recalculada', () => {
  assert.equal(avisoQualidadeIndicador({ incompleto: null, percentual_falhas: null, motivo: 'FORA_DO_MONITORAMENTO' }),
    'Qualidade indisponível: FORA_DO_MONITORAMENTO.');
  assert.equal(avisoQualidadeIndicador({ incompleto: false, percentual_falhas: 10, motivo: null }), null);
});

test('resume elementos sinalizados e não inventa alerta para os demais', () => {
  assert.deepEqual(resumoQualidadeMapa([
    { properties: { qualidade_coleta: { incompleto: true } } },
    { properties: { qualidade_coleta: { incompleto: null } } },
    { properties: { qualidade_coleta: { incompleto: false } } },
  ]), { avisos: 1, indisponiveis: 1 });
});

test('converte o período civil de São Paulo para intervalo ISO com fim exclusivo', () => {
  assert.deepEqual(periodoMapa('2026-11-25', '2026-11-25'), {
    inicio: '2026-11-25T03:00:00.000Z', fim: '2026-11-26T03:00:00.000Z',
  });
});
