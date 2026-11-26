import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarMapa, buscarRedes } from '../js/mapa-indicadores/cliente.mjs';
import { classeDaFeicao, CORES, COR_AUSENCIA, cortesPadrao, instanteSP, legendaFaixas,
  normalizarBusca, parametrosMapa, recortesDaPagina, validarCortes, validarMapa } from '../js/mapa-indicadores/modelo.mjs';
import { estiloFeicao } from '../js/mapa-indicadores/mapa.mjs';

const ler = nome => JSON.parse(readFileSync(new URL(`./fixtures/mapas/${nome}.json`, import.meta.url)));
const filtros = { escopo: 'parada', base: 'parada', linha: '8000-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS',
  inicio: '2026-11-24T08:00', fim: '2026-11-24T08:15', versao_gtfs_id: '00000000-0000-0000-0000-000000000024',
  versao_territorial_id: '', codigo: '' };

for (const [escopo, base] of [['parada', null], ['trecho', null], ['distrito','parada'], ['subprefeitura','parada'], ['distrito','trecho']]) {
  test(`contrato GeoJSON real de ensaio: ${escopo}/${base}`, () => {
    const dados = ler(`${escopo}-${base ?? 'rede'}`);
    assert.equal(validarMapa(dados, { ...filtros, escopo, base: base ?? 'parada' }, 1), dados);
  });
}

test('filtros preservam rede, sentido, período e base territorial sem login', () => {
  const args = parametrosMapa({ ...filtros, escopo: 'distrito', base: 'trecho', codigo: '01' }, 2);
  assert.equal(args.get('base'), 'trecho');
  assert.equal(args.get('versao_gtfs_id'), filtros.versao_gtfs_id);
  assert.equal(args.get('inicio'), '2026-11-24T11:00:00.000Z');
  assert.equal(args.get('fim'), '2026-11-24T11:15:00.000Z');
  assert.equal(args.get('codigo'), '01');
  assert.equal(args.get('page'), '2');
  assert.equal(parametrosMapa(filtros).has('base'), false);
});

test('fuso é explícito e filtros inválidos não viram consultas silenciosamente diferentes', () => {
  assert.equal(instanteSP('2026-11-24T22:00'), '2026-11-25T01:00:00.000Z');
  for (const dados of [{ ...filtros, versao_gtfs_id: '' }, { ...filtros, fim: filtros.inicio },
    { ...filtros, inicio: '2026-02-30T08:00' }, { ...filtros, sentido: '2' }, { ...filtros, escopo: 'bairro' }]) {
    assert.throws(() => parametrosMapa(dados));
  }
});

test('zero tem faixa numérica e null tem ausência distinta', () => {
  const dados = ler('parada-rede');
  const zero = dados.features.find(f => f.properties.parada === 'P0');
  const vazio = dados.features.find(f => f.properties.parada === 'PN');
  assert.deepEqual(classeDaFeicao(zero, [25, 50, 75]), { indice: 0, cor: CORES[0], rotulo: 'Faixa baixa' });
  assert.equal(classeDaFeicao(vazio, [25, 50, 75]).cor, COR_AUSENCIA);
  assert.equal(estiloFeicao(vazio, [25, 50, 75]).dashArray, '5 5');
  assert.equal(estiloFeicao(zero, [25, 50, 75]).dashArray, null);
});

test('trechos recebem a cor da faixa no traço, não apenas no preenchimento', () => {
  const dados = ler('trecho-rede');
  const baixo = dados.features.find(f => f.properties.valor === 0);
  const alto = dados.features.find(f => f.properties.valor === 80);
  assert.equal(estiloFeicao(baixo, [25, 50, 75]).color, CORES[0]);
  assert.equal(estiloFeicao(alto, [25, 50, 75]).color, CORES[3]);
});

test('faixas usam limites explícitos e unidade; limites vazios/desordenados são rejeitados', () => {
  assert.deepEqual(cortesPadrao('FREQUENCIA_OBSERVADA'), [2, 4, 8]);
  assert.ok(legendaFaixas([2, 4, 8], 'passagens/h').every(t => t.includes('passagens/h')));
  for (const cortes of [['', 4, 8], [2, 2, 8], [8, 4, 2], [2, NaN, 8]]) assert.throws(() => validarCortes(cortes));
});

test('janelas e conjuntos diferentes não são sobrepostos nem promediados', () => {
  const dados = ler('parada-rede');
  const outra = structuredClone(dados.features[0]);
  outra.properties.versao_conjunto = 'outra-revisao';
  outra.properties.valor = 99;
  dados.features.push(outra);
  const grupos = recortesDaPagina(dados);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[1].features[0].properties.valor, 99);
  assert.ok(!grupos[0].features.some(f => f.properties.valor === 99));
});

test('contrato rejeita valores ou geometria incompatíveis', () => {
  for (const mutar of [d => { d.features[0].properties.valor = '0'; }, d => { d.features[0].geometry.coordinates = [999, 999]; },
    d => { d.features[0].properties.sentido = '1'; }, d => { d.features[0].geometry.type = 'LineString'; },
    d => { d.features[0].properties.inicio = 'inválido'; },
    d => { d.features[0].properties.inicio = '2026-11-23T11:00:00Z'; d.features[0].properties.fim = '2026-11-23T11:15:00Z'; }]) {
    const dados = ler('parada-rede'); mutar(dados); assert.throws(() => validarMapa(dados, filtros, 1));
  }
});

test('versão territorial fixada e base de agregação devem corresponder à consulta', () => {
  const dados = ler('distrito-parada');
  assert.throws(() => validarMapa(dados, { ...filtros, escopo: 'distrito', base: 'trecho' }, 1));
  assert.throws(() => validarMapa(dados, { ...filtros, escopo: 'distrito', base: 'parada', versao_territorial_id: '00000000-0000-0000-0000-000000000001' }, 1));
});

test('consulta pública usa parâmetros corretos e omite credenciais', async () => {
  let chamada;
  await buscarMapa('https://api.example', filtros, 1, { fetchImpl: async (url, opcoes) => {
    chamada = { url, opcoes }; return Response.json(ler('parada-rede'));
  } });
  assert.equal(chamada.url.pathname, '/mapas/indicadores');
  assert.equal(chamada.url.searchParams.get('escopo'), 'parada');
  assert.equal(chamada.opcoes.credentials, 'omit');
});

test('catálogo de redes vem de indicadores publicados sem inventar identificadores', async () => {
  const dados = await buscarRedes('https://api.example', { ...filtros, versao_gtfs_id: '' }, 1, {
    fetchImpl: async url => {
      assert.equal(url.pathname, '/indicadores');
      assert.equal(url.searchParams.has('escopo'), false);
      return Response.json({ dados: [{ versao_gtfs_id: filtros.versao_gtfs_id, inicio: '2026-11-24T11:00:00Z' }], paginacao: { page: 1, page_size: 100, total: 1 } });
    },
  });
  assert.equal(dados.redes[0].id, filtros.versao_gtfs_id);
  assert.equal(dados.mais, false);
});

test('429 e erro não viram mapa vazio; busca local tolera acentos', async () => {
  await assert.rejects(buscarMapa('https://api.example', filtros, 1, { fetchImpl: async () => new Response(null, { status: 429, headers: { 'Retry-After': '3' } }) }), e => e.tentarEm === 3);
  await assert.rejects(buscarMapa('https://api.example', filtros, 1, { fetchImpl: async () => new Response(null, { status: 503 }) }));
  assert.equal(normalizarBusca('  SÉ  '), 'se');
});

test('US26: qualidade da coleta no mapa respeita o limite estrito de 10% e não inventa zero', async () => {
  const { textoQualidade, qualidadeDoRecorte } = await import('../js/mapa-indicadores/modelo.mjs');
  const q = (pct, incompleto, situacao = 'COM_FALHAS', motivo = null) =>
    ({ percentual_falhas: pct, incompleto, situacao, motivo, limite_incompleto_percentual: 10 });
  assert.equal(textoQualidade(q(0, false, 'COMPLETA')).aviso, false);
  assert.equal(textoQualidade(q(10, false)).aviso, false);
  assert.match(textoQualidade(q(10, false)).texto, /10% de falhas/);
  assert.equal(textoQualidade(q(10.1, true, 'INCOMPLETA')).aviso, true);
  assert.match(textoQualidade(q(10.1, true, 'INCOMPLETA')).texto, /Dado incompleto: 10,1%/);
  const nulo = textoQualidade(q(null, null, 'SEM_EXPECTATIVA', 'FORA_DO_MONITORAMENTO'));
  assert.equal(nulo.aviso, false);
  assert.match(nulo.texto, /indeterminada \(SEM_EXPECTATIVA · .*\(FORA_DO_MONITORAMENTO\)\)/);
  assert.match(textoQualidade(undefined).texto, /não informada/);
  const feicao = qualidade => ({ properties: { inicio: '2026-11-24T11:00:00+00:00', qualidade_coleta: qualidade } });
  assert.equal(qualidadeDoRecorte([feicao(q(13.33, true, 'INCOMPLETA')), feicao(q(13.33, true, 'INCOMPLETA'))]).aviso, true);
  const misto = qualidadeDoRecorte([feicao(q(5, false)), feicao(q(13.33, true, 'INCOMPLETA'))]);
  assert.equal(misto.aviso, true);
  assert.match(misto.texto, /difere entre os locais/);
  // Áreas sem medição (sem janela) não alteram a qualidade da janela exibida.
  assert.equal(qualidadeDoRecorte([feicao(q(0, false, 'COMPLETA')), { properties: { inicio: null } }]).aviso, false);
});

test('US26: nova resposta atualiza o aviso do recorte exibido no mapa', async () => {
  const { qualidadeDoRecorte } = await import('../js/mapa-indicadores/modelo.mjs');
  const feicao = qualidade => ({ properties: { inicio: '2026-11-25T11:00:00+00:00', qualidade_coleta: qualidade } });
  const anterior = qualidadeDoRecorte([feicao({ percentual_falhas: 10, incompleto: false, motivo: null, limite_incompleto_percentual: 10 })]);
  const atual = qualidadeDoRecorte([feicao({ percentual_falhas: 10.1, incompleto: true, motivo: 'FALHAS_ACIMA_DO_LIMITE', causas: ['SPTRANS_HTTP_503'], limite_incompleto_percentual: 10 })]);
  assert.equal(anterior.aviso, false);
  assert.match(anterior.texto, /10% de falhas/);
  assert.equal(atual.aviso, true);
  assert.match(atual.texto, /10,1%/);
  assert.match(atual.texto, /acima de 10%/);
});

test('US26: no mapa, motivo e causas reais da API acompanham o aviso e a geometria recebe destaque', async () => {
  const { readFileSync } = await import('node:fs');
  const { textoQualidade } = await import('../js/mapa-indicadores/modelo.mjs');
  const { estiloFeicao } = await import('../js/mapa-indicadores/mapa.mjs');
  // qualidade_coleta real (API em SQLite descartável, dados SINTÉTICOS).
  const B = JSON.parse(readFileSync(new URL('./fixtures/backend-sqlite-sintetico/series-versao-B.json', import.meta.url)));
  const q = inicio => B.dados.find(p => p.inicio === inicio).qualidade_coleta;
  const incompleta = textoQualidade(q('2026-11-24T12:00:00+00:00'));
  assert.equal(incompleta.aviso, true);
  assert.match(incompleta.texto, /13,33% de falhas de coleta nesta janela, acima de 10%\. Motivo: .*FALHAS_ACIMA_DO_LIMITE.*causas: SPTRANS_HTTP_503/);
  assert.equal(textoQualidade(q('2026-11-24T12:15:00+00:00')).aviso, false);
  assert.match(textoQualidade(q('2026-11-24T12:30:00+00:00')).texto, /100% de falhas.*NENHUM_CICLO_COM_DADOS/);
  const nulo = textoQualidade(q('2026-11-24T03:00:00+00:00'));
  assert.equal(nulo.indeterminada, true);
  assert.doesNotMatch(nulo.texto, /0% de falhas/);
  const feicao = qualidade => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-46.6, -23.5] },
    properties: { inicio: '2026-11-24T12:00:00+00:00', valor: 80, unidade: '%', qualidade_coleta: qualidade } });
  assert.equal(estiloFeicao(feicao(q('2026-11-24T12:00:00+00:00')), [25, 50, 75]).className, 'feicao-incompleta');
  assert.equal(estiloFeicao(feicao(q('2026-11-24T12:15:00+00:00')), [25, 50, 75]).className, '');
});
