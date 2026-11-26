import { API_BASE } from '../comum/config.mjs';
import { escapar as h } from '../comum/formatacao.mjs';
import { dataHora, valorFormatado } from '../series/modelo.mjs';
import { buscarMapa, buscarRedes } from './cliente.mjs';
import { criarMapa } from './mapa.mjs';
import { CAMPOS_MAPA, CORES, COR_AUSENCIA, classeDaFeicao, codigoFeicao, cortesPadrao,
  legendaFaixas, nomeFeicao, normalizarBusca, parametrosMapa, qualidadeDoRecorte, recortesDaPagina, selecaoInicial, territorial,
  textoQualidade, validarCortes } from './modelo.mjs';

const el = id => document.getElementById(id);
const form = el('filtros-mapa'), mapa = criarMapa(el('mapa-indicadores'));
let controle = null, corpo = null, recortes = [], ativos = [], pagina = 1, paginaRedes = 1, visual = 0;
let cortes = [], ultimoTipo = '', recortePreferido = '', bloqueadoAte = 0;
const filtros = () => Object.fromEntries(CAMPOS_MAPA.map(c => [c, form.elements[c].value.trim()]));

function salvarEndereco() {
  const args = new URLSearchParams();
  for (const [c, v] of Object.entries(filtros())) if (v) args.set(c, v);
  args.set('cortes', cortes.join(','));
  if (pagina > 1) args.set('page', String(pagina));
  if (el('recorte-mapa').value) args.set('recorte', el('recorte-mapa').value);
  history.replaceState(null, '', `${location.pathname}?${args}`);
}

function preencherCortes(valores) {
  cortes = validarCortes(valores);
  valores.forEach((v, i) => { el(`corte-${i}`).value = v; });
  el('erro-cores').textContent = '';
}

function limparApresentacao() {
  visual += 1; mapa.limpar(); corpo = null; ativos = []; recortes = [];
  el('resultado-mapa').hidden = true; el('erro-mapa').hidden = true; el('vazio-mapa').hidden = true;
  el('unidade-mapa').textContent = 'Não informada'; el('periodo-mapa').textContent = '';
  el('busca-local').value = ''; el('localizacao-status').textContent = ''; el('qualidade-mapa').hidden = true;
}

// US26: cada local com janela publicada mostra o estado recebido da API (incompleta ou indeterminada).
function marcaQualidade(q) {
  const texto = textoQualidade(q);
  if (texto.aviso) return `<small class="coleta-incompleta">⚠ ${h(texto.texto)}</small>`;
  return texto.indeterminada ? `<small class="coleta-indeterminada">${h(texto.texto)}</small>` : '';
}

function renderizarLista() {
  const busca = normalizarBusca(el('busca-local').value);
  const selecionados = ativos.map((f, i) => ({ f, i })).filter(({ f }) => normalizarBusca(`${nomeFeicao(f)} ${codigoFeicao(f)}`).includes(busca));
  el('lista-locais').innerHTML = selecionados.map(({ f, i }) => {
    const p = f.properties, classe = classeDaFeicao(f, cortes);
    const motivo = p.ausencia ? (corpo.legenda.ausencia[p.ausencia] ?? p.ausencia) : '';
    return `<tr><td><strong>${h(nomeFeicao(f))}</strong><small>${h(codigoFeicao(f))}</small>${p.territorio_ausente ? '<small>Sem vínculo territorial</small>' : ''}</td><td><span class="amostra-cor ${classe.indice === null ? 'sem-resultado' : ''}" style="--cor:${classe.cor}"></span><strong>${h(valorFormatado(p.valor, p.unidade ?? ''))}</strong><small>${h(classe.rotulo)}</small>${motivo ? `<small>${h(motivo)}</small>` : ''}${p.inicio ? marcaQualidade(p.qualidade_coleta) : ''}</td><td><button class="button secondary" type="button" data-localizar="${i}" aria-label="Localizar ${h(nomeFeicao(f))}">Localizar</button></td></tr>`;
  }).join('');
  el('lista-vazia').hidden = selecionados.length !== 0;
  el('contagem-locais').textContent = `${selecionados.length} de ${ativos.length} locais neste recorte`;
}

function renderizarRecorte() {
  const escolhido = recortes.find(r => r.chave === el('recorte-mapa').value) ?? recortes[0];
  if (!escolhido) return;
  ativos = escolhido.features;
  el('unidade-mapa').textContent = escolhido.unidade ?? 'Não informada';
  el('periodo-mapa').textContent = escolhido.inicio ? `${dataHora(escolhido.inicio)} a ${dataHora(escolhido.fim)}` : 'Nenhuma janela publicada para estas áreas';
  const textos = legendaFaixas(cortes, escolhido.unidade);
  el('legenda-faixas').innerHTML = (escolhido.unidade ? textos.map((t, i) => `<li><i style="--cor:${CORES[i]}"></i><span>${h(t)}</span></li>`).join('') : '')
    + `<li><i class="sem-resultado" style="--cor:${COR_AUSENCIA}"></i><span>Sem resultado · não é zero</span></li>`;
  el('aviso-unidade').hidden = !ativos.some(f => f.properties.ausencia === 'AGREGACAO_NAO_SUPORTADA');
  el('aviso-territorio').hidden = corpo.ausencia !== 'VERSAO_TERRITORIAL_INDISPONIVEL';
  const coleta = escolhido.inicio ? qualidadeDoRecorte(ativos) : null;
  el('qualidade-mapa').hidden = !coleta;
  el('qualidade-mapa').className = `message ${coleta?.aviso ? 'warning' : 'info'}`;
  el('qualidade-mapa').textContent = coleta?.texto ?? '';
  renderizarLista(); salvarEndereco();
  const atual = ++visual;
  el('erro-base-mapa').hidden = true; el('desenhando-mapa').hidden = false;
  mapa.mostrar(ativos, cortes, corpo.legenda).then(() => {
    if (atual === visual) el('desenhando-mapa').hidden = true;
  }).catch(() => {
    if (atual !== visual) return;
    el('desenhando-mapa').hidden = true; el('erro-base-mapa').hidden = false;
  });
}

function apresentar(resposta, f) {
  corpo = resposta;
  el('resultado-mapa').hidden = false;
  el('referencia-rede').textContent = f.versao_gtfs_id;
  const territorio = resposta.versao_territorial;
  if (territorio && !f.versao_territorial_id) form.elements.versao_territorial_id.value = territorio.id;
  el('fonte-mapa').textContent = `Valores: indicadores publicados pelo Observa SP. Limites: ${territorio ? `${territorio.fonte} · ${territorio.versao_fonte}` : 'não disponíveis'}.`;
  el('referencia-territorio').textContent = territorio?.id ?? 'Não informada';
  el('cenario-mapa').hidden = !(territorio?.fonte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('SINTETIC')
    || resposta.features.some(p => p.properties.qualidade?.origem === 'SINTETICA'));
  el('pagina-mapa').textContent = `Página ${pagina} de ${Math.max(1, Math.ceil(resposta.paginacao.total / 100))} · ${resposta.paginacao.total} registros na consulta`;
  el('paginacao-mapa').hidden = resposta.paginacao.total <= 100;
  el('anterior-mapa').disabled = pagina <= 1;
  el('proximo-mapa').disabled = pagina * 100 >= resposta.paginacao.total;
  recortes = recortesDaPagina(resposta);
  el('recorte-mapa').replaceChildren(...recortes.map(r => new Option(r.titulo, r.chave)));
  if (recortes.some(r => r.chave === recortePreferido)) el('recorte-mapa').value = recortePreferido;
  if (!resposta.features.length) {
    const periodo = parametrosMapa(f, pagina);
    el('periodo-mapa').textContent = `${dataHora(periodo.get('inicio'))} a ${dataHora(periodo.get('fim'))}`;
    el('conteudo-mapa').hidden = true; el('vazio-mapa').hidden = false;
    el('vazio-mapa').textContent = 'Nenhum indicador atende aos filtros e à rede selecionada. Ausência de resultado não significa zero.';
    salvarEndereco(); return;
  }
  el('conteudo-mapa').hidden = false;
  renderizarRecorte();
}

function adicionarRede(rede) {
  const seletor = form.elements.versao_gtfs_id;
  if ([...seletor.options].some(o => o.value === rede.id)) return;
  const data = rede.inicio && Number.isFinite(Date.parse(rede.inicio)) ? `${dataHora(rede.inicio)} · ` : '';
  seletor.add(new Option(`${data}rede ${rede.id.slice(0, 8)}`, rede.id));
}

async function consultar({ resetar = false, redes = false, mais = false } = {}) {
  controle?.abort();
  const atual = new AbortController(); controle = atual;
  if (resetar) { pagina = 1; recortePreferido = ''; }
  limparApresentacao();
  el('carregando-mapa').hidden = false; form.setAttribute('aria-busy', 'true');
  try {
    if (!form.elements.inicio.reportValidity() || !form.elements.fim.reportValidity()) return;
    if (Date.now() < bloqueadoAte) throw new Error('Aguarde o prazo do limite de consultas antes de tentar novamente.');
    let f = filtros();
    parametrosMapa(f, pagina, { exigirRede: false });
    if (!f.versao_gtfs_id || redes) {
      if (!mais) { paginaRedes = 1; form.elements.versao_gtfs_id.replaceChildren(new Option('Selecione uma rede', '')); }
      else paginaRedes += 1;
      const catalogo = await buscarRedes(API_BASE, f, paginaRedes, { signal: atual.signal });
      if (controle !== atual || atual.signal.aborted) return;
      catalogo.redes.forEach(adicionarRede);
      el('mais-redes').hidden = !catalogo.mais;
      const seletor = form.elements.versao_gtfs_id;
      if ([...seletor.options].some(o => o.value === f.versao_gtfs_id)) seletor.value = f.versao_gtfs_id;
      if (!seletor.value && seletor.options.length === 2) seletor.value = seletor.options[1].value;
      el('estado-redes').textContent = seletor.options.length > 1 ? 'Redes encontradas nos indicadores publicados. Escolha uma versão para fixar a geometria.' : 'Nenhuma rede com indicadores encontrada para estes filtros.';
      f = filtros();
      if (!f.versao_gtfs_id) { salvarEndereco(); return; }
    }
    const resposta = await buscarMapa(API_BASE, f, pagina, { signal: atual.signal });
    if (controle !== atual || atual.signal.aborted) return;
    if (!resposta.features.length && resposta.paginacao.total > 0 && pagina > 1) { pagina = 1; return consultar(); }
    apresentar(resposta, f);
  } catch (erro) {
    if (controle !== atual || atual.signal.aborted) return;
    el('erro-mapa-texto').textContent = erro.message; el('erro-mapa').hidden = false;
    if (erro.tentarEm) bloqueadoAte = Date.now() + erro.tentarEm * 1000;
  } finally {
    if (controle === atual) { el('carregando-mapa').hidden = true; form.removeAttribute('aria-busy'); }
  }
}

function restaurar() {
  const f = selecaoInicial(location.search);
  if (f.versao_gtfs_id) adicionarRede({ id: f.versao_gtfs_id });
  for (const c of CAMPOS_MAPA) form.elements[c].value = f[c];
  ultimoTipo = f.tipo;
  const args = new URLSearchParams(location.search);
  pagina = /^\d+$/.test(args.get('page') ?? '') ? Math.max(1, Math.min(2147483647, Number(args.get('page')))) : 1;
  recortePreferido = args.get('recorte') ?? '';
  try { preencherCortes(args.has('cortes') ? args.get('cortes').split(',') : cortesPadrao(f.tipo)); }
  catch { preencherCortes(cortesPadrao(f.tipo)); el('erro-cores').textContent = 'Faixas do endereço inválidas. Os limites padrão estão indicados nos campos.'; }
  el('base-agregacao').hidden = !territorial(f.escopo);
}

form.addEventListener('submit', e => { e.preventDefault(); void consultar({ resetar: true }); });
form.addEventListener('change', e => {
  if (e.target.name === 'escopo') { form.elements.codigo.value = ''; el('base-agregacao').hidden = !territorial(form.elements.escopo.value); }
  if (form.elements.tipo.value !== ultimoTipo) { ultimoTipo = form.elements.tipo.value; preencherCortes(cortesPadrao(ultimoTipo)); }
  void consultar({ resetar: true });
});
form.addEventListener('reset', e => { e.preventDefault(); history.replaceState(null, '', location.pathname); restaurar(); void consultar({ redes: true }); });
el('buscar-redes').addEventListener('click', () => { void consultar({ redes: true, resetar: true }); });
el('mais-redes').addEventListener('click', () => { void consultar({ redes: true, mais: true, resetar: true }); });
el('tentar-mapa').addEventListener('click', () => { void consultar(); });
el('recorte-mapa').addEventListener('change', () => { recortePreferido = el('recorte-mapa').value; renderizarRecorte(); });
el('cores-mapa').addEventListener('submit', e => {
  e.preventDefault();
  try { preencherCortes([0, 1, 2].map(i => el(`corte-${i}`).value)); if (corpo) renderizarRecorte(); }
  catch (erro) { el('erro-cores').textContent = erro.message; }
});
el('cores-mapa').addEventListener('input', () => { el('erro-cores').textContent = 'Faixas editadas. Use Aplicar faixas para atualizar a legenda e o mapa.'; });
el('busca-local').addEventListener('input', renderizarLista);
el('lista-locais').addEventListener('click', e => {
  const botao = e.target.closest('[data-localizar]');
  if (botao) el('localizacao-status').textContent = mapa.localizar(Number(botao.dataset.localizar)) ? 'Local destacado no mapa.' : 'O mapa ainda está carregando; os valores estão na tabela.';
});
el('ajustar-mapa').addEventListener('click', mapa.ajustar);
el('tentar-base-mapa').addEventListener('click', () => { if (corpo) renderizarRecorte(); });
el('imprimir-mapa').addEventListener('click', () => window.print());
el('anterior-mapa').addEventListener('click', () => { pagina = Math.max(1, pagina - 1); void consultar(); });
el('proximo-mapa').addEventListener('click', () => { pagina += 1; void consultar(); });
window.addEventListener('popstate', () => { restaurar(); void consultar(); });
restaurar();
void consultar();
