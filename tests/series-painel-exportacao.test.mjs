import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarArquivoSvg } from '../js/series/graficos.mjs';
import { csvDoPainel, fixarPainel, metadadosDoPainel } from '../js/series/painel-exportacao.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/series-us23.json', import.meta.url), 'utf8'));
const filtros = { linha: '3762-10', sentido: '0', tipo: 'PONTUALIDADE_VIAGENS', parada: '',
  inicio: '2026-11-20', fim: '2026-11-24', hora_inicio: '', hora_fim: '' };

test('CSV usa somente as linhas da página vista, inclui zero, ausência, filtros, data, fonte e versões', () => {
  const resposta = structuredClone(fixture);
  resposta.versao_dados = 'snapshot-123';
  const snapshot = fixarPainel(resposta, filtros, 2, '2026-11-26T12:00:00Z');
  resposta.dados[0].valor = 99; // atualização concorrente não altera a exportação pedida
  const linhas = csvDoPainel(snapshot).slice(1).trim().split('\r\n');
  assert.equal(linhas.length, fixture.dados.length + 1);
  assert.match(linhas[0], /versao_conjunto.*versao_dados.*pagina.*fonte/);
  assert.match(linhas[1], /"92.5"/);
  assert.match(linhas[2], /"0"/);
  assert.match(linhas[3], /"";"%";"SEM_RESULTADO"/);
  assert.doesNotMatch(linhas[1], /"99"/);
  for (const linha of linhas.slice(1)) {
    assert.match(linha, /"snapshot-123"/);
    assert.match(linha, /"2026-11-26T12:00:00Z"/);
    assert.match(linha, /Indicadores publicados pelo Observa SP/);
    assert.match(linha, /"2";"2026-11-20";"2026-11-24"/);
  }
});

test('sem versão de conjunto ou versão de dados inválida, não há exportação silenciosa', () => {
  const semVersao = structuredClone(fixture);
  delete semVersao.dados[0].versao_conjunto;
  assert.throws(() => fixarPainel(semVersao, filtros), /versão.*indisponível/);
  const invalida = structuredClone(fixture);
  invalida.versao_dados = '';
  assert.throws(() => fixarPainel(invalida, filtros), /versão.*inválida/);
});

test('imagem inclui o gráfico fixado e metadados legíveis de filtros, data, fonte e versão', async () => {
  const snapshot = fixarPainel(fixture, filtros, 1, '2026-11-26T12:00:00Z');
  const metadados = metadadosDoPainel(snapshot, 'Pontualidade', 'Resultado publicado · Sem publicação');
  const arquivo = criarArquivoSvg({ cloneNode: () => ({ firstChild: null, insertBefore() {} }) }, {
    documentRef: { createElementNS: () => ({}) },
    serializer: { serializeToString: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 282"><circle data-valor="92.5"/></svg>' },
    parser: { parseFromString: () => ({ documentElement: { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg' }, querySelector: () => null }) },
    metadados,
  });
  const texto = await arquivo.text();
  assert.match(texto, /data-valor="92.5"/);
  assert.match(texto, /Linha 3762-10/);
  assert.match(texto, /Conjuntos exibidos:/);
  assert.match(texto, /Exibido em: 26\/11\/2026, 09:00:00 \(São Paulo\)/);
  assert.match(texto, /Fonte: Indicadores publicados pelo Observa SP/);
  assert.match(texto, /Resultado publicado/);
});
