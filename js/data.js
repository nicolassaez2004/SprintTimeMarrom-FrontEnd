/* Dados fictícios centralizados. Uma futura integração pode substituir este arquivo. */
(() => {
  const lines = [
    { id: '8000-10', origin: 'Terminal Lapa', destination: 'Praça Ramos', region: 'Oeste', color: '#80614c', completion: 0.963, punctuality: 0.893, coverage: 0.989, interval: 10, wait: 6.1 },
    { id: '702U-10', origin: 'Butantã', destination: 'Cidade Universitária', region: 'Oeste', color: '#78917a', completion: 0.944, punctuality: 0.862, coverage: 0.978, interval: 12, wait: 7.3 },
    { id: '4310-10', origin: 'Itaquera', destination: 'Terminal Parque D. Pedro II', region: 'Leste', color: '#d19b58', completion: 0.908, punctuality: 0.823, coverage: 0.963, interval: 14, wait: 8.7 },
    { id: '6500-10', origin: 'Terminal Santo Amaro', destination: 'Praça da Sé', region: 'Sul', color: '#9a859d', completion: 0.927, punctuality: 0.841, coverage: 0.971, interval: 12, wait: 7.9 },
    { id: '178L-10', origin: 'Santana', destination: 'Centro', region: 'Norte', color: '#6b929c', completion: 0.877, punctuality: 0.796, coverage: 0.952, interval: 16, wait: 10.4 },
    { id: '407N-10', origin: 'São Mateus', destination: 'Terminal Vila Prudente', region: 'Leste', color: '#ba786a', completion: 0.826, punctuality: 0.742, coverage: 0.858, interval: 18, wait: 12.8 },
  ];

  // Datas fixas tornam o protótipo reproduzível, mesmo sem conexão com a internet.
  const referenceDate = '2026-11-15';
  const dayMs = 24 * 60 * 60 * 1000;
  const bands = [
    { id: 'manha', label: 'Pico da manhã', scheduled: 22, adjustment: -0.025 },
    { id: 'dia', label: 'Entre picos', scheduled: 38, adjustment: 0.022 },
    { id: 'tarde', label: 'Pico da tarde', scheduled: 27, adjustment: -0.037 },
  ];
  const records = [];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  for (let day = 0; day < 90; day += 1) {
    const date = new Date(Date.parse(`${referenceDate}T12:00:00Z`) - (89 - day) * dayMs).toISOString().slice(0, 10);
    lines.forEach((line, index) => {
      ['ida', 'volta'].forEach((direction, directionIndex) => {
        bands.forEach((band, bandIndex) => {
          const wave = Math.sin(day * 0.7 + index + bandIndex) * 0.025;
          const adjustment = band.adjustment + wave - directionIndex * 0.012;
          const scheduled = band.scheduled + index * 2 + (day % 7 < 2 ? -4 : 0);
          const completed = Math.round(scheduled * clamp(line.completion + adjustment, 0.65, 1));
          const onTime = Math.round(completed * clamp(line.punctuality + adjustment, 0.55, 0.98));
          const expectedSamples = scheduled * 60;
          const coverage = clamp(line.coverage + wave * 0.3, 0.7, 1);
          records.push({
            lineId: line.id, date, direction, band: band.id,
            scheduled, completed, onTime, expectedSamples,
            receivedSamples: Math.round(expectedSamples * coverage),
            // Estimativa fictícia já calculada, sem processar posições de veículos.
            wait: line.wait - adjustment * 22,
          });
        });
      });
    });
  }

  const defaults = { period: '30', line: 'all', direction: 'all', time: 'all' };

  function getRange(period) {
    return {
      start: new Date(Date.parse(`${referenceDate}T12:00:00Z`) - (Number(period) - 1) * dayMs).toISOString().slice(0, 10),
      end: referenceDate,
    };
  }

  function filterRecords(filters) {
    const range = getRange(filters.period);
    return records.filter(record =>
      record.date >= range.start && record.date <= range.end &&
      (filters.line === 'all' || record.lineId === filters.line) &&
      (filters.direction === 'all' || record.direction === filters.direction) &&
      (filters.time === 'all' || record.band === filters.time)
    );
  }

  function summarize(selectedRecords) {
    const totals = selectedRecords.reduce((result, record) => {
      result.scheduled += record.scheduled;
      result.completed += record.completed;
      result.onTime += record.onTime;
      result.expectedSamples += record.expectedSamples;
      result.receivedSamples += record.receivedSamples;
      result.weightedWait += record.wait * record.completed;
      return result;
    }, { scheduled: 0, completed: 0, onTime: 0, expectedSamples: 0, receivedSamples: 0, weightedWait: 0 });

    return {
      ...totals,
      completion: totals.scheduled ? totals.completed / totals.scheduled * 100 : null,
      punctuality: totals.completed ? totals.onTime / totals.completed * 100 : null,
      coverage: totals.expectedSamples ? totals.receivedSamples / totals.expectedSamples * 100 : null,
      wait: totals.completed ? totals.weightedWait / totals.completed : null,
      hasGaps: selectedRecords.some(record => record.receivedSamples / record.expectedSamples < 0.9),
    };
  }

  function groupByLine(selectedRecords) {
    return lines.map(line => {
      const selected = selectedRecords.filter(record => record.lineId === line.id);
      return { ...line, ...summarize(selected), recordCount: selected.length };
    }).filter(line => line.recordCount > 0);
  }

  function groupByDay(selectedRecords) {
    const dates = [...new Set(selectedRecords.map(record => record.date))].sort();
    return dates.map(date => ({ date, ...summarize(selectedRecords.filter(record => record.date === date)) }));
  }

  window.SprintData = Object.freeze({ lines, bands, referenceDate, defaults, getRange, filterRecords, summarize, groupByLine, groupByDay });
})();
