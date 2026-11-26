// US25-T03: exportação durante uma atualização. As respostas A/B, o CSV e o 410 foram
// capturados do backend real (rotas Flask, SQLite descartável, dados SINTÉTICOS): ver
// tests/fixtures/backend-sqlite-sintetico e docs/reviews/US25-T03-US26-FE-review.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarArquivoSvg } from '../js/series/graficos.mjs';
import { validarResposta } from '../js/series/modelo.mjs';
import { baixarVersaoPainel, VersaoIndisponivel } from '../js/series/exportacao.mjs';
import { fixarPainel, metadadosDoPainel, parametrosExportacao, registrosEsperados } from '../js/series/painel-exportacao.mjs';

const ler = nome => readFileSync(new URL(`./fixtures/backend-sqlite-sintetico/${nome}`, import.meta.url));
const A = JSON.parse(ler('series-versao-A.json'));
const B = JSON.parse(ler('series-versao-B.json'));
const csvA = ler('csv-versao-A.csv');
const cabecalhosA = JSON.parse(ler('csv-versao-A.headers.json'));
const removida = JSON.parse(ler('csv-versao-A-removida.json'));
const filtros = { linha: '3762-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS', parada: '',
  inicio: '2026-11-24', fim: '2026-11-24', hora_inicio: '', hora_fim: '' };
const respostaCsv = (corpo = csvA, cabecalhos = {}) => new Response(corpo, { status: 200, headers: {
  'Content-Type': cabecalhosA['Content-Type'], 'Content-Disposition': cabecalhosA['Content-Disposition'],
  'X-Versao-Dados': cabecalhosA['X-Versao-Dados'], 'X-Total-Registros': cabecalhosA['X-Total-Registros'], ...cabecalhos } });
// CSV RFC 4180 mínimo (aspas duplicadas, vírgulas e BOM), só para a conferência do teste.
function lerCsv(texto) {
  const linhas = [], t = texto.replace(/^﻿/, '');
  let linha = [], campo = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const svgFalso = (markup, metadados) => criarArquivoSvg({ cloneNode: () => ({ markup, insertBefore() {} }) }, {
  documentRef: { createElementNS: () => ({}) }, serializer: { serializeToString: c => c.markup },
  parser: { parseFromString: () => ({ documentElement: { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg' }, querySelector: () => null }) },
  metadados,
});

test('a resposta real de /series (versao_dados objeto) é aceita e fixada sem quebrar o painel', () => {
  validarResposta(A, filtros, 1);
  const snapshot = fixarPainel(A, filtros, 1, '2026-11-24T12:32:00Z');
  assert.equal(snapshot.versaoDados.id, A.versao_dados.id);
  assert.equal(snapshot.versaoDados.tipo, 'ATUALIZACAO_INDICADORES');
  A.dados[0].valor = 1; // mutação posterior da resposta não altera o que foi fixado
  assert.equal(snapshot.resposta.dados[0].valor, 100);
  A.dados[0].valor = 100;
});

test('sem versao_dados ou com versão malformada o painel continua legível, mas não exporta CSV', () => {
  for (const versao of [null, 'texto-antigo', { id: 'nao-uuid' }]) {
    const snapshot = fixarPainel({ ...A, versao_dados: versao }, filtros);
    assert.equal(snapshot.versaoDados, null);
    assert.throws(() => parametrosExportacao(snapshot), /versão/);
  }
});

test('a exportação pede ao backend exatamente os filtros, o período efetivo e a versão exibidos', () => {
  const args = Object.fromEntries(parametrosExportacao(fixarPainel(A, filtros)));
  assert.deepEqual(args, cabecalhosA.query); // mesma consulta que o backend respondeu com 200 no ensaio
  assert.throws(() => parametrosExportacao(fixarPainel({ ...A, dados: [] }, filtros)), /Não há resultados/);
});

test('espera exporta espera e excesso pelo tipo público ESPERA e confere o dobro do total', () => {
  const f = { ...filtros, tipo: 'ESPERA_ESTIMADA', parada: 'P01' };
  const snapshot = fixarPainel(A, f);
  const args = parametrosExportacao(snapshot);
  assert.equal(args.get('tipo'), 'ESPERA');
  assert.equal(args.get('parada'), 'P01');
  assert.equal(registrosEsperados(snapshot), 2 * A.paginacao.total);
});

test('publicação B durante a exportação: o arquivo entregue é o da versão A exibida no clique', async () => {
  let snapshotAtual = fixarPainel(A, filtros, 1, '2026-11-24T12:32:00Z');
  const alvo = snapshotAtual;
  let pedido;
  const pendente = baixarVersaoPainel('https://api.example', alvo, { fetchImpl: async url => {
    pedido = new URL(url);
    snapshotAtual = fixarPainel(B, filtros); // atualização em segundo plano chega no meio do download
    return respostaCsv();
  } });
  const resultado = await pendente;
  assert.notEqual(snapshotAtual.versaoDados.id, alvo.versaoDados.id);
  assert.equal(pedido.searchParams.get('versao_dados'), A.versao_dados.id);
  assert.equal(resultado.versao, A.versao_dados.id);
  assert.equal(resultado.nome, `indicadores_2026-11-24_2026-11-25_v${A.versao_dados.id.slice(0, 8)}.csv`);
  const [cabecalho, ...linhas] = lerCsv(await resultado.arquivo.text());
  for (const coluna of ['valor', 'unidade', 'versao_conjunto', 'contagem_numerador', 'contagem_denominador', 'qualidade_coleta', 'fonte', 'licenca']) {
    assert.ok(cabecalho.includes(coluna), coluna);
  }
  assert.equal(linhas.length, A.paginacao.total);
  // Mesmos valores, unidades, versões, contagens e qualidade dos pontos exibidos na versão A.
  const col = (linha, nome) => linha[cabecalho.indexOf(nome)];
  A.dados.forEach((p, i) => {
    const l = linhas[i];
    assert.equal(col(l, 'valor') === '' ? null : Number(col(l, 'valor')), p.valor); // null continua vazio
    for (const campo of ['unidade', 'inicio', 'fim', 'versao_conjunto', 'versao_gtfs_id']) assert.equal(col(l, campo), p[campo]);
    assert.equal(Number(col(l, 'contagem_numerador')), p.contagens.numerador);
    assert.equal(Number(col(l, 'contagem_denominador')), p.contagens.denominador);
    assert.deepEqual(JSON.parse(col(l, 'qualidade_coleta')), p.qualidade_coleta);
  });
});

test('falha de geração não entrega arquivo nem mensagem de sucesso', async () => {
  const snapshot = fixarPainel(A, filtros);
  const tentar = resposta => baixarVersaoPainel('https://api.example', snapshot, { fetchImpl: async () => resposta });
  await assert.rejects(tentar(new Response(JSON.stringify(removida.corpo), { status: removida.status, headers: { 'Content-Type': 'application/json' } })),
    e => e instanceof VersaoIndisponivel && /não pode mais ser exportada.*Nenhum arquivo/.test(e.message));
  await assert.rejects(tentar(new Response(JSON.stringify({ erro: { codigo: 'VERSAO_INEXISTENTE' } }), { status: 404 })), VersaoIndisponivel);
  await assert.rejects(tentar(new Response(JSON.stringify({ erro: { mensagem: 'Com versao_dados, o período tem até 31 dias.' } }), { status: 400 })), /até 31 dias\. Nenhum arquivo/);
  await assert.rejects(tentar(new Response('erro', { status: 503 })), /Nenhum arquivo/);
  await assert.rejects(tentar(respostaCsv(csvA, { 'X-Versao-Dados': B.versao_dados.id })), /outra versão/);
  await assert.rejects(tentar(respostaCsv(csvA, { 'X-Total-Registros': String(B.paginacao.total) })), /mesma quantidade/);
  await assert.rejects(tentar(respostaCsv(csvA, { 'Content-Type': 'application/json' })), /não entregou um arquivo CSV/);
  await assert.rejects(tentar(respostaCsv('')), /vazio/);
  await assert.rejects(baixarVersaoPainel('https://api.example', snapshot, { fetchImpl: async () => { throw new TypeError('rede'); } }), /Nenhum arquivo/);
});

test('imagem traz a versão exibida, filtros, data e fonte, sem achatar os avisos', async () => {
  const metadados = metadadosDoPainel(fixarPainel(A, filtros, 1, '2026-11-24T12:32:00Z'), 'Pontualidade', 'Resultado publicado');
  const texto = await svgFalso('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 445"><text class="alerta-qualidade-svg">⚠ aviso</text></svg>', metadados).text();
  assert.match(texto, new RegExp(`Versão dos dados: ${A.versao_dados.id} \\(atualização de 15 min, publicada em 24/11/2026, 09:31\\)`));
  assert.match(texto, /Linha 3762-10/);
  assert.match(texto, /Exibido em: 24\/11\/2026, 09:32:00 \(São Paulo\)/);
  assert.match(texto, /Fonte: Indicadores publicados pelo Observa SP/);
  assert.match(texto, /width="860" height="426"/); // 860 × 445/900: proporção mantida
  assert.doesNotMatch(texto, /preserveAspectRatio="none"/);
});
