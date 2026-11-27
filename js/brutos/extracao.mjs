// US28-T03B: pedido de extração e acompanhamento do estado publicado pelo backend.
// Um timer e no máximo uma consulta por vez; para em pronto/erro ou ao deixar de acompanhar.
import { API_BASE } from '../comum/config.mjs';
import { numero } from '../comum/formatacao.mjs';
import { consultarExtracao, PedidoNaoEncontrado, solicitarExtracao } from './extracao-cliente.mjs';
import { corpoSolicitacao, ESTADOS, FINAIS } from './extracao-modelo.mjs';
import { tamanhoArquivo } from './modelo.mjs';

export const INTERVALO_EXTRACAO_MS = 5000;
// Falha temporária (rede, 503 com Retry-After) não encerra o acompanhamento: nova
// consulta com espera dobrada a cada falha seguida, até este teto.
export const ESPERA_MAXIMA_MS = 60000;
const CHAVE = 'observasp.extracao';
const PARAMETRO = 'extracao';
// Só o identificador opaco do último pedido; armazenamento bloqueado não impede o uso pela URL.
const armazenamentoLocal = {
  ler() { try { return globalThis.localStorage?.getItem(CHAVE) ?? null; } catch { return null; } },
  gravar(id) { try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } },
};
const dataHora = valor => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
const hora = valor => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', timeStyle: 'medium' }).format(valor);

export function instalarExtracao({ base = API_BASE, intervaloMs = INTERVALO_EXTRACAO_MS, esperaMaximaMs = ESPERA_MAXIMA_MS,
  armazenamento = armazenamentoLocal } = {}) {
  const el = id => document.getElementById(id), form = el('form-extracao');
  if (!form) return null;
  // `vez` muda a cada troca de pedido: um POST que termina depois não assume o acompanhamento.
  let idAtual = null, timer = null, controle = null, enviando = false, falhas = 0, vez = 0;

  function lembrar(id) {
    armazenamento.gravar(id);
    const busca = new URLSearchParams(location.search);
    if (id) busca.set(PARAMETRO, id); else busca.delete(PARAMETRO);
    const q = busca.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  }
  function parar() {
    clearTimeout(timer); timer = null;
    controle?.abort(); controle = null;
  }
  function falha(mensagem, podeTentar) {
    el('erro-acompanhamento-texto').textContent = mensagem;
    el('tentar-acompanhamento').hidden = !podeTentar;
    el('erro-acompanhamento').hidden = false;
  }

  function renderizar(p) {
    const estado = el('estado-extracao');
    estado.textContent = ESTADOS[p.estado].rotulo;
    estado.setAttribute('data-estado', p.estado);
    el('descricao-estado').textContent = p.mensagem ?? ESTADOS[p.estado].texto;
    el('extracao-id').textContent = p.id;
    el('extracao-linha').textContent = p.linha;
    el('extracao-periodo').textContent = `${dataHora(p.periodo.inicio)} a ${dataHora(p.periodo.fim)} (fim exclusivo)`;
    el('extracao-formato').textContent = p.formato;
    el('extracao-solicitado').textContent = dataHora(p.solicitado_em);
    el('detalhes-extracao').hidden = false;
    const progresso = p.estado === 'processando' ? p.progresso : null;
    el('progresso-extracao').hidden = !progresso;
    el('progresso-extracao').textContent = progresso
      ? `${numero(progresso.registros)} registros gravados até ${dataHora(progresso.atualizado_em)}, segundo o servidor.` : '';
    const baixar = el('baixar-extracao');
    el('extracao-pronta').hidden = !p.arquivo;
    if (p.arquivo) {
      baixar.setAttribute('href', p.arquivo.download);
      el('arquivo-extracao').textContent = `${p.arquivo.nome} · ${tamanhoArquivo(p.arquivo.tamanho_bytes)}${p.arquivo.sha256 ? ` · SHA-256 ${p.arquivo.sha256}` : ''}`;
    } else baixar.removeAttribute('href');
    el('consultado-em').textContent = `Consultado às ${hora(new Date())}. ${FINAIS.has(p.estado)
      ? 'Acompanhamento encerrado.' : `Nova consulta a cada ${Math.round(intervaloMs / 1000)} s.`}`;
  }

  async function consultar() {
    if (!idAtual || controle) return; // já há uma consulta em andamento
    clearTimeout(timer); timer = null;
    const atual = new AbortController();
    controle = atual;
    el('erro-acompanhamento').hidden = true;
    try {
      const pedido = await consultarExtracao(base, idAtual, { signal: atual.signal });
      if (controle !== atual) return;
      falhas = 0;
      renderizar(pedido);
      if (!FINAIS.has(pedido.estado)) timer = setTimeout(consultar, intervaloMs);
    } catch (erro) {
      if (controle !== atual) return;
      if (erro instanceof PedidoNaoEncontrado) {
        idAtual = null; lembrar(null);
        el('detalhes-extracao').hidden = el('extracao-pronta').hidden = el('progresso-extracao').hidden = true;
        el('estado-extracao').textContent = 'Não encontrado';
        el('estado-extracao').setAttribute('data-estado', 'erro');
        el('descricao-estado').textContent = el('consultado-em').textContent = '';
        falha(erro.message, false);
      } else {
        const espera = Math.min(intervaloMs * 2 ** falhas++, esperaMaximaMs);
        falha(`${erro.message} O pedido continua registrado; nenhuma nova extração será criada. `
          + `Nova consulta automática em ${Math.round(espera / 1000)} s.`, true);
        timer = setTimeout(consultar, espera);
      }
    } finally {
      if (controle === atual) controle = null;
    }
  }

  function acompanhar(id, inicial) {
    parar();
    vez++; falhas = 0;
    idAtual = id;
    lembrar(id);
    el('acompanhamento').hidden = false;
    el('erro-acompanhamento').hidden = true;
    el('detalhes-extracao').hidden = el('extracao-pronta').hidden = el('progresso-extracao').hidden = true;
    el('baixar-extracao').removeAttribute('href');
    el('estado-extracao').textContent = 'Consultando…';
    el('estado-extracao').removeAttribute('data-estado');
    el('descricao-estado').textContent = el('consultado-em').textContent = '';
    if (!inicial) return void consultar();
    renderizar(inicial);
    if (!FINAIS.has(inicial.estado)) timer = setTimeout(consultar, intervaloMs);
  }
  function deixar() {
    parar();
    vez++;
    idAtual = null;
    lembrar(null);
    el('acompanhamento').hidden = true;
  }

  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (enviando || !form.reportValidity()) return;
    enviando = true;
    const status = el('status-solicitacao');
    el('solicitar-extracao').disabled = true;
    status.classList.remove('error');
    status.textContent = 'Registrando o pedido…';
    const antes = vez;
    try {
      const pedido = await solicitarExtracao(base, corpoSolicitacao(Object.fromEntries(new FormData(form))));
      if (vez !== antes) {
        // Outro pedido passou a ser acompanhado (ou o acompanhamento foi encerrado) durante o envio.
        status.textContent = `Pedido registrado com o código ${pedido.id}. Para acompanhá-lo, informe o código em "Já fez um pedido?".`;
        return;
      }
      // 202 só confirma o registro; pedido idêntico pode voltar já pronto (idempotência do backend).
      status.textContent = pedido.estado === 'pronto' ? 'Pedido registrado. O servidor informa que este arquivo já está pronto.'
        : 'Pedido registrado. O arquivo ainda não está pronto: acompanhe o estado abaixo.';
      acompanhar(pedido.id, pedido);
    } catch (erro) {
      status.textContent = erro.message;
      status.classList.add('error');
    } finally {
      enviando = false;
      el('solicitar-extracao').disabled = false;
    }
  });
  el('form-retomar').addEventListener('submit', evento => {
    evento.preventDefault();
    const id = String(el('codigo-extracao').value ?? '').trim();
    if (id) acompanhar(id);
  });
  el('tentar-acompanhamento').addEventListener('click', () => { void consultar(); });
  el('parar-extracao').addEventListener('click', deixar);

  const salvo = new URLSearchParams(location.search).get(PARAMETRO) || armazenamento.ler();
  if (salvo) acompanhar(salvo);
  return { acompanhar, deixar };
}
