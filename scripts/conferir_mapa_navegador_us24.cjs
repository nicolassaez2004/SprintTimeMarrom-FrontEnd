// Opcional: Playwright instalado no ambiente de QA. Não participa de node --test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const assert = require('node:assert/strict');
(async () => {
  const { values } = parseArgs({ options: { frontend: { type: 'string', default: 'http://127.0.0.1:5173' }, api: { type: 'string' } } });
  const raiz = path.resolve(__dirname, '..'), evidencia = path.join(raiz, 'docs/evidencias');
  const { caderno, conferirResposta, filtrosDaConsulta, identificar } = await import(pathToFileURL(path.join(__dirname, 'conferir_mapa_us24.mjs')).href);
  const { recortesDaPagina } = await import(pathToFileURL(path.join(raiz, 'js/mapa-indicadores/modelo.mjs')).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const pagina = await contexto.newPage(), erros = [], resultados = [];
    let respostaAtual;
    pagina.on('pageerror', e => erros.push(e.message));
    // A substituição só encaminha a origem padrão à API de ensaio informada.
    if (values.api) await contexto.route('http://127.0.0.1:5000/**', async rota => {
      const original = new URL(rota.request().url());
      const destino = new URL(original.pathname + original.search, values.api);
      const r = await rota.fetch({ url: destino.href });
      if (original.pathname === '/mapas/indicadores' && r.ok()) respostaAtual = await r.json();
      await rota.fulfill({ response: r, headers: { ...r.headers(), 'Access-Control-Allow-Origin': '*' } });
    });
    else pagina.on('response', async r => {
      if (new URL(r.url()).pathname === '/mapas/indicadores' && r.ok()) respostaAtual = await r.json();
    });
    for (const q of caderno.consultas) {
      respostaAtual = null;
      const url = new URL('/indicadores-mapa.html', values.frontend); url.search = new URLSearchParams(filtrosDaConsulta(q)).toString();
      await pagina.goto(url.href);
      await pagina.locator('#resultado-mapa').waitFor({ state: 'visible' });
      await pagina.waitForFunction(() => document.querySelector('#carregando-mapa').hidden);
      assert.ok(respostaAtual); conferirResposta(q, respostaAtual);
      if (!q.casos.length) {
        assert.equal(await pagina.locator('#vazio-mapa').isVisible(), true);
        assert.equal(await pagina.locator('#mapa-indicadores [data-feicao]').count(), 0);
        resultados.push({ consulta: q.id, caso: 'SEM_RESULTADO', tela: 'ausência explícita, sem desenhos' }); continue;
      }
      const ativos = recortesDaPagina(respostaAtual)[0].features;
      await pagina.waitForFunction(n => document.querySelector('#desenhando-mapa').hidden && document.querySelectorAll('#mapa-indicadores [data-feicao]').length === n, ativos.length);
      await pagina.waitForTimeout(400); // Esperar a animação inicial de fitBounds.
      await pagina.waitForFunction(() => !document.querySelector('#mapa-indicadores').classList.contains('leaflet-zoom-anim'));
      assert.equal(await pagina.locator('#erro-base-mapa').isVisible(), false);
      assert.equal(await pagina.locator('#unidade-mapa').innerText(), q.unidade);
      const legenda = await pagina.locator('#legenda-faixas').innerText();
      assert.match(legenda, /Sem resultado · não é zero/);
      assert.ok(legenda.includes(q.unidade));
      const formas = await pagina.locator('#mapa-indicadores [data-feicao]').evaluateAll(es => es.map(e => {
        const caixa = e.getBBox();
        return { indice: Number(e.dataset.feicao), valor: e.dataset.valor, faixa: e.dataset.faixa, fill: e.getAttribute('fill'),
          stroke: e.getAttribute('stroke'), dash: e.getAttribute('stroke-dasharray'), x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
      }));
      for (const r of q.casos) {
        const i = ativos.findIndex(f => identificar(f) === r.id), f = ativos[i], forma = formas.find(e => e.indice === i);
        assert.ok(forma); assert.equal(forma.valor, String(r.valor));
        assert.equal(forma.faixa, r.faixa === null ? 'ausente' : String(r.faixa));
        const cor = f.geometry.type === 'LineString' ? forma.stroke : forma.fill;
        assert.equal(cor, r.cor); assert.equal(Boolean(forma.dash), r.valor === null);
        const linha = pagina.locator('#lista-locais tr').nth(i);
        assert.match(await linha.innerText(), r.valor === null ? /Sem resultado/ : new RegExp(q.unidade.replace('/', '\\/')));
        resultados.push({ consulta: q.id, caso: r.id, valor_api: f.properties.valor, valor_desenhado: forma.valor,
          cor_svg: cor, faixa_svg: forma.faixa, legenda_com_unidade: true, tabela_conferida: true });
      }
      // Longitude maior deve ficar à direita; latitude maior, acima (não inverter eixos).
      for (const [i, a] of ativos.entries()) for (const [j, b] of ativos.entries()) {
        if (a.geometry.type !== 'Point' || b.geometry.type !== 'Point') continue;
        const [lonA, latA] = a.geometry.coordinates, [lonB, latB] = b.geometry.coordinates;
        if (lonA < lonB - 0.000001) assert.ok(formas.find(e => e.indice === i).x < formas.find(e => e.indice === j).x);
        // Diferenças subpixel são arredondadas pelo SVG do Leaflet; usar >11 m.
        if (latA > latB + 0.0001) assert.ok(formas.find(e => e.indice === i).y < formas.find(e => e.indice === j).y,
          JSON.stringify({ a: identificar(a), b: identificar(b), latA, latB, formas }));
      }
      if (['distritos-paradas', 'frequencia-observada'].includes(q.id)) {
        const alvo = q.id === 'distritos-paradas' ? ativos.findIndex(f => f.properties.codigo === '04') : 0;
        await pagina.locator(`[data-localizar="${alvo}"]`).click();
        await pagina.locator('.leaflet-popup-content').waitFor({ state: 'visible' });
        assert.match(await pagina.locator('#localizacao-status').innerText(), /destacado/);
        await pagina.waitForTimeout(800);
        await pagina.locator('.mapa-grade').screenshot({ path: path.join(evidencia, `mapa-conferencia-${q.id}.jpg`), type: 'jpeg', quality: 85 });
      }
    }
    await pagina.goto(new URL('/series.html?linha=8000-10&inicio=2026-11-24&fim=2026-11-25', values.frontend).href);
    await pagina.locator('#exportacao-indicadores').waitFor({ state: 'visible' });
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#baixar-csv')]);
    assert.equal(await download.failure(), null);
    const referenciaCSV = JSON.parse(await fs.readFile(path.join(raiz, 'tests/fixtures/indicadores-us10.json'), 'utf8'));
    const sha = createHash('sha256').update(await fs.readFile(await download.path())).digest('hex');
    assert.equal(sha, referenciaCSV.sha256); assert.equal(download.suggestedFilename(), 'indicadores_2026-11-24.csv');
    assert.deepEqual(erros, []);
    const registro = { data: '2026-11-25', origem: 'SINTETICA', navegador: await browser.version(), resultados, casos: resultados.length,
      geografia: 'Coordenadas comparadas com o caderno; eixos leste/norte conferidos nos desenhos SVG das paradas',
      regressao_csv: { arquivo: download.suggestedFilename(), sha256: sha, concluido: true }, erros_javascript: erros,
      frequencia_operacional_us15: 'PENDENTE_CONFIRMACAO', revisao: 'PENDENTE', aceite: 'PENDENTE', pode_mover_para_pronto: false };
    await fs.writeFile(path.join(evidencia, 'US24-T04-navegador.json'), JSON.stringify(registro, null, 2)+'\n');
    console.log(JSON.stringify({ resultado: 'CONFERE_NO_ENSAIO', casos: resultados.length, regressao_csv: 'OK', erros_javascript: erros, aceite: 'PENDENTE' }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
