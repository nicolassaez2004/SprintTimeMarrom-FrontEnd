// US30-T03B: painel público de saúde. Mostra o que GET /api/saude devolveu, serviço por serviço.
import { consultarSaude } from './cliente.mjs';
import { API_BASE } from '../comum/config.mjs';
import { escapar as h, numero, percentual, hojeSP, horario } from '../comum/formatacao.mjs';
import { DETALHES, SERVICOS, estadoAtual, minutosTexto, semMedicao, servicosAfetados, situacaoMeta, taxaPrincipal, validarMes } from './modelo.mjs';

const el = id => document.getElementById(id);
const mesAtual = hojeSP().slice(0, 7);
const parametros = new URLSearchParams(location.search);
let requisicao = null;

el('mes').max = mesAtual;
el('mes').value = /^\d{4}-\d{2}$/.test(parametros.get('mes') || '') && parametros.get('mes') <= mesAtual ? parametros.get('mes') : mesAtual;

const nomeMes = mes => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-15T12:00Z`));
const dataHora = instante => horario(instante, true);
const CLASSES = { OK: 'ok', FALHA: 'bad', SEM_MEDICAO: 'unknown', ATENDIDA: 'ok', NAO_ATENDIDA: 'bad', INDEFINIDA: 'unknown' };

function mostrarErro(mensagem) {
  el('erro-texto').textContent = mensagem;
  el('erro').hidden = false;
  el('relatorio').hidden = true;
}

async function carregar() {
  requisicao?.abort();
  let mes;
  try { mes = validarMes(el('mes').value, mesAtual); } catch (erro) { mostrarErro(erro.message); return; }
  const atual = new AbortController();
  requisicao = atual;
  el('erro').hidden = true;
  el('relatorio').hidden = true;
  el('carregamento').hidden = false;
  el('consultar').disabled = true;
  try {
    const relatorio = await consultarSaude(API_BASE, mes, { signal: atual.signal });
    if (atual !== requisicao) return;
    renderizar(relatorio);
    const url = new URL(location.href);
    url.searchParams.set('mes', mes);
    history.replaceState(null, '', url);
  } catch (erro) {
    if (!atual.signal.aborted && atual === requisicao) mostrarErro(erro.message);
  } finally {
    if (atual === requisicao) { el('carregamento').hidden = true; el('consultar').disabled = false; }
  }
}

function renderizar(relatorio) {
  const consultadoEm = new Date().toISOString();
  el('periodo').textContent = `${nomeMes(relatorio.mes)} · de ${dataHora(relatorio.inicio_utc)} até ${dataHora(relatorio.corte_exclusivo_utc)}`
    + (relatorio.mes_parcial ? ' (mês em andamento, apurado até o último minuto completo)' : ' (mês encerrado)');
  el('consultado').textContent = `Consultado em ${dataHora(consultadoEm)} · Horários de São Paulo`;

  const afetados = servicosAfetados(relatorio);
  const resumo = el('resumo');
  if (semMedicao(relatorio)) {
    resumo.className = 'message warning';
    resumo.innerHTML = '<p><strong>Não há medições neste período.</strong> A disponibilidade de todos os serviços é desconhecida; isso não indica que estavam funcionando.</p>';
  } else if (!afetados.length) {
    resumo.className = 'message info';
    resumo.innerHTML = '<p><strong>Nenhum serviço com falha registrada neste período.</strong> Isso vale para o que foi medido; minutos sem sondagem continuam desconhecidos.</p>';
  } else {
    resumo.className = 'message error';
    resumo.innerHTML = `<div><h2>Serviços afetados</h2><ul class="affected">${afetados.map(a => `<li><strong>${h(a.nome)}</strong>: ${h(a.atual.codigo === 'FALHA' ? a.atual.texto.toLowerCase() : a.atual.codigo === 'OK' ? 'funcionando na última medição' : a.atual.texto.toLowerCase())}${a.atual.ultima ? ` (${dataHora(a.atual.ultima.instante)})` : a.atual.desde ? ` desde ${dataHora(a.atual.desde)}` : ''}${a.incidentes ? ` · ${numero(a.incidentes)} ${a.incidentes === 1 ? 'incidente' : 'incidentes'} no período` : ''}</li>`).join('')}</ul></div>`;
  }

  el('servicos').innerHTML = SERVICOS.map(({ chave, nome, descricao }) => cartao(chave, nome, descricao, relatorio)).join('');
  el('incidentes').innerHTML = SERVICOS.map(({ chave, nome }) => incidentes(chave, nome, relatorio.servicos[chave])).join('');
  el('limites').innerHTML = [relatorio.politica_lacunas, ...relatorio.limites].map(t => `<li>${h(t)}</li>`).join('');
  el('relatorio').hidden = false;
}

function cartao(chave, nome, descricao, relatorio) {
  const servico = relatorio.servicos[chave];
  const atual = estadoAtual(chave, servico), meta = situacaoMeta(servico, relatorio), taxa = taxaPrincipal(chave, servico);
  const ultima = atual.ultima
    ? `Última sondagem: ${dataHora(atual.ultima.instante)} · ${h(DETALHES[atual.ultima.detalhe] ?? atual.ultima.detalhe)}${Number.isFinite(atual.ultima.latencia_ms) ? ` · ${numero(atual.ultima.latencia_ms)} ms` : ''}`
    : atual.desde ? `Desde ${dataHora(atual.desde)} · causa registrada: ${h(atual.causa ?? 'não informada')}` : '';
  const linhas = chave === 'COLETA'
    ? [['Ciclos esperados', numero(servico.ciclos_esperados)], ['Ciclos registrados', numero(servico.ciclos_registrados)],
       ['Falhas nossas', numero(servico.falhas_proprias)], ['Falhas da origem (excluídas)', numero(servico.falhas_fonte_excluidas)],
       ['Indeterminados ou sem registro', numero(servico.indeterminados_total)], ['Taxa máxima possível', percentual(servico.percentual_maximo)]]
    : [['Minutos com falha', numero(servico.minutos_falha)], ['Minutos sem sondagem', numero(servico.minutos_sem_medicao)],
       ['Cobertura do monitoramento', percentual(servico.percentual_cobertura)],
       ['Faixa possível no mês', servico.limite_inferior === null ? '—' : `${percentual(servico.limite_inferior)} a ${percentual(servico.limite_superior)}`]];
  return `<article class="panel service-card" aria-labelledby="titulo-${chave}">
    <div class="service-top"><div><h3 id="titulo-${chave}">${h(nome)}</h3><p class="muted">${h(descricao)}</p></div><span class="state ${CLASSES[atual.codigo]}">${h(atual.texto)}</span></div>
    <p class="service-rate"><span class="rate-value">${percentual(taxa.valor)}</span><span class="muted">${chave === 'COLETA' ? 'ciclos com sucesso' : 'disponibilidade observada'} · ${h(taxa.base)}</span></p>
    <p class="meta ${CLASSES[meta.codigo]}"><strong>${h(meta.texto)}</strong>${meta.motivo ? `<span>${h(meta.motivo)}</span>` : ''}</p>
    <dl class="service-data">${linhas.map(([t, v]) => `<div><dt>${h(t)}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${ultima ? `<p class="source-note">${ultima}</p>` : ''}
  </article>`;
}

function incidentes(chave, nome, servico) {
  const itens = servico.incidentes.itens.map(i => chave === 'COLETA'
    ? `<tr><td class="period">${dataHora(i.inicio)}</td><td>${i.fim ? dataHora(i.fim) : '<span class="badge open">Em aberto</span>'}</td><td class="cause">Lacuna na coleta · ${h(i.causa ?? 'causa não informada')}</td></tr>`
    : `<tr><td class="period">${dataHora(i.inicio)}</td><td>${dataHora(i.fim_exclusivo)}</td><td class="cause">Indisponível por ${minutosTexto(i.minutos)}</td></tr>`).join('');
  const lacunas = chave === 'COLETA' ? null : servico.lacunas_monitoramento;
  const truncado = servico.incidentes.truncado ? `<p class="source-note">Mostrando os ${numero(servico.incidentes.itens.length)} mais recentes de ${numero(servico.incidentes.total)}.</p>` : '';
  return `<section class="panel incident-panel" aria-labelledby="incidentes-${chave}">
    <div class="section-top"><h3 id="incidentes-${chave}">${h(nome)}</h3><span class="small-tag">${numero(servico.incidentes.total)} ${servico.incidentes.total === 1 ? 'incidente' : 'incidentes'}</span></div>
    ${itens ? `<div class="table-wrap"><table><thead><tr><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">O que aconteceu</th></tr></thead><tbody>${itens}</tbody></table></div>${truncado}` : '<p class="empty-state">Nenhum incidente registrado neste período.</p>'}
    ${lacunas && lacunas.total ? `<p class="gap-note">Sem sondagem em ${numero(lacunas.total)} ${lacunas.total === 1 ? 'intervalo' : 'intervalos'} (${minutosTexto(servico.minutos_sem_medicao)}): nesses minutos a disponibilidade é desconhecida, não é queda nem sucesso.</p>` : ''}
  </section>`;
}

el('filtro').addEventListener('submit', evento => { evento.preventDefault(); carregar(); });
el('tentar').addEventListener('click', carregar);
carregar();
