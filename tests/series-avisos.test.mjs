// US26-T03-FE: avisos de qualidade conferidos contra respostas da API.
// "real" = capturada das rotas Flask (SQLite descartável, dados SINTÉTICOS; fixtures em
// tests/fixtures/backend-sqlite-sintetico). "controlada" = a mesma resposta real com
// `qualidade_coleta` trocada por valores permitidos pelo contrato (0% e 10,1%).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { avisosQualidade, estadoQualidade, qualidadeIndeterminada } from '../js/series/avisos.mjs';
import { prepararGraficos } from '../js/series/grafico.mjs';
import { criarArquivoSvg, figura } from '../js/series/graficos.mjs';
import { fixarPainel, metadadosDoPainel } from '../js/series/painel-exportacao.mjs';

const ler = nome => JSON.parse(readFileSync(new URL(`./fixtures/backend-sqlite-sintetico/${nome}`, import.meta.url), 'utf8'));
const B = ler('series-versao-B.json');
const filtros = { linha: '3762-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS', parada: '', inicio: '2026-11-24', fim: '2026-11-24', hora_inicio: '', hora_fim: '' };
const ponto = inicio => B.dados.find(p => p.inicio === inicio);
const P1333 = ponto('2026-11-24T12:00:00+00:00');   // INCOMPLETA 13,33% (API real)
const P10 = ponto('2026-11-24T12:15:00+00:00');     // COM_FALHAS 10% exato (API real)
const PSEM = ponto('2026-11-24T12:30:00+00:00');    // SEM_DADOS: nenhum ciclo coletado (API real)
const PNULO = ponto('2026-11-24T03:00:00+00:00');   // SEM_EXPECTATIVA: percentual null (API real)
const controlada = (base, qualidade) => ({ ...structuredClone(base), qualidade_coleta: { ...base.qualidade_coleta, ...qualidade } });
const P0 = controlada(P10, { percentual_falhas: 0, incompleto: false, situacao: 'COMPLETA', motivo: null, causas: [] });
const P101 = controlada(P10, { percentual_falhas: 10.1, incompleto: true, situacao: 'INCOMPLETA', motivo: 'FALHAS_ACIMA_DO_LIMITE', causas: ['SPTRANS_HTTP_503'] });
const markup = dados => figura(prepararGraficos({ ...structuredClone(B), dados })[0], 0, 900);
const svgDe = html => html.match(/<svg class="grafico-serie"[\s\S]*?<\/svg>/)?.[0];
const exportar = (html, metadados) => criarArquivoSvg({ cloneNode: () => ({ m: svgDe(html), insertBefore() {} }) }, {
  documentRef: { createElementNS: () => ({}) }, serializer: { serializeToString: c => c.m },
  parser: { parseFromString: () => ({ documentElement: { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg' }, querySelector: () => null }) },
  metadados,
}).text();

test('fixtures reais cobrem 10%, 13,33%, ausência total e percentual NULL', () => {
  assert.deepEqual([P1333, P10, PSEM, PNULO].map(p => [p.qualidade_coleta.situacao, p.qualidade_coleta.percentual_falhas, p.qualidade_coleta.incompleto]),
    [['INCOMPLETA', 13.33, true], ['COM_FALHAS', 10, false], ['SEM_DADOS', 100, true], ['SEM_EXPECTATIVA', null, null]]);
});

test('aviso só onde a API informa incompleto=true: 0% e 10% não; 10,1% sim', () => {
  assert.equal(avisosQualidade([P0]).length, 0);
  assert.equal(avisosQualidade([P10]).length, 0); // exatamente 10% (real): sem aviso de "acima de 10%"
  const [aviso] = avisosQualidade([P101]);
  assert.equal(aviso.percentual, '10,1% de falhas');
  assert.match(aviso.texto, /FALHAS_ACIMA_DO_LIMITE.*causas: SPTRANS_HTTP_503/);
  // O navegador não aplica limite: incompleto=false com percentual alto não vira aviso.
  assert.equal(avisosQualidade([controlada(P10, { percentual_falhas: 50, incompleto: false })]).length, 0);
});

test('motivo e causas reais aparecem junto ao percentual', () => {
  const [aviso] = avisosQualidade([P1333]);
  assert.equal(aviso.texto, '24/11/2026, 09:00 · 13,33% de falhas · falhas de coleta acima do limite (FALHAS_ACIMA_DO_LIMITE); causas: SPTRANS_HTTP_503');
});

test('ausência total de coleta é aviso de 100%, não qualidade satisfatória', () => {
  const [aviso] = avisosQualidade([PSEM]);
  assert.match(aviso.texto, /100% de falhas · nenhum ciclo de coleta com dados \(NENHUM_CICLO_COM_DADOS\); causas: SEM_CICLO_REGISTRADO/);
});

test('percentual NULL ou bloco ausente fica indeterminado, nunca 0%', () => {
  assert.equal(estadoQualidade(PNULO.qualidade_coleta), 'indeterminada');
  assert.equal(avisosQualidade([PNULO]).length, 0);
  const [grupo] = qualidadeIndeterminada([PNULO, PNULO]);
  assert.equal(grupo.quantidade, 2);
  assert.match(grupo.texto, /2 janelas sem qualidade da coleta determinada \(não é 0% de falhas\): SEM_EXPECTATIVA · fora do período monitorado/);
  const semBloco = { ...structuredClone(P10) }; delete semBloco.qualidade_coleta;
  assert.match(qualidadeIndeterminada([semBloco])[0].texto, /não informada pela API/);
  assert.equal(qualidadeIndeterminada([P0, P10, P1333]).length, 0);
});

test('gráfico real: marcador e texto em cada janela incompleta, nada na janela de 10%', () => {
  const html = markup(B.dados);
  const incompletas = B.dados.filter(p => p.qualidade_coleta.incompleto === true);
  assert.equal((svgDe(html).match(/class="alerta-qualidade-svg"/g) ?? []).length >= incompletas.length, true);
  assert.equal((html.match(/class="marcador-incompleto"/g) ?? []).length, incompletas.filter(p => p.valor !== null).length);
  assert.match(html, /13,33% de falhas/);
  assert.doesNotMatch(html, /09:15 · 10% de falhas/); // 12:15 UTC = 09:15 em SP, exatamente 10%
  assert.match(html, /janelas sem qualidade da coleta determinada \(não é 0% de falhas\)/);
});

test('zero observado (valor 0) é distinto de ausência de dados', () => {
  const zero = { ...structuredClone(P10), valor: 0, status: 'DISPONIVEL' };
  const html = markup([zero, PNULO]);
  assert.match(html, /data-valor="0"/);
  assert.match(html, /1 resultado numérico · 1 sem resultado/);
});

test('nova resposta da API substitui o aviso anterior, na tela e na imagem', async () => {
  const antes = markup([P1333, P10]);
  assert.match(antes, /13,33% de falhas/);
  // Republicação: a mesma janela agora com 10% (incompleto=false) e outra com 10,1%.
  const depois = markup([controlada(P1333, P10.qualidade_coleta), controlada(P10, P101.qualidade_coleta)]);
  assert.doesNotMatch(depois, /13,33%/);
  assert.match(depois, /09:15 · 10,1% de falhas/);
  const imagem = await exportar(depois);
  assert.doesNotMatch(imagem, /13,33%/);
  assert.match(imagem, /10,1% de falhas.*SPTRANS_HTTP_503/);
});

test('imagem exportada preserva avisos, período e versão dos dados exibidos', async () => {
  const snapshot = fixarPainel(B, filtros, 1, '2026-11-25T07:01:00Z');
  const html = markup(B.dados);
  const imagem = await exportar(html, metadadosDoPainel(snapshot, 'Pontualidade das saídas', 'Resultado publicado'));
  assert.match(imagem, /⚠ 24\/11\/2026, 09:00 · 13,33% de falhas/);
  assert.match(imagem, /NENHUM_CICLO_COM_DADOS/);
  assert.match(imagem, /não é 0% de falhas/);
  assert.match(imagem, /2026-11-24 a 2026-11-24/);
  assert.match(imagem, new RegExp(`Versão dos dados: ${B.versao_dados.id} \\(consolidação do dia`));
});

test('texto longo de aviso é quebrado em várias linhas em vez de cortado na largura móvel', () => {
  const longo = controlada(P1333, { causas: Array.from({ length: 8 }, (_, i) => `CAUSA_MUITO_LONGA_${i}`) });
  const svg = svgDe(figura(prepararGraficos({ ...structuredClone(B), dados: [longo] })[0], 0, 320));
  const linhas = [...svg.matchAll(/<text class="alerta-qualidade-svg"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  assert.ok(linhas.length > 1);
  assert.ok(linhas.every(l => l.length <= Math.floor((320 - 52 - 8) / 6) + 20));
  assert.match(linhas.join(' '), /CAUSA_MUITO_LONGA_7/);
});
