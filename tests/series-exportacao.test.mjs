import test from 'node:test';
import assert from 'node:assert/strict';
import { lerSelecao } from '../js/series/modelo.mjs';
import { nomeDoArquivo, parametrosDownload, PeriodoIndisponivel, prepararDownload, SemRegistros } from '../js/series/exportacao.mjs';
import { criarArquivoSvg } from '../js/series/graficos.mjs';

const filtros = { ...lerSelecao('?linha=3762-10'), inicio: '2026-11-20', fim: '2026-11-24' };
const csv = new Uint8Array([239, 187, 191, ...new TextEncoder().encode('linha,valor\r\nSão José,0\r\n')]);
const resposta = (body, extras = {}) => new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ...extras.headers }, ...extras });

test('imagem é um snapshot do gráfico visível e permanece válida durante atualização posterior', async () => {
  let valorVisivel = '10';
  const svg = { cloneNode: () => ({ valor: valorVisivel, insertBefore() {} }) };
  const arquivo = criarArquivoSvg(svg, {
    documentRef: { createElementNS: () => ({}) },
    serializer: { serializeToString: copia => `<svg xmlns="http://www.w3.org/2000/svg"><circle data-valor="${copia.valor}"/></svg>` },
    parser: { parseFromString: () => ({ documentElement: { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg' }, querySelector: () => null }) },
  });
  valorVisivel = '11'; // simula a atualização do painel enquanto o download já foi solicitado
  assert.match(await arquivo.text(), /data-valor="10"/);
  assert.equal(arquivo.type, 'image/svg+xml;charset=utf-8');
});

test('imagem inválida não produz arquivo para download', () => {
  const svg = { cloneNode: () => ({ insertBefore() {} }) };
  assert.throws(() => criarArquivoSvg(svg, {
    documentRef: { createElementNS: () => ({}) }, serializer: { serializeToString: () => '<html>erro</html>' },
    parser: { parseFromString: () => ({ documentElement: { localName: 'html', namespaceURI: null }, querySelector: () => null }) },
  }), /imagem gerada está inválida/);
});

test('arquivo diário mantém filtros e dispensa paginação e geração no navegador', () => {
  const args = parametrosDownload(filtros, '2026-11-22');
  assert.deepEqual(Object.fromEntries(args), { formato: 'csv', linha: '3762-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS', data: '2026-11-22' });
});

test('espera exporta também excesso e conserva a parada', () => {
  const args = parametrosDownload({ ...filtros, tipo: 'ESPERA_ESTIMADA', parada: 'P01' }, '2026-11-22');
  assert.equal(args.get('tipo'), 'ESPERA');
  assert.equal(args.get('parada'), 'P01');
});

test('faixa local envia os mesmos horários para a rota pronta', () => {
  const args = parametrosDownload({ ...filtros, hora_inicio: '06:00', hora_fim: '09:00' }, '2026-11-22');
  assert.equal(args.has('data'), false);
  assert.equal(args.get('inicio'), '2026-11-22T09:00:00.000Z');
  assert.equal(args.get('fim'), '2026-11-22T12:00:00.000Z');
  const noite = parametrosDownload({ ...filtros, hora_inicio: '22:00', hora_fim: '00:00' }, '2026-11-22');
  assert.equal(noite.get('fim'), '2026-11-23T03:00:00.000Z');
});

test('não descarta silenciosamente o período nem uma faixa noturna incompatível', () => {
  assert.throws(() => parametrosDownload(filtros, '2026-11-25'), /dentro do período/);
  assert.throws(() => parametrosDownload(filtros, '2026-02-30'));
  assert.throws(() => parametrosDownload({ ...filtros, hora_inicio: '22:00', hora_fim: '02:00' }, '2026-11-22'), /atravessam dois dias/);
});

test('preserva nome recebido inclusive UTF-8, sem inventar quando o cabeçalho não está exposto', () => {
  assert.equal(nomeDoArquivo('attachment; filename="indicadores_2026-11-22.csv"'), 'indicadores_2026-11-22.csv');
  assert.equal(nomeDoArquivo("attachment; filename*=UTF-8''S%C3%A3o%20Paulo.csv"), 'São Paulo.csv');
  assert.equal(nomeDoArquivo(null), null);
  for (const nome of ['attachment; filename="../x.csv"', 'inline; filename="x.csv"', 'attachment; filename="x.html"']) {
    assert.throws(() => nomeDoArquivo(nome));
  }
});

test('arquivo recebido é preservado byte a byte, com BOM e nome do servidor', async () => {
  const chamadas = [];
  const resultado = await prepararDownload('https://api.example/', filtros, '2026-11-22', {
    fetchImpl: async (url, opcoes) => {
      chamadas.push({ url, opcoes });
      return resposta(opcoes.method === 'HEAD' ? null : csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="nome-da-fonte.csv"' } });
    },
  });
  assert.equal(resultado.nome, 'nome-da-fonte.csv');
  assert.equal(resultado.modo, 'arquivo');
  assert.deepEqual(new Uint8Array(await resultado.arquivo.arrayBuffer()), csv);
  assert.deepEqual(chamadas.map(c => c.opcoes.method), ['HEAD', 'GET']);
  assert.equal(chamadas[0].opcoes.credentials, 'omit');
});

test('download nativo preserva o Content-Disposition sem duplicar a transferência do corpo', async () => {
  let consultas = 0;
  const resultado = await prepararDownload('https://api.example/', filtros, '2026-11-22', {
    fetchImpl: async () => { consultas += 1; return resposta(null); },
  });
  assert.equal(consultas, 1);
  assert.equal(resultado.modo, 'nativo');
  assert.match(resultado.url, /downloads\/indicadores\?/);
});

for (const codigo of ['PERIODO_AINDA_NAO_CONSOLIDADO', 'CONSOLIDACAO_NAO_PUBLICADA']) {
  test(`404 ${codigo} informa indisponibilidade sem retornar um download`, async () => {
    await assert.rejects(prepararDownload('https://api.example/', filtros, '2026-11-22', {
      fetchImpl: async (_, opcoes) => new Response(opcoes.method === 'HEAD' ? null : JSON.stringify({ erro: { codigo, previsto_em: '2026-11-23T06:00:00-03:00' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }),
    }), erro => erro instanceof PeriodoIndisponivel && /indisponível/.test(erro.message));
  });
}

test('erros HTTP, resposta HTML e 429 não anunciam sucesso', async () => {
  for (const r of [new Response(null, { status: 503 }), new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), new Response(null, { status: 429, headers: { 'Retry-After': '10' } })]) {
    await assert.rejects(prepararDownload('https://api.example/', filtros, '2026-11-22', { fetchImpl: async () => r }));
  }
});

test('cancelamento de filtros não entrega um arquivo antigo', async () => {
  const controle = new AbortController();
  await assert.rejects(prepararDownload('https://api.example/', filtros, '2026-11-22', {
    signal: controle.signal,
    fetchImpl: async (_, opcoes) => {
      if (opcoes.method === 'GET') controle.abort();
      return resposta(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="x.csv"' } });
    },
  }), erro => erro.name === 'AbortError');
});

test('CSV só com cabeçalho informa ausência de registros e não inicia download', async () => {
  for (const exposto of [true, false]) {
    const chamadas = [];
    await assert.rejects(prepararDownload('https://api.example/', filtros, '2026-11-22', {
      fetchImpl: async (_, opcoes) => {
        chamadas.push(opcoes.method);
        return resposta(opcoes.method === 'HEAD' ? null : csv.slice(0, 15), { headers: { 'Content-Type': 'text/csv', 'X-Total-Registros': '0',
          ...(exposto ? { 'Content-Disposition': 'attachment; filename="indicadores_2026-11-22.csv"' } : {}) } });
      },
    }), erro => erro instanceof SemRegistros && /Nenhum arquivo foi baixado/.test(erro.message));
    assert.deepEqual(chamadas, ['HEAD']);
  }
});
