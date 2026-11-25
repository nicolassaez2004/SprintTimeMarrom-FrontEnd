import { requisitar, urlDaApi } from '../comum/http.mjs';
import { parametrosMapa, validarMapa } from './modelo.mjs';

async function conferir(r) {
  if (r.status === 429) {
    const segundos = Number(r.headers.get('Retry-After'));
    const erro = new Error(`Limite de consultas atingido. Aguarde ${segundos > 0 && Number.isFinite(segundos) ? Math.ceil(segundos) : 60} segundos.`);
    erro.tentarEm = segundos > 0 && Number.isFinite(segundos) ? Math.ceil(segundos) : 60;
    throw erro;
  }
  if (!r.ok) throw new Error('Não foi possível consultar o mapa. Confira os filtros e tente novamente.');
  return r.json();
}
const config = opcoes => ({ ...opcoes, cache: 'no-store', headers: { Accept: 'application/geo+json, application/json' },
  mensagens: { conexao: 'Não foi possível conectar ao serviço do mapa.', formato: 'O serviço retornou uma resposta inválida.' } });

export function buscarMapa(base, filtros, pagina = 1, opcoes = {}) {
  const url = urlDaApi('mapas/indicadores', base);
  url.search = parametrosMapa(filtros, pagina).toString();
  return requisitar(url, async r => validarMapa(await conferir(r), filtros, pagina), config(opcoes));
}

// A API de mapas exige rede explícita; o catálogo é obtido dos indicadores publicados,
// sem inventar UUID nem pedir ao usuário uma consulta ao banco.
export function buscarRedes(base, filtros, pagina = 1, opcoes = {}) {
  const originais = parametrosMapa(filtros, pagina, { exigirRede: false });
  const url = urlDaApi('indicadores', base), args = new URLSearchParams();
  for (const campo of ['linha', 'sentido', 'tipo', 'inicio', 'fim', 'page', 'page_size']) if (originais.has(campo)) args.set(campo, originais.get(campo));
  url.search = args.toString();
  return requisitar(url, async r => {
    const corpo = await conferir(r);
    if (!Array.isArray(corpo.dados) || !corpo.paginacao || corpo.paginacao.page !== pagina
        || corpo.dados.some(p => typeof p.versao_gtfs_id !== 'string')) throw new Error('Não foi possível identificar as redes publicadas.');
    const redes = [...new Map(corpo.dados.map(p => [p.versao_gtfs_id, { id: p.versao_gtfs_id, inicio: p.inicio }])).values()];
    return { redes, mais: pagina * corpo.paginacao.page_size < corpo.paginacao.total };
  }, config(opcoes));
}
