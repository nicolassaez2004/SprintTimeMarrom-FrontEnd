import { API_BASE } from '../comum/config.mjs';
import { escapar as h } from '../comum/formatacao.mjs';
import { dataHora } from './modelo.mjs';
import { buscarRanking } from './ranking-cliente.mjs';
import { coberturaRanking, filtrosRanking, mesRanking, numeroRanking, selecaoRanking, valorRanking } from './ranking-modelo.mjs';

const versao = (nome, valor) => `<small>${h(nome)}: ${h(valor ?? 'Não informada')}</small>`;
export function linhasRanking(dados) {
  return dados.map(r => {
    const t = r.trecho;
    return `<tr data-ranking-trecho="${h(t.id)}" data-ranking-valor="${r.aumento_atraso}" data-ranking-cobertura="${r.cobertura}"><td data-label="Posição"><strong>${r.posicao}</strong></td><td data-label="Trecho"><strong>${h(t.parada_origem)} → ${h(t.parada_destino)}</strong><small>Linha ${h(t.linha)} · ${t.sentido === '0' ? 'Ida' : 'Volta'} · trajeto ${h(t.trajeto)} · trecho ${t.ordem}</small><small>Código: ${h(t.id)}</small></td><td data-label="Variação do atraso"><strong class="ranking-valor">${h(valorRanking(r.aumento_atraso))}</strong><small>${r.aumento_atraso > 0 ? 'Aumento do atraso' : r.aumento_atraso < 0 ? 'Redução do atraso' : 'Sem variação do atraso'}</small></td><td data-label="Cobertura"><strong>${h(coberturaRanking(r))}</strong><small>${r.amostras} de ${r.amostras_total} amostras</small>${r.cobertura === null ? '' : `<details><summary>Razão publicada</summary><small>${h(numeroRanking(r.cobertura))}</small></details>`}</td><td data-label="Versões"><details><summary>Ver versões</summary>${versao('Rede GTFS', r.versao_gtfs_id)}${versao('Cálculo', r.versao_calculo)}${versao('Correspondência', r.versao_correspondencia)}${versao('Conjunto', r.versao_conjunto)}${(r.qualidade.versoes_entrada ?? []).map(v => `${versao('Reconstrução de entrada', v.versao_reconstrucao)}${versao('Estimativa de entrada', v.versao_estimativa)}`).join('')}</details></td></tr>`;
  }).join('');
}

export function instalarRanking() {
  const el = id => document.getElementById(id), form = el('filtros-ranking');
  if (!form) return;
  let controle = null, bloqueadoAte = 0;
  const inicial = selecaoRanking(location.search);
  for (const [c, v] of Object.entries(inicial)) form.elements[c].value = v;
  async function consultar() {
    controle?.abort(); const atual = new AbortController(); controle = atual;
    el('resultado-ranking').hidden = true; el('ranking-erro').hidden = true; el('ranking-vazio').hidden = true;
    el('ranking-sintetico').hidden = true; el('linhas-ranking').replaceChildren(); el('ranking-carregando').hidden = false;
    form.setAttribute('aria-busy', 'true');
    try {
      if (!form.reportValidity()) return;
      if (Date.now() < bloqueadoAte) throw new Error('Aguarde o prazo informado antes de consultar novamente.');
      const filtros = filtrosRanking(Object.fromEntries(new FormData(form)));
      const corpo = await buscarRanking(API_BASE, filtros, { signal: atual.signal });
      if (controle !== atual || atual.signal.aborted) return;
      el('ranking-mes-exibido').textContent = mesRanking(corpo.mes);
      el('ranking-contexto').textContent = `${filtros.linha ? `Linha ${filtros.linha}` : 'Todas as linhas'} · ${filtros.sentido === '' ? 'Todos os sentidos' : filtros.sentido === '0' ? 'Ida' : 'Volta'} · ${corpo.metrica === 'MEDIA' ? 'Média mensal' : 'Mediana mensal'} · unidade: ${corpo.unidade}`;
      el('ranking-periodo').textContent = `${dataHora(corpo.periodo.inicio)} a ${dataHora(corpo.periodo.fim)} · fim exclusivo · ${corpo.fuso}`;
      el('ranking-contagens').textContent = `${corpo.dados.length} de ${corpo.trechos_com_valor} trechos com valor · ${corpo.trechos_sem_valor} sem valor, fora do ranking`;
      el('ranking-ordenacao').textContent = `Ordem publicada: ${corpo.ordenacao}. Até ${corpo.limite} trechos.`;
      el('ranking-sintetico').hidden = !corpo.dados.some(r => r.qualidade.origem === 'SINTETICA');
      el('linhas-ranking').innerHTML = linhasRanking(corpo.dados);
      el('ranking-vazio').hidden = corpo.dados.length !== 0;
      el('ranking-tabela').hidden = corpo.dados.length === 0;
      el('resultado-ranking').hidden = false;
    } catch (erro) {
      if (controle !== atual || atual.signal.aborted) return;
      el('ranking-erro-texto').textContent = erro.message; el('ranking-erro').hidden = false;
      if (erro.tentarEm) bloqueadoAte = Date.now() + erro.tentarEm * 1000;
    } finally {
      if (controle === atual) { el('ranking-carregando').hidden = true; form.removeAttribute('aria-busy'); }
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); void consultar(); });
  form.addEventListener('change', () => { void consultar(); });
  el('ranking-tentar').addEventListener('click', () => { void consultar(); });
  void consultar();
}
