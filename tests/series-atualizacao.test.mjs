// US23-T03: atualização de 15 min e consolidação informadas por GET /series.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOLGA_MS, INTERVALO_MS, esperaAteProxima, lerAtualizacao, rotuloPonto, textosAtualizacao } from '../js/series/atualizacao.mjs';

const estado = {
  intervalo_minutos: 15,
  ultima_atualizacao: { janela_inicio: '2026-11-24T12:00:00+00:00', janela_fim: '2026-11-24T12:15:00+00:00', publicada_em: '2026-11-24T12:16:00+00:00' },
  proxima_atualizacao_prevista: '2026-11-24T12:30:00+00:00',
  consolidacao: { dia: '2026-11-23', consolidado_ate: '2026-11-24T03:00:00+00:00', consolidado_em: '2026-11-24T07:05:00+00:00', no_prazo: true, regra: 'x' },
};
const ponto = (consolidado, consolidado_em = null) => ({ consolidado, consolidado_em });

test('lê e valida o bloco de atualização; ausente na API antiga vira null', () => {
  assert.equal(lerAtualizacao({ dados: [] }), null);
  assert.deepEqual(lerAtualizacao({ dados: [ponto(false)], atualizacao: estado }), estado);
  for (const ruim of [
    { ...estado, intervalo_minutos: 30 },
    { ...estado, ultima_atualizacao: { ...estado.ultima_atualizacao, publicada_em: 'ontem' } },
    { ...estado, consolidacao: { ...estado.consolidacao, dia: '23/11' } },
  ]) assert.throws(() => lerAtualizacao({ dados: [], atualizacao: ruim }), /atualização/);
  assert.throws(() => lerAtualizacao({ dados: [{}], atualizacao: estado }), /atualização/);
});

test('textos mostram a última atualização, a próxima e o dia consolidado', () => {
  const textos = textosAtualizacao(estado);
  assert.match(textos.atualizacao, /^Atualizado em 24\/11\/2026,? 09:16/);
  assert.match(textos.atualizacao, /janela até 24\/11\/2026,? 09:15/);
  assert.match(textos.atualizacao, /próxima prevista 24\/11\/2026,? 09:30/);
  assert.match(textos.consolidacao, /^Dia 23\/11\/2026 consolidado em 24\/11\/2026,? 04:05$/);
  assert.match(textosAtualizacao({ ...estado, consolidacao: { ...estado.consolidacao, no_prazo: false } }).consolidacao, /após o prazo das 06:00/);
  assert.equal(textosAtualizacao({ ...estado, ultima_atualizacao: null }).atualizacao, 'Nenhuma atualização de 15 min publicada ainda');
  assert.equal(textosAtualizacao(null).consolidacao, '');
});

test('nova consulta na hora prevista mais a folga, entre 1 e 15 min', () => {
  const agora = Date.parse('2026-11-24T12:20:00Z');
  assert.equal(esperaAteProxima(estado, agora), 10 * 60_000 + FOLGA_MS);
  assert.equal(esperaAteProxima(estado, Date.parse('2026-11-24T13:00:00Z')), FOLGA_MS);
  assert.equal(esperaAteProxima(null, agora), INTERVALO_MS);
});

test('ponto mostra se é consolidado ou provisório', () => {
  assert.equal(rotuloPonto(ponto(true, '2026-11-24T07:05:00+00:00')), 'Consolidado');
  assert.equal(rotuloPonto(ponto(false)), 'Provisório');
});

test('painel: falha na atualização silenciosa não troca "Atualizado em" nem apaga os valores', () => {
  const app = readFileSync(new URL('../js/series/app.mjs', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../series.html', import.meta.url), 'utf8');
  for (const id of ['estado-atualizacao', 'estado-consolidacao', 'aviso-atualizacao']) assert.match(html, new RegExp(`id="${id}"`));
  const silenciosa = app.slice(app.indexOf('async function atualizarEmSegundoPlano'), app.indexOf('async function consultar'));
  const falha = silenciosa.slice(silenciosa.indexOf('catch'));
  assert.doesNotMatch(falha, /estado-atualizacao|limparResultado|renderizar/);
  assert.match(falha, /aviso-atualizacao/);
  assert.doesNotMatch(silenciosa.slice(0, silenciosa.indexOf('catch')), /limparResultado/);
});
