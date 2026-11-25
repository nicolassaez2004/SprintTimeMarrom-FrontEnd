import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { consultarQualidade } from '../js/qualidade/cliente.mjs';
import { validarPeriodo, validarRelatorio, recorteLacuna, fimNoDia } from '../js/qualidade/modelo.mjs';
import { percentual, escapar, horario, hojeSP } from '../js/comum/formatacao.mjs';

const dados = JSON.parse(readFileSync(new URL('./fixtures/qualidade-us13.json', import.meta.url), 'utf8'));

test('contrato real do Flask inclui todos os dias, inclusive sem monitoramento e sem dados', () => {
  validarRelatorio(dados, '2026-11-17', '2026-11-20');
  assert.equal(dados.dias[0].situacao, 'FORA_DO_MONITORAMENTO');
  assert.equal(dados.dias[3].situacao, 'SEM_DADOS');
  assert.equal(dados.dias[3].percentual_falhas, 100);
  assert.equal(percentual(dados.dias[0].percentual_falhas), '—');
  const faltouDia = structuredClone(dados); faltouDia.dias.splice(1, 1);
  assert.throws(() => validarRelatorio(faltouDia, '2026-11-17', '2026-11-20'), /incompleto/);
});
test('falha atravessa meia-noite e aparece nos dois dias com a versão correspondente', () => {
  const [a, b] = dados.dias.slice(1, 3);
  const lacuna = a.lacunas.find(l => l.id === 'falha-meia-noite');
  const primeiro = recorteLacuna(lacuna, a, dados.periodo.observado_ate);
  const segundo = recorteLacuna(lacuna, b, dados.periodo.observado_ate);
  assert.equal(horario(primeiro.inicio), '23:50');
  assert.equal(horario(primeiro.fim), '00:00');
  assert.equal(horario(segundo.inicio), '00:00');
  assert.equal(horario(segundo.fim), '00:20');
  assert.equal(primeiro.seguinte, true); assert.equal(segundo.anterior, true);
  assert.equal(a.gtfs.versao.id, 'gtfs-a'); assert.equal(b.gtfs.versao.id, 'gtfs-b');
});
test('lacuna em curso não recebe encerramento inventado e GTFS ambíguo não é escolhido', () => {
  const dia = dados.dias[3], lacuna = dia.lacunas[0];
  assert.equal(lacuna.fim, null);
  assert.equal(recorteLacuna(lacuna, dia, dados.periodo.observado_ate).aberta, true);
  assert.equal(dia.gtfs.situacao, 'AMBIGUA'); assert.equal(dia.gtfs.versao, null);
  assert.equal(fimNoDia(recorteLacuna(lacuna, dia, dados.periodo.observado_ate).fim, dia), '24:00');
});
test('datas usam São Paulo e recusam período futuro, inválido ou maior que 31 dias', () => {
  assert.equal(hojeSP(new Date('2026-11-20T02:30:00Z')), '2026-11-19');
  assert.throws(() => validarPeriodo('2026-02-30', '2026-03-01'), /válidas/);
  assert.throws(() => validarPeriodo('2026-11-01', '2026-12-02', '2026-12-03'), /31 dias/);
  assert.throws(() => validarPeriodo('2026-11-20', '2026-11-19'), /posterior/);
  assert.throws(() => validarPeriodo('2099-01-01', '2099-01-01'), /hoje/);
});
test('valores e causas da API não podem inserir HTML na página', () => {
  assert.equal(escapar('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('consulta usa API pública com janelas e sem credenciais', async () => {
  let chamada;
  await consultarQualidade('http://127.0.0.1:5000', '2026-11-17', '2026-11-20', { fetchImpl: async (url, opcoes) => {
    chamada = { url, opcoes }; return { ok: true, json: async () => dados };
  } });
  assert.equal(chamada.url.pathname, '/api/qualidade');
  assert.equal(chamada.url.searchParams.get('janelas'), 'true');
  assert.equal(chamada.opcoes.credentials, 'omit');
});
test('503 e respostas inválidas são erro, nunca relatório com zeros ou demonstração automática', async () => {
  await assert.rejects(consultarQualidade('http://localhost:5000', '2026-11-17', '2026-11-20', {
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /indisponível/);
  await assert.rejects(consultarQualidade('http://localhost:5000', '2026-11-17', '2026-11-20', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ dias: [] }) }),
  }), /incompleto/);
});
test('timeout e cancelamento encerram consulta sem fabricar dados', async () => {
  const fetchLento = (url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Cancelado', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError')), { once: true });
  });
  await assert.rejects(consultarQualidade('http://localhost:5000', '2026-11-17', '2026-11-20', { fetchImpl: fetchLento, timeoutMs: 5 }), /demorou/);
  const controle = new AbortController(); controle.abort();
  await assert.rejects(consultarQualidade('http://localhost:5000', '2026-11-17', '2026-11-20', { fetchImpl: fetchLento, signal: controle.signal }), { name: 'AbortError' });
});
