import { buscarDocumentos, obterPdf } from './acervo-api.mjs';

const el = id => document.getElementById(id);
const base = document.querySelector('meta[name="api-base"]').content;
const formulario = el('filtros');
const visor = el('visor');
let filtros = {};
let pagina = 1;
let busca;
let consultaPdf;
let pdfUrl;
let botaoPdf;

function criar(tag, texto, classe) {
  const elemento = document.createElement(tag);
  elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function cancelarPdf() {
  consultaPdf?.abort();
  consultaPdf = undefined;
  if (visor.open) visor.close();
}

async function abrirPdf(documento, botao, aviso) {
  cancelarPdf();
  const controle = new AbortController();
  consultaPdf = controle;
  botao.disabled = true;
  aviso.textContent = 'Carregando PDF…';
  const limite = setTimeout(() => controle.abort('timeout'), 20000);
  try {
    const original = await obterPdf(base, documento.id, { signal: controle.signal });
    if (consultaPdf !== controle || controle.signal.aborted) return;
    pdfUrl = URL.createObjectURL(original);
    botaoPdf = botao;
    el('pdf-titulo').textContent = documento.titulo;
    el('pdf').src = pdfUrl;
    el('pdf-link').href = pdfUrl;
    botao.disabled = false;
    aviso.textContent = '';
    visor.showModal();
  } catch {
    if (consultaPdf === controle) aviso.textContent = 'O PDF original está indisponível. Tente novamente.';
  } finally {
    clearTimeout(limite);
    botao.disabled = false;
    if (consultaPdf !== controle) aviso.textContent = '';
  }
}

visor.addEventListener('close', () => {
  el('pdf').removeAttribute('src');
  el('pdf-link').removeAttribute('href');
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = undefined;
  if (botaoPdf?.isConnected) botaoPdf.focus();
});

function mostrarDocumento(documento) {
  const item = criar('li', '', 'documento');
  const dados = criar('div', '');
  dados.append(
    criar('p', documento.tipo, 'tipo'),
    criar('h3', documento.titulo),
    criar('p', 'Órgão: ' + documento.orgao),
    criar('p', 'Data do documento: ' + documento.data),
  );
  const acoes = criar('div', '');
  if (documento.id) {
    const aviso = criar('p', '', 'pdf-erro');
    aviso.setAttribute('role', 'status');
    const botao = criar('button', 'Abrir PDF original', 'button secondary');
    botao.type = 'button';
    botao.setAttribute('aria-label', 'Abrir PDF original de ' + documento.titulo);
    botao.addEventListener('click', () => abrirPdf(documento, botao, aviso));
    acoes.append(botao, aviso);
  } else {
    acoes.append(criar('p', 'Original indisponível: identificação ausente.'));
  }
  item.append(dados, acoes);
  return item;
}

async function carregar(numero) {
  busca?.abort();
  cancelarPdf();
  const controle = new AbortController();
  busca = controle;
  const limite = setTimeout(() => controle.abort('timeout'), 20000);
  el('lista').replaceChildren();
  el('paginacao').hidden = true;
  el('acervo-erro').hidden = true;
  el('estado').textContent = 'Buscando documentos…';

  try {
    const { itens, paginacao } = await buscarDocumentos(base, filtros, numero, { signal: controle.signal });
    if (busca !== controle || controle.signal.aborted) return;
    pagina = paginacao.pagina;
    if (paginacao.total === 0) {
      el('estado').textContent = 'Nenhum documento encontrado. Ajuste ou limpe os filtros.';
      return;
    }
    el('estado').textContent = paginacao.total + (paginacao.total === 1 ? ' documento' : ' documentos') +
      ' · Página ' + pagina + ' de ' + paginacao.paginas;
    el('lista').replaceChildren(...itens.map(mostrarDocumento));
    el('paginacao').hidden = paginacao.paginas <= 1;
    el('acervo-anterior').disabled = pagina <= 1;
    el('proxima').disabled = pagina >= paginacao.paginas;
  } catch (erro) {
    if (busca !== controle) return;
    el('estado').textContent = '';
    el('acervo-erro').hidden = false;
    el('acervo-erro').textContent = controle.signal.reason === 'timeout'
      ? 'A busca demorou mais que o esperado. Tente novamente.'
      : erro instanceof TypeError || erro instanceof SyntaxError
        ? 'Não foi possível consultar o acervo. Confira se o backend está disponível.'
        : erro.message;
  } finally {
    clearTimeout(limite);
  }
}

formulario.addEventListener('submit', evento => {
  evento.preventDefault();
  filtros = Object.fromEntries(new FormData(formulario));
  carregar(1);
});
formulario.addEventListener('reset', () => {
  filtros = {};
  carregar(1);
});
el('acervo-anterior').addEventListener('click', () => carregar(pagina - 1));
el('proxima').addEventListener('click', () => carregar(pagina + 1));
carregar(1);
