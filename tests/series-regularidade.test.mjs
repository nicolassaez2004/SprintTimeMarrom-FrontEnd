// US17-T03A-FE: regularidade no painel, comparada com uma resposta conhecida de GET /series.
// Fixture gerada pelo backend (tests/indicadores/test_regularidade_us17.py, dados SINTÉTICOS):
// parada B, 24/11/2026; janela 09:00–09:15 com intervalos 240, 360 e 180 s → CV 0,28782.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parametrosApi, validarFiltros, validarResposta, valorFormatado } from '../js/series/modelo.mjs';
import { detalheRegularidade, motivoLegivel } from '../js/series/regularidade.mjs';

const resposta = JSON.parse(readFileSync(new URL('./fixtures/series-regularidade-us17.json', import.meta.url), 'utf8'));
const filtros = { linha: '3762-10', sentido: '0', tipo: 'REGULARIDADE_INTERVALOS', parada: 'B',
  inicio: '2026-11-24', fim: '2026-11-24', hora_inicio: '', hora_fim: '' };
const ponto = hora => resposta.dados.find(p => p.inicio === `2026-11-24T${hora}:00+00:00`);

test('regularidade exige parada e os demais indicadores não aceitam parada', () => {
  assert.throws(() => validarFiltros({ ...filtros, parada: '' }), /código da parada/);
  assert.throws(() => validarFiltros({ ...filtros, tipo: 'PONTUALIDADE_VIAGENS' }), /só se aplica/);
  assert.equal(parametrosApi(filtros).get('parada'), 'B');
  assert.equal(parametrosApi({ ...filtros, tipo: 'CUMPRIMENTO_VIAGENS', parada: '' }).has('parada'), false);
});

test('a resposta conhecida é aceita e de outra parada é recusada', () => {
  assert.equal(validarResposta(resposta, filtros, 1), resposta);
  assert.throws(() => validarResposta(resposta, { ...filtros, parada: 'C' }, 1), /fora dos filtros/);
});

test('tela reproduz CV, unidade e agrupamento da resposta', () => {
  const p = ponto('12:00');
  assert.equal(valorFormatado(p.valor, p.unidade), '0,288 CV (adimensional)');
  assert.deepEqual(detalheRegularidade(p), {
    agrupamento: 'Agrupamento: não (CV até 0,5)', motivo: null, intervalos: 'Intervalos entre passagens: 3' });
  assert.equal(detalheRegularidade({ ...p, valor: 0.6, qualidade: { ...p.qualidade, agrupamento: true } }).agrupamento,
    'Agrupamento: sim (CV acima de 0,5)');
});

test('ausência não vira zero e o motivo é mostrado', () => {
  const insuficiente = ponto('12:15');
  assert.equal(insuficiente.valor, null);
  assert.equal(valorFormatado(insuficiente.valor, insuficiente.unidade), 'Sem resultado');
  assert.deepEqual(detalheRegularidade(insuficiente), {
    agrupamento: 'Agrupamento: não avaliado sem CV', motivo: 'Motivo: Menos de três passagens na janela',
    intervalos: 'Intervalos entre passagens: 1' });
  const semColeta = ponto('13:00');
  assert.equal(detalheRegularidade(semColeta).motivo, 'Motivo: Coleta não confiável (sem dados)');
  assert.equal(motivoLegivel('coleta_sem_dados_sem_evidencia_gps'),
    'Coleta não confiável (sem dados); Passagem sem evidência GPS na parada');
});

test('o painel tem o campo de parada e o novo indicador', () => {
  const html = readFileSync(new URL('../series.html', import.meta.url), 'utf8');
  assert.match(html, /<option value="REGULARIDADE_INTERVALOS">Regularidade dos intervalos<\/option>/);
  assert.match(html, /id="parada" name="parada"/);
});
