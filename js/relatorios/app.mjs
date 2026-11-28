// US21-T04-FE: página pública do relatório mensal de associações (contexto × desempenho).
import { consultarRelatorio } from './cliente.mjs';
import { API_BASE } from '../comum/config.mjs';
import { escapar as h, hojeSP, numero } from '../comum/formatacao.mjs';
import { DESFECHOS, MODELOS, MOTIVOS_INVALIDO, VARIAVEIS, escalaIntervalos, leituraCoeficiente, resumoHash, validarMes } from './modelo.mjs';

const el = id => document.getElementById(id);
const mesAtual = hojeSP().slice(0, 7);
const [ano, mes] = mesAtual.split('-').map(Number);
const mesAnterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
const parametro = new URLSearchParams(location.search).get('mes') || '';
let requisicao = null;

el('mes').max = mesAtual;
el('mes').value = /^\d{4}-\d{2}$/.test(parametro) && parametro <= mesAtual ? parametro : mesAnterior;

const dec = (v, casas = 2) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
const pValor = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0,001' : dec(p, 3));
const dataCompleta = (instante, hora = false) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo', ...(hora ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) }).format(new Date(instante));
const nomeMes = m => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00Z`));

function estado(id) {
  for (const bloco of ['carregamento', 'erro', 'ausente', 'relatorio']) el(bloco).hidden = bloco !== id;
}

async function carregar() {
  requisicao?.abort();
  let alvo;
  try { alvo = validarMes(el('mes').value, mesAtual); } catch (erro) { el('erro-texto').textContent = erro.message; estado('erro'); return; }
  const atual = new AbortController();
  requisicao = atual;
  estado('carregamento');
  el('consultar').disabled = true;
  try {
    const resposta = await consultarRelatorio(API_BASE, alvo, { signal: atual.signal });
    if (atual !== requisicao) return;
    const url = new URL(location.href); url.searchParams.set('mes', alvo); history.replaceState(null, '', url);
    if (resposta.situacao === 'PUBLICADO') { renderizar(resposta.relatorio); estado('relatorio'); return; }
    el('ausente-titulo').textContent = resposta.situacao === 'INVALIDO'
      ? `O relatório de ${nomeMes(alvo)} foi considerado inválido`
      : `Ainda não há relatório publicado para ${nomeMes(alvo)}`;
    el('ausente-texto').textContent = resposta.situacao === 'INVALIDO'
      ? `A análise deste mês não passou nas verificações (${MOTIVOS_INVALIDO[resposta.motivo] ?? resposta.motivo ?? 'motivo não informado'}). Por isso nenhum coeficiente é mostrado; isso não significa associação nula.`
      : 'Um relatório só aparece depois de calculado e revisado. A falta de relatório não significa que a associação seja zero.';
    estado('ausente');
  } catch (erro) {
    if (!atual.signal.aborted && atual === requisicao) { el('erro-texto').textContent = erro.message; estado('erro'); }
  } finally {
    if (atual === requisicao) el('consultar').disabled = false;
  }
}

function renderizar(r) {
  const { metodo, resultado, revisao } = r;
  const unidade = metodo.unidade === 's' ? 's' : metodo.unidade;
  el('titulo-relatorio').textContent = `Relatório de ${nomeMes(r.mes)}`;
  el('registro').textContent = `Registrado em ${dataCompleta(r.registrado_em, true)} · revisado em ${dataCompleta(`${revisao.data}T12:00:00Z`)} · horário de São Paulo`;
  el('desfecho').textContent = `O que é comparado: ${DESFECHOS[metodo.desfecho] ?? metodo.desfecho} (${metodo.metrica === 'MEDIA' ? 'média' : metodo.metrica}, em segundos). Não é atraso absoluto nem pontualidade.`;
  el('interpretacao').textContent = metodo.interpretacao;
  el('modelos').innerHTML = Object.entries(resultado.modelos).map(([nome, m]) => modelo(nome, m, unidade, resultado.parametros)).join('');
  el('verificacoes').innerHTML = (resultado.prontidao?.verificacoes_posteriores_obrigatorias ?? []).map(t => `<li>${h(t)}</li>`).join('') || '<li>Nenhuma informada.</li>';
  el('fontes').innerHTML = r.fontes.map(f => `<tr><td class="period">${h(f.mes)}</td><td>${h(f.versao_base)}</td><td>${h(f.selecao?.fonte_clima ?? '—')} · ${h(f.selecao?.clima_versao_fonte ?? '—')}</td><td>${h(f.selecao?.trafego_versao_fonte ?? '—')}</td><td><code title="${h(f.hash_base)}">${h(resumoHash(f.hash_base))}</code></td></tr>`).join('');
  el('total-fontes').textContent = `${numero(r.fontes.length)} ${r.fontes.length === 1 ? 'mês' : 'meses'} na base`;
  const p = resultado.parametros ?? {};
  const versoes = [
    ['Mês de referência', nomeMes(r.mes)], ['Versão do cálculo', resultado.versao_calculo],
    ['Estimador', `${metodo.estimador} (pesos ${metodo.pesos})`],
    ['Incerteza', `${p.metodo_incerteza ?? '—'}, nível ${Number.isFinite(p.nivel_confianca) ? dec(p.nivel_confianca * 100, 0) : '—'}%`],
    ['Plano de análise', resumoHash(resultado.hash_plano)], ['Revisão', `${revisao.responsavel} · ${revisao.referencia}`],
    ['Bibliotecas', Object.entries(resultado.versoes ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ')],
  ];
  el('versoes').innerHTML = versoes.map(([t, v]) => `<div><dt>${h(t)}</dt><dd>${h(v)}</dd></div>`).join('');
}

function modelo(nome, m, unidade, parametros) {
  const info = MODELOS[nome] ?? { titulo: nome, descricao: '' };
  const escala = escalaIntervalos(m.coeficientes);
  const fmt = v => dec(v);
  const linhas = Object.entries(m.coeficientes).sort(([a], [b]) => (a === 'intercepto') - (b === 'intercepto')).map(([variavel, c]) => {
    const rotulo = VARIAVEIS[variavel]?.nome ?? variavel;
    const barra = escala && variavel !== 'intercepto'
      ? `<div class="interval" role="img" aria-label="Intervalo de 95% de ${h(fmt(c.ic95[0]))} a ${h(fmt(c.ic95[1]))} ${h(unidade)}"><span class="zero" style="left:${escala.posicao(0)}%"></span><span class="range" style="left:${escala.posicao(c.ic95[0])}%;width:${escala.posicao(c.ic95[1]) - escala.posicao(c.ic95[0])}%"></span><span class="point" style="left:${escala.posicao(c.coeficiente)}%"></span></div>`
      : '';
    return `<tr><th scope="row">${h(rotulo)}<small>${h(VARIAVEIS[variavel]?.incremento ?? '')}</small></th><td class="num">${fmt(c.coeficiente)} ${h(unidade)}</td><td class="num">${fmt(c.ic95[0])} a ${fmt(c.ic95[1])}</td><td class="num">${Number.isFinite(c.erro_padrao) ? fmt(c.erro_padrao) : '—'}</td><td class="num">${pValor(c.p_valor)}</td><td class="interval-cell">${barra}</td></tr>`
      + `<tr class="reading"><td colspan="6">${h(leituraCoeficiente(variavel, c, unidade, fmt))}</td></tr>`;
  }).join('');
  const amostra = [
    ['Amostra', `${numero(m.observacoes)} trechos-mês`], ['Excluídos por dado ausente', numero(m.excluidas_por_dados_ausentes)],
    ['Grupos espaciais', numero(m.grupos_espaciais)], ['Grupos temporais', numero(m.grupos_temporais)],
    ['Graus de liberdade', numero(m.graus_liberdade)],
    ['Mínimos exigidos', `${numero(parametros?.min_observacoes)} obs., ${numero(parametros?.min_grupos_espaciais)} e ${numero(parametros?.min_grupos_temporais)} grupos`],
  ];
  return `<section class="panel model-panel" aria-labelledby="modelo-${h(nome)}">
    <div class="section-top"><div><h2 id="modelo-${h(nome)}">${h(info.titulo)}</h2><p class="muted">${h(info.descricao)}</p></div><span class="small-tag">${h(m.situacao)}</span></div>
    <div class="table-wrap"><table class="coef-table"><caption class="sr-only">Coeficientes do ${h(info.titulo)}</caption><thead><tr><th scope="col">Variável</th><th scope="col">Coeficiente</th><th scope="col">Intervalo de 95%</th><th scope="col">Erro padrão</th><th scope="col">p-valor</th><th scope="col"><span class="sr-only">Gráfico do intervalo</span></th></tr></thead><tbody>${linhas}</tbody></table></div>
    <dl class="sample">${amostra.map(([t, v]) => `<div><dt>${h(t)}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>
    <h3>Limitações deste modelo</h3><ul class="limits">${m.limitacoes.map(t => `<li>${h(t)}</li>`).join('')}</ul>
  </section>`;
}

el('filtro').addEventListener('submit', evento => { evento.preventDefault(); carregar(); });
el('tentar').addEventListener('click', carregar);
carregar();
