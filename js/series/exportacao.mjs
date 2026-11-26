import { API_BASE } from '../comum/config.mjs';
import { requisitar, urlDaApi } from '../comum/http.mjs';
import { dataValida, hojeSP } from '../comum/formatacao.mjs';
import { dataHora, meiaNoiteSP, validarFiltros } from './modelo.mjs';
import { parametrosExportacao, registrosEsperados, textoVersao } from './painel-exportacao.mjs';

export class PeriodoIndisponivel extends Error {}
// CSV válido, mas só com o cabeçalho: não é erro nem arquivo útil para baixar.
export class SemRegistros extends PeriodoIndisponivel {}
// US25-T01: a versão exibida não pode mais ser recomposta (404/410); nunca trocar por outra.
export class VersaoIndisponivel extends Error {}

function diaSeguinte(dia) {
  const proximo = new Date(`${dia}T12:00:00Z`);
  proximo.setUTCDate(proximo.getUTCDate() + 1);
  return proximo.toISOString().slice(0, 10);
}

function instanteLocal(dia, hora) {
  return new Date(Date.parse(meiaNoiteSP(dia)) + (Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3))) * 60000).toISOString();
}

export function parametrosDownload(filtros, dia) {
  const f = validarFiltros(filtros);
  if (!dataValida(dia) || (f.inicio && dia < f.inicio) || (f.fim && dia > f.fim)) {
    throw new Error('Escolha um dia dentro do período selecionado.');
  }
  const args = new URLSearchParams({ formato: 'csv', linha: f.linha, sentido: f.sentido,
    tipo: f.tipo === 'ESPERA_ESTIMADA' ? 'ESPERA' : f.tipo });
  if (f.parada) args.set('parada', f.parada);
  if (!f.hora_inicio) args.set('data', dia);
  else {
    if (f.hora_fim < f.hora_inicio && f.hora_fim !== '00:00') {
      throw new Error('O CSV diário ainda não atende faixas que atravessam dois dias. Escolha uma faixa dentro do mesmo dia.');
    }
    args.set('inicio', instanteLocal(dia, f.hora_inicio));
    args.set('fim', f.hora_fim === '00:00' ? meiaNoiteSP(diaSeguinte(dia)) : instanteLocal(dia, f.hora_fim));
  }
  return args;
}

export function nomeDoArquivo(cabecalho) {
  if (!cabecalho) return null; // Cabeçalho não exposto por CORS: o navegador usa o nome da resposta nativa.
  if (!/^attachment\s*(?:;|$)/i.test(cabecalho)) throw new Error('O serviço não confirmou um arquivo para download.');
  const utf8 = /(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecalho);
  const simples = /(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(cabecalho);
  let nome;
  try { nome = utf8 ? decodeURIComponent(utf8[1].trim()) : (simples?.[1] ?? simples?.[2]?.trim()); }
  catch { throw new Error('O nome do arquivo recebido é inválido.'); }
  if (!nome || !/\.csv$/i.test(nome) || /[\\/\x00-\x1f\x7f]/.test(nome)) throw new Error('O nome do arquivo recebido é inválido.');
  return nome;
}

async function conferirResposta(resposta) {
  if (resposta.status === 429) {
    const prazo = Number(resposta.headers.get('Retry-After'));
    throw new Error(`Limite de consultas atingido. Aguarde ${prazo > 0 && Number.isFinite(prazo) ? Math.ceil(prazo) : 60} segundos.`);
  }
  if (!resposta.ok) {
    let corpo;
    try { corpo = await resposta.json(); } catch { /* Erro sem JSON continua sendo falha, nunca sucesso. */ }
    const erro = corpo?.erro;
    if (resposta.status === 404 && ['PERIODO_AINDA_NAO_CONSOLIDADO', 'CONSOLIDACAO_NAO_PUBLICADA'].includes(erro?.codigo)) {
      throw new PeriodoIndisponivel(`O arquivo deste dia ainda está indisponível.${erro.previsto_em ? ` Previsão: ${dataHora(erro.previsto_em)}.` : ' A consolidação ainda não foi publicada.'}`);
    }
    throw new Error('Não foi possível baixar o CSV. Tente novamente em instantes.');
  }
  if (resposta.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'text/csv') {
    throw new Error('O serviço não entregou um arquivo CSV. Tente novamente.');
  }
  if (resposta.headers.get('X-Total-Registros') === '0') {
    throw new SemRegistros('Não há indicadores publicados para estes filtros neste dia. Nenhum arquivo foi baixado.');
  }
  return nomeDoArquivo(resposta.headers.get('Content-Disposition'));
}

export async function prepararDownload(base, filtros, dia, opcoes = {}) {
  const url = urlDaApi('downloads/indicadores', base);
  url.search = parametrosDownload(filtros, dia).toString();
  const config = { ...opcoes, cache: 'no-store', headers: { Accept: 'text/csv, application/json' },
    mensagens: { conexao: 'Não foi possível conectar ao serviço de downloads.', formato: 'A resposta do serviço é inválida.' } };
  const cabecalho = await requisitar(url, async r => r, { ...config, method: 'HEAD' });
  if (cabecalho.ok) {
    const nome = await conferirResposta(cabecalho);
    // Sem Content-Disposition visível, preservar o nome pelo download nativo.
    // Não inventar um nome nem carregar o arquivo inteiro duas vezes.
    if (nome === null) return { modo: 'nativo', url: url.href };
  } else if (cabecalho.status !== 404) await conferirResposta(cabecalho);
  return requisitar(url, async r => {
    const nome = await conferirResposta(r);
    if (nome === null) { await r.body?.cancel(); return { modo: 'nativo', url: url.href }; }
    const arquivo = await r.blob();
    if (opcoes.signal?.aborted) throw new DOMException('Download cancelado', 'AbortError');
    if (arquivo.size === 0) throw new Error('O arquivo recebido está vazio. Tente novamente.');
    return { modo: 'arquivo', nome, arquivo };
  }, { ...config, method: 'GET' });
}

// Mesmo mecanismo de download do exportador existente, também usado pelo CSV do painel.
export function baixarArquivo(arquivo, nome) {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// US25-T03: CSV do painel = exportação da versão fixada no clique (US25-T01), com os mesmos
// filtros de /series. Só entrega o arquivo se versão, tipo e total conferem com o painel.
export async function baixarVersaoPainel(base, snapshot, opcoes = {}) {
  const url = urlDaApi('downloads/indicadores', base);
  url.search = parametrosExportacao(snapshot).toString();
  const id = snapshot.versaoDados.id;
  return requisitar(url, async r => {
    if (r.status === 429) {
      const prazo = Number(r.headers.get('Retry-After'));
      throw new Error(`Limite de consultas atingido. Aguarde ${prazo > 0 && Number.isFinite(prazo) ? Math.ceil(prazo) : 60} segundos. Nenhum arquivo foi baixado.`);
    }
    if (!r.ok) {
      let corpo;
      try { corpo = await r.json(); } catch { /* Erro sem JSON continua sendo falha. */ }
      if (r.status === 410 || corpo?.erro?.codigo === 'VERSAO_INEXISTENTE') {
        throw new VersaoIndisponivel(`A versão exibida (${id.slice(0, 8)}) não pode mais ser exportada. Recarregue o painel para exportar a versão atual. Nenhum arquivo foi baixado.`);
      }
      if (r.status === 400 && corpo?.erro?.mensagem) throw new Error(`${corpo.erro.mensagem} Nenhum arquivo foi baixado.`);
      throw new Error('Não foi possível gerar o CSV desta versão. Nenhum arquivo foi baixado.');
    }
    if (r.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'text/csv') {
      throw new Error('O serviço não entregou um arquivo CSV. Nenhum arquivo foi baixado.');
    }
    const versao = r.headers.get('X-Versao-Dados');
    if (versao !== null && versao.toLowerCase() !== id.toLowerCase()) {
      throw new Error('O serviço entregou outra versão dos dados. Nenhum arquivo foi baixado.');
    }
    const total = r.headers.get('X-Total-Registros');
    if (total !== null && Number(total) !== registrosEsperados(snapshot)) {
      throw new Error('O arquivo recebido não tem a mesma quantidade de resultados do painel. Nenhum arquivo foi baixado.');
    }
    const nome = nomeDoArquivo(r.headers.get('Content-Disposition')) ?? `indicadores_v${id.slice(0, 8)}.csv`;
    const arquivo = await r.blob();
    if (opcoes.signal?.aborted) throw new DOMException('Download cancelado', 'AbortError');
    if (arquivo.size === 0) throw new Error('O arquivo recebido está vazio. Nenhum arquivo foi baixado.');
    return { nome, arquivo, total: total === null ? null : Number(total), versao: id };
  // A recomposição de até 31 dias pode passar dos 20 s padrão das consultas.
  }, { timeoutMs: 120000, ...opcoes, method: 'GET', cache: 'no-store', headers: { Accept: 'text/csv, application/json' },
    mensagens: { conexao: 'Não foi possível conectar ao serviço de downloads. Nenhum arquivo foi baixado.' } });
}

export function instalarExportacaoPainel() {
  const painel = document.getElementById('exportacao-painel');
  const botao = document.getElementById('baixar-painel-csv');
  const status = document.getElementById('status-painel-csv');
  const versao = document.getElementById('versao-painel');
  let snapshot = null, controle = null;
  const cancelar = () => { controle?.abort(); controle = null; };
  document.addEventListener('series:limpar', () => {
    cancelar(); snapshot = null; painel.hidden = true; status.textContent = ''; botao.disabled = false;
  });
  document.addEventListener('series:resultado', evento => {
    // Uma atualização em segundo plano troca o painel, mas não a exportação já pedida.
    snapshot = evento.detail.snapshot;
    painel.hidden = !snapshot.resposta.dados.length;
    versao.textContent = snapshot.versaoDados ? textoVersao(snapshot.versaoDados) : snapshot.erroVersao;
    if (controle) return;
    botao.disabled = !snapshot.versaoDados;
    status.textContent = snapshot.versaoDados ? '' : 'Exportação em CSV indisponível para esta resposta.';
  });
  botao.addEventListener('click', async () => {
    if (!snapshot?.versaoDados || controle) return;
    const alvo = snapshot, atual = new AbortController();
    controle = atual; botao.disabled = true;
    status.textContent = `Gerando o CSV da versão ${alvo.versaoDados.id.slice(0, 8)}…`;
    try {
      const resultado = await baixarVersaoPainel(API_BASE, alvo, { signal: atual.signal });
      if (controle !== atual || atual.signal.aborted) return;
      baixarArquivo(resultado.arquivo, resultado.nome);
      const mudou = snapshot?.versaoDados?.id !== alvo.versaoDados.id;
      status.textContent = `Arquivo ${resultado.nome}: ${resultado.total ?? 'todos os'} resultados desta seleção (todas as páginas), versão ${alvo.versaoDados.id.slice(0, 8)}, com unidades, contagens, qualidade, fonte e licença.`
        + (mudou ? ' O painel foi atualizado durante a exportação; o arquivo corresponde à versão exibida no momento do clique.' : '');
    } catch (erro) {
      if (controle !== atual || atual.signal.aborted) return;
      status.textContent = erro.message;
    } finally {
      if (controle === atual) { controle = null; botao.disabled = !snapshot?.versaoDados; }
    }
  });
}

export function instalarExportacao() {
  const el = id => document.getElementById(id);
  const painel = el('exportacao-indicadores'), dia = el('dia-csv'), botao = el('baixar-csv'), status = el('status-csv');
  let filtros = null, controle = null, selecao = '';
  function cancelar() { controle?.abort(); controle = null; botao.disabled = false; }
  document.addEventListener('series:limpar', () => {
    cancelar(); filtros = null; painel.hidden = true; status.textContent = ''; selecao = '';
  });
  document.addEventListener('series:resultado', evento => {
    const nova = JSON.stringify(evento.detail.filtros);
    if (nova !== selecao) {
      cancelar(); status.textContent = ''; status.className = '';
      filtros = { ...evento.detail.filtros }; selecao = nova;
      dia.min = filtros.inicio; dia.max = filtros.fim;
      const fim = evento.detail.resposta.consulta?.fim;
      const ultimoDia = fim ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.parse(fim) - 1)) : hojeSP();
      dia.value = filtros.inicio || filtros.fim || ultimoDia;
    }
    painel.hidden = false;
  });
  dia.addEventListener('change', () => { cancelar(); status.textContent = ''; });
  botao.addEventListener('click', async () => {
    if (!filtros || controle || !dia.reportValidity()) return;
    const atual = new AbortController(); controle = atual; botao.disabled = true;
    status.className = ''; status.textContent = 'Verificando o arquivo consolidado…';
    try {
      const resultado = await prepararDownload(API_BASE, filtros, dia.value, { signal: atual.signal });
      if (controle !== atual || atual.signal.aborted) return;
      if (resultado.modo === 'arquivo') baixarArquivo(resultado.arquivo, resultado.nome);
      else {
        const link = document.createElement('a');
        link.href = resultado.url;
        // A resposta attachment inicia o download sem depender de pop-up após o HEAD.
        document.body.append(link); link.click(); link.remove();
      }
      status.textContent = resultado.modo === 'arquivo' ? `Arquivo recebido: ${resultado.nome}. Salvamento solicitado; confira os downloads do navegador.`
        : 'Arquivo disponível. Download solicitado; confira os downloads do navegador.';
    } catch (erro) {
      if (controle !== atual || atual.signal.aborted) return;
      status.className = erro instanceof PeriodoIndisponivel ? 'csv-indisponivel' : 'csv-erro';
      status.textContent = erro.message;
    } finally {
      if (controle === atual) { controle = null; botao.disabled = false; }
    }
  });
}
