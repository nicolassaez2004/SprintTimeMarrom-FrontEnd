// US30-T03B: regras de leitura da resposta de GET /saude (US30-T03A). Só interpreta o que a API
// mandou; nenhuma taxa é recalculada aqui. A meta de 99% só aparece como atendida quando a API
// confirma (`meta_atendida === true`, mês encerrado com evidência suficiente).

export const SERVICOS = [
  { chave: 'API', nome: 'API pública', descricao: 'Rotas consultadas pelo site e por quem usa os dados abertos.' },
  { chave: 'PAINEL', nome: 'Painel (site)', descricao: 'Entrega das páginas públicas do Observa SP.' },
  { chave: 'COLETA', nome: 'Coleta da origem (SPTrans)', descricao: 'Ciclos que buscam as posições dos ônibus no Olho Vivo.' },
];

export const MOTIVOS_META = {
  mes_parcial: 'O mês ainda não terminou; a meta só é avaliada com o mês encerrado.',
  lacunas_de_monitoramento_impedem_concluir: 'Há minutos sem sondagem suficientes para mudar o resultado; não é possível concluir.',
  periodo_sem_minutos_esperados: 'Não há minutos a avaliar neste período.',
  ciclos_indeterminados_impedem_concluir: 'Ciclos não registrados ou de resultado indeterminado impedem concluir.',
  periodo_sem_ciclos_esperados: 'Não há ciclos de coleta esperados neste período.',
  todos_os_ciclos_esperados_tiveram_falha_da_fonte: 'Todos os ciclos esperados falharam por causa da origem; não há base para a taxa.',
};

export const DETALHES = {
  OK: 'respondeu normalmente',
  HTTP_ERRO: 'respondeu com erro HTTP',
  TIMEOUT: 'não respondeu dentro do tempo limite',
  ERRO_CONEXAO: 'não aceitou a conexão',
  CONTEUDO_INESPERADO: 'respondeu sem o conteúdo esperado',
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const numeroOuNulo = v => v === null || Number.isFinite(v);
const lista = v => v && Number.isInteger(v.total) && typeof v.truncado === 'boolean' && Array.isArray(v.itens);

export function validarMes(mes, atual) {
  if (typeof mes !== 'string' || !MES.test(mes)) throw new Error('Informe o mês no formato AAAA-MM.');
  if (atual && mes > atual) throw new Error('Escolha um mês que já começou.');
  return mes;
}

// Recusa respostas que não seguem o contrato: melhor avisar do que mostrar um número errado.
export function validarSaude(corpo, mes) {
  const invalida = () => { throw new Error('O serviço de saúde retornou uma resposta inválida. Tente novamente.'); };
  if (!corpo || typeof corpo !== 'object' || corpo.mes !== mes || typeof corpo.mes_parcial !== 'boolean') invalida();
  for (const campo of ['inicio_utc', 'corte_exclusivo_utc', 'fim_mes_utc']) if (Number.isNaN(Date.parse(corpo[campo]))) invalida();
  if (!Array.isArray(corpo.limites) || !corpo.servicos) invalida();
  for (const chave of ['API', 'PAINEL']) {
    const s = corpo.servicos[chave];
    if (!s || !lista(s.incidentes) || !lista(s.lacunas_monitoramento)) invalida();
    if (![s.minutos_esperados, s.minutos_observados, s.minutos_falha, s.minutos_sem_medicao].every(Number.isInteger)) invalida();
    if (![s.percentual_observado, s.percentual_cobertura, s.limite_inferior, s.limite_superior].every(numeroOuNulo)) invalida();
    if (![true, false, null].includes(s.meta_atendida)) invalida();
    if (s.ultima_medicao !== null && (typeof s.ultima_medicao !== 'object' || Number.isNaN(Date.parse(s.ultima_medicao.instante)))) invalida();
  }
  const c = corpo.servicos.COLETA;
  if (!c || !lista(c.incidentes) || ![c.ciclos_esperados, c.ciclos_registrados, c.sucessos].every(Number.isInteger)) invalida();
  if (![c.percentual, c.percentual_maximo].every(numeroOuNulo) || ![true, false, null].includes(c.meta_atendida)) invalida();
  return corpo;
}

// Situação da meta mensal de 99%: atendida só com confirmação da API em mês encerrado.
export function situacaoMeta(servico, relatorio) {
  if (servico.meta_atendida === true && !relatorio.mes_parcial) return { codigo: 'ATENDIDA', texto: 'Meta de 99% atendida no mês', motivo: null };
  if (servico.meta_atendida === false) return { codigo: 'NAO_ATENDIDA', texto: 'Meta de 99% não atendida', motivo: null };
  const motivo = relatorio.mes_parcial ? 'mes_parcial' : servico.motivo_meta_indefinida;
  return { codigo: 'INDEFINIDA', texto: 'Meta de 99% ainda sem conclusão', motivo: MOTIVOS_META[motivo] ?? 'Não há evidência suficiente para concluir.' };
}

// Estado mais recente de cada serviço, sem confundir "sem medição" com "funcionando".
export function estadoAtual(chave, servico) {
  if (chave === 'COLETA') {
    const aberta = servico.incidentes.itens.find(i => i.estado_no_corte === 'ABERTA');
    if (aberta) return { codigo: 'FALHA', texto: 'Coleta interrompida', desde: aberta.inicio, causa: aberta.causa };
    if (servico.ciclos_registrados === 0) return { codigo: 'SEM_MEDICAO', texto: 'Nenhum ciclo registrado no período' };
    return { codigo: 'OK', texto: 'Sem lacuna aberta' };
  }
  const ultima = servico.ultima_medicao;
  if (!ultima) return { codigo: 'SEM_MEDICAO', texto: 'Nunca sondado' };
  if (!ultima.no_periodo) return { codigo: 'SEM_MEDICAO', texto: 'Sem sondagem neste período', ultima };
  if (ultima.estado === 'OK') return { codigo: 'OK', texto: 'Funcionando na última sondagem', ultima };
  return { codigo: 'FALHA', texto: ultima.estado === 'DEGRADADO' ? 'Degradado na última sondagem' : 'Indisponível na última sondagem', ultima };
}

// Serviços que o usuário deve olhar: com falha agora ou com incidentes no período.
export function servicosAfetados(relatorio) {
  return SERVICOS.map(({ chave, nome }) => {
    const servico = relatorio.servicos[chave];
    return { chave, nome, atual: estadoAtual(chave, servico), incidentes: servico.incidentes.total };
  }).filter(s => s.atual.codigo === 'FALHA' || s.incidentes > 0);
}

// Nenhum serviço tem medição no período: tudo é desconhecido, não "sem falhas".
export const semMedicao = relatorio => SERVICOS.every(({ chave }) => estadoAtual(chave, relatorio.servicos[chave]).codigo === 'SEM_MEDICAO');

// Disponibilidade exibida: observada (API/PAINEL) ou taxa dos ciclos (COLETA), sempre com a base.
export function taxaPrincipal(chave, servico) {
  if (chave === 'COLETA') return { valor: servico.percentual, base: `${inteiro(servico.sucessos)} de ${inteiro(servico.denominador)} ciclos considerados` };
  return { valor: servico.percentual_observado, base: `${inteiro(servico.minutos_sucesso)} de ${inteiro(servico.minutos_observados)} minutos sondados` };
}

const inteiro = n => new Intl.NumberFormat('pt-BR').format(n);
export const minutosTexto = n => (n === 1 ? '1 minuto' : `${inteiro(n)} minutos`);
