import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarRanking } from '../js/series/ranking-cliente.mjs';
import { coberturaRanking, filtrosRanking, selecaoRanking, validarRanking, valorRanking } from '../js/series/ranking-modelo.mjs';
import { linhasRanking } from '../js/series/ranking.mjs';

const ler = () => JSON.parse(readFileSync(new URL('fixtures/ranking-us19.json', import.meta.url), 'utf8'));
const filtros = { mes:'2026-11', linha:'8000-10', sentido:'0' };

test('contrato real do backend: ranking mensal, cobertura e versões', () => {
  const corpo = ler();
  assert.equal(validarRanking(corpo, filtros), corpo);
  assert.deepEqual(corpo.dados.map(r => [r.posicao, r.trecho.id, r.aumento_atraso]),
    [[1,'T-BC',240],[2,'T-AB',80],[3,'T-DE',0],[4,'T-CD',-30]]);
  assert.equal(corpo.dados[3].cobertura, 2/3);
});

test('renderização mantém a ordem recebida e não classifica novamente por valor ou código', () => {
  const corpo = ler();
  corpo.dados[0].aumento_atraso = -100;
  corpo.dados[2].aumento_atraso = 999;
  validarRanking(corpo, filtros);
  const html = linhasRanking(corpo.dados);
  assert.deepEqual([...html.matchAll(/data-ranking-trecho="([^"]+)"/g)].map(m => m[1]), ['T-BC','T-AB','T-DE','T-CD']);
  assert.match(html, /-100 s/); assert.match(html, /\+999 s/);
});

test('zero, redução e valor pequeno mantêm o sinal sem preenchimento ou conversão', () => {
  assert.equal(valorRanking(0), '0 s'); assert.equal(valorRanking(-30), '-30 s');
  assert.equal(valorRanking(0.000004), '+0,000004 s');
  assert.match(linhasRanking(ler().dados), /Redução do atraso/);
});

test('cobertura nula é desconhecida; zero real é zero e não é recalculado pelas contagens', () => {
  const r = ler().dados[0];
  assert.equal(coberturaRanking({...r,cobertura:null}), 'Não informada');
  assert.equal(coberturaRanking({...r,cobertura:0}), '0%');
  assert.equal(coberturaRanking({...r,cobertura:.37}), '37%');
  const html = linhasRanking([{...r,cobertura:null}]);
  assert.match(html, /Não informada/); assert.doesNotMatch(html, /100%/);
});

test('versões, IDs e amostras são preservados e texto de origem é escapado', () => {
  const r = ler().dados[0]; r.trecho.parada_origem = '<img src=x onerror=alert(1)>';
  r.versao_conjunto = '<script>1</script>';
  const html = linhasRanking([r]);
  assert.match(html, /&lt;img/); assert.match(html, /&lt;script/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /3 de 3 amostras/); assert.ok(html.includes(r.versao_gtfs_id));
});

test('mês vazio é sucesso de consulta, sem trechos inventados', () => {
  const corpo = ler(); corpo.dados = []; corpo.trechos_com_valor = 0;
  assert.deepEqual(validarRanking(corpo, filtros).dados, []); assert.equal(linhasRanking([]), '');
});

for (const [nome, alterar] of [
  ['mês divergente', c => { c.mes = '2026-10'; }],
  ['período divergente', c => { c.periodo.inicio = '2026-11-01T00:00:00Z'; }],
  ['fuso divergente', c => { c.fuso = 'UTC'; }],
  ['versão omitida', c => { delete c.dados[0].versao_conjunto; }],
  ['valor nulo dentro do ranking', c => { c.dados[0].aumento_atraso = null; }],
  ['cobertura inválida', c => { c.dados[0].cobertura = 100; }],
  ['ordem incompatível', c => { c.dados.reverse(); }],
  ['contagem inconsistente', c => { c.trechos_com_valor = 9; }],
  ['linha divergente', c => { c.dados[0].trecho.linha = 'outra'; }],
  ['sentido divergente', c => { c.dados[0].trecho.sentido = '1'; }],
  ['unidade divergente', c => { c.dados[0].unidade = 'min'; }],
  ['registro inválido', c => { c.dados[0] = null; }],
]) test(`resposta incompatível é rejeitada: ${nome}`, () => {
  const corpo = ler(); alterar(corpo); assert.throws(() => validarRanking(corpo, filtros));
});

test('filtros aceitam todos os sentidos e rejeitam mês/linha inválidos', () => {
  assert.deepEqual(filtrosRanking({mes:'2026-11',linha:'',sentido:''}), {mes:'2026-11',linha:'',sentido:''});
  for (const f of [{...filtros,mes:'2026-13'},{...filtros,mes:'0000-01'},{...filtros,mes:'9999-12'}, {...filtros,linha:'<x>'},{...filtros,sentido:'2'}]) assert.throws(() => filtrosRanking(f));
  assert.deepEqual(selecaoRanking('?linha=8000-10&sentido=1&inicio=2020-01-01', '2026-11-27'), {mes:'2026-11',linha:'8000-10',sentido:'1'});
});

test('cliente envia somente mês, linha e sentido, sem credenciais ou filtros diários', async () => {
  let chamada;
  await buscarRanking('https://api.example/base/', {...filtros,inicio:'2026-11-24',hora_inicio:'09:00'}, {fetchImpl:async(url, init) => {
    chamada = {url,init}; return Response.json(ler());
  }});
  assert.equal(chamada.url.pathname, '/base/api/atrasos/ranking');
  assert.deepEqual(Object.fromEntries(chamada.url.searchParams), filtros);
  assert.equal(chamada.init.credentials, 'omit');
});

test('409, 429, 503 e falha de rede não viram lista vazia', async () => {
  await assert.rejects(buscarRanking('https://api.example', filtros, {fetchImpl:async()=>Response.json({erro:{codigo:'METRICA_PENDENTE'}},{status:409})}), /métrica mensal aguarda/);
  await assert.rejects(buscarRanking('https://api.example', filtros, {fetchImpl:async()=>new Response('',{status:429,headers:{'Retry-After':'2'}})}), e=>e.tentarEm===2);
  await assert.rejects(buscarRanking('https://api.example', filtros, {fetchImpl:async()=>new Response('',{status:503})}), /Não foi possível/);
  await assert.rejects(buscarRanking('https://api.example', filtros, {fetchImpl:async()=>{throw new TypeError('rede');}}), /conectar/);
});

test('cancelamento mesmo após receber o corpo não publica a resposta antiga', async () => {
  const controle = new AbortController();
  await assert.rejects(buscarRanking('https://api.example', filtros, {signal:controle.signal, fetchImpl:async()=>({ok:true,status:200,json:async()=>{
    controle.abort(); return ler();
  }})}), e=>e.name==='AbortError');
});
