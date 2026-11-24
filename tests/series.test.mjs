import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarSeries } from '../js/series/cliente.mjs';
import { buscaDaSelecao, lerSelecao, meiaNoiteSP, parametrosApi, validarFiltros,
  validarResposta, valorFormatado } from '../js/series/modelo.mjs';

// Resposta capturada do backend US23-T01 real com SQLite e dados SINTÉTICOS.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));
const filtros = lerSelecao('?linha=3762-10');
const resposta = (body = fixture, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('seleção é restaurada do endereço sem perder os filtros da futura exportação', () => {
  const original = { ...filtros, inicio: '2026-11-20', fim: '2026-11-24', hora_inicio: '22:00', hora_fim: '02:00' };
  assert.deepEqual(lerSelecao(buscaDaSelecao(original, 3)), original);
  assert.equal(new URLSearchParams(buscaDaSelecao(original, 3)).get('page'), '3');
});

test('período de datas é inclusivo na tela e exclusivo no fim da API, no fuso SP', () => {
  const args = parametrosApi({ ...filtros, inicio: '2026-12-31', fim: '2026-12-31', hora_inicio: '22:00', hora_fim: '02:00' }, 2);
  assert.equal(args.get('inicio'), '2026-12-31T03:00:00.000Z');
  assert.equal(args.get('fim'), '2027-01-01T03:00:00.000Z');
  assert.equal(args.get('hora_inicio'), '22:00');
  assert.equal(args.get('hora_fim'), '02:00');
  assert.equal(args.get('page'), '2');
  assert.equal(args.get('page_size'), '50');
});

test('sem período consulta todo o histórico, sem inventar a data de início', () => {
  const args = parametrosApi(filtros);
  assert.equal(args.has('inicio'), false);
  assert.equal(args.has('fim'), false);
  assert.equal(args.has('hora_inicio'), false);
  assert.equal(meiaNoiteSP('2026-11-24'), '2026-11-24T03:00:00.000Z');
});

for (const alteracao of [
  { linha: '' }, { sentido: '2' }, { tipo: 'inexistente' }, { inicio: '2026-02-30' },
  { inicio: '2026-11-24', fim: '2026-11-20' }, { hora_inicio: '06:00' },
  { hora_inicio: '25:00', hora_fim: '08:00' }, { hora_inicio: '08:00', hora_fim: '08:00' },
]) test(`filtro inválido é rejeitado: ${JSON.stringify(alteracao)}`, () => {
  assert.throws(() => validarFiltros({ ...filtros, ...alteracao }));
});

test('resposta capturada da API preserva zero, null, unidades, versões e lacunas', () => {
  const corpo = validarResposta(structuredClone(fixture), filtros, 1);
  assert.equal(corpo.dados[1].valor, 0);
  assert.equal(corpo.dados[2].valor, null);
  assert.equal(corpo.dados[2].status, 'SEM_RESULTADO');
  assert.ok(corpo.lacunas.some(l => l.motivo === 'RESULTADO_NULO'));
  assert.equal(corpo.dados[0].unidade, '%');
  assert.equal(valorFormatado(0, '%'), '0 %');
  assert.equal(valorFormatado(null, '%'), 'Sem resultado');
});

for (const mutar of [
  c => { c.dados[0].valor = '0'; }, c => { c.dados[0].valor = Infinity; },
  c => { c.dados[0].linha = 'outra'; }, c => { c.dados[0].sentido = '1'; },
  c => { c.dados[0].status = 'SEM_RESULTADO'; }, c => { delete c.historico; },
  c => { c.dados[0].versao_conjunto = ''; }, c => { c.dados[0].fim = c.dados[0].inicio; },
  c => { c.paginacao.total = 999; c.dados = []; }, c => { c.consulta.fuso = 'UTC'; },
]) test(`contrato incompatível não é exibido (${mutar.toString()})`, () => {
  const corpo = structuredClone(fixture);
  mutar(corpo);
  assert.throws(() => validarResposta(corpo, filtros, 1));
});

test('requisição usa os filtros corretos e dispensa credenciais', async () => {
  let chamada;
  await buscarSeries('https://api.exemplo.invalid/', filtros, 1, { fetchImpl: async (url, opcoes) => {
    chamada = { url, opcoes }; return resposta();
  } });
  assert.equal(chamada.url.pathname, '/series');
  assert.equal(chamada.url.searchParams.get('linha'), '3762-10');
  assert.equal(chamada.url.searchParams.get('sentido'), '0');
  assert.equal(chamada.url.searchParams.get('tipo'), 'PONTUALIDADE_VIAGENS');
  assert.equal(chamada.opcoes.credentials, 'omit');
});

test('erro HTTP e 429 não são tratados como ausência de resultados', async () => {
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    fetchImpl: async () => resposta({}, 503),
  }), /Não foi possível consultar/);
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    fetchImpl: async () => resposta({}, 429, { 'Retry-After': '12' }),
  }), erro => erro.tentarEm === 12);
});

test('JSON inválido, falha de rede e timeout têm erro explícito', async () => {
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    fetchImpl: async () => new Response('<html>'),
  }), /resposta inválida/);
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    fetchImpl: async () => { throw new TypeError('rede'); },
  }), /conectar/);
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((_, rejeitar) => {
      signal.addEventListener('abort', () => rejeitar(new DOMException('cancelado', 'AbortError')));
    }),
  }), /demorou/);
});

test('resposta de consulta cancelada não pode substituir o filtro atual', async () => {
  const controle = new AbortController();
  await assert.rejects(buscarSeries('https://api.exemplo.invalid', filtros, 1, {
    signal: controle.signal, fetchImpl: async () => { controle.abort(); return resposta(); },
  }), erro => erro.name === 'AbortError');
});
