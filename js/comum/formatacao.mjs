// Formatação e datas civis compartilhadas pelas páginas (horário de São Paulo).
const FUSO = 'America/Sao_Paulo';

export const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const numero = valor => Number.isFinite(valor) ? new Intl.NumberFormat('pt-BR').format(valor) : '—';
export const percentual = valor => Number.isFinite(valor) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor)}%` : '—';

export function dataValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(+data) && data.toISOString().slice(0, 10) === valor;
}
export const somarDias = (valor, quantidade) => {
  const data = new Date(`${valor}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return data.toISOString().slice(0, 10);
};
export function hojeSP(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const obter = tipo => partes.find(p => p.type === tipo).value;
  return `${obter('year')}-${obter('month')}-${obter('day')}`;
}
export const dataCurta = dia => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO }).format(new Date(`${dia}T12:00Z`));
export const diaSemana = dia => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: FUSO }).format(new Date(`${dia}T12:00Z`));
export const dataExtensa = dia => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSO }).format(new Date(`${dia}T12:00Z`));
export function horario(instante, comData = false) {
  if (!instante) return 'Não registrado';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(comData ? { day: '2-digit', month: '2-digit' } : {}) }).format(new Date(instante));
}
