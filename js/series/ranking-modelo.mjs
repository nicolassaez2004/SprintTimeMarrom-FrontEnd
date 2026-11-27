import { hojeSP } from '../comum/formatacao.mjs';

const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const codigo = /^[A-Za-z0-9_.:-]{1,64}$/;
const texto = v => typeof v === 'string' && v.length > 0;
const contagem = v => Number.isSafeInteger(v) && v >= 0;
export const numeroRanking = v => new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 21 }).format(v);
export const valorRanking = v => `${new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 21, signDisplay: 'exceptZero' }).format(v)} s`;
export const mesRanking = mes => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-01T12:00:00Z`));

export function filtrosRanking(valores) {
  const f = Object.fromEntries(['mes', 'linha', 'sentido'].map(c => [c, String(valores[c] ?? '').trim()]));
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(f.mes) || f.mes === '9999-12') throw new Error('Escolha um mês válido.');
  if (f.linha && !codigo.test(f.linha)) throw new Error('Confira o código da linha do ranking.');
  if (!['', '0', '1'].includes(f.sentido)) throw new Error('Escolha todos os sentidos, ida ou volta.');
  return f;
}

export function selecaoRanking(busca = '', hoje = hojeSP()) {
  const args = new URLSearchParams(busca);
  return { mes: hoje.slice(0, 7), linha: args.get('linha') ?? '', sentido: args.get('sentido') ?? '' };
}

export function validarRanking(corpo, filtros) {
  const erro = () => { throw new Error('O serviço retornou um ranking incompleto ou incompatível com a consulta.'); };
  if (!objeto(corpo) || corpo.mes !== filtros.mes || corpo.fuso !== 'America/Sao_Paulo'
      || !['MEDIA', 'MEDIANA'].includes(corpo.metrica) || corpo.unidade !== 's' || corpo.limite !== 20
      || !texto(corpo.ordenacao) || !objeto(corpo.periodo) || !Array.isArray(corpo.dados)
      || !contagem(corpo.trechos_com_valor) || !contagem(corpo.trechos_sem_valor)
      || corpo.dados.length !== Math.min(20, corpo.trechos_com_valor)) erro();
  // O mês é operacional em São Paulo. Não reinterpretar a resposta como UTC civil.
  const ini = new Date(corpo.periodo.inicio), fim = new Date(corpo.periodo.fim);
  for (const instante of [corpo.periodo.inicio, corpo.periodo.fim]) if (typeof instante !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(instante)) erro();
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: corpo.fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const partes = d => Object.fromEntries(local.formatToParts(d).map(p => [p.type, p.value]));
  if (!Number.isFinite(+ini) || !Number.isFinite(+fim) || fim <= ini) erro();
  const a = partes(ini), b = partes(fim), [ano, mes] = filtros.mes.split('-').map(Number);
  if (`${a.year.padStart(4, '0')}-${a.month}` !== filtros.mes || a.day !== '01' || a.hour !== '00' || a.minute !== '00' || a.second !== '00'
      || Number(b.year) !== ano + Math.floor(mes / 12) || Number(b.month) !== mes % 12 + 1
      || b.day !== '01' || b.hour !== '00' || b.minute !== '00' || b.second !== '00') erro();
  const ids = new Set();
  for (const [i, r] of corpo.dados.entries()) {
    const t = r?.trecho;
    if (!objeto(r) || r.posicao !== i + 1 || !objeto(t) || !texto(t.id) || ids.has(t.id)
        || !texto(t.linha) || !['0', '1'].includes(t.sentido) || !texto(t.trajeto) || !Number.isSafeInteger(t.ordem) || t.ordem < 1
        || !texto(t.parada_origem) || !texto(t.parada_destino)
        || typeof r.aumento_atraso !== 'number' || !Number.isFinite(r.aumento_atraso) || r.unidade !== corpo.unidade
        || !contagem(r.amostras) || !contagem(r.amostras_total) || r.amostras > r.amostras_total
        || !(r.cobertura === null || (typeof r.cobertura === 'number' && Number.isFinite(r.cobertura) && r.cobertura >= 0 && r.cobertura <= 1))
        || !texto(r.versao_gtfs_id) || !texto(r.versao_calculo) || !texto(r.versao_conjunto)
        || !(r.versao_correspondencia === null || texto(r.versao_correspondencia)) || !objeto(r.qualidade)) erro();
    if (filtros.linha && t.linha !== filtros.linha || filtros.sentido && t.sentido !== filtros.sentido) erro();
    if (r.qualidade.metrica != null && r.qualidade.metrica !== corpo.metrica) erro();
    if (r.qualidade.versoes_entrada != null && (!Array.isArray(r.qualidade.versoes_entrada)
        || r.qualidade.versoes_entrada.some(v => !objeto(v)))) erro();
    ids.add(t.id);
  }
  // Não ordenar, limitar novamente, calcular médias ou substituir a cobertura.
  return corpo;
}

export function coberturaRanking(r) {
  return r.cobertura === null ? 'Não informada' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(r.cobertura);
}
