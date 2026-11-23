import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarCatalogo, validarDicionario, linkDaApi, tamanhoArquivo } from '../js/brutos/modelo.mjs';
import { consultarCatalogo, consultarDicionario, verificarArquivo, ArquivoIndisponivel } from '../js/brutos/cliente.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/brutos-us09.json', import.meta.url)));
const base = 'http://localhost:5000';
const json = corpo => ({ ok: true, status: 200, json: async () => corpo });

test('catálogo mantém o dia correto, mais recente primeiro, inclusive zero registros', () => {
  const corpo = structuredClone(fixture.catalogo);
  corpo.datas.reverse();
  const catalogo = validarCatalogo(corpo, base);
  assert.equal(catalogo.datas[0].data, '2026-11-22');
  assert.equal(catalogo.datas[0].url, `${base}/downloads/brutos?data=2026-11-22`);
  assert.equal(catalogo.datas.at(-1).registros, 0);
  assert.equal(catalogo.dicionario, `${base}/downloads/brutos/dicionario`);
  assert.equal(tamanhoArquivo(12582912), '12 MB');
});

test('catálogo vazio é válido; corpo malformado, datas repetidas e contagens inválidas não são', () => {
  assert.equal(validarCatalogo({ ...fixture.catalogo, datas: [], total: 0 }, base).total, 0);
  const mudar = mutacao => { const c = structuredClone(fixture.catalogo); mutacao(c); return c; };
  for (const corpo of [null, {}, mudar(c => c.total++), mudar(c => c.datas[0].data = '2026-02-30'),
    mudar(c => c.datas[1].data = c.datas[0].data), mudar(c => c.datas[0].registros = null),
    mudar(c => c.datas[0].tamanho_bytes = -1), mudar(c => c.datas[0].gerado_em = 'ontem')]) {
    assert.throws(() => validarCatalogo(corpo, base));
  }
});

test('links do servidor devem pertencer ao backend e ao dia escolhido', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,oi', 'https://outro.example/download',
    'http://usuario:senha@localhost:5000/downloads/brutos?data=2026-11-22',
    '/downloads/brutos?data=2026-11-21', '/downloads/brutos?data=2026-11-22&data=2026-11-21',
    '/api/gerar?data=2026-11-22', '/downloads/brutos?data=2026-11-22#segredo']) {
    assert.throws(() => linkDaApi(url, base, 'arquivo', '2026-11-22'));
  }
  assert.throws(() => linkDaApi('/downloads/brutos/dicionario?outro=x', base, 'dicionario'));
});

test('consulta do catálogo usa endpoint público, sem credenciais e sem cache obsoleto', async () => {
  let chamada;
  await consultarCatalogo(base, { fetchImpl: async (url, opcoes) => { chamada = { url, opcoes }; return json(fixture.catalogo); } });
  assert.equal(chamada.url.href, `${base}/api/downloads/brutos/datas`);
  assert.equal(chamada.opcoes.method, 'GET');
  assert.equal(chamada.opcoes.credentials, 'omit');
  assert.equal(chamada.opcoes.cache, 'no-store');
});

test('erro HTTP e JSON inválido não são convertidos em catálogo vazio', async () => {
  await assert.rejects(consultarCatalogo(base, { fetchImpl: async () => ({ ok: false, status: 503 }) }), /consultar o serviço/);
  await assert.rejects(consultarCatalogo(base, { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }), /resposta inválida/);
  await assert.rejects(consultarCatalogo(base, { fetchImpl: async () => { throw new TypeError('rede'); } }), /conectar/);
});

test('download verifica só os cabeçalhos sem ler ou gerar arquivo no navegador', async () => {
  let metodo;
  await verificarArquivo(`${base}/downloads/brutos?data=2026-11-22`, { fetchImpl: async (_, opcoes) => {
    metodo = opcoes.method;
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/vnd.apache.parquet' }),
      blob: () => assert.fail('não usar Blob'), json: () => assert.fail('não ler corpo do arquivo') };
  } });
  assert.equal(metodo, 'HEAD');
  await assert.rejects(verificarArquivo(base, { fetchImpl: async () => ({ ok: false, status: 404 }) }), ArquivoIndisponivel);
  await assert.rejects(verificarArquivo(base, { fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'text/html' }) }) }), /Parquet/);
});

test('timeout e cancelamento não deixam uma consulta antiga continuar', async () => {
  const aguardarAbort = (_, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('cancelado', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')), { once: true });
  });
  await assert.rejects(consultarCatalogo(base, { timeoutMs: 10, fetchImpl: aguardarAbort }), /demorou/);
  const controle = new AbortController();
  const consulta = consultarCatalogo(base, { signal: controle.signal, fetchImpl: aguardarAbort });
  controle.abort();
  await assert.rejects(consulta, { name: 'AbortError' });
});

test('dicionário preserva os campos da API e rejeita campos incompletos', async () => {
  const dados = await consultarDicionario(`${base}/downloads/brutos/dicionario`, { fetchImpl: async () => json(fixture.dicionario) });
  assert.equal(dados.campos.length, 11);
  assert.equal(dados.campos.find(c => c.nome === 'coletado_em').anulavel, false);
  const invalido = structuredClone(dados); delete invalido.campos[0].descricao;
  assert.throws(() => validarDicionario(invalido), /incompleto/);
});
