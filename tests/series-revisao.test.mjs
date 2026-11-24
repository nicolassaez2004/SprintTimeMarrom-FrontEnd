// Revisão US23-T02A/T02B: regressões de contrato API ↔ gráfico, zero × null × lacuna e contagens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepararGraficos } from '../js/series/grafico.mjs';
import { figura } from '../js/series/graficos.mjs';
import { contagensFormatadas, lerSelecao, parametrosApi, validarResposta } from '../js/series/modelo.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));
const filtros = lerSelecao('?linha=3762-10');
const svg = corpo => prepararGraficos(corpo).map((g, i) => figura(g, i, 900)).join('');

test('cada valor numérico da API vira exatamente um ponto com o mesmo valor; null não vira ponto', () => {
  const html = svg(fixture);
  const desenhados = [...html.matchAll(/data-valor="([^"]+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(desenhados, fixture.dados.filter(p => p.valor !== null).map(p => p.valor));
  assert.ok(desenhados.includes(0), 'zero é desenhado como resultado');
});

test('lacuna sem publicação e resultado null têm marcação distinta, e zero não é lacuna', () => {
  const html = svg(fixture);
  const motivos = [...html.matchAll(/data-motivo="([^"]+)"[^>]*fill="url\(#grafico-0-(\w+)\)"/g)].map(m => [m[1], m[2]]);
  assert.ok(motivos.some(([m, p]) => m === 'RESULTADO_NULO' && p === 'nulo'));
  assert.ok(motivos.every(([m, p]) => (m === 'RESULTADO_NULO') === (p === 'nulo')));
  const zero = fixture.dados.find(p => p.valor === 0);
  assert.ok(!fixture.lacunas.some(l => l.inicio === zero.inicio), 'janela com zero não aparece como ausência');
});

test('lacunas na série interrompem o traço: nenhum caminho atravessa intervalo sem dados', () => {
  const ponto = (h, valor) => ({ ...structuredClone(fixture.dados[0]), id: `p${h}`, valor,
    inicio: `2026-11-20T${String(h).padStart(2, '0')}:00:00Z`, fim: `2026-11-20T${String(h + 1).padStart(2, '0')}:00:00Z` });
  const corpo = { ...structuredClone(fixture), dados: [ponto(8, 10), ponto(9, 0), ponto(12, 30)],
    lacunas: [{ linha: '3762-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS', unidade: '%',
      inicio: '2026-11-20T10:00:00Z', fim: '2026-11-20T12:00:00Z', motivo: 'SEM_PUBLICACAO' }] };
  const caminhos = [...svg(corpo).matchAll(/class="linha-serie" d="([^"]+)"/g)].map(m => m[1]);
  assert.equal(caminhos.length, 2);
  assert.equal((caminhos[0].match(/M /g) || []).length, 1);
});

test('ausência completa de resultados não desenha gráfico', () => {
  assert.equal(svg({ ...structuredClone(fixture), dados: [], lacunas: [] }), '');
});

test('contagens são preservadas e distinguem 0% de período sem observações', () => {
  const corpo = validarResposta(structuredClone(fixture), filtros, 1);
  assert.deepEqual(corpo.dados.map(p => [p.valor, p.contagens.numerador, p.contagens.denominador]),
    [[92.5, 37, 40], [0, 0, 12], [null, 0, 0], [88.75, 71, 80]]);
  assert.equal(contagensFormatadas({ numerador: 0, denominador: 12 }), '0 de 12');
  assert.match(contagensFormatadas({ numerador: 0, denominador: 0 }), /sem observações/);
  assert.equal(contagensFormatadas({ numerador: null, denominador: null }), 'Contagens não informadas');
});

for (const contagens of [{ numerador: 5, denominador: 4 }, { numerador: -1, denominador: 4 },
  { numerador: '1', denominador: 4 }, null]) {
  test(`contagens incoerentes invalidam a resposta: ${JSON.stringify(contagens)}`, () => {
    const corpo = structuredClone(fixture);
    corpo.dados[0].contagens = contagens;
    assert.throws(() => validarResposta(corpo, filtros, 1));
  });
}

test('filtros combinados geram os parâmetros da API e aceitam o período recortado ao histórico', () => {
  const combinados = { ...filtros, sentido: '1', tipo: 'CUMPRIMENTO_VIAGENS', inicio: '2026-01-01',
    fim: '2026-12-31', hora_inicio: '06:00', hora_fim: '09:00' };
  const args = parametrosApi(combinados, 1);
  assert.deepEqual(Object.fromEntries(args), { linha: '3762-10', sentido: '1', tipo: 'CUMPRIMENTO_VIAGENS',
    page: '1', page_size: '50', inicio: '2026-01-01T03:00:00.000Z', fim: '2027-01-01T03:00:00.000Z',
    hora_inicio: '06:00', hora_fim: '09:00' });
  const vazio = { ...structuredClone(fixture), dados: [], lacunas: [], paginacao: { page: 1, page_size: 50, total: 0 },
    consulta: { ...fixture.consulta, hora_inicio: '06:00', hora_fim: '09:00',
      inicio: '2026-11-20T03:00:00+00:00', fim: '2026-11-24T12:00:00+00:00' } };
  assert.doesNotThrow(() => validarResposta(vazio, combinados, 1));
  assert.doesNotThrow(() => validarResposta({ ...vazio, consulta: { ...vazio.consulta, inicio: null, fim: null } }, combinados, 1));
  assert.throws(() => validarResposta({ ...vazio, consulta: { ...vazio.consulta, inicio: '2025-12-31T03:00:00Z' } }, combinados, 1));
  assert.throws(() => validarResposta({ ...vazio, consulta: { ...vazio.consulta, fim: null } }, combinados, 1));
});
