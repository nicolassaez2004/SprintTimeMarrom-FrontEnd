// Integração frontend ↔ backend contra uma API em execução (padrão: demonstração SINTÉTICA
// do backend, `python -m scripts.demo_sprints_1_2 --pasta <dir> --servir`).
// Usa os MESMOS clientes e validadores de contrato das páginas; nenhum fixture.
//
//   node scripts/conferir_integracao_api.mjs [http://127.0.0.1:5000/]
import { buscarSeries } from '../js/series/cliente.mjs';
import { buscarComExcesso } from '../js/series/espera.mjs';
import { fixarPainel, parametrosExportacao, registrosEsperados } from '../js/series/painel-exportacao.mjs';
import { avisosQualidade } from '../js/series/avisos.mjs';
import { consultarQualidade } from '../js/qualidade/cliente.mjs';
import { consultarCatalogo, consultarDicionario, verificarArquivo } from '../js/brutos/cliente.mjs';
import { buscarMapa } from '../js/mapa-indicadores/cliente.mjs';
import { buscarDocumentos } from '../js/acervo/cliente.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5000/';
const LINHA = 'DEMO-01', DIA = '2026-11-24';
const resultados = [];

async function caso(nome, fn) {
  try { resultados.push([true, nome, await fn()]); } catch (erro) { resultados.push([false, nome, erro.message]); }
}
const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
const filtros = extra => ({ linha: LINHA, sentido: '0', tipo: 'CUMPRIMENTO_VIAGENS', parada: '',
  inicio: DIA, fim: DIA, hora_inicio: '', hora_fim: '', ...extra });
const csvLinhas = texto => {
  const [cabecalho, ...linhas] = texto.replace(/^﻿/, '').trim().split(/\r?\n/);
  const campos = cabecalho.split(',');
  return linhas.map(l => Object.fromEntries(l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, campos.length)
    .map((v, i) => [campos[i], v.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')])));
};

// Fluxo A — coleta → API → mapa ao vivo
await caso('A: /posicoes/atuais (modo do mapa) traz veículos com idade e marca de recência', async () => {
  const r = await fetch(new URL('posicoes/atuais?modo=ultima_coleta', BASE));
  const corpo = await r.json();
  exigir(r.ok && Array.isArray(corpo.veiculos) && corpo.limite_recente_segundos === 60, 'contrato do mapa');
  for (const v of corpo.veiculos) exigir(typeof v.recente === 'boolean' && v.coletado_em && Number.isFinite(v.latitude), 'veículo inválido');
  const prefixos = corpo.veiculos.map(v => v.prefixo);
  exigir(prefixos.includes('DEMO-LIVE-2'), 'ônibus com GPS inalterado sumiu do mapa (correção US22)');
  return `${corpo.total} veículos: ${prefixos.join(', ')}`;
});

// Fluxo B/C/D — indicadores → painel → exportação da versão exibida, com qualidade
for (const [tipo, extra] of [['CUMPRIMENTO_VIAGENS', {}], ['PONTUALIDADE_VIAGENS', {}],
  ['REGULARIDADE_INTERVALOS', { sentido: '1', parada: 'D' }]]) {
  await caso(`B/C: painel ${tipo} valida e o CSV da versão exibida tem os mesmos valores`, async () => {
    const f = filtros({ tipo, ...extra });
    const resposta = await buscarSeries(BASE, f, 1);
    exigir(resposta.dados.length > 0, 'sem dados');
    const snapshot = fixarPainel(resposta, f, 1);
    const url = new URL('downloads/indicadores', BASE);
    url.search = parametrosExportacao(snapshot).toString();
    const r = await fetch(url);
    exigir(r.ok && r.headers.get('content-type').startsWith('text/csv'), `CSV HTTP ${r.status}`);
    exigir(r.headers.get('X-Versao-Dados') === snapshot.versaoDados.id, 'versão do CSV ≠ versão exibida');
    const linhas = csvLinhas(await r.text());
    exigir(linhas.length === registrosEsperados(snapshot), `CSV ${linhas.length} linhas ≠ painel ${registrosEsperados(snapshot)}`);
    const porInicio = new Map(linhas.map(l => [l.inicio, l]));
    for (const p of resposta.dados) {
      const l = porInicio.get(p.inicio);
      exigir(l, `janela ${p.inicio} ausente no CSV`);
      exigir((l.valor === '' ? null : Number(l.valor)) === p.valor, `valor divergente em ${p.inicio}`);
    }
    const nulos = resposta.dados.filter(p => p.valor === null).length;
    return `${resposta.paginacao.total} janelas (${nulos} sem resultado), CSV idêntico, versão ${snapshot.versaoDados.id.slice(0, 8)}`;
  });
}

await caso('B: espera e excesso vêm pareados e separados (US18)', async () => {
  const f = filtros({ tipo: 'ESPERA_ESTIMADA', sentido: '1', parada: 'D' });
  const { dados } = await buscarComExcesso(buscarSeries, BASE, f, 1);
  exigir(dados.length && dados.every(p => p.excesso && p.excesso.tipo === 'EXCESSO_ESPERA'), 'pares incompletos');
  exigir(dados.every(p => p.unidade === 'min' && p.excesso.unidade === 'min'), 'unidade');
  const valores = dados.filter(p => p.valor !== null).length;
  const negativos = dados.filter(p => p.excesso.valor !== null && p.excesso.valor < 0).length;
  return `${dados.length} janelas, ${valores} com espera, ${negativos} com excesso negativo preservado`;
});

await caso('B: agrupamento sinalizado somente com CV > 0,5 (US17)', async () => {
  const r = await fetch(new URL(`indicadores?linha=${LINHA}&sentido=1&tipo=REGULARIDADE_INTERVALOS&parada=D&page_size=100&inicio=2026-11-24T03:00:00Z&fim=2026-11-25T03:00:00Z`, BASE));
  const { dados } = await r.json();
  const calculados = dados.filter(d => d.valor !== null);
  exigir(calculados.length, 'nenhum CV calculado');
  for (const d of calculados) exigir(d.agrupamento === (d.valor > 0.5), `agrupamento incoerente em ${d.inicio}`);
  for (const d of dados.filter(x => x.valor === null)) exigir(d.motivo_ausencia, `NULL sem motivo em ${d.inicio}`);
  return `CV calculado em ${calculados.length} janelas; ${calculados.filter(d => d.agrupamento).length} com agrupamento`;
});

await caso('D: aviso > 10% no painel e exatamente 10% sem aviso (US26)', async () => {
  const f = filtros({});
  const { dados } = await buscarSeries(BASE, f, 1);
  const pct = h => dados.find(p => p.inicio === h)?.qualidade_coleta;
  exigir(pct('2026-11-24T09:30:00+00:00')?.incompleto === true, '06:30 (16,67%) deveria avisar');
  exigir(pct('2026-11-24T10:00:00+00:00')?.incompleto === false, '07:00 (10%) não deveria avisar');
  return `${avisosQualidade(dados).length ?? 0} aviso(s) na página`;
});

await caso('D: relatório de qualidade do dia valida no cliente (US13)', async () => {
  const relatorio = await consultarQualidade(BASE, DIA, DIA);
  const dia = relatorio.dias[0];
  exigir(dia.lacunas.length >= 1 && dia.gtfs.situacao === 'VIGENTE', 'lacuna ou versão GTFS ausente');
  return `situação ${dia.situacao}, ${dia.percentual_falhas}% de falhas, ${dia.lacunas.length} lacuna(s)`;
});

// Fluxo E — brutos → Parquet → catálogo → download
await caso('E: catálogo, dicionário e Parquet do dia (US09)', async () => {
  const catalogo = await consultarCatalogo(BASE);
  const item = catalogo.datas.find(d => d.data === DIA);
  exigir(item, 'dia ausente no catálogo');
  await consultarDicionario(new URL('downloads/brutos/dicionario', BASE).href);
  await verificarArquivo(item.url ?? new URL(`downloads/brutos?data=${DIA}`, BASE).href, { method: 'HEAD' });
  const bytes = new Uint8Array(await (await fetch(new URL(`downloads/brutos?data=${DIA}`, BASE))).arrayBuffer());
  exigir(String.fromCharCode(...bytes.slice(0, 4)) === 'PAR1', 'arquivo não é Parquet');
  return `${item.registros} registros, ${bytes.length} bytes`;
});

// US24 — mapa por parada e por distrito, com a rede publicada
await caso('US24: mapa por parada e por distrito valida no cliente', async () => {
  const r = await fetch(new URL(`indicadores?linha=${LINHA}&page_size=1`, BASE));
  const rede = (await r.json()).dados[0].versao_gtfs_id;
  const sel = { escopo: 'parada', base: 'parada', linha: LINHA, sentido: '1', tipo: 'FREQUENCIA_OBSERVADA',
    inicio: `${DIA}T08:00`, fim: `${DIA}T08:15`, versao_gtfs_id: rede, versao_territorial_id: '', codigo: '' };
  const paradas = await buscarMapa(BASE, sel, 1);
  const distritos = await buscarMapa(BASE, { ...sel, escopo: 'distrito' }, 1);
  exigir(paradas.features.length === 5 && distritos.features.length >= 1, 'feições ausentes');
  return `${paradas.features.length} paradas; distritos: ${distritos.features.map(f => f.properties.nome).join(', ')}`;
});

await caso('US05: acervo lista o documento catalogado', async () => {
  const corpo = await buscarDocumentos(BASE, {}, 1);
  const total = corpo.total ?? corpo.documentos?.length ?? corpo.itens?.length;
  exigir(total >= 1, 'acervo vazio');
  return `${total} documento(s)`;
});

await caso('US11: documentação pública e erro claro para filtro inválido', async () => {
  const doc = await fetch(new URL('docs/indicadores', BASE));
  const erro = await fetch(new URL('indicadores?sentido=x', BASE));
  const corpo = await erro.json();
  exigir(doc.ok && erro.status === 400 && corpo.erro?.campo === 'sentido', 'contrato de erro');
  exigir(erro.headers.get('X-RateLimit-Limit') === '60', 'limite por IP não informado');
  return 'guia 200; filtro inválido 400 com campo; X-RateLimit-Limit 60';
});

for (const [ok, nome, detalhe] of resultados) console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}\n        ${detalhe}`);
const falhas = resultados.filter(([ok]) => !ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações de integração passaram.`);
process.exitCode = falhas ? 1 : 0;
