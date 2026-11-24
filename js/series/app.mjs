import { buscarSeries } from './cliente.mjs';
import { CAMPOS, TIPOS, buscaDaSelecao, contagensFormatadas, dataHora, lerSelecao, validarFiltros, valorFormatado } from './modelo.mjs';
import { escapar as h } from '../qualidade/modelo.mjs';
import { instalarGraficos } from './graficos.mjs';

instalarGraficos();

const el = id => document.getElementById(id);
const form = el('filtros-series');
const base = document.querySelector('meta[name="api-base"]').content;
let controle = null, pagina = 1, bloqueadoAte = 0, timer = null;
const campos = () => Object.fromEntries(CAMPOS.map(c => [c, form.elements[c].value]));

function limparResultado() {
  el('resultado-series').hidden = true;
  document.dispatchEvent(new CustomEvent('series:limpar'));
}

function renderizar(resposta, filtros) {
  const { dados, paginacao, historico, lacunas } = resposta;
  el('cenario-sintetico').hidden = !dados.some(p => p.qualidade.origem === 'SINTETICA');
  const sentido = filtros.sentido === '0' ? 'Ida' : 'Volta';
  el('titulo-resultado').textContent = `${filtros.linha} · ${sentido}`;
  el('resumo-filtros').textContent = `${TIPOS[filtros.tipo]} · ${filtros.inicio || 'Desde o início'} a ${filtros.fim || 'último resultado'}${filtros.hora_inicio ? ` · ${filtros.hora_inicio}–${filtros.hora_fim}` : ' · dia inteiro'} · ${resposta.consulta.inicio ? `período efetivo ${dataHora(resposta.consulta.inicio)} a ${dataHora(resposta.consulta.fim)}` : 'período fora do histórico coletado'}`;
  el('limites-historico').textContent = historico.inicio_indicadores ? `${dataHora(historico.inicio_indicadores)} a ${dataHora(historico.fim_indicadores)}` : 'Nenhum indicador publicado ainda';
  el('inicio-coleta').textContent = historico.coleta_inicio ? `Coleta do projeto iniciada em ${dataHora(historico.coleta_inicio)}` : 'Início da coleta ainda não informado';
  el('sem-resultados').hidden = dados.length > 0;
  el('valores-series').innerHTML = dados.map(p => `<tr><td>${h(dataHora(p.inicio))}<small>até ${h(dataHora(p.fim))}</small></td><td><strong class="${p.valor === null ? 'sem-valor' : ''}">${h(valorFormatado(p.valor, p.unidade))}</strong>${p.valor === null ? `<small>Unidade: ${h(p.unidade)} · ausência preservada</small>` : ''}<small>Contagens: ${h(contagensFormatadas(p.contagens))}</small></td><td><details><summary>Ver versões</summary><small>Conjunto: ${h(p.versao_conjunto)}</small><small>Rede GTFS: ${h(p.versao_gtfs_id)}</small><small>Cálculo: ${h(p.versao_calculo ?? 'Não informado')}</small><small>Correspondência: ${h(p.versao_correspondencia ?? 'Não informada')}</small><small>Reconstrução: ${h(p.qualidade.versao_reconstrucao ?? 'Não informada')}</small></details></td></tr>`).join('');
  el('total-resultados').textContent = `${paginacao.total} ${paginacao.total === 1 ? 'resultado' : 'resultados'} · até ${paginacao.page_size} por página`;
  el('paginacao-series').hidden = paginacao.total <= paginacao.page_size;
  el('pagina-series').textContent = `Página ${pagina} de ${Math.max(1, Math.ceil(paginacao.total / paginacao.page_size))}`;
  el('anterior-series').disabled = pagina <= 1;
  el('proxima-series').disabled = pagina * paginacao.page_size >= paginacao.total;
  el('total-lacunas').textContent = `(${lacunas.length}${resposta.consulta.lacunas_truncadas ? '+' : ''})`;
  el('lacunas-series').innerHTML = lacunas.map(l => `<li>${h(dataHora(l.inicio))} a ${h(dataHora(l.fim))} · ${l.motivo === 'RESULTADO_NULO' ? 'Resultado indisponível' : 'Sem publicação'}</li>`).join('');
  el('nenhuma-lacuna').hidden = lacunas.length !== 0;
  el('aviso-lacunas').hidden = !resposta.consulta.lacunas_truncadas;
  el('resultado-series').hidden = false;
  document.dispatchEvent(new CustomEvent('series:resultado', { detail: { resposta, filtros: { ...filtros } } }));
}

async function consultar({ resetarPagina = false } = {}) {
  controle?.abort();
  const atual = new AbortController();
  controle = atual;
  if (resetarPagina) pagina = 1;
  const selecionados = campos();
  history.replaceState(null, '', `${location.pathname}?${buscaDaSelecao(selecionados, pagina)}`);
  limparResultado();
  form.removeAttribute('aria-busy');
  el('erro-series').hidden = true;
  el('carregando-series').hidden = true;
  el('orientacao').hidden = Boolean(selecionados.linha);
  if (!selecionados.linha) return;
  try {
    const filtros = validarFiltros(selecionados);
    if (!form.reportValidity()) return;
    if (Date.now() < bloqueadoAte) throw new Error('Aguarde o prazo informado antes de consultar novamente.');
    el('carregando-series').hidden = false;
    form.setAttribute('aria-busy', 'true');
    const resposta = await buscarSeries(base, filtros, pagina, { signal: atual.signal });
    if (controle !== atual || atual.signal.aborted) return;
    // Endereço salvo com página além do total: volta à primeira em vez de sugerir ausência.
    if (!resposta.dados.length && resposta.paginacao.total > 0 && pagina > 1) { pagina = 1; return consultar(); }
    renderizar(resposta, filtros);
  } catch (erro) {
    if (controle !== atual || atual.signal.aborted) return;
    el('erro-texto').textContent = erro.message;
    el('erro-series').hidden = false;
    if (erro.tentarEm) {
      bloqueadoAte = Date.now() + erro.tentarEm * 1000;
      el('tentar-series').disabled = true;
      clearTimeout(timer);
      timer = setTimeout(() => { el('tentar-series').disabled = false; }, erro.tentarEm * 1000);
    }
  } finally {
    if (controle === atual) {
      el('carregando-series').hidden = true;
      form.removeAttribute('aria-busy');
    }
  }
}

function restaurar() {
  const filtros = lerSelecao(location.search);
  for (const campo of CAMPOS) form.elements[campo].value = filtros[campo];
  const numero = Number(new URLSearchParams(location.search).get('page'));
  pagina = Number.isSafeInteger(numero) && numero > 0 ? numero : 1;
}

form.addEventListener('submit', e => { e.preventDefault(); void consultar({ resetarPagina: true }); });
form.addEventListener('change', () => { void consultar({ resetarPagina: true }); });
form.addEventListener('reset', e => {
  e.preventDefault();
  for (const campo of CAMPOS) form.elements[campo].value = campo === 'sentido' ? '0' : campo === 'tipo' ? 'PONTUALIDADE_VIAGENS' : '';
  void consultar({ resetarPagina: true });
});
el('tentar-series').addEventListener('click', () => { void consultar(); });
el('anterior-series').addEventListener('click', () => { pagina = Math.max(1, pagina - 1); void consultar(); });
el('proxima-series').addEventListener('click', () => { pagina += 1; void consultar(); });
window.addEventListener('popstate', () => { restaurar(); void consultar(); });
restaurar();
void consultar();
// O catálogo local é apenas uma ajuda de preenchimento, não uma lista de histórico disponível.
fetch('data/linhas-sptrans.json').then(r => r.ok ? r.json() : null).then(catalogo => {
  if (catalogo?.linhas && typeof catalogo.linhas === 'object') {
    el('linhas').innerHTML = Object.keys(catalogo.linhas).map(l => `<option value="${h(l)}"></option>`).join('');
  }
}).catch(() => {});
