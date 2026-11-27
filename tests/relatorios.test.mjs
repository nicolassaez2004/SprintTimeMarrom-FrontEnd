// US21-T04-FE: relatório mensal de associações sobre respostas REAIS da API (fixture gerada pelo
// ensaio controlado do backend: dados e revisão FICTÍCIOS; scripts/gerar_fixture_relatorio_us21.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { consultarRelatorio } from '../js/relatorios/cliente.mjs';
import { escalaIntervalos, interpretarResposta, leituraCoeficiente, validarMes, validarPublicado } from '../js/relatorios/modelo.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/relatorio-us21.json', import.meta.url), 'utf8'));
const publicado = fixture.publicado.corpo;
const fmt = v => v.toFixed(2).replace('.', ',');
const resposta = ({ status, corpo }) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

test('relatório publicado corresponde à resposta da API: coeficientes, IC95, amostra, fontes e versões', () => {
  const r = validarPublicado(publicado, '2025-01');
  const chuva = r.resultado.modelos.principal.coeficientes.chuva_10mm;
  assert.ok(chuva.ic95[0] < chuva.coeficiente && chuva.coeficiente < chuva.ic95[1]);
  assert.equal(r.resultado.modelos.principal.observacoes, 160);
  assert.deepEqual(Object.keys(r.resultado.modelos.secundario.coeficientes).sort(), ['chuva_10mm', 'intercepto', 'velocidade_kmh']);
  assert.equal(r.fontes.length, 8);
  assert.ok(r.resultado.versao_calculo && r.resultado.hash_plano && r.metodo.interpretacao);
  assert.ok(r.resultado.modelos.principal.limitacoes.length > 0);
});

test('resposta incompleta ou incoerente é recusada em vez de exibida', () => {
  assert.throws(() => validarPublicado(publicado, '2025-02'), /inválida/);
  const semIc = structuredClone(publicado); delete semIc.resultado.modelos.principal.coeficientes.chuva_10mm.ic95;
  assert.throws(() => validarPublicado(semIc, '2025-01'), /inválida/);
  const invertido = structuredClone(publicado); invertido.resultado.modelos.principal.coeficientes.chuva_10mm.ic95 = [3, 1];
  assert.throws(() => validarPublicado(invertido, '2025-01'), /inválida/);
  const semFontes = structuredClone(publicado); semFontes.fontes = [];
  assert.throws(() => validarPublicado(semFontes, '2025-01'), /inválida/);
});

test('ausência e invalidez do relatório são tratadas de forma clara, sem coeficientes', () => {
  assert.deepEqual(interpretarResposta(404, fixture.nao_encontrado.corpo, '2025-02'), { situacao: 'NAO_ENCONTRADO', mes: '2025-02' });
  const invalido = interpretarResposta(409, fixture.invalido.corpo, '2025-03');
  assert.deepEqual(invalido, { situacao: 'INVALIDO', mes: '2025-03', motivo: 'MATRIZ_SEM_POSTO_COMPLETO' });
  assert.equal('relatorio' in invalido, false);
  assert.throws(() => interpretarResposta(400, fixture.erro_400.corpo, '2025-13'), /não foi aceito/);
  assert.throws(() => interpretarResposta(503, fixture.erro_503.corpo, '2025-01'), /indisponível/);
  assert.throws(() => interpretarResposta(404, { erro: {} }, '2025-01'), /indisponível/);  // 404 sem contrato não vira "sem relatório"
});

test('leitura descreve associação com incerteza e nunca afirma causa', () => {
  const chuva = publicado.resultado.modelos.principal.coeficientes.chuva_10mm;
  const texto = leituraCoeficiente('chuva_10mm', chuva, 's', fmt);
  assert.match(texto, /10 mm/);
  assert.match(texto, /intervalo de 95%: 1,51 a 2,84 s/);
  assert.match(texto, /associação observada, não prova de causa/);
  assert.doesNotMatch(texto, /\bcausou|\bprovoca|\bdevido a/i);
  const zero = leituraCoeficiente('chuva_10mm', { coeficiente: 0.4, ic95: [-0.2, 1] }, 's', fmt);
  assert.match(zero, /inclui zero: não há associação clara/);
  assert.match(leituraCoeficiente('intercepto', publicado.resultado.modelos.principal.coeficientes.intercepto, 's', fmt), /referência/);
});

test('escala dos intervalos sempre mostra o zero e ignora o intercepto', () => {
  const escala = escalaIntervalos(publicado.resultado.modelos.secundario.coeficientes);
  assert.ok(escala.min < 0 && escala.max > 2.75);
  assert.ok(escala.posicao(0) > 0 && escala.posicao(0) < 100);
  assert.equal(escalaIntervalos({ intercepto: { coeficiente: 1, ic95: [0, 2] } }), null);
});

test('cliente consulta /api/relatorios/associacoes?mes e repassa situação ou erro', async () => {
  let chamada;
  const ok = await consultarRelatorio('http://api.test', '2025-01', { fetchImpl: async url => { chamada = String(url); return resposta(fixture.publicado); } });
  assert.equal(chamada, 'http://api.test/api/relatorios/associacoes?mes=2025-01');
  assert.equal(ok.situacao, 'PUBLICADO');
  assert.equal((await consultarRelatorio('http://api.test', '2025-02', { fetchImpl: async () => resposta(fixture.nao_encontrado) })).situacao, 'NAO_ENCONTRADO');
  assert.equal((await consultarRelatorio('http://api.test', '2025-03', { fetchImpl: async () => resposta(fixture.invalido) })).situacao, 'INVALIDO');
  await assert.rejects(consultarRelatorio('http://api.test', '2025-01', { fetchImpl: async () => resposta(fixture.erro_503) }), /indisponível/);
  await assert.rejects(consultarRelatorio('http://api.test', '2025-01', { fetchImpl: async () => { throw new TypeError('rede'); } }), /conectar/);
  assert.throws(() => validarMes('2025-1'), /AAAA-MM/);
});
