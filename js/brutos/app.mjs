import { ArquivoIndisponivel, consultarCatalogo, consultarDicionario, verificarArquivo } from './cliente.mjs';
import { tamanhoArquivo } from './modelo.mjs';
import { API_BASE as base } from '../comum/config.mjs';
import { instalarExtracao } from './extracao.mjs';
import { escapar as h, dataValida, dataExtensa, dataCurta, diaSemana, horario, hojeSP, numero } from '../comum/formatacao.mjs';

const el = id => document.getElementById(id);
let catalogo = null, consulta = null, consultaDicionario = null, download = null;
let diaSelecionado = '';

function selecionarDia(dia) {
  download?.abort();
  download = null;
  el('status-download').textContent = '';
  el('status-download').classList.remove('error');
  el('baixar-arquivo').removeAttribute('href');
  el('baixar-arquivo').setAttribute('aria-disabled', 'false');
  el('baixar-arquivo').innerHTML = 'Baixar Parquet <span aria-hidden="true">↓</span>';
  if (!dataValida(dia)) return;
  diaSelecionado = dia;
  el('dia').value = dia;
  el('selecao').hidden = false;
  el('titulo-arquivo').textContent = `registros_gps_${dia}.parquet`;
  el('data-arquivo').textContent = dataExtensa(dia);
  const arquivo = catalogo.datas.find(item => item.data === dia);
  document.querySelectorAll('[data-dia]').forEach(botao => botao.setAttribute('aria-pressed', String(botao.dataset.dia === dia)));
  el('arquivo-disponivel').hidden = !arquivo;
  el('arquivo-indisponivel').hidden = Boolean(arquivo);
  el('situacao-arquivo').textContent = arquivo ? 'Disponível' : 'Indisponível';
  el('situacao-arquivo').classList.toggle('unavailable', !arquivo);
  if (!arquivo) return;
  el('registros').textContent = numero(arquivo.registros);
  el('tamanho').textContent = tamanhoArquivo(arquivo.tamanho_bytes);
  el('gerado-em').textContent = `Gerado em ${horario(arquivo.gerado_em, true)} · horário de São Paulo`;
  el('baixar-arquivo').href = arquivo.url;
}

async function carregarDicionario() {
  if (!catalogo) return;
  consultaDicionario?.abort();
  const atual = new AbortController();
  consultaDicionario = atual;
  el('erro-dicionario').hidden = el('conteudo-dicionario').hidden = true;
  el('carregando-dicionario').textContent = 'Carregando o dicionário dos campos…';
  el('carregando-dicionario').hidden = false;
  el('tentar-dicionario').disabled = true;
  try {
    const dados = await consultarDicionario(catalogo.dicionario, { signal: atual.signal });
    if (consultaDicionario !== atual || atual.signal.aborted) return;
    el('recorte-dicionario').textContent = `${dados.formato}. ${dados.recorte}.`;
    el('campos-dicionario').innerHTML = dados.campos.map(campo => `<tr><td><code>${h(campo.nome)}</code><small>${h(campo.tipo)}</small></td><td>${h(campo.descricao)}</td><td>${h(campo.unidade || '—')}</td><td>${campo.anulavel ? 'Sim' : 'Não'}</td></tr>`).join('');
    el('publicacao-dicionario').textContent = `${dados.disponibilidade} · Licença: ${dados.licenca}`;
    el('conteudo-dicionario').hidden = false;
  } catch (erro) {
    if (atual.signal.aborted || consultaDicionario !== atual) return;
    el('erro-dicionario-texto').textContent = erro.message;
    el('erro-dicionario').hidden = false;
  } finally {
    if (consultaDicionario === atual) {
      el('carregando-dicionario').hidden = true;
      el('tentar-dicionario').disabled = false;
    }
  }
}

async function carregarCatalogo() {
  consulta?.abort();
  consultaDicionario?.abort();
  consultaDicionario = null;
  download?.abort();
  download = null;
  const atual = new AbortController();
  consulta = atual;
  catalogo = null;
  el('catalogo').hidden = el('erro-catalogo').hidden = true;
  el('conteudo-dicionario').hidden = el('erro-dicionario').hidden = true;
  el('dicionario-original').hidden = true;
  el('dicionario-original').removeAttribute('href');
  el('carregando-catalogo').hidden = false;
  el('carregando-dicionario').hidden = false;
  el('carregando-dicionario').textContent = 'O dicionário será consultado com o catálogo.';
  try {
    const dados = await consultarCatalogo(base, { signal: atual.signal });
    if (consulta !== atual || atual.signal.aborted) return;
    catalogo = dados;
    el('resumo-catalogo').textContent = `${numero(dados.total)} ${dados.total === 1 ? 'dia disponível' : 'dias disponíveis'} para download`;
    el('dias-disponiveis').innerHTML = dados.datas.map(arquivo => `<button class="available-day" type="button" data-dia="${arquivo.data}" aria-pressed="false"><span><strong>${h(dataCurta(arquivo.data))}/${arquivo.data.slice(0, 4)} <small>${h(diaSemana(arquivo.data))} · ${h(numero(arquivo.registros))} registros</small></strong></span><span aria-hidden="true">↗</span></button>`).join('');
    el('catalogo-vazio').hidden = dados.datas.length > 0;
    el('origem-catalogo').textContent = `Fonte: ${dados.fonte} · Licença: ${dados.licenca}`;
    el('dicionario-original').href = dados.dicionario;
    el('dicionario-original').hidden = false;
    el('catalogo').hidden = false;
    selecionarDia(el('dia').value || dados.datas[0]?.data || hojeSP());
    void carregarDicionario();
  } catch (erro) {
    if (atual.signal.aborted || consulta !== atual) return;
    el('erro-catalogo-texto').textContent = erro.message;
    el('erro-catalogo').hidden = false;
    el('carregando-dicionario').textContent = 'Atualize o catálogo acima para acessar o dicionário.';
  } finally {
    if (consulta === atual) el('carregando-catalogo').hidden = true;
  }
}

el('selecionar-dia').addEventListener('submit', evento => {
  evento.preventDefault();
  if (catalogo && el('selecionar-dia').reportValidity()) selecionarDia(el('dia').value);
});
el('dias-disponiveis').addEventListener('click', evento => {
  const botao = evento.target.closest('[data-dia]');
  if (botao && catalogo) selecionarDia(botao.dataset.dia);
});
for (const id of ['tentar-catalogo', 'atualizar-catalogo']) el(id).addEventListener('click', carregarCatalogo);
el('tentar-dicionario').addEventListener('click', carregarDicionario);

el('baixar-arquivo').addEventListener('click', async evento => {
  if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
  evento.preventDefault();
  const arquivo = catalogo?.datas.find(item => item.data === diaSelecionado);
  if (!arquivo || download || !el('baixar-arquivo').hasAttribute('href')) return;
  const atual = new AbortController();
  download = atual;
  el('baixar-arquivo').setAttribute('aria-disabled', 'true');
  el('status-download').classList.remove('error');
  el('status-download').textContent = 'Verificando a disponibilidade do arquivo…';
  try {
    await verificarArquivo(arquivo.url, { signal: atual.signal });
    if (download !== atual || atual.signal.aborted) return;
    // URL publicada pelo backend: o navegador recebe o anexo, sem Blob/gerador local.
    window.location.assign(arquivo.url);
    el('status-download').textContent = 'Download solicitado. Confira os downloads do navegador.';
  } catch (erro) {
    if (download !== atual || atual.signal.aborted) return;
    if (erro instanceof ArquivoIndisponivel) {
      el('arquivo-disponivel').hidden = true;
      el('arquivo-indisponivel').hidden = false;
      el('situacao-arquivo').textContent = 'Indisponível';
      el('situacao-arquivo').classList.add('unavailable');
      el('baixar-arquivo').removeAttribute('href');
    }
    el('status-download').textContent = erro.message;
    el('status-download').classList.add('error');
  } finally {
    if (download === atual) {
      download = null;
      el('baixar-arquivo').setAttribute('aria-disabled', 'false');
    }
  }
});

void carregarCatalogo();
instalarExtracao();
