// US28-T03B: acompanhamento de extrações. Respostas reais da API US28-T03A em
// fixtures/extracoes-us28.json (scripts/gerar_fixture_extracoes_us28.py); DOM mínimo simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corpoSolicitacao, linkDownload, validarPedido } from '../js/brutos/extracao-modelo.mjs';
import { consultarExtracao, PedidoNaoEncontrado, solicitarExtracao } from '../js/brutos/extracao-cliente.mjs';

const real = JSON.parse(readFileSync(new URL('fixtures/extracoes-us28.json', import.meta.url), 'utf8'));
const copia = chave => structuredClone(real[chave]);
const BASE = 'http://127.0.0.1:5000/';
const ID = real.aguardando.id;
const INTERVALO = 4321;

// --- Contrato -------------------------------------------------------------------

test('respostas reais da T03A são aceitas nos quatro estados, sem campos extras inventados', () => {
  for (const estado of ['aguardando', 'processando', 'pronto', 'erro']) assert.equal(validarPedido(copia(estado), BASE).estado, estado);
  const pronto = validarPedido(copia('pronto'), BASE);
  assert.equal(pronto.arquivo.download, `http://127.0.0.1:5000/api/extracoes/${ID}/arquivo`);
  assert.equal(validarPedido(copia('erro'), BASE).mensagem, real.erro.mensagem);
  assert.equal(validarPedido(copia('aguardando'), BASE).progresso, null, 'progresso sem registro do servidor fica ausente');
  assert.deepEqual(validarPedido(copia('processando'), BASE).progresso, real.processando.progresso);
  assert.ok(!JSON.stringify(validarPedido(copia('processando'), BASE)).includes('%'));
});

test('download só com estado pronto e link do próprio backend para o mesmo pedido', () => {
  const comLink = { ...copia('processando'), arquivo: copia('pronto').arquivo };
  assert.equal(validarPedido(comLink, BASE).arquivo, null, 'arquivo fora de pronto é ignorado');
  const mudar = f => { const c = copia('pronto'); f(c); return c; };
  for (const corpo of [mudar(c => { c.arquivo = null; }), mudar(c => { c.arquivo.download = 'https://outro.example/x'; }),
    mudar(c => { c.arquivo.download = '/api/extracoes/outro-id/arquivo'; }), mudar(c => { c.arquivo.download = 'javascript:alert(1)'; }),
    mudar(c => { c.estado = 'concluido'; }), mudar(c => { c.id = '../x'; }), null]) {
    assert.throws(() => validarPedido(corpo, BASE), /inválida/);
  }
  assert.throws(() => linkDownload(`/api/extracoes/${ID}/arquivo?x=1`, BASE, ID));
  assert.throws(() => validarPedido(copia('pronto'), BASE, 'outro-id'), /inválida/, 'resposta de outro pedido');
});

test('corpo do pedido segue o contrato do POST (dias de São Paulo, último dia inclusivo)', () => {
  assert.deepEqual(corpoSolicitacao({ linha: ' 33887 ', inicio: '2026-11-01', fim: '2026-11-07', formato: 'CSV' }),
    { linha: '33887', inicio: '2026-11-01T00:00:00-03:00', fim: '2026-11-08T00:00:00-03:00', formato: 'CSV' });
});

test('cliente: 202 aceito, 400 com mensagem do servidor, 404 e indisponibilidade distintos', async () => {
  let chamada;
  const pedido = await solicitarExtracao(BASE, { linha: '1' }, { fetchImpl: async (url, init) => {
    chamada = { url: String(url), init }; return Response.json(copia('aguardando'), { status: 202 });
  } });
  assert.equal(pedido.id, ID);
  assert.equal(chamada.url, `${BASE}api/extracoes`);
  assert.equal(chamada.init.method, 'POST');
  assert.equal(chamada.init.credentials, 'omit');
  await assert.rejects(solicitarExtracao(BASE, {}, { fetchImpl: async () => Response.json(copia('aguardando')) }), /indisponível/, '200 não é 202');
  await assert.rejects(solicitarExtracao(BASE, {}, { fetchImpl: async () => Response.json(real.pedido_invalido_400.corpo, { status: 400 }) }),
    new RegExp(real.pedido_invalido_400.corpo.erro.mensagem.slice(0, 20)));
  await assert.rejects(consultarExtracao(BASE, ID, { fetchImpl: async () => Response.json(real.nao_encontrado_404.corpo, { status: 404 }) }), PedidoNaoEncontrado);
  await assert.rejects(consultarExtracao(BASE, 'a b', { fetchImpl: () => assert.fail('id inválido não é consultado') }), PedidoNaoEncontrado);
  await assert.rejects(consultarExtracao(BASE, ID, { fetchImpl: async () => new Response('', { status: 503 }) }), /indisponível/);
  await assert.rejects(consultarExtracao(BASE, ID, { fetchImpl: async () => { throw new TypeError('rede'); } }), /conectar/);
  await assert.rejects(consultarExtracao(BASE, ID, { fetchImpl: async () => new Response('<html>', { status: 200 }) }), /inválida/);
});

// --- Tela -----------------------------------------------------------------------

class Elemento {
  constructor() { this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; this.atributos = {}; this.ouvintes = {}; this.classes = new Set(); }
  get classList() { const c = this.classes; return { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) }; }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  removeAttribute(k) { delete this.atributos[k]; }
  addEventListener(tipo, f) { (this.ouvintes[tipo] ??= []).push(f); }
  async disparar(tipo) { for (const f of this.ouvintes[tipo] ?? []) await f({ preventDefault() {} }); }
}

function ambiente({ busca = '', salvo = null } = {}) {
  const els = {}, pegar = id => (els[id] ??= new Elemento());
  const form = pegar('form-extracao');
  form.elements = { linha: { value: '33887' }, inicio: { value: '2026-11-01' }, fim: { value: '2026-11-07' }, formato: { value: 'CSV' } };
  form.reportValidity = () => true;
  globalThis.document = { getElementById: pegar };
  globalThis.location = { pathname: '/brutos.html', search: busca, hash: '' };
  globalThis.history = { replaceState: (_, __, url) => { location.search = new URL(url, 'http://x').search; } };
  globalThis.FormData = class { constructor(f) { this.e = Object.entries(f.elements).map(([k, v]) => [k, v.value]); } [Symbol.iterator]() { return this.e[Symbol.iterator](); } };
  const memoria = { valor: salvo, ler() { return this.valor; }, gravar(id) { this.valor = id; } };

  // fetch controlado: cada chamada fica pendente até o teste responder.
  const chamadas = [];
  globalThis.fetch = (url, init) => new Promise((resolver, rejeitar) =>
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body, resolver, rejeitar }));

  // Só os timers de polling (delay INTERVALO) são capturados; o resto segue real.
  const timers = new Map(); let seq = 0;
  const [st, ct] = [globalThis.setTimeout, globalThis.clearTimeout];
  globalThis.setTimeout = (f, ms, ...a) => ms === INTERVALO ? (timers.set(++seq, f), seq) : st(f, ms, ...a);
  globalThis.clearTimeout = id => { if (!timers.delete(id)) ct(id); };
  const restaurar = () => { globalThis.setTimeout = st; globalThis.clearTimeout = ct; };
  const disparar = async () => { const [[id, f]] = timers; timers.delete(id); f(); await tick(); };
  return { els, form, memoria, chamadas, timers, disparar, restaurar };
}
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
const responder = async (chamada, corpo, status = 200) => { chamada.resolver(Response.json(corpo, { status })); await tick(); };
const { instalarExtracao } = await import('../js/brutos/extracao.mjs');
const instalar = amb => instalarExtracao({ base: BASE, intervaloMs: INTERVALO, armazenamento: amb.memoria });

test('pedido aceito (202) guarda o id, mostra aguardando e não anuncia sucesso nem link', async t => {
  const amb = ambiente(); t.after(amb.restaurar);
  instalar(amb);
  assert.equal(amb.chamadas.length, 0, 'sem pedido salvo não consulta nada');
  const envio = amb.form.disparar('submit'); await tick();
  await amb.form.disparar('submit'); // clique duplo durante o envio
  assert.equal(amb.chamadas.length, 1, 'um único POST');
  const post = amb.chamadas[0];
  assert.equal(post.metodo, 'POST');
  assert.deepEqual(JSON.parse(post.corpo), { linha: '33887', inicio: '2026-11-01T00:00:00-03:00', fim: '2026-11-08T00:00:00-03:00', formato: 'CSV' });
  await responder(post, real.solicitacao_202.corpo, 202); await envio;

  assert.equal(amb.memoria.valor, ID);
  assert.equal(location.search, `?extracao=${ID}`);
  assert.equal(amb.els['estado-extracao'].textContent, 'Aguardando');
  assert.match(amb.els['status-solicitacao'].textContent, /ainda não está pronto/);
  assert.equal(amb.els['extracao-pronta'].hidden, true);
  assert.equal(amb.els['baixar-extracao'].atributos.href, undefined);
  assert.equal(amb.els['progresso-extracao'].hidden, true, 'sem progresso registrado, nada é exibido');
  assert.equal(amb.els['extracao-linha'].textContent, '33887');
  assert.equal(amb.timers.size, 1, 'próxima consulta agendada');
});

test('polling: aguardando → processando → pronto libera o download e encerra as consultas', async t => {
  const amb = ambiente({ busca: `?extracao=${ID}` }); t.after(amb.restaurar);
  instalar(amb);
  assert.equal(amb.chamadas[0].metodo, 'GET');
  assert.equal(amb.chamadas[0].url, `${BASE}api/extracoes/${ID}`);
  await responder(amb.chamadas[0], copia('aguardando'));
  assert.equal(amb.els['estado-extracao'].atributos['data-estado'], 'aguardando');

  await amb.disparar();
  await responder(amb.chamadas[1], copia('processando'));
  assert.equal(amb.els['estado-extracao'].textContent, 'Processando');
  assert.equal(amb.els['progresso-extracao'].hidden, false);
  assert.match(amb.els['progresso-extracao'].textContent, /^2 registros gravados/);
  assert.doesNotMatch(amb.els['progresso-extracao'].textContent, /%/);
  assert.equal(amb.els['baixar-extracao'].atributos.href, undefined, 'processando não tem link');

  await amb.disparar();
  await responder(amb.chamadas[2], copia('pronto'));
  assert.equal(amb.els['estado-extracao'].textContent, 'Pronto');
  assert.equal(amb.els['extracao-pronta'].hidden, false);
  assert.equal(amb.els['baixar-extracao'].atributos.href, `http://127.0.0.1:5000/api/extracoes/${ID}/arquivo`);
  assert.match(amb.els['arquivo-extracao'].textContent, /brutos_linha_33887_.*\.csv · 790 B/);
  assert.equal(amb.timers.size, 0, 'polling interrompido');
  assert.equal(amb.chamadas.length, 3);
});

test('erro do servidor mostra a mensagem, sem link, e interrompe o polling', async t => {
  const amb = ambiente({ salvo: real.erro.id }); t.after(amb.restaurar);
  instalar(amb);
  assert.equal(amb.chamadas[0].url, `${BASE}api/extracoes/${real.erro.id}`, 'retoma pelo armazenamento local');
  await responder(amb.chamadas[0], copia('erro'));
  assert.equal(amb.els['estado-extracao'].textContent, 'Erro');
  assert.equal(amb.els['descricao-estado'].textContent, real.erro.mensagem);
  assert.equal(amb.els['extracao-pronta'].hidden, true);
  assert.equal(amb.timers.size, 0);
  assert.equal(amb.memoria.valor, real.erro.id, 'mantido para rever o erro após recarregar');
});

test('pedido repetido que o backend devolve já pronto (202 idempotente) não diz "ainda não está pronto"', async t => {
  const amb = ambiente(); t.after(amb.restaurar);
  instalar(amb);
  const envio = amb.form.disparar('submit'); await tick();
  await responder(amb.chamadas[0], copia('pronto'), 202); await envio;
  assert.match(amb.els['status-solicitacao'].textContent, /já está pronto/);
  assert.equal(amb.els['estado-extracao'].textContent, 'Pronto');
  assert.ok(amb.els['baixar-extracao'].atributos.href);
  assert.equal(amb.timers.size, 0, 'sem polling para pedido já final');
});

test('atualizar a página retoma o mesmo pedido sem criar outro', async t => {
  const amb = ambiente(); t.after(amb.restaurar);
  instalar(amb);
  const envio = amb.form.disparar('submit'); await tick();
  await responder(amb.chamadas[0], real.solicitacao_202.corpo, 202); await envio;

  // "Recarga": nova instalação com a mesma URL e o mesmo armazenamento.
  const recarregada = ambiente({ busca: location.search, salvo: amb.memoria.valor }); t.after(recarregada.restaurar);
  instalar(recarregada);
  assert.deepEqual(recarregada.chamadas.map(c => [c.metodo, c.url]), [['GET', `${BASE}api/extracoes/${ID}`]]);
  await responder(recarregada.chamadas[0], copia('processando'));
  assert.equal(recarregada.els['extracao-id'].textContent, ID);
});

test('recuperar pelo código e identificador inexistente', async t => {
  const amb = ambiente(); t.after(amb.restaurar);
  instalar(amb);
  document.getElementById('codigo-extracao').value = ` ${ID} `;
  await amb.els['form-retomar'].disparar('submit');
  assert.equal(amb.chamadas[0].url, `${BASE}api/extracoes/${ID}`);
  await responder(amb.chamadas[0], copia('aguardando'));
  assert.equal(amb.memoria.valor, ID);

  document.getElementById('codigo-extracao').value = '00000000-0000-0000-0000-000000000000';
  await amb.els['form-retomar'].disparar('submit');
  assert.equal(amb.timers.size, 0, 'timer do pedido anterior cancelado');
  await responder(amb.chamadas[1], real.nao_encontrado_404.corpo, 404);
  assert.equal(amb.els['erro-acompanhamento'].hidden, false);
  assert.match(amb.els['erro-acompanhamento-texto'].textContent, /não encontrado/);
  assert.equal(amb.els['tentar-acompanhamento'].hidden, true, 'nada a tentar de novo');
  assert.equal(amb.els['detalhes-extracao'].hidden, true);
  assert.equal(amb.memoria.valor, null);
  assert.equal(location.search, '');
  assert.equal(amb.timers.size, 0);
});

test('falha de conexão: para, oferece nova consulta e não cria outro pedido', async t => {
  const amb = ambiente({ busca: `?extracao=${ID}` }); t.after(amb.restaurar);
  instalar(amb);
  amb.chamadas[0].rejeitar(new TypeError('Failed to fetch')); await tick();
  assert.equal(amb.els['erro-acompanhamento'].hidden, false);
  assert.match(amb.els['erro-acompanhamento-texto'].textContent, /conectar.*nenhuma nova extração/s);
  assert.equal(amb.els['tentar-acompanhamento'].hidden, false);
  assert.equal(amb.timers.size, 0);
  assert.equal(amb.memoria.valor, ID, 'falha temporária não descarta o pedido');

  await amb.els['tentar-acompanhamento'].disparar('click');
  await amb.els['tentar-acompanhamento'].disparar('click'); // cliques repetidos
  assert.equal(amb.chamadas.length, 2, 'uma única consulta em andamento');
  assert.deepEqual(amb.chamadas.map(c => c.metodo), ['GET', 'GET']);
  await responder(amb.chamadas[1], copia('processando'));
  assert.equal(amb.els['erro-acompanhamento'].hidden, true);
  assert.equal(amb.timers.size, 1, 'polling retomado');

  await amb.disparar();
  await responder(amb.chamadas[2], copia('processando'), 503);
  assert.match(amb.els['erro-acompanhamento-texto'].textContent, /indisponível/);
  assert.equal(amb.els['estado-extracao'].textContent, 'Processando', 'último estado do servidor preservado');
  assert.equal(amb.timers.size, 0);
});

test('sem timers duplicados: acompanhar de novo e deixar de acompanhar', async t => {
  const amb = ambiente({ busca: `?extracao=${ID}` }); t.after(amb.restaurar);
  const api = instalar(amb);
  await responder(amb.chamadas[0], copia('aguardando'));
  assert.equal(amb.timers.size, 1);
  api.acompanhar(ID); api.acompanhar(ID);
  assert.equal(amb.timers.size, 0, 'timer anterior cancelado');
  await responder(amb.chamadas.at(-1), copia('aguardando'));
  assert.equal(amb.timers.size, 1);
  await responder(amb.chamadas[1], copia('pronto')); // resposta de consulta abortada chega tarde
  assert.equal(amb.els['estado-extracao'].textContent, 'Aguardando', 'resposta antiga ignorada');

  await amb.els['parar-extracao'].disparar('click');
  assert.equal(amb.timers.size, 0);
  assert.equal(amb.els['acompanhamento'].hidden, true);
  assert.equal(amb.memoria.valor, null);
  const antes = amb.chamadas.length;
  await tick();
  assert.equal(amb.chamadas.length, antes, 'nenhuma consulta após encerrar');
});
