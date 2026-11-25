import { consultarQualidade } from './cliente.mjs';
import { API_BASE } from '../comum/config.mjs';
import { escapar as h, numero, percentual, hojeSP, somarDias, dataValida, dataCurta, diaSemana, dataExtensa, horario } from '../comum/formatacao.mjs';
import { SITUACOES, validarPeriodo, fimNoDia, causa, recorteLacuna } from './modelo.mjs';

const el = id => document.getElementById(id);
let relatorio = null, indice = 0, requisicao = null;
const parametros = new URLSearchParams(location.search);
const hoje = hojeSP();
el('inicio').max = el('fim').max = hoje;
el('inicio').value = dataValida(parametros.get('inicio') || '') ? parametros.get('inicio') : somarDias(hoje, -6);
el('fim').value = dataValida(parametros.get('fim') || '') ? parametros.get('fim') : hoje;

function erroConsulta(mensagem) {
  el('erro-texto').textContent = mensagem;
  el('erro').hidden = false;
  el('relatorio').hidden = true;
  el('simulacao').hidden = true;
}
async function carregar() {
  requisicao?.abort();
  requisicao = null;
  el('carregamento').hidden = true;
  el('consultar').disabled = false;
  el('inicio').disabled = el('fim').disabled = false;
  try { validarPeriodo(el('inicio').value, el('fim').value); }
  catch (erro) { erroConsulta(erro.message); return; }
  const inicio = el('inicio').value, fim = el('fim').value;
  const atual = new AbortController();
  requisicao = atual;
  el('erro').hidden = true;
  el('relatorio').hidden = true;
  el('simulacao').hidden = true;
  el('carregamento').hidden = false;
  el('consultar').disabled = true;
  el('inicio').disabled = el('fim').disabled = true;
  try {
    relatorio = await consultarQualidade(API_BASE, inicio, fim, { signal: atual.signal });
    if (atual !== requisicao) return;
    indice = Math.max(0, relatorio.dias.length - 1);
    el('dias').innerHTML = relatorio.dias.map((dia, i) => `<button class="day-button" type="button" data-dia="${i}" aria-pressed="false"><span>${h(diaSemana(dia.data))}</span><strong>${h(dataCurta(dia.data))}</strong></button>`).join('');
    el('relatorio').hidden = false;
    el('simulacao').hidden = relatorio.simulado !== true;
    const url = new URL(location.href);
    url.searchParams.set('inicio', inicio);
    url.searchParams.set('fim', fim);
    history.replaceState(null, '', url);
    renderizarDia();
  } catch (erro) {
    if (!atual.signal.aborted && atual === requisicao) erroConsulta(erro.message);
  } finally {
    if (atual === requisicao) {
      el('carregamento').hidden = true;
      el('consultar').disabled = false;
      el('inicio').disabled = el('fim').disabled = false;
    }
  }
}
function metrica(titulo, valor, nota, classe = '', status = false) {
  return `<article class="metric ${classe}"><span class="metric-label">${h(titulo)}</span><p class="metric-value ${status ? 'status-text' : ''}">${h(valor)}</p><p class="metric-foot">${h(nota)}</p></article>`;
}
function renderizarDia() {
  const dia = relatorio.dias[indice];
  el('titulo-dia').textContent = dataExtensa(dia.data);
  el('dias').querySelectorAll('[data-dia]').forEach((botao, i) => botao.setAttribute('aria-pressed', String(i === indice)));
  el('anterior').disabled = indice === 0;
  el('proximo').disabled = indice === relatorio.dias.length - 1;
  el('contexto').textContent = `Relatório gerado em ${horario(relatorio.gerado_em, true)} · Intervalo de coleta: ${numero(relatorio.intervalo_coleta_segundos)} s · Horários de São Paulo`;
  const semObservacao = ['FORA_DO_MONITORAMENTO', 'PENDENTE'].includes(dia.situacao);
  const alerta = dia.situacao === 'SEM_DADOS' ? 'Não há ciclos com dados neste dia. Isso não significa que não havia ônibus em circulação.'
    : dia.situacao === 'FORA_DO_MONITORAMENTO' ? 'Não há ciclos de monitoramento registrados neste dia. A disponibilidade é desconhecida; confira também os eventos identificados abaixo.'
    : dia.incompleto ? 'Há mais de 10% de falhas de coleta no dia. Considere essa ausência de dados ao analisar a operação.'
    : '';
  el('aviso').hidden = !alerta;
  el('aviso').textContent = alerta;
  el('aviso').className = `message ${dia.situacao === 'SEM_DADOS' ? 'error' : 'warning'}`;
  el('metricas').innerHTML = metrica('Situação da coleta', SITUACOES[dia.situacao].texto, semObservacao ? 'Disponibilidade não determinada' : 'Resultado dos ciclos observados', dia.incompleto ? 'warn' : '', true)
    + metrica('Ciclos com dados', semObservacao ? '—' : numero(dia.ciclos_com_dados), semObservacao ? 'Não confundir com zero ônibus' : `de ${numero(dia.ciclos_esperados)} ciclos esperados`)
    + metrica('Falhas na coleta', percentual(dia.percentual_falhas), dia.percentual_falhas === null ? 'Percentual desconhecido' : 'Inclui ciclos sem registro', dia.incompleto ? 'bad' : '')
    + metrica('Lacunas identificadas', numero(dia.lacunas.length), 'Registradas e silêncios identificados', dia.lacunas.length ? 'warn' : '');
  el('janelas').innerHTML = dia.janelas.map((janela, i) => {
    const situacao = SITUACOES[janela.situacao];
    return `<button type="button" class="window-cell ${situacao.classe}" data-janela="${i}" tabindex="${i === 0 ? '0' : '-1'}" aria-label="${h(horario(janela.inicio))} a ${h(fimNoDia(janela.fim, dia))}: ${h(situacao.texto)}" title="${h(horario(janela.inicio))} · ${h(situacao.texto)}"></button>`;
  }).join('');
  selecionarJanela(0);
  renderizarLacunas(dia);
  renderizarGtfs(dia.gtfs);
}
function selecionarJanela(i, focar = false) {
  const janela = relatorio.dias[indice].janelas[i];
  el('janelas').querySelectorAll('[data-janela]').forEach((b, k) => { b.classList.toggle('selected', k === i); b.tabIndex = k === i ? 0 : -1; });
  if (focar) el('janelas').querySelector(`[data-janela="${i}"]`).focus();
  el('janela-detalhe').textContent = `${horario(janela.inicio, true)} → ${horario(janela.fim, true)} · ${SITUACOES[janela.situacao].texto} · ${janela.percentual_falhas === null ? 'Falhas não determinadas' : `${percentual(janela.percentual_falhas)} de falhas`}`;
}
function renderizarLacunas(dia) {
  el('total-lacunas').textContent = `${numero(dia.lacunas.length)} ${dia.lacunas.length === 1 ? 'evento' : 'eventos'}`;
  if (!dia.lacunas.length) {
    el('lacunas').innerHTML = `<p class="empty-state">${dia.situacao === 'FORA_DO_MONITORAMENTO' ? 'Não há eventos de coleta registrados para este dia. A ausência de monitoramento não comprova disponibilidade.' : 'Nenhuma lacuna foi identificada no período observado deste dia.'}</p>`;
    return;
  }
  el('lacunas').innerHTML = `<div class="table-wrap"><table><caption class="sr-only">Lacunas do dia ${h(dataCurta(dia.data))}, incluindo eventos que cruzam meia-noite.</caption><thead><tr><th scope="col">Período neste dia</th><th scope="col">Causa</th><th scope="col">Situação</th></tr></thead><tbody>${dia.lacunas.map(l => {
    const recorte = recorteLacuna(l, dia, relatorio.periodo.observado_ate);
    const continuacao = [recorte.anterior ? 'Continua do dia anterior' : '', recorte.seguinte ? 'Segue para o próximo dia' : ''].filter(Boolean).join(' · ');
    return `<tr><td><span class="period">${h(horario(recorte.inicio))} → ${h(fimNoDia(recorte.fim, dia))}</span>${continuacao ? `<span class="subline">${h(continuacao)}</span>` : ''}<span class="subline">Evento: ${h(horario(l.inicio, true))} → ${l.fim ? h(horario(l.fim, true)) : 'encerramento não registrado'}</span></td><td><span class="cause">${h(causa(l.causa))}</span><span class="subline">${l.origem === 'REGISTRADA' ? 'Registrada pelo coletor' : 'Silêncio identificado'}</span></td><td><span class="badge ${recorte.aberta ? 'open' : ''}">${recorte.aberta ? 'Em andamento' : 'Encerrada'}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function renderizarGtfs(gtfs) {
  if (gtfs.situacao === 'SEM_VERSAO_VIGENTE') {
    el('gtfs').innerHTML = '<span class="badge ambiguous">Sem versão vigente</span><p class="muted">Não há GTFS com vigência registrada para este dia. Nenhuma versão foi escolhida automaticamente.</p>';
    return;
  }
  if (gtfs.situacao === 'AMBIGUA') {
    el('gtfs').innerHTML = `<span class="badge ambiguous">Vigências sobrepostas</span><p class="muted">Mais de uma versão cobre este dia. Não é possível indicar uma única referência.</p>${gtfs.candidatas.map(v => `<div class="candidate"><strong>${h(v.id)}</strong><p class="muted">${h(dataCurta(v.vigencia_inicio))} → ${v.vigencia_fim ? h(dataCurta(v.vigencia_fim)) : 'sem fim registrado'}</p></div>`).join('')}`;
    return;
  }
  const v = gtfs.versao;
  el('gtfs').innerHTML = `<span class="badge current">Versão vigente</span><dl class="gtfs-data"><dt>Identificador</dt><dd>${h(v.id)}</dd><dt>Vigência</dt><dd>${h(dataCurta(v.vigencia_inicio))} → ${v.vigencia_fim ? h(dataCurta(v.vigencia_fim)) : 'sem fim registrado'}</dd><dt>Capturada em</dt><dd>${h(horario(v.capturada_em, true))}</dd><dt>Hash SHA-256</dt><dd class="gtfs-hash">${h(v.hash)}</dd></dl><p class="gtfs-note">Referência da rede para a data selecionada. A troca de dia pode mostrar outra versão.</p>`;
}
el('periodo').addEventListener('submit', evento => { evento.preventDefault(); carregar(); });
el('tentar').addEventListener('click', carregar);
el('dias').addEventListener('click', evento => { const b = evento.target.closest('[data-dia]'); if (b) { indice = Number(b.dataset.dia); renderizarDia(); } });
el('anterior').addEventListener('click', () => { if (indice > 0) { indice--; renderizarDia(); } });
el('proximo').addEventListener('click', () => { if (indice < relatorio.dias.length - 1) { indice++; renderizarDia(); } });
el('janelas').addEventListener('click', evento => { const b = evento.target.closest('[data-janela]'); if (b) selecionarJanela(Number(b.dataset.janela)); });
el('janelas').addEventListener('keydown', evento => {
  const b = evento.target.closest('[data-janela]');
  if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(evento.key)) return;
  evento.preventDefault();
  const colunas = getComputedStyle(el('janelas')).gridTemplateColumns.split(' ').length;
  const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -colunas, ArrowDown: colunas };
  const novo = evento.key === 'Home' ? 0 : evento.key === 'End' ? 95 : Number(b.dataset.janela) + passos[evento.key];
  selecionarJanela(Math.max(0, Math.min(95, novo)), true);
});
carregar();
