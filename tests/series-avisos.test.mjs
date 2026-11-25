import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { avisosQualidade } from '../js/series/avisos.mjs';
import { prepararGraficos } from '../js/series/grafico.mjs';
import { criarArquivoSvg, figura } from '../js/series/graficos.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));

test('usa o aviso e o motivo fornecidos pela API sem recalcular o limite', () => {
  const pontos = [
    { ...fixture.dados[0], qualidade_coleta: { incompleto: true, percentual_falhas: 13.33, motivo: 'SPTRANS_HTTP_503' } },
    { ...fixture.dados[1], qualidade_coleta: { incompleto: false, percentual_falhas: 10, motivo: null } },
    { ...fixture.dados[2], qualidade_coleta: { incompleto: null, percentual_falhas: null, motivo: 'FORA_DO_MONITORAMENTO' } },
  ];
  assert.deepEqual(avisosQualidade(pontos).map(a => [a.percentual, a.motivo]), [[13.33, 'SPTRANS_HTTP_503']]);
});

test('0%, 10%, 10,1% e qualidade ausente seguem exatamente o estado da API', () => {
  const ponto = (percentual_falhas, incompleto) => ({ inicio: fixture.dados[0].inicio,
    qualidade_coleta: { percentual_falhas, incompleto, motivo: null } });
  assert.deepEqual(avisosQualidade([ponto(0, false), ponto(10, false), ponto(10.1, true), { inicio: fixture.dados[0].inicio }])
    .map(a => a.percentual), [10.1]);
  assert.equal(avisosQualidade([{}]).length, 0);
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

test('nova resposta atualiza o aviso visível e o motivo na imagem exportada', async () => {
  const resposta = (percentual_falhas, incompleto, motivo) => {
    const corpo = structuredClone(fixture);
    corpo.dados[0].qualidade_coleta = { incompleto, percentual_falhas, motivo };
    return corpo;
  };
  const markupDaResposta = corpo => figura(prepararGraficos(corpo)[0], 0, 900);
  const anterior = markupDaResposta(resposta(10, false, null));
  assert.doesNotMatch(anterior, /Dados incompletos/);

  const atualizado = markupDaResposta(resposta(10.1, true, 'SPTRANS_HTTP_503'));
  assert.match(atualizado, /10\.1% de falhas/);
  assert.match(atualizado, /SPTRANS_HTTP_503/);
  const svgMarkup = atualizado.match(/<svg class="grafico-serie"[\s\S]*?<\/svg>/)?.[0];
  const svg = { cloneNode: () => ({ markup: svgMarkup, insertBefore() {} }) };
  const arquivo = criarArquivoSvg(svg, {
    documentRef: { createElementNS: () => ({}) },
    serializer: { serializeToString: copia => copia.markup },
    parser: { parseFromString: () => ({ documentElement: { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg' }, querySelector: () => null }) },
  });
  const exportado = await arquivo.text();
  assert.match(exportado, /10\.1% de falhas/);
  assert.match(exportado, /SPTRANS_HTTP_503/);
  assert.doesNotMatch(exportado, /LIMITE_ANTERIOR/);
});
