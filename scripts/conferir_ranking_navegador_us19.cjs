// QA opcional: Playwright no ambiente de teste; API HTTP com a amostra controlada C20.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
(async () => {
  const { values } = parseArgs({ options: { frontend:{type:'string',default:'http://127.0.0.1:5173'}, api:{type:'string',default:'http://127.0.0.1:5000'} } });
  const pasta = path.resolve(__dirname, '../docs/evidencias'); await fs.mkdir(pasta, {recursive:true});
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH}: {})});
  try {
    const contexto = await browser.newContext({viewport:{width:1440,height:1000}}), pagina = await contexto.newPage();
    let modo = 'real', corpoAtual;
    const erros = [], consultas = [], verificacoes = [];
    pagina.on('pageerror', e=>erros.push(e.message));
    await contexto.route('http://127.0.0.1:5000/**', async rota => {
      const u = new URL(rota.request().url()), modoDaChamada = modo;
      const ehRanking = u.pathname === '/api/atrasos/ranking';
      if (ehRanking) {
        consultas.push({filtros:Object.fromEntries(u.searchParams),modo:modoDaChamada});
        const cabecalhos = {'Access-Control-Allow-Origin':'*'};
        if (modoDaChamada === 'erro') return rota.fulfill({status:503,contentType:'application/json',body:'{}',headers:cabecalhos});
        if (modoDaChamada === 'pendente') return rota.fulfill({status:409,contentType:'application/json',body:JSON.stringify({erro:{codigo:'METRICA_PENDENTE'}}),headers:cabecalhos});
        if (modoDaChamada === 'limite') return rota.fulfill({status:429,contentType:'application/json',body:'{}',headers:{...cabecalhos,'Retry-After':'1','Access-Control-Expose-Headers':'Retry-After'}});
        if (modoDaChamada === 'lento') await new Promise(r=>setTimeout(r,600));
      }
      try {
        const r = await rota.fetch({url:new URL(u.pathname+u.search,values.api).href,
          headers:{...rota.request().headers(),origin:'http://127.0.0.1:5173'}});
        if (ehRanking) assert.equal(r.headers()['access-control-allow-origin'],'http://127.0.0.1:5173', 'A origem real do frontend precisa estar liberada pelo backend');
        if (ehRanking && r.ok()) {
          corpoAtual = await r.json();
          if (modoDaChamada === 'cobertura') {
            corpoAtual.dados[0].cobertura = null;
            return await rota.fulfill({status:200,contentType:'application/json',body:JSON.stringify(corpoAtual),headers:{'Access-Control-Allow-Origin':'*'}});
          }
        }
        await rota.fulfill({response:r,headers:{...r.headers(),'Access-Control-Allow-Origin':'*'}});
      } catch(e) { if (modoDaChamada !== 'lento') throw e; }
    });
    await pagina.goto(new URL('/series.html?linha=8000-10&sentido=0&inicio=2026-11-24&fim=2026-11-24&hora_inicio=09:00&hora_fim=10:00',values.frontend).href);
    const alterar = async (campo, valor) => { await pagina.locator(campo).fill(valor); await pagina.locator(campo).dispatchEvent('change'); };
    const pronto = async n => {
      await pagina.locator('#resultado-ranking').waitFor({state:'visible'});
      await pagina.waitForFunction(n=>document.querySelector('#ranking-carregando').hidden && document.querySelectorAll('#linhas-ranking tr').length===n,n);
    };
    await alterar('#ranking-mes','2026-11'); await pronto(4);
    const recebido = corpoAtual;
    const desenhado = await pagina.locator('#linhas-ranking tr').evaluateAll(es=>es.map(e=>({id:e.dataset.rankingTrecho,valor:Number(e.dataset.rankingValor),cobertura:e.dataset.rankingCobertura})));
    assert.deepEqual(desenhado, recebido.dados.map(r=>({id:r.trecho.id,valor:r.aumento_atraso,cobertura:String(r.cobertura)})));
    assert.deepEqual(desenhado.map(r=>[r.id,r.valor]),[['T-BC',240],['T-AB',80],['T-DE',0],['T-CD',-30]]);
    assert.match(await pagina.locator('#linhas-ranking').innerText(), /\+240 s/);
    assert.match(await pagina.locator('#linhas-ranking').innerText(), /0 s/);
    assert.match(await pagina.locator('#linhas-ranking').innerText(), /-30 s/);
    assert.match(await pagina.locator('#linhas-ranking').innerText(), /66,67%/);
    await pagina.locator('#linhas-ranking tr').first().locator('td').last().locator('summary').click();
    assert.ok((await pagina.locator('#linhas-ranking').innerText()).includes(recebido.dados[0].versao_conjunto));
    assert.match(await pagina.locator('#ranking-mes-exibido').innerText(), /novembro de 2026/i);
    assert.equal(await pagina.locator('#ranking-sintetico').isVisible(),true);
    await pagina.locator('#ranking-atrasos').screenshot({path:path.join(pasta,'ranking-us19-desktop.jpg'),type:'jpeg',quality:85});
    verificacoes.push('ordem, trechos, valores, unidades e cobertura iguais à resposta HTTP', 'zero e redução preservados', 'mês, período e versões visíveis', 'CORS real permite a origem padrão do frontend no alias /api/atrasos/ranking');
    await alterar('#ranking-linha','9999-99'); await pronto(0);
    assert.equal(await pagina.locator('#ranking-vazio').isVisible(),true);
    await pagina.locator('#ranking-atrasos').screenshot({path:path.join(pasta,'ranking-us19-vazio.jpg'),type:'jpeg',quality:85});
    modo='erro'; await pagina.click('#filtros-ranking button'); await pagina.locator('#ranking-erro').waitFor({state:'visible'});
    assert.equal(await pagina.locator('#resultado-ranking').isVisible(),false);
    assert.equal(await pagina.locator('#linhas-ranking tr').count(),0);
    await pagina.locator('#ranking-atrasos').screenshot({path:path.join(pasta,'ranking-us19-erro.jpg'),type:'jpeg',quality:85});
    modo='pendente'; await pagina.click('#ranking-tentar');
    await pagina.waitForFunction(()=>document.querySelector('#ranking-erro-texto').textContent.includes('métrica mensal aguarda'));
    modo='limite'; await pagina.click('#ranking-tentar');
    await pagina.waitForFunction(()=>document.querySelector('#ranking-erro-texto').textContent.includes('Aguarde 1 segundos'));
    const chamadasAntes=consultas.length; await pagina.click('#ranking-tentar'); assert.equal(consultas.length,chamadasAntes);
    await pagina.waitForTimeout(1100);
    modo='cobertura'; await alterar('#ranking-linha','8000-10'); await pronto(4);
    assert.match(await pagina.locator('#linhas-ranking tr').first().innerText(), /Não informada/);
    verificacoes.push('lista vazia distinta de erro', '503 limpa valores antigos', '409 informa publicação pendente', '429 respeita Retry-After', 'cobertura nula não vira zero nem é deduzida das amostras');
    modo='lento'; await alterar('#ranking-mes','2026-10');
    await pagina.locator('#ranking-carregando').waitFor({state:'visible'});
    modo='real'; await alterar('#ranking-mes','2026-11'); await pronto(4); await pagina.waitForTimeout(800);
    assert.match(await pagina.locator('#ranking-mes-exibido').innerText(), /novembro de 2026/i);
    assert.equal(await pagina.locator('#linhas-ranking tr').count(),4);
    assert.equal(await pagina.locator('#inicio').inputValue(),'2026-11-24');
    assert.equal(await pagina.locator('#hora_inicio').inputValue(),'09:00');
    assert.ok(consultas.every(c=>Object.keys(c.filtros).every(k=>['mes','linha','sentido'].includes(k))));
    verificacoes.push('carregando e cancelamento de resposta antiga', 'ranking mensal não herda faixa ou datas diárias do histórico');
    await pagina.setViewportSize({width:390,height:844});
    await pagina.evaluate(()=>document.activeElement.blur()); await pagina.waitForTimeout(200);
    assert.equal(await pagina.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await pagina.locator('#ranking-atrasos').screenshot({path:path.join(pasta,'ranking-us19-mobile.jpg'),type:'jpeg',quality:85,style:'.skip-link:not(:focus) { visibility: hidden !important; }'});
    assert.deepEqual(erros,[]); verificacoes.push('celular sem transbordamento', 'nenhum erro JavaScript');
    await fs.writeFile(path.join(pasta,'US19-T03-FE-verificacao.json'),JSON.stringify({data:'2026-11-27',origem:'SINTETICA_CONTROLADA',navegador:await browser.version(),
      api:'Backend real US19, SQLite em memória; 409/429/503/cobertura nula simulados no transporte para conferir estados da interface',verificacoes,comparacao:{recebido:recebido.dados,desenhado},consultas,erros_javascript:erros,revisao:'PENDENTE'},null,2)+'\n');
    console.log(JSON.stringify({resultado:'OK',verificacoes:verificacoes.length,erros_javascript:erros}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
