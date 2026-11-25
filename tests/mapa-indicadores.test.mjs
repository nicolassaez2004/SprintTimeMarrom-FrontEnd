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
