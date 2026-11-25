// Caderno de dados da US24-T04: referência manual independente da classificação.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { classeDaFeicao, codigoFeicao, legendaFaixas, parametrosMapa, validarMapa } from '../js/mapa-indicadores/modelo.mjs';
import { estiloFeicao } from '../js/mapa-indicadores/mapa.mjs';

const raiz = new URL('../', import.meta.url);
const arquivo = caminho => new URL(caminho, raiz);
const carregar = async caminho => JSON.parse(await readFile(arquivo(caminho), 'utf8'));
export const caderno = await carregar('tests/fixtures/mapas-referencias-us24.json');
export const filtrosDaConsulta = q => ({ ...caderno.filtros, ...q.filtros });
export const identificar = f => f.properties.origem ? `${f.properties.origem}–${f.properties.destino}` : codigoFeicao(f);
const perto = (a, b, tolerancia = 1e-9) => assert.ok(Math.abs(a - b) <= tolerancia, `${a} difere de ${b}`);

export function conferirResposta(q, corpo) {
  validarMapa(corpo, filtrosDaConsulta(q), 1);
  assert.match(corpo.versao_territorial.fonte, /SINTÉTICOS/);
  assert.equal(corpo.paginacao.total, q.casos.length);
  assert.equal(new Set(corpo.features.map(identificar)).size, q.casos.length, 'Locais não podem ser duplicados neste ensaio');
  if (!q.casos.length) {
    assert.equal(corpo.ausencia, 'SEM_DADOS');
    return [{ consulta: q.id, caso: 'SEM_RESULTADO', resultado: 'CONFERE_NO_ENSAIO', referencia: q.vazio }];
  }
  // O texto esperado é literal; não é calculado pelo mesmo classificador.
  const legenda = legendaFaixas(q.cortes, q.unidade);
  assert.deepEqual(legenda, q.unidade === '%' ? ['Menor que 25 %', '25 % a menos de 50 %', '50 % a menos de 75 %', '75 % ou mais']
    : ['Menor que 2 passagens/h', '2 passagens/h a menos de 4 passagens/h', '4 passagens/h a menos de 8 passagens/h', '8 passagens/h ou mais']);
  return q.casos.map(r => {
    const f = corpo.features.find(f => identificar(f) === r.id);
    assert.ok(f, `Local ${r.id} ausente em ${q.id}`);
    const p = f.properties;
    if (r.valor === null) { assert.equal(p.valor, null); assert.equal(p.ausencia, r.motivo); }
    else { perto(p.valor, r.valor); assert.equal(p.unidade, q.unidade); assert.equal(p.ausencia, null); }
    if (r.contagens) {
      assert.deepEqual([p.contagens.numerador, p.contagens.denominador], r.contagens);
      if (r.contagens[1]) perto(r.valor, r.contagens[0] / r.contagens[1] * 100);
    }
    if (p.inicio) {
      assert.equal(Date.parse(p.inicio), Date.parse('2026-11-24T11:00:00Z'));
      assert.equal(Date.parse(p.fim), Date.parse('2026-11-24T11:15:00Z'));
      assert.equal(p.versao_conjunto, 'ensaio-us24-1');
      assert.equal(p.versao_calculo, 'regra-controle');
    }
    const classe = classeDaFeicao(f, q.cortes), estilo = estiloFeicao(f, q.cortes);
    assert.equal(classe.indice, r.faixa); assert.equal(classe.cor, r.cor);
    assert.equal(f.geometry.type === 'LineString' ? estilo.color : estilo.fillColor, r.cor);
    assert.equal(Boolean(estilo.dashArray), r.valor === null);
    if (r.fora_territorio) { assert.equal(p.territorio_ausente, true); assert.equal(p.distrito_id, null); }
    if (r.coordenadas) r.coordenadas.forEach((v, i) => perto(f.geometry.coordinates[i], v, 0.000001));
    if (r.origem) {
      assert.equal(f.geometry.coordinates.length, 2, 'Não cortar o trecho na fronteira');
      const refs = caderno.consultas[0].casos;
      for (const [i, codigo] of [r.origem, r.destino].entries()) {
        refs.find(p => p.id === codigo).coordenadas.forEach((v, eixo) => perto(f.geometry.coordinates[i][eixo], v, 0.000001));
      }
    }
    if (r.cruza_limite) { assert.equal(p.cruza_limite, true); perto(p.fracao_distrito, r.fracao_distrito, 0.000001); }
    if (r.limites_x_m) {
      const anel = f.geometry.coordinates[0];
      assert.equal(f.geometry.type, 'Polygon'); assert.deepEqual(anel[0], anel.at(-1));
      const xs = anel.slice(0, -1).map(p => (p[0] + 46.63) * 111320 * Math.cos(23.55 * Math.PI / 180));
      // Checagem geográfica independente aproximada: metros locais, tolerância 8 m.
      perto(Math.min(...xs), r.limites_x_m[0], 8); perto(Math.max(...xs), r.limites_x_m[1], 8);
      assert.ok(anel.every(p => p[1] > -23.552 && p[1] < -23.548));
    }
    return { consulta: q.id, caso: r.id, referencia: r.calculo, valor_esperado: r.valor, valor_api: p.valor,
      faixa_esperada: r.faixa, cor_esperada: r.cor, cor_renderizacao: f.geometry.type === 'LineString' ? estilo.color : estilo.fillColor,
      ausencia: p.ausencia, resultado: 'CONFERE_NO_ENSAIO' };
  });
}

export async function executar({ api, capturar = false } = {}) {
  assert.equal(caderno.origem, 'SINTETICA');
  if (capturar && !api) throw new Error('--capturar requer --api de ensaio.');
  const resultados = [], fontes = [];
  for (const q of caderno.consultas) {
    let corpo, consulta;
    if (api) {
      const url = new URL('/mapas/indicadores', api);
      url.search = parametrosMapa(filtrosDaConsulta(q)).toString(); consulta = url.href;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      assert.equal(r.status, 200); assert.match(r.headers.get('Content-Type'), /application\/geo\+json/);
      corpo = await r.json();
    } else corpo = await carregar(`tests/fixtures/${q.fixture}`);
    resultados.push(...conferirResposta(q, corpo));
    // Capturas adicionais só são gravadas após comparação com a referência.
    if (capturar && q.fixture.startsWith('mapas-conferencia/')) {
      const destino = arquivo(`tests/fixtures/${q.fixture}`);
      await mkdir(new URL('./', destino), { recursive: true });
      await writeFile(destino, JSON.stringify(corpo, null, 2)+'\n');
    }
    fontes.push({ consulta: q.id, rota: consulta ?? q.fixture,
      sha256_json_canonico: createHash('sha256').update(JSON.stringify(corpo)).digest('hex') });
  }
  return { data: caderno.data, origem: caderno.origem, modo: api ? 'HTTP_REAL_SQLITE_DE_ENSAIO' : 'CAPTURAS_DA_API_DE_ENSAIO',
    consultas: fontes, resultados, total_conferido: resultados.length, divergencias_no_ensaio: 0,
    frequencia_controlada: '4 observada e 8 programada, passagens/h, persistidas para ensaio; não executa o cálculo US15',
    frequencia_operacional_us15: 'PENDENTE_CONFIRMACAO: este caderno valida somente referências sintéticas, sem comprovar a publicação operacional da US15',
    referencia_institucional: 'PENDENTE', revisao_por_outra_pessoa: 'PENDENTE', aceite: 'PENDENTE', pode_mover_para_pronto: false };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { values } = parseArgs({ options: { api: { type: 'string' }, capturar: { type: 'boolean' }, saida: { type: 'string' } } });
  try {
    const resultado = await executar(values);
    if (values.saida) await writeFile(values.saida, JSON.stringify(resultado, null, 2)+'\n');
    console.log(JSON.stringify({ resultado: 'CONFERE_NO_ENSAIO', consultas: resultado.consultas.length, casos: resultado.total_conferido, aceite: resultado.aceite, pode_mover_para_pronto: false }));
  } catch (erro) { console.error(erro); process.exitCode = 1; }
}
