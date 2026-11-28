// US30-T03B: painel público de saúde sobre respostas REAIS de GET /saude (fixture gerada pelo
// backend com dados sintéticos: scripts/gerar_fixture_saude_us30.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { consultarSaude } from '../js/saude/cliente.mjs';
import { estadoAtual, semMedicao, servicosAfetados, situacaoMeta, taxaPrincipal, validarMes, validarSaude } from '../js/saude/modelo.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/saude-us30.json', import.meta.url), 'utf8'));
const parcial = fixture.parcial.corpo, encerrado = fixture.encerrado.corpo, semSondagem = fixture.sem_sondagem.corpo;
const resposta = ({ status, corpo }) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

test('contrato real de /saude é aceito e respostas fora do contrato são recusadas', () => {
  assert.equal(validarSaude(parcial, '2026-11'), parcial);
  validarSaude(encerrado, '2026-02');
  validarSaude(semSondagem, '2026-10');
  assert.throws(() => validarSaude(parcial, '2026-10'), /inválida/);  // resposta de outro mês
  const semPainel = structuredClone(parcial); delete semPainel.servicos.PAINEL;
  assert.throws(() => validarSaude(semPainel, '2026-11'), /inválida/);
  const taxaTexto = structuredClone(parcial); taxaTexto.servicos.API.percentual_observado = '95';
  assert.throws(() => validarSaude(taxaTexto, '2026-11'), /inválida/);
});

test('falhas de API, painel e origem ficam separadas e o serviço afetado é identificado', () => {
  const afetados = servicosAfetados(parcial);
  assert.deepEqual(afetados.map(a => a.chave), ['API', 'COLETA']);  // PAINEL funcionou o tempo todo
  const api = afetados.find(a => a.chave === 'API');
  assert.equal(api.atual.codigo, 'FALHA');
  assert.equal(api.atual.ultima.detalhe, 'HTTP_ERRO');
  assert.equal(api.incidentes, 2);
  const coleta = estadoAtual('COLETA', parcial.servicos.COLETA);
  assert.deepEqual([coleta.codigo, coleta.causa, coleta.desde], ['FALHA', 'SPTRANS_HTTP_503', '2026-11-10T15:40:00+00:00']);
  assert.equal(estadoAtual('PAINEL', parcial.servicos.PAINEL).codigo, 'OK');
});

test('taxas exibidas são as da API, com a base de cada uma', () => {
  assert.deepEqual(taxaPrincipal('API', parcial.servicos.API), { valor: 93.3333, base: '56 de 60 minutos sondados' });
  const coleta = taxaPrincipal('COLETA', parcial.servicos.COLETA);
  assert.equal(coleta.valor, parcial.servicos.COLETA.percentual);
  assert.match(coleta.base, /^80 de 27.440 ciclos/);
});

test('meta de 99% só aparece como atendida com mês encerrado e confirmação da API', () => {
  for (const chave of ['API', 'PAINEL', 'COLETA']) {
    assert.equal(situacaoMeta(parcial.servicos[chave], parcial).codigo, 'INDEFINIDA');  // mês parcial
  }
  assert.equal(situacaoMeta(encerrado.servicos.API, encerrado).codigo, 'ATENDIDA');        // inferior 99,75%
  assert.equal(situacaoMeta(encerrado.servicos.PAINEL, encerrado).codigo, 'NAO_ATENDIDA'); // superior 98,76%
  const coleta = situacaoMeta(encerrado.servicos.COLETA, encerrado);                      // nenhum ciclo
  assert.equal(coleta.codigo, 'INDEFINIDA');
  assert.match(coleta.motivo, /indeterminado/);
  // Mesmo que a resposta diga true, mês parcial nunca é anunciado como atendido.
  const forcado = structuredClone(parcial); forcado.servicos.API.meta_atendida = true;
  assert.equal(situacaoMeta(forcado.servicos.API, forcado).codigo, 'INDEFINIDA');
});

test('ausência de sondagem é desconhecida, não sucesso', () => {
  for (const chave of ['API', 'PAINEL']) {
    const servico = semSondagem.servicos[chave];
    assert.equal(servico.minutos_observados, 0);
    assert.equal(servico.percentual_observado, null);
    const atual = estadoAtual(chave, servico);
    assert.equal(atual.codigo, 'SEM_MEDICAO');           // a última sondagem é de março, fora do período
    assert.equal(atual.ultima.no_periodo, false);
    assert.equal(situacaoMeta(servico, semSondagem).codigo, 'INDEFINIDA');
  }
  assert.equal(estadoAtual('COLETA', semSondagem.servicos.COLETA).codigo, 'SEM_MEDICAO');
  assert.deepEqual(servicosAfetados(semSondagem), []);
  assert.equal(semMedicao(semSondagem), true);  // o painel avisa: desconhecido, não "sem falhas"
  assert.equal(semMedicao(parcial), false);
  const nunca = structuredClone(semSondagem.servicos.API); nunca.ultima_medicao = null;
  assert.equal(estadoAtual('API', nunca).texto, 'Nunca sondado');
});

test('cliente consulta /api/saude?mes e traduz erros 400 e 503', async () => {
  let chamada;
  const ok = await consultarSaude('http://api.test/', '2026-11', { fetchImpl: async url => { chamada = String(url); return resposta(fixture.parcial); } });
  assert.equal(chamada, 'http://api.test/api/saude?mes=2026-11');
  assert.equal(ok.mes, '2026-11');
  await assert.rejects(consultarSaude('http://api.test/', '2026-11', { fetchImpl: async () => resposta(fixture.erro_400) }), /não foi aceito/);
  await assert.rejects(consultarSaude('http://api.test/', '2026-11', { fetchImpl: async () => resposta(fixture.erro_503) }), /indisponível/);
  await assert.rejects(consultarSaude('http://api.test/', '2026-11', { fetchImpl: async () => { throw new TypeError('rede'); } }), /conectar à API/);
  await assert.rejects(consultarSaude('http://api.test/', '2026-02', { fetchImpl: async () => resposta(fixture.parcial) }), /inválida/);
});

test('mês é validado antes da consulta', () => {
  assert.equal(validarMes('2026-11', '2026-11'), '2026-11');
  assert.throws(() => validarMes('2026-12', '2026-11'), /já começou/);
  assert.throws(() => validarMes('2026-13'), /AAAA-MM/);
  assert.throws(() => validarMes('11/2026'), /AAAA-MM/);
});
