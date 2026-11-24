import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_DEFASAGEM_SEGUNDOS,
  calcularDefasagemSegundos,
  criarCoordenadorDeRequisicoes,
  criarEstadoPosicoes,
  descreverUltimaColeta,
  INTERVALO_CONSULTA_MS,
} from '../../src/atualizacao.js';

test('mede a defasagem entre a coleta e a exibição do marcador', () => {
  const exibidoEm = Date.parse('2026-11-23T12:00:01.250Z');
  const defasagem = calcularDefasagemSegundos('2026-11-23T12:00:00.000Z', exibidoEm);
  assert.equal(defasagem, 1.25);
  assert.ok(defasagem <= LIMITE_DEFASAGEM_SEGUNDOS);
  assert.equal(calcularDefasagemSegundos('2026-11-23T11:59:01.250Z', exibidoEm), LIMITE_DEFASAGEM_SEGUNDOS);
  assert.ok(calcularDefasagemSegundos('2026-11-23T11:59:01.249Z', exibidoEm) > LIMITE_DEFASAGEM_SEGUNDOS);
});

test('horário ausente, inválido ou futuro não é tratado como posição atual', () => {
  const agora = Date.parse('2026-11-23T12:00:00Z');
  assert.equal(calcularDefasagemSegundos(null, agora), null);
  assert.equal(calcularDefasagemSegundos('inválido', agora), null);
  assert.equal(calcularDefasagemSegundos('2026-11-23T12:00:01Z', agora), null);
});

test('aborta requisição anterior e ignora resposta que chega fora de ordem', async () => {
  const pendentes = [];
  const coordenador = criarCoordenadorDeRequisicoes((url, opcoes) => new Promise((resolve, reject) => {
    pendentes.push({ url, signal: opcoes.signal, resolve, reject });
  }));
  const anterior = coordenador.iniciar('/posicoes/atuais?linha=1');
  const atual = coordenador.iniciar('/posicoes/atuais?linha=2');
  assert.equal(pendentes[0].signal.aborted, true);
  assert.equal(coordenador.eAtual(anterior.id), false);

  const respostaAtual = { veiculos: [{ prefixo: '2' }] };
  pendentes[1].resolve(respostaAtual);
  assert.deepEqual(await atual.promise, { response: respostaAtual });
  const respostaAntiga = { veiculos: [{ prefixo: '1' }] };
  pendentes[0].resolve(respostaAntiga); // Simula servidor que respondeu mesmo após o abort.
  assert.deepEqual(await anterior.promise, { response: respostaAntiga });
  assert.equal(coordenador.eAtual(anterior.id), false);
});

test('falha temporária preserva a última lista válida para manter os marcadores', async () => {
  const estado = criarEstadoPosicoes();
  const ultimaResposta = [{ prefixo: '11001' }];
  estado.substituir(ultimaResposta);
  const coordenador = criarCoordenadorDeRequisicoes(async () => { throw new TypeError('rede indisponível'); });
  const requisicao = coordenador.iniciar('/posicoes/atuais');
  await assert.rejects(requisicao.promise, /rede indisponível/);
  assert.equal(estado.obter(), ultimaResposta);
});

test('consulta a cada 10 s: coleta (30 s) + espera da tela não somam outros 30 s', () => {
  assert.equal(INTERVALO_CONSULTA_MS, 10_000);
});

test('informa o horário da última coleta e marca coleta parada', () => {
  const agora = Date.parse('2026-11-24T12:00:00Z');
  assert.deepEqual(descreverUltimaColeta('2026-11-24T11:59:35Z', agora),
    { texto: 'Última coleta às 08:59:35 (há 25 s)', desatualizada: false });
  assert.deepEqual(descreverUltimaColeta('2026-11-24T11:55:00Z', agora),
    { texto: 'Última coleta às 08:55:00 (há 5 min) · coleta atrasada', desatualizada: true });
  assert.deepEqual(descreverUltimaColeta(null, agora), { texto: 'Sem coleta registrada', desatualizada: true });
});
