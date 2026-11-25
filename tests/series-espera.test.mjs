// US18-T03A-FE: espera estimada e excesso de espera comparados com respostas conhecidas de GET /series.
// Fixture gerada pelo backend da US18 (dados SINTÉTICOS): parada B, 24/11/2026.
// 09:00–09:15: espera 2,346154 min; excesso −0,153846 min (programada 2,5 min).
// 09:45–10:00: espera 11,423077 min; excesso sem intervalo programado vigente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarComExcesso, detalheEspera, parear } from '../js/series/espera.mjs';
import { TITULOS_SERIE, validarFiltros, validarResposta } from '../js/series/modelo.mjs';

const respostas = JSON.parse(readFileSync(new URL('./fixtures/series-espera-us18.json', import.meta.url), 'utf8'));
const filtros = { linha: '3762-10', sentido: '0', tipo: 'ESPERA_ESTIMADA', parada: 'B',
  inicio: '2026-11-24', fim: '2026-11-24', hora_inicio: '', hora_fim: '' };
const copia = v => JSON.parse(JSON.stringify(v));
const pareado = () => parear(copia(respostas.ESPERA_ESTIMADA), copia(respostas.EXCESSO_ESPERA));
const ponto = hora => pareado().dados.find(p => p.inicio === `2026-11-24T${hora}:00+00:00`);

test('as duas respostas conhecidas são aceitas com os seus próprios tipos', () => {
  assert.ok(validarResposta(copia(respostas.ESPERA_ESTIMADA), filtros, 1));
  assert.ok(validarResposta(copia(respostas.EXCESSO_ESPERA), { ...filtros, tipo: 'EXCESSO_ESPERA' }, 1));
  assert.throws(() => validarFiltros({ ...filtros, parada: '' }), /código da parada/);
});

test('busca a espera e o excesso juntos; a falha de um vira erro e não meia tela', async () => {
  const chamadas = [];
  const buscar = async (_, f) => { chamadas.push(f.tipo); return copia(respostas[f.tipo]); };
  const resultado = await buscarComExcesso(buscar, 'http://api', filtros, 1, {});
  assert.deepEqual(chamadas.sort(), ['ESPERA_ESTIMADA', 'EXCESSO_ESPERA']);
  assert.equal(resultado.dados.length, respostas.ESPERA_ESTIMADA.dados.length);
  const falha = async (_, f) => { if (f.tipo === 'EXCESSO_ESPERA') throw new Error('Não foi possível consultar as séries.'); return copia(respostas[f.tipo]); };
  await assert.rejects(buscarComExcesso(falha, 'http://api', filtros, 1, {}), /Não foi possível consultar/);
  const outro = copia(respostas.EXCESSO_ESPERA);
  outro.dados[0].inicio = '2026-11-24T02:00:00+00:00';
  assert.throws(() => parear(copia(respostas.ESPERA_ESTIMADA), outro), /mesmas janelas/);
});

test('tela mostra espera e excesso separados, com unidade, como a API devolve', () => {
  assert.deepEqual(detalheEspera(ponto('12:00')), {
    espera: 'Espera estimada: 2,35 min', motivoEspera: null,
    excesso: 'Excesso de espera: -0,15 min', motivoExcesso: null, programada: 'Espera programada: 2,5 min' });
  const p = ponto('12:00');
  assert.equal(p.valor, 2.346154);
  assert.equal(p.excesso.valor, -0.153846);
});

test('ausência não vira zero e cada lado tem o seu motivo', () => {
  assert.deepEqual(detalheEspera(ponto('12:15')), {
    espera: 'Espera estimada: sem resultado', motivoEspera: 'Motivo: Menos de três passagens na janela',
    excesso: 'Excesso de espera: sem resultado', motivoExcesso: 'Motivo: Menos de três passagens na janela',
    programada: 'Espera programada: 2,5 min' });  // partida das 09:15 vigente, mesmo sem espera observada
  const semProgramacao = detalheEspera(ponto('12:45'));
  assert.equal(semProgramacao.espera, 'Espera estimada: 11,42 min');
  assert.equal(semProgramacao.excesso, 'Excesso de espera: sem resultado');
  assert.equal(semProgramacao.motivoExcesso, 'Motivo: Sem intervalo programado vigente na janela');
  assert.equal(detalheEspera(ponto('13:00')).motivoEspera, 'Motivo: Coleta não confiável (sem dados)');
});

test('os gráficos recebem as duas séries, cada uma com o seu tipo', () => {
  const tipos = new Set(pareado().graficos.dados.map(p => p.tipo));
  assert.deepEqual([...tipos].sort(), ['ESPERA_ESTIMADA', 'EXCESSO_ESPERA']);
  assert.deepEqual([...tipos].map(t => TITULOS_SERIE[t]).sort(), ['Espera estimada', 'Excesso de espera']);
  const html = readFileSync(new URL('../series.html', import.meta.url), 'utf8');
  assert.match(html, /<option value="ESPERA_ESTIMADA">Espera estimada e excesso de espera<\/option>/);
});

// Review 25/11/2026: excesso negativo pequeno não pode aparecer como 0 nem perder o sinal.
test('excesso negativo pequeno mantém o sinal e zero continua zero', () => {
  const com = valor => detalheEspera({ valor: 2.5, unidade: 'min', qualidade: {},
    excesso: { valor, unidade: 'min', qualidade: {} } }).excesso;
  assert.equal(com(-0.004), 'Excesso de espera: -0,004 min');
  assert.equal(com(0), 'Excesso de espera: 0 min');
  assert.equal(com(null), 'Excesso de espera: sem resultado');
});
