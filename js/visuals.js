/* Ícones e visualizações em SVG, sem serviços externos ou bibliotecas. */
(() => {
  const paths = {
    bus: '<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 12h14M12 3v9M8 20v2m8-2v2M3 7v5m18-5v5M8 16h1m6 0h1"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    building: '<path d="M4 21V7h7v14M11 3h9v18M2 21h20M7 10v1m0 3v1m7-8h3m-3 4h3m-3 4h3"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    alert: '<path d="m10.3 4.5-8 14A1.7 1.7 0 0 0 3.8 21h16.4a1.7 1.7 0 0 0 1.5-2.5l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4v.1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5"/>',
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    timer: '<path d="M9 2h6m-3 0v3m6 1 2-2"/><circle cx="12" cy="14" r="8"/><path d="M12 9v5l3 2"/>',
  };

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const number = (value, digits = 0) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const date = (value, short = false) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: short ? '2-digit' : 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;

  function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  }

  function performance(value) {
    if (value >= 95) return { label: 'A partir de 95%', className: 'good', color: '#5c8570' };
    if (value >= 85) return { label: 'De 85% a 94,9%', className: 'attention', color: '#bd914f' };
    return { label: 'Abaixo de 85%', className: 'critical', color: '#bb7566' };
  }

  let chartId = 0;
  function historyChart(series) {
    if (!series.length) return '<p class="empty-state">Não há dados para este recorte.</p>';
    chartId += 1;
    const gradientId = `chart-area-${chartId}`;
    const width = 700, height = 246, left = 52, right = 15, top = 16, bottom = 36;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const max = Math.ceil(Math.max(...series.map(item => item.scheduled)) * 1.15 / 100) * 100;
    const x = index => left + index / Math.max(1, series.length - 1) * plotWidth;
    const y = value => top + plotHeight * (1 - value / max);
    const points = key => series.map((item, index) => `${x(index).toFixed(1)},${y(item[key]).toFixed(1)}`).join(' ');
    const grid = [0, 1, 2, 3].map(step => {
      const value = max / 3 * step;
      return `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#ecece8" stroke-dasharray="3 5"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end">${number(value)}</text>`;
    }).join('');
    const tickIndexes = [...new Set([0, Math.round((series.length - 1) / 4), Math.round((series.length - 1) / 2), Math.round((series.length - 1) * 3 / 4), series.length - 1])];
    const ticks = tickIndexes.map(index => `<text x="${x(index)}" y="${height - 8}" text-anchor="middle">${date(series[index].date, true)}</text>`).join('');
    const dots = series.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.completed)}" r="${series.length > 30 ? 2 : 3.5}" fill="#80614c" stroke="white" stroke-width="1.5"><title>${date(item.date)}: ${number(item.completed)} realizadas de ${number(item.scheduled)} programadas${item.hasGaps ? ' · Dados incompletos' : ''}</title></circle>`).join('');
    return `<div class="chart-scroll"><svg class="history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Viagens programadas e realizadas por dia, com dados fictícios. Os mesmos dados podem ser baixados em CSV na seção Dados abertos."><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b29478" stop-opacity=".2"/><stop offset="100%" stop-color="#b29478" stop-opacity=".01"/></linearGradient></defs>${grid}<polygon points="${left},${y(0)} ${points('completed')} ${width - right},${y(0)}" fill="url(#${gradientId})"/><polyline points="${points('scheduled')}" fill="none" stroke="#bcc3bd" stroke-width="2" stroke-dasharray="6 5" stroke-linejoin="round"/><polyline points="${points('completed')}" fill="none" stroke="#80614c" stroke-width="2.5" stroke-linejoin="round"/>${dots}${ticks}</svg></div>`;
  }

  const routePoints = [
    '145,200 240,180 330,230 430,260',
    '180,330 270,310 330,230 430,260',
    '715,180 610,195 520,245 430,260',
    '300,420 335,350 390,315 430,260',
    '445,75 470,145 440,195 430,260',
    '700,365 625,335 570,290 520,245',
  ];

  function operationMap(selectedLines, metric) {
    const routes = selectedLines.map(line => {
      const index = window.SprintData.lines.findIndex(item => item.id === line.id);
      const points = routePoints[index];
      const last = points.split(' ').at(-1).split(',');
      const first = points.split(' ')[0].split(',');
      const status = performance(line.completion);
      const color = metric === 'coverage' ? (line.coverage < 90 ? '#bb7566' : '#5c8570') : status.color;
      return `<g class="map-route" tabindex="0" role="button" data-route="${line.id}" aria-label="Ver detalhes da linha ${line.id}"><title>Linha ${line.id} · ${metric === 'coverage' ? 'Cobertura' : 'Cumprimento'}: ${number(metric === 'coverage' ? line.coverage : line.completion, 1)}%. Posição ilustrativa.</title><polyline points="${points}" fill="none" stroke="transparent" stroke-width="22"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="6" fill="white" stroke="${color}" stroke-width="3"/><rect x="${Number(first[0]) - 15}" y="${Number(first[1]) - 15}" width="30" height="30" rx="9" fill="${color}" stroke="white" stroke-width="3"/><svg x="${Number(first[0]) - 9}" y="${Number(first[1]) - 10}" width="18" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round">${paths.bus}</svg></g>`;
    }).join('');
    return `<svg class="operation-map" viewBox="0 0 840 500" role="group" aria-label="Mapa esquemático das regiões de São Paulo. Traçados e posições fictícios, sem precisão geográfica."><rect width="840" height="500" fill="#f1f3ee"/><path d="m60 70 175-25 80 95-90 145L45 260Z" fill="#e4ebdf"/><path d="m555 30 220 25 25 100-155 40-90-65Z" fill="#e5ebdf"/><path d="m500 340 180 30 100 100H490Z" fill="#e4ebdf"/><g fill="none" stroke="#fff" stroke-width="15"><path d="M0 115 245 145 460 110 840 150M0 280 200 250 440 270 650 230 840 260M0 420 250 390 440 325 650 390 840 370M180 0 230 190 200 500M390 0 370 180 440 315 440 500M640 0 580 190 660 500M0 20 330 230 840 490"/></g><g fill="none" stroke="#e4e7de" stroke-width="1.5"><path d="M0 175 250 195 400 175 840 205M0 345 300 310 540 350 840 325M95 0 130 500M290 0 310 500M520 0 500 500M745 0 760 500"/></g><path d="M75-20C95 70 300 55 315 160S220 310 285 390s40 90 20 130" fill="none" stroke="#b7d4d5" stroke-width="12"/><path d="M75-20C95 70 300 55 315 160S220 310 285 390s40 90 20 130" fill="none" stroke="#d3e5e5" stroke-width="5"/><g class="map-labels"><text x="405" y="48">ZONA NORTE</text><text x="85" y="300">ZONA OESTE</text><text x="640" y="115">ZONA LESTE</text><text x="325" y="470">ZONA SUL</text><text x="465" y="300">CENTRO</text></g>${routes}<g transform="translate(18 455)"><rect width="202" height="27" rx="6" fill="white" fill-opacity=".94"/><text x="12" y="18" fill="#68716a" font-size="11">Mapa esquemático · não geográfico</text></g></svg>`;
  }

  window.SprintVisuals = Object.freeze({ escapeHtml, number, date, icon, fillIcons, performance, historyChart, operationMap });
})();
