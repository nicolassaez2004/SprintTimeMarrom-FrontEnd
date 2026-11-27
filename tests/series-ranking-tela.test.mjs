// Revisão US19-T03-FE: controlador da seção (estados e troca rápida de mês), sem navegador.
// DOM mínimo simulado: só os elementos e operações que js/series/ranking.mjs usa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = () => JSON.parse(readFileSync(new URL('fixtures/ranking-us19.json', import.meta.url), 'utf8'));
const vazio = mes => {
  const [a, m] = mes.split('-').map(Number), seg = `${a + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}`;
  return { ...fixture(), mes, periodo: { inicio: `${mes}-01T03:00:00Z`, fim: `${seg}-01T03:00:00Z` },
    trechos_com_valor: 0, trechos_sem_valor: 0, dados: [] };
};

class Elemento {
  constructor() { this.hidden = false; this.textContent = ''; this.innerHTML = ''; this.atributos = {}; this.ouvintes = {}; }
  replaceChildren() { this.innerHTML = ''; }
  setAttribute(k, v) { this.atributos[k] = v; }
  removeAttribute(k) { delete this.atributos[k]; }
  addEventListener(tipo, f) { (this.ouvintes[tipo] ??= []).push(f); }
  disparar(tipo) { for (const f of this.ouvintes[tipo] ?? []) f({ preventDefault() {} }); }
}

function montarTela() {
  const els = {};
  const pegar = id => (els[id] ??= new Elemento());
  const form = pegar('filtros-ranking');
  form.elements = { mes: { value: '' }, linha: { value: '8000-10' }, sentido: { value: '0' } };
  form.reportValidity = () => true;
  globalThis.document = { getElementById: pegar };
  globalThis.location = { search: '?linha=8000-10&sentido=0' };
  globalThis.FormData = class { constructor(f) { this.e = Object.entries(f.elements).map(([k, v]) => [k, v.value]); } [Symbol.iterator]() { return this.e[Symbol.iterator](); } };
  return { els, form };
}

// fetch controlado: cada chamada fica pendente até o teste responder. Ignora o
// cancelamento de propósito (pior caso: resposta antiga chega depois da nova).
function fetchControlado() {
  const chamadas = [];
  globalThis.fetch = url => new Promise(resolver => chamadas.push({ mes: new URL(url).searchParams.get('mes'), resolver }));
  return chamadas;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const responder = async (chamada, corpo, status = 200) => {
  chamada.resolver(status === 200 ? Response.json(corpo) : new Response('', { status }));
  for (let i = 0; i < 5; i++) await tick();
};

test('troca rápida de mês: resposta antiga não sobrescreve a seleção atual; estados coerentes', async () => {
  const chamadas = fetchControlado();
  const { els, form } = montarTela();
  const { instalarRanking } = await import('../js/series/ranking.mjs');
  instalarRanking();
  await tick();
  assert.equal(els['ranking-carregando'].hidden, false, 'carregando visível durante a consulta');
  assert.equal(form.atributos['aria-busy'], 'true');

  form.elements.mes.value = '2026-10'; form.disparar('change'); await tick();
  form.elements.mes.value = '2026-11'; form.disparar('change'); await tick();
  assert.deepEqual(chamadas.map(c => c.mes).slice(1), ['2026-10', '2026-11'], 'mês selecionado enviado');

  await responder(chamadas[2], fixture());               // a mais nova chega primeiro
  assert.equal(els['ranking-mes-exibido'].textContent, 'novembro de 2026');
  assert.equal((els['linhas-ranking'].innerHTML.match(/data-ranking-trecho=/g) ?? []).length, 4);
  assert.equal(els['ranking-carregando'].hidden, true);
  assert.equal(form.atributos['aria-busy'], undefined);

  await responder(chamadas[1], vazio('2026-10'));         // a antiga chega depois
  await responder(chamadas[0], vazio(chamadas[0].mes));   // e a inicial também
  assert.equal(els['ranking-mes-exibido'].textContent, 'novembro de 2026', 'seleção atual preservada');
  assert.equal(els['ranking-vazio'].hidden, true);
  assert.equal(els['resultado-ranking'].hidden, false);

  form.elements.mes.value = '2026-10'; form.disparar('change'); await tick();
  assert.equal(els['resultado-ranking'].hidden, true, 'resultado anterior ocultado durante nova consulta');
  await responder(chamadas[3], vazio('2026-10'));
  assert.equal(els['ranking-vazio'].hidden, false, 'lista vazia é estado próprio');
  assert.equal(els['ranking-tabela'].hidden, true);
  assert.match(els['ranking-contagens'].textContent, /^0 de 0 trechos/);

  form.elements.mes.value = '2026-09'; form.disparar('change'); await tick();
  await responder(chamadas[4], null, 503);
  assert.equal(els['ranking-erro'].hidden, false, 'indisponibilidade vira erro, não lista vazia');
  assert.equal(els['resultado-ranking'].hidden, true);
  assert.equal(els['ranking-carregando'].hidden, true);
});
