function carregarMapa() {
  const iframe = document.getElementById('mapa-incorporado');
  if (!iframe.hasAttribute('src')) iframe.src = iframe.dataset.src;
}

const abas = new Map([
  ['mapa', { painel: 'painel-mapa', carregar: carregarMapa }],
  ['qualidade', { painel: 'painel-qualidade', carregar: () => import('./qualidade/app.mjs') }],
  ['acervo', { painel: 'painel-acervo', carregar: () => import('./acervo/app.mjs') }],
]);
const links = document.querySelectorAll('[data-aba]');
let selecao = 0;
let abaVisivel = 'mapa';

async function mostrarAba() {
  const atual = ++selecao;
  const fragmento = location.hash.slice(1);
  // Âncoras internas como #conteudo não mudam a seção exibida.
  if (abas.has(fragmento)) abaVisivel = fragmento;
  else if (!fragmento) abaVisivel = 'mapa';
  else if (fragmento === 'como-ler') abaVisivel = 'qualidade';
  const aba = abaVisivel;
  const erro = document.getElementById('erro-site');
  erro.hidden = true;

  for (const [nome, dados] of abas) {
    document.getElementById(dados.painel).hidden = nome !== aba;
  }
  for (const link of links) {
    if (link.dataset.aba === aba) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  try {
    await abas.get(aba).carregar();
  } catch (falha) {
    if (atual === selecao) erro.hidden = false;
    console.error('Falha ao carregar a seção do Observa SP.', falha);
  }
}

window.addEventListener('hashchange', mostrarAba);
mostrarAba();
