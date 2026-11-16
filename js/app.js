/* Navegação e interações do front-end. Não faz chamadas a APIs nem grava dados. */
(() => {
  const D = window.SprintData;
  const V = window.SprintVisuals;
  const { icon, number, date, escapeHtml: html } = V;
  const state = { ...D.defaults, search: '', sort: 'completion', mapMetric: 'completion' };
  const pages = {
    'visao-geral': { label: 'Visão geral', title: 'Visão geral da operação', description: 'Entenda a oferta de viagens e a qualidade do serviço em São Paulo.' },
    linhas: { label: 'Linhas de ônibus', title: 'Cada linha, um olhar mais próximo', description: 'Compare os indicadores e explore os detalhes das linhas do recorte.' },
    mapa: { label: 'Mapa da operação', title: 'A operação em perspectiva', description: 'Explore um mapa esquemático das linhas e seus indicadores de exemplo.' },
    dados: { label: 'Dados abertos', title: 'Transparência que você pode explorar', description: 'Baixe os exemplos do painel e consulte a qualidade dos dados exibidos.' },
    sobre: { label: 'Sobre e metodologia', title: 'Mais clareza sobre o transporte público', description: 'Conheça a proposta do projeto e entenda os indicadores apresentados.' },
  };
  const content = document.querySelector('#page-content');
  const dialog = document.querySelector('#line-dialog');
  let toastTimer;

  const pageName = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'visao-geral';
  const percentage = value => `${number(value, 1)}%`;
  const metric = (label, value, unit, symbol, description) => `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(symbol)}</span></div><p class="metric-value">${value}<span>${unit}</span></p><p class="metric-description">${description}</p></article>`;
  const coverageBadge = line => `<span class="coverage-badge ${line.hasGaps ? 'incomplete' : 'complete'}"><span class="status-dot"></span>${percentage(line.coverage)}${line.hasGaps ? ' · incompletos' : ''}</span>`;
  const routeName = line => `${line.origin} → ${line.destination}`;

  function routeTable(lines, compact = false) {
    if (!lines.length) return `<div class="empty-state">${icon('search')}<h3>Nenhuma linha encontrada</h3><p>Tente outro nome ou código de linha.</p><button class="button button-secondary" type="button" data-action="clear-search">Limpar busca</button></div>`;
    return `<div class="table-scroll"><table class="routes-table"><caption class="sr-only">Indicadores fictícios por linha para os filtros selecionados. Ative o código de uma linha para ver detalhes.</caption><thead><tr><th scope="col">Linha e itinerário</th><th scope="col">Cumprimento</th>${compact ? '' : '<th scope="col">Pontualidade</th>'}<th scope="col">Espera média</th><th scope="col">Cobertura da coleta</th><th scope="col"><span class="sr-only">Detalhes</span></th></tr></thead><tbody>${lines.map(line => {
      const status = V.performance(line.completion);
      return `<tr><td><button class="route-link" type="button" data-route="${line.id}"><span class="route-code"><span class="route-color" style="--route-color:${line.color}"></span>${line.id}</span><span class="route-name">${html(routeName(line))}</span></button></td><td><div class="completion-value">${percentage(line.completion)}</div><div class="mini-progress" role="img" aria-label="Cumprimento de ${percentage(line.completion)}"><span style="width:${line.completion}%;background:${status.color}"></span></div></td>${compact ? '' : `<td>${percentage(line.punctuality)}</td>`}<td>${number(line.wait, 1)} <span class="muted">min</span></td><td>${coverageBadge(line)}</td><td><button class="icon-button row-arrow" type="button" data-route="${line.id}" aria-label="Ver detalhes da linha ${line.id}">${icon('arrow')}</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function overview(records, lines, totals) {
    const missing = totals.scheduled - totals.completed;
    return `<section class="metrics-grid" aria-label="Indicadores do período">
      ${metric('Cumprimento de viagens', number(totals.completion, 1), '%', 'bus', 'Viagens realizadas / programadas')}
      ${metric('Pontualidade', number(totals.punctuality, 1), '%', 'clock', 'Saídas dentro da tolerância prevista')}
      ${metric('Espera média estimada', number(totals.wait, 1), 'min', 'timer', 'Estimativa ilustrativa por passageiro')}
      ${metric('Cobertura da coleta', number(totals.coverage, 1), '%', 'database', 'Registros recebidos / esperados')}
    </section>
    <div class="dashboard-grid">
      <section class="panel chart-panel"><div class="panel-heading"><div><h2>Oferta de viagens</h2><p>Programadas e realizadas a cada dia</p></div><button class="icon-button" type="button" data-action="download-history" aria-label="Baixar a série diária em CSV" title="Baixar série diária em CSV">${icon('download')}</button></div><div class="chart-legend"><span><i class="legend-line planned"></i>Programadas</span><span><i class="legend-line observed"></i>Realizadas</span></div>${V.historyChart(D.groupByDay(records))}<p class="chart-note">Valores fictícios para o período selecionado.</p></section>
      <section class="panel trip-summary"><div class="panel-heading"><div><h2>Viagens no período</h2><p>Um resumo da oferta</p></div></div><span class="summary-illustration">${icon('bus')}</span><p class="summary-total">${number(totals.completed)}</p><p class="summary-caption">viagens realizadas</p><div class="trip-progress" aria-hidden="true"><span style="width:${totals.completion}%"></span></div><dl class="summary-list"><div><dt><i class="legend-dot brown"></i>Realizadas</dt><dd>${number(totals.completed)}</dd></div><div><dt><i class="legend-dot light"></i>Não realizadas</dt><dd>${number(missing)}</dd></div><div class="summary-list-total"><dt>Total programado</dt><dd>${number(totals.scheduled)}</dd></div></dl></section>
      <section class="panel lines-preview"><div class="panel-heading"><div><h2>De olho nas linhas</h2><p>Menores percentuais de cumprimento neste recorte</p></div><a class="text-link" href="#linhas">Ver todas ${icon('arrow')}</a></div>${routeTable([...lines].sort((a, b) => a.completion - b.completion).slice(0, 4), true)}</section>
      <section class="panel quality-card"><div class="panel-heading"><div><h2>Qualidade dos dados</h2><p>A cobertura também importa</p></div></div><div class="quality-ring" style="--coverage:${totals.coverage}%"><div><strong>${number(totals.coverage, 1)}<small>%</small></strong><span>de cobertura</span></div></div><p>${totals.hasGaps ? 'Algumas janelas deste recorte estão incompletas. Isso pode afetar a comparação entre linhas.' : 'As janelas deste recorte têm ao menos 90% de cobertura na base de exemplo.'}</p><a class="text-link" href="#dados">Consultar a cobertura ${icon('arrow')}</a></section>
    </div>`;
  }

  function linesPage(lines) {
    return `<section class="panel"><div class="panel-heading lines-heading"><div><h2>Linhas do recorte <span class="count-badge">${lines.length}</span></h2><p>Selecione uma linha para explorar seus indicadores.</p></div><div class="table-tools"><label class="search-field">${icon('search')}<span class="sr-only">Buscar por código ou itinerário</span><input id="line-search" type="search" placeholder="Buscar linha ou itinerário" value="${html(state.search)}" autocomplete="off" /></label><label class="sort-field"><span class="sr-only">Ordenar linhas</span><select id="line-sort"><option value="completion"${state.sort === 'completion' ? ' selected' : ''}>Menor cumprimento</option><option value="wait"${state.sort === 'wait' ? ' selected' : ''}>Maior espera</option><option value="code"${state.sort === 'code' ? ' selected' : ''}>Código da linha</option></select></label></div></div><div id="line-results" aria-live="polite">${filteredTable(lines)}</div><div class="panel-bottom-note">Faixas de cumprimento ilustrativas: <span class="legend-inline good">≥ 95%</span><span class="legend-inline attention">85% a 94,9%</span><span class="legend-inline critical">&lt; 85%</span></div></section><p class="section-footnote">Os códigos, itinerários e valores compõem uma base de exemplo. As faixas de cor não representam metas contratuais oficiais.</p>`;
  }

  function searchedLines(lines) {
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize(state.search.trim());
    const selected = lines.filter(line => normalize(`${line.id} ${routeName(line)}`).includes(query));
    selected.sort((a, b) => state.sort === 'wait' ? b.wait - a.wait : state.sort === 'code' ? a.id.localeCompare(b.id) : a.completion - b.completion);
    return selected;
  }

  function filteredTable(lines) {
    return routeTable(searchedLines(lines));
  }

  function mapPage(lines) {
    const isCoverage = state.mapMetric === 'coverage';
    return `<section class="panel map-panel"><div class="panel-heading"><div><h2>Mapa ilustrativo da operação</h2><p>Selecione um traçado ou uma linha para ver os detalhes.</p></div><label class="map-metric"><span class="sr-only">Indicador no mapa</span><select id="map-metric"><option value="completion"${!isCoverage ? ' selected' : ''}>Cumprimento de viagens</option><option value="coverage"${isCoverage ? ' selected' : ''}>Cobertura da coleta</option></select></label></div><div class="map-layout"><div class="map-canvas">${V.operationMap(lines, state.mapMetric)}<div class="map-legend"><strong>${isCoverage ? 'Cobertura da coleta' : 'Cumprimento'}</strong>${isCoverage ? '<span><i class="legend-dot green"></i>≥ 90%</span><span><i class="legend-dot red"></i>&lt; 90% · incompletos</span>' : '<span><i class="legend-dot green"></i>≥ 95%</span><span><i class="legend-dot gold"></i>85% a 94,9%</span><span><i class="legend-dot red"></i>&lt; 85%</span>'}</div></div><aside class="map-lines" aria-label="Linhas no mapa"><p class="nav-caption">${lines.length} LINHAS NO RECORTE</p>${lines.map(line => `<button type="button" class="map-line-item" data-route="${line.id}"><span class="map-line-top"><strong>${line.id}</strong><span>${percentage(isCoverage ? line.coverage : line.completion)}</span></span><span>${html(routeName(line))}</span><span class="map-line-region">Zona ${line.region}</span></button>`).join('')}</aside></div></section><p class="section-footnote">Este desenho não é um mapa geográfico. As posições e os traçados são fictícios; a integração com a SPTrans será feita em uma etapa futura.</p>`;
  }

  function dataPage(lines, totals) {
    return `<section class="download-grid" aria-label="Conjuntos de dados">
      <article class="panel download-card"><span class="download-icon">${icon('file')}</span><span class="small-label available">EXEMPLO DISPONÍVEL</span><h2>Indicadores por linha</h2><p>Cumprimento, pontualidade, espera e cobertura, respeitando os filtros selecionados.</p><div class="download-card-footer"><span>CSV · UTF-8 · ${lines.length} linhas</span><button class="button button-secondary" type="button" data-action="download-lines">Baixar CSV ${icon('download')}</button></div></article>
      <article class="panel download-card"><span class="download-icon muted-icon">${icon('database')}</span><span class="small-label">ETAPA FUTURA</span><h2>Registros brutos</h2><p>Área reservada para o histórico de posições dos veículos e arquivos Parquet.</p><div class="download-card-footer"><span>Aguardando integração de dados</span><span class="future-tag">Planejado</span></div></article>
      <article class="panel download-card"><span class="download-icon muted-icon">${icon('code')}</span><span class="small-label">ETAPA FUTURA</span><h2>API pública</h2><p>Área reservada para a documentação de consulta dos indicadores por outras aplicações.</p><div class="download-card-footer"><span>Aguardando desenvolvimento</span><span class="future-tag">Planejado</span></div></article>
    </section>
    <section class="panel"><div class="panel-heading"><div><h2>Cobertura e qualidade da coleta</h2><p>Registros fictícios recebidos em relação ao esperado em cada linha.</p></div><span class="count-badge">${percentage(totals.coverage)} no recorte</span></div><div class="table-scroll"><table class="quality-table"><caption class="sr-only">Qualidade dos dados fictícios por linha</caption><thead><tr><th scope="col">Linha</th><th scope="col">Registros esperados</th><th scope="col">Registros recebidos</th><th scope="col">Cobertura</th><th scope="col">Situação das janelas</th></tr></thead><tbody>${lines.map(line => `<tr><td><button type="button" class="plain-link" data-route="${line.id}">${line.id}</button></td><td>${number(line.expectedSamples)}</td><td>${number(line.receivedSamples)}</td><td>${percentage(line.coverage)}</td><td><span class="coverage-badge ${line.hasGaps ? 'incomplete' : 'complete'}"><span class="status-dot"></span>${line.hasGaps ? 'Há janelas incompletas' : 'Cobertura ≥ 90%'}</span></td></tr>`).join('')}</tbody></table></div><div class="panel-bottom-note">Uma janela é sinalizada quando faltam mais de 10% dos registros esperados. O exemplo usa faixas horárias; as janelas de 15 minutos ficam para a integração futura.</div></section>
    <div class="two-column-info"><section class="panel info-panel"><h2>Fontes previstas</h2><ul class="source-list"><li><span>SPTrans · Olho Vivo</span><span>Posições dos ônibus</span></li><li><span>SPTrans · GTFS</span><span>Programação e itinerários</span></li><li><span>Documentos de concessão</span><span>Contratos e metas</span></li></ul><p>Nenhuma dessas fontes está conectada ao protótipo.</p></section><section class="panel info-panel"><h2>Antes de usar os arquivos</h2><p>Os downloads contêm apenas valores fictícios e identificam o período, o sentido, a faixa horária e a fonte de exemplo.</p><p>Na versão com dados reais, a proposta é publicar um dicionário de dados, a versão do GTFS, o histórico de falhas e a licença aplicável.</p><a class="text-link" href="#sobre">Entenda a metodologia ${icon('arrow')}</a></section></div>`;
  }

  function aboutPage() {
    const definitions = [
      ['Cumprimento de viagens', 'Compara as viagens realizadas com as partidas programadas. A regra prevista considera uma viagem cumprida quando cobre ao menos 80% do traçado e respeita a tolerância de partida definida no projeto.'],
      ['Pontualidade', 'Percentual de viagens com saída entre 1 minuto antes e 5 minutos depois do horário previsto. Aplica-se às linhas com horário fixo; não deve ser calculado para linhas operadas por frequência.'],
      ['Espera média estimada', 'A proposta considera a distribuição dos intervalos entre ônibus em cada parada. É necessário ter pelo menos três passagens na janela. Neste protótipo, a espera é um valor fictício já preparado para as telas.'],
      ['Regularidade e frequência', 'A etapa futura comparará passagens observadas e programadas e medirá a variação dos intervalos entre ônibus. Esses indicadores ainda não são calculados por este front-end.'],
      ['Cobertura e dados incompletos', 'Cobertura é a proporção de registros recebidos em relação ao esperado. Janelas com mais de 10% de falhas recebem um aviso para evitar interpretações sem contexto.'],
    ];
    return `<section class="about-intro panel"><div class="about-symbol">${icon('bus')}</div><div><p class="eyebrow">OBSERVA SP</p><h2>Um olhar cidadão sobre os ônibus de São Paulo.</h2><p>A proposta é reunir informações públicas sobre a operação dos ônibus, comparar o serviço realizado com a programação e tornar os resultados acessíveis a cidadãos, pesquisadores e equipes de fiscalização.</p><p>Esta primeira versão é um esqueleto do front-end: navegação, filtros, gráficos e downloads de exemplo. A coleta, o histórico de dados e os cálculos oficiais serão desenvolvidos separadamente.</p></div></section>
      <div class="two-column-info"><section class="panel info-panel"><h2>O que você pode explorar agora</h2><ul class="feature-list"><li>${icon('check')}Painel com indicadores ilustrativos</li><li>${icon('check')}Filtros por período, linha, sentido e faixa</li><li>${icon('check')}Consulta e detalhes das linhas de exemplo</li><li>${icon('check')}Mapa esquemático com seleção de linhas</li><li>${icon('check')}Exportação dos exemplos em CSV</li></ul></section><section class="panel info-panel"><h2>Próximas etapas do projeto</h2><ol class="roadmap"><li><span>01</span><div><strong>Conectar as fontes</strong><p>Posições de veículos, GTFS e programação oficial.</p></div></li><li><span>02</span><div><strong>Construir o histórico</strong><p>Coleta contínua, qualidade e versionamento dos dados.</p></div></li><li><span>03</span><div><strong>Publicar os indicadores reais</strong><p>Mapas geográficos, séries históricas e dados abertos.</p></div></li></ol></section></div>
      <section class="panel methodology"><div class="panel-heading"><div><h2>Como ler os indicadores</h2><p>Conceitos previstos nos requisitos do projeto.</p></div></div>${definitions.map(([title, description]) => `<details><summary>${title}<span aria-hidden="true">+</span></summary><p>${description}</p></details>`).join('')}<div class="panel-bottom-note">As faixas de cor do protótipo são ilustrativas e não substituem metas contratuais ou a validação da equipe responsável.</div></section>`;
  }

  function render() {
    const page = pageName();
    const selected = pages[page];
    const records = D.filterRecords(state);
    const totals = D.summarize(records);
    const lines = D.groupByLine(records);
    const range = D.getRange(state.period);
    document.title = `${selected.label} · Observa SP`;
    document.querySelector('#page-title').textContent = selected.title;
    document.querySelector('#page-description').textContent = selected.description;
    document.querySelector('#breadcrumb-page').textContent = selected.label;
    document.querySelectorAll('[data-page]').forEach(link => {
      if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelector('#filters').hidden = page === 'sobre';
    document.querySelector('#data-context').hidden = page === 'sobre';
    document.querySelector('#quality-notice').hidden = page === 'sobre' || !totals.hasGaps;
    document.querySelector('#export-button').hidden = page === 'sobre';
    document.querySelector('#data-context').innerHTML = `<span>${icon('clock')} ${date(range.start)} a ${date(range.end)}</span><span>${lines.length} ${lines.length === 1 ? 'linha de exemplo' : 'linhas de exemplo'}<span class="context-dot">·</span>Filtros aplicados a todos os indicadores</span>`;
    content.innerHTML = page === 'linhas' ? linesPage(lines) : page === 'mapa' ? mapPage(lines) : page === 'dados' ? dataPage(lines, totals) : page === 'sobre' ? aboutPage() : overview(records, lines, totals);
  }

  function openLine(lineId) {
    const records = D.filterRecords({ ...state, line: lineId });
    const line = D.groupByLine(records).find(item => item.id === lineId);
    if (!line) return;
    const range = D.getRange(state.period);
    const directionLabel = state.direction === 'all' ? 'Ambos os sentidos' : state.direction === 'ida' ? 'Ida' : 'Volta';
    const timeLabel = state.time === 'all' ? 'Dia todo' : D.bands.find(band => band.id === state.time).label;
    document.querySelector('#dialog-title').textContent = `Linha ${line.id}`;
    document.querySelector('#dialog-content').innerHTML = `<p class="dialog-itinerary">${html(routeName(line))}</p><p class="muted dialog-context">${date(range.start)} a ${date(range.end)} · ${directionLabel} · ${timeLabel}</p><div class="dialog-tags"><span class="future-tag">Zona ${line.region}</span>${coverageBadge(line)}<span class="future-tag">Dados fictícios</span></div><div class="dialog-metrics">${metric('Cumprimento', number(line.completion, 1), '%', 'bus', `${number(line.completed)} de ${number(line.scheduled)} viagens`)}${metric('Pontualidade', number(line.punctuality, 1), '%', 'clock', 'Exemplo de linha com horário fixo')}${metric('Espera estimada', number(line.wait, 1), 'min', 'timer', 'Valor ilustrativo')}</div><div class="dialog-chart-heading"><h3>Oferta de viagens por dia</h3><div class="chart-legend"><span><i class="legend-line planned"></i>Programadas</span><span><i class="legend-line observed"></i>Realizadas</span></div></div>${V.historyChart(D.groupByDay(records))}${line.hasGaps ? '<p class="dialog-warning">Atenção: há janelas com mais de 10% de falhas de coleta nesta linha.</p>' : ''}<div class="dialog-footer"><p>Os indicadores seguem os filtros selecionados no painel.</p><button type="button" class="button button-primary" data-action="download-line" data-line="${line.id}">${icon('download')}Baixar CSV desta linha</button></div>`;
    dialog.showModal();
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  }

  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csvDecimal = value => value == null ? '' : value.toFixed(1).replace('.', ',');

  function downloadCsv(lineId = null, daily = false) {
    const filters = lineId ? { ...state, line: lineId } : state;
    const records = D.filterRecords(filters);
    const range = D.getRange(filters.period);
    const direction = filters.direction === 'all' ? 'Ambos' : filters.direction;
    const time = filters.time === 'all' ? 'Dia todo' : D.bands.find(band => band.id === filters.time).label;
    const source = 'Dados fictícios do protótipo Observa SP; sem conexão com SPTrans';
    let rows;
    if (daily) {
      rows = [['data', 'viagens_programadas', 'viagens_realizadas', 'cobertura_percentual', 'janelas_incompletas', 'linha', 'sentido', 'faixa_horaria', 'fonte'], ...D.groupByDay(records).map(day => [day.date, day.scheduled, day.completed, csvDecimal(day.coverage), day.hasGaps ? 'Sim' : 'Não', filters.line === 'all' ? 'Todas' : filters.line, direction, time, source])];
    } else {
      const groupedLines = D.groupByLine(records);
      const exportedLines = !lineId && pageName() === 'linhas' ? searchedLines(groupedLines) : groupedLines;
      rows = [['linha', 'origem', 'destino', 'regiao', 'inicio_periodo', 'fim_periodo', 'sentido', 'faixa_horaria', 'viagens_programadas', 'viagens_realizadas', 'cumprimento_percentual', 'pontualidade_percentual', 'espera_media_minutos', 'registros_esperados', 'registros_recebidos', 'cobertura_percentual', 'janelas_incompletas', 'fonte'], ...exportedLines.map(line => [line.id, line.origin, line.destination, line.region, range.start, range.end, direction, time, line.scheduled, line.completed, csvDecimal(line.completion), csvDecimal(line.punctuality), csvDecimal(line.wait), line.expectedSamples, line.receivedSamples, csvDecimal(line.coverage), line.hasGaps ? 'Sim' : 'Não', source])];
    }
    const blob = new Blob(['\uFEFF', rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `observa-sp-exemplo-${daily ? 'serie-diaria' : lineId || 'indicadores'}-${range.start}-${range.end}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV de exemplo gerado com os filtros selecionados.');
  }

  document.querySelector('#line-filter').insertAdjacentHTML('beforeend', D.lines.map(line => `<option value="${line.id}">${line.id} · ${html(line.origin)}</option>`).join(''));
  V.fillIcons();

  document.querySelector('#filters').addEventListener('submit', event => event.preventDefault());
  document.querySelector('#filters').addEventListener('change', event => {
    const key = { 'period-filter': 'period', 'line-filter': 'line', 'direction-filter': 'direction', 'time-filter': 'time' }[event.target.id];
    if (!key) return;
    state[key] = event.target.value;
    render();
  });
  document.querySelector('#reset-filters').addEventListener('click', () => {
    Object.assign(state, D.defaults, { search: '' });
    document.querySelector('#filters').reset();
    render();
    showToast('Filtros restaurados.');
  });
  document.querySelector('#export-button').addEventListener('click', () => downloadCsv());
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  document.addEventListener('click', event => {
    const route = event.target.closest('[data-route]');
    if (route) { openLine(route.dataset.route); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'download-lines') downloadCsv();
    if (action.dataset.action === 'download-history') downloadCsv(null, true);
    if (action.dataset.action === 'download-line') downloadCsv(action.dataset.line);
    if (action.dataset.action === 'clear-search') {
      state.search = '';
      document.querySelector('#line-search').value = '';
      document.querySelector('#line-results').innerHTML = filteredTable(D.groupByLine(D.filterRecords(state)));
      document.querySelector('#line-search').focus();
    }
  });
  content.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.map-route')) {
      event.preventDefault();
      openLine(event.target.dataset.route);
    }
  });
  content.addEventListener('input', event => {
    if (event.target.id !== 'line-search') return;
    state.search = event.target.value;
    document.querySelector('#line-results').innerHTML = filteredTable(D.groupByLine(D.filterRecords(state)));
  });
  content.addEventListener('change', event => {
    if (event.target.id === 'line-sort') {
      state.sort = event.target.value;
      document.querySelector('#line-results').innerHTML = filteredTable(D.groupByLine(D.filterRecords(state)));
    }
    if (event.target.id === 'map-metric') { state.mapMetric = event.target.value; render(); }
  });
  window.addEventListener('hashchange', () => {
    if (dialog.open) dialog.close();
    render();
    document.querySelector('#main-content').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  render();
})();
