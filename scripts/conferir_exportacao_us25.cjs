async (page) => {
  await page.route('**/series?**', route => route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    path: 'tests/fixtures/series-us23.json' }));
  await page.goto('http://127.0.0.1:5173/series.html?linha=3762-10&sentido=0&tipo=PONTUALIDADE_VIAGENS');
  await page.locator('#resultado-series').waitFor({ state: 'visible' });
  const tela = await page.locator('#valores-series tr').count();
  const [downloadCsv] = await Promise.all([
    page.waitForEvent('download'), page.locator('#baixar-painel-csv').click(),
  ]);
  const arquivoCsv = 'docs/evidencias/US25-painel-sintetico.csv';
  await downloadCsv.saveAs(arquivoCsv);
  let csv = '';
  for await (const trecho of await downloadCsv.createReadStream()) csv += trecho.toString('utf8');
  const linhas = csv.slice(1).trim().split('\r\n');
  if (linhas.length - 1 !== tela || !csv.includes('"92.5"') || !csv.includes('"0"')
      || !csv.includes('"SEM_RESULTADO"') || !csv.includes('conjunto-sintetico-0')) {
    throw new Error('O CSV não corresponde às linhas e valores exibidos.');
  }
  const [downloadImagem] = await Promise.all([
    page.waitForEvent('download'), page.locator('.exportar-grafico').first().click(),
  ]);
  const arquivoImagem = 'docs/evidencias/US25-grafico-sintetico.svg';
  await downloadImagem.saveAs(arquivoImagem);
  let imagem = '';
  for await (const trecho of await downloadImagem.createReadStream()) imagem += trecho.toString('utf8');
  for (const trecho of ['Fonte: Indicadores publicados', 'Exibido em:', 'Conjuntos exibidos:',
    'Resultado publicado', 'data-valor="92.5"']) {
    if (!imagem.includes(trecho)) throw new Error(`Imagem sem ${trecho}`);
  }
  await page.route('**/us25-verificacao.svg', route => route.fulfill({ status: 200,
    contentType: 'image/svg+xml', path: arquivoImagem }));
  await page.goto('http://127.0.0.1:5173/us25-verificacao.svg');
  if (await page.locator('svg').count() === 0) throw new Error('O navegador não abriu a imagem SVG.');
  return { linhasNaTela: tela, linhasNoCsv: linhas.length - 1, csv: arquivoCsv,
    imagem: arquivoImagem, tituloImagem: await page.title() };
}
