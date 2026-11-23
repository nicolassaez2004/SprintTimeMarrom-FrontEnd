import { dataValida } from '../qualidade/modelo.mjs';

export function baseDaApi(valor) {
  const url = new URL(valor);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('O endereço do serviço de dados não está configurado corretamente.');
  }
  return url;
}

export function linkDaApi(valor, base, tipo, dia) {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error('O catálogo retornou um link inválido.');
  const origem = baseDaApi(base);
  const url = new URL(valor, origem);
  const caminhos = tipo === 'dicionario'
    ? ['/downloads/brutos/dicionario', '/api/downloads/brutos/dicionario']
    : ['/downloads/brutos', '/api/downloads/brutos'];
  if (url.origin !== origem.origin || url.username || url.password || url.hash || !caminhos.includes(url.pathname)) {
    throw new Error('O catálogo retornou um link inválido.');
  }
  if (tipo === 'dicionario' ? Boolean(url.search) :
    [...url.searchParams.keys()].length !== 1 || url.searchParams.get('data') !== dia) {
    throw new Error('O link do arquivo não corresponde ao dia informado.');
  }
  return url.href;
}

const texto = valor => typeof valor === 'string' && valor.trim().length > 0;
export function validarCatalogo(corpo, base) {
  if (!corpo || !Array.isArray(corpo.datas) || corpo.total !== corpo.datas.length ||
      !texto(corpo.fonte) || !texto(corpo.licenca)) {
    throw new Error('O serviço retornou um catálogo inválido. Tente atualizar.');
  }
  const vistas = new Set();
  const datas = corpo.datas.map(item => {
    if (!item || !dataValida(item.data) || vistas.has(item.data) ||
        !Number.isSafeInteger(item.registros) || item.registros < 0 ||
        !Number.isSafeInteger(item.tamanho_bytes) || item.tamanho_bytes <= 0 ||
        !texto(item.gerado_em) || !/(Z|[+-]\d{2}:\d{2})$/.test(item.gerado_em) || !Number.isFinite(Date.parse(item.gerado_em))) {
      throw new Error('O serviço retornou um catálogo inválido. Tente atualizar.');
    }
    vistas.add(item.data);
    return { ...item, url: linkDaApi(item.url, base, 'arquivo', item.data) };
  }).sort((a, b) => b.data.localeCompare(a.data));
  return { datas, total: corpo.total, fonte: corpo.fonte, licenca: corpo.licenca,
    dicionario: linkDaApi(corpo.dicionario, base, 'dicionario') };
}

export function validarDicionario(corpo) {
  if (!corpo || !Array.isArray(corpo.campos) || !corpo.campos.length ||
      !['formato', 'recorte', 'fonte', 'licenca', 'disponibilidade'].every(chave => texto(corpo[chave]))) {
    throw new Error('O dicionário retornado pelo serviço está incompleto.');
  }
  const nomes = new Set();
  for (const campo of corpo.campos) {
    if (!campo || !['nome', 'tipo', 'descricao'].every(chave => texto(campo[chave])) ||
        typeof campo.anulavel !== 'boolean' || nomes.has(campo.nome) ||
        (campo.unidade !== null && typeof campo.unidade !== 'string')) {
      throw new Error('O dicionário retornado pelo serviço está incompleto.');
    }
    nomes.add(campo.nome);
  }
  return corpo;
}

export function tamanhoArquivo(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const indice = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1024 ** indice)} ${['B', 'KB', 'MB', 'GB'][indice]}`;
}
