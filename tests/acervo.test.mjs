import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarDocumentos, formatarDocumento, obterPdf } from '../js/acervo/cliente.mjs';

const base = 'http://localhost:5000/';

test('combina tipo, datas do documento e página sem enviar credenciais', async () => {
  const filtros = { tipo: 'CONTRATO', data_inicio: '2026-03-01', data_fim: '2026-03-31' };
  const resposta = await buscarDocumentos(base, filtros, 2, {
    fetchImpl: async (url, opcoes) => {
      assert.equal(url.pathname, '/api/documentos');
      assert.deepEqual(Object.fromEntries(url.searchParams), { ...filtros, pagina: '2' });
      assert.equal(opcoes.credentials, 'omit');
      return Response.json({
        itens: [{ id: 'abc', titulo: 'Contrato de teste', tipo: 'CONTRATO', orgao: 'SPTrans',
          data_documento: '2026-03-01', catalogado_em: '2026-04-02T00:00:00Z' }],
        paginacao: { pagina: 2, total: 21, paginas: 2 },
      });
    },
  });
  assert.equal(resposta.itens[0].orgao, 'SPTrans');
  assert.equal(resposta.itens[0].data, '01/03/2026');
});

test('busca sem resultados é sucesso e omite filtros vazios', async () => {
  const dados = await buscarDocumentos(base, { tipo: '', data_inicio: '', data_fim: '' }, 1, {
    fetchImpl: async url => {
      assert.equal(url.search, '?pagina=1');
      return Response.json({ itens: [], paginacao: { pagina: 1, total: 0, paginas: 0 } });
    },
  });
  assert.deepEqual(dados.itens, []);
  assert.equal(dados.paginacao.total, 0);
});

test('metadados incompletos mantêm o documento e mostram os campos desconhecidos', () => {
  assert.deepEqual(formatarDocumento({ id: 'abc', titulo: '  ', orgao: null, data_documento: '2026-02-30' }), {
    id: 'abc', titulo: 'Título não informado', tipo: 'Tipo não informado',
    orgao: 'Órgão não informado', data: 'Data não informada',
  });
  assert.equal(formatarDocumento({}).id, null);
});

test('período invertido para antes da consulta', async () => {
  await assert.rejects(buscarDocumentos(base, { data_inicio: '2026-03-31', data_fim: '2026-03-01' }, 1, {
    fetchImpl: () => assert.fail('a API não deveria ser chamada'),
  }), /posterior/);
});

test('503 na consulta não é interpretado como lista vazia', async () => {
  await assert.rejects(buscarDocumentos(base, {}, 1, {
    fetchImpl: async () => new Response(null, { status: 503 }),
  }), /acervo está indisponível/);
});

test('abre os bytes do PDF original na rota pública', async () => {
  const pdf = await obterPdf(base, 'abc-123', {
    fetchImpl: async (url, opcoes) => {
      assert.equal(url.pathname, '/api/documentos/abc-123/arquivo');
      assert.equal(opcoes.credentials, 'omit');
      return new Response('%PDF-1.4\noriginal', { headers: { 'Content-Type': 'application/pdf' } });
    },
  });
  assert.equal(await pdf.text(), '%PDF-1.4\noriginal');
});

test('PDF ausente, erro HTTP e resposta HTML não abrem o visualizador', async () => {
  for (const resposta of [
    Response.json({ erro: { codigo: 'ARQUIVO_INDISPONIVEL' } }, { status: 503 }),
    new Response(null, { status: 404 }),
    new Response('<html>Falha</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('', { headers: { 'Content-Type': 'application/pdf' } }),
  ]) {
    await assert.rejects(obterPdf(base, 'abc', { fetchImpl: async () => resposta }), /PDF original está indisponível/);
  }
});
