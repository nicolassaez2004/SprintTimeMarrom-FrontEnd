import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { avisosQualidade } from '../js/series/avisos.mjs';
import { prepararGraficos } from '../js/series/grafico.mjs';
import { figura } from '../js/series/graficos.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));

test('usa o aviso e o motivo fornecidos pela API sem recalcular o limite', () => {
  const pontos = [
    { ...fixture.dados[0], qualidade_coleta: { incompleto: true, percentual_falhas: 13.33, motivo: 'SPTRANS_HTTP_503' } },
    { ...fixture.dados[1], qualidade_coleta: { incompleto: false, percentual_falhas: 10, motivo: null } },
    { ...fixture.dados[2], qualidade_coleta: { incompleto: null, percentual_falhas: null, motivo: 'FORA_DO_MONITORAMENTO' } },
  ];
  assert.deepEqual(avisosQualidade(pontos).map(a => [a.percentual, a.motivo]), [[13.33, 'SPTRANS_HTTP_503']]);
});

test('o gráfico identifica e inclui na imagem cada janela incompleta', () => {
  const resposta = structuredClone(fixture);
  resposta.dados[0].qualidade_coleta = { incompleto: true, percentual_falhas: 13.33, motivo: 'SPTRANS_HTTP_503' };
  const [grupo] = prepararGraficos(resposta);
  const markup = figura(grupo, 0, 900);
  assert.match(markup, /Dados incompletos/);
  assert.match(markup, /SPTRANS_HTTP_503/);
  assert.match(markup, /alerta-qualidade-svg/);
  assert.match(markup, /Baixar imagem SVG/);
});
