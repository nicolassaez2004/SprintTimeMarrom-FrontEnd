const abas = new Map([
  ['qualidade', { painel: 'painel-qualidade', carregar: () => import('./qualidade/app.mjs') }],
  ['acervo', { painel: 'painel-acervo', carregar: () => import('./acervo.mjs') }],
]);
const links = document.querySelectorAll('[data-aba]');
let selecao = 0;

async function mostrarAba() {
  const atual = ++selecao;
  const fragmento = location.hash.slice(1);
  const aba = abas.has(fragmento) ? fragmento : 'qualidade';
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
