# US10-T02-FE — download dos indicadores na interface

Implementação: Bernardo, 25/11/2026. **Revisão por outra pessoa pendente.**
Base frontend `0e3d632`; contrato backend conferido em `d4fd3aa`.

O painel `series.html` oferece **Baixar indicadores em CSV** após a consulta.
Seleciona um dia do período e mantém linha, sentido, indicador e parada. O
download abrange todos os registros correspondentes, sem a paginação da tabela.
Espera usa o tipo composto `ESPERA`, incluindo o excesso, como a tela.

## Limites do contrato pronto

`/downloads/indicadores?formato=csv` serve arquivos diários consolidados.
Por isso a interface pede explicitamente o **dia do arquivo**, limitado às datas
selecionadas; não apresenta um dia como se fosse o período inteiro.

Sem faixa, envia `data`. Com faixa, envia `inicio`/`fim` no fuso de São Paulo.
Faixas que extrapolam o dia (ex.: 22–02) são recusadas com orientação; 22–00
cabe no mesmo dia e é permitida. Não se remove um filtro para contornar a rota.
O CSV segue a regra de sobreposição da API de download; a interface informa
que janelas que cruzam o horário podem ser incluídas. A tabela do histórico
seleciona janelas inteiramente contidas e não é usada como gerador de CSV.
Sem filtro de parada, o arquivo pode conter também indicadores por parada/trecho
publicados para a linha/tipo: são mantidos como a API os entrega.

## Recebimento e estados

`js/series/exportacao.mjs` verifica a rota pública e o tipo `text/csv`. Um 404
é consultado em JSON para mostrar `PERIODO_AINDA_NAO_CONSOLIDADO` ou
`CONSOLIDACAO_NAO_PUBLICADA`, incluindo a previsão quando informada. Erro de
rede, HTTP, nome/formato inválido e 429 não iniciam download nem anunciam sucesso.

Quando `Content-Disposition` é legível, recebe o Blob original e usa o nome
exato da resposta, incluindo o nome UTF-8. Não lê/regrava linhas, delimitador,
BOM, valores ou unidades. A confirmação informa arquivo recebido e salvamento
solicitado; a interface não afirma que o usuário salvou em disco.

O backend atual não expõe `Content-Disposition` por CORS. Nesse caso, um HEAD
confirma disponibilidade/formato e o **download nativo** recebe o nome do
servidor. Não se inventa nome, não se gera CSV e não se transfere o corpo duas
vezes. A mensagem é **Download solicitado; confira os downloads do navegador**.
O navegador gerencia a conclusão/cancelamento do salvamento. Uma melhoria futura
no backend pode expor esse cabeçalho, habilitando automaticamente o outro caminho.

Alterar filtros/dia durante a verificação cancela a requisição antiga. Atualizar
silenciosamente as mesmas séries não apaga o download em curso. Filtros e dados
da tela permanecem selecionados; nenhum login é necessário.

## Evidência

- `node --test tests/series-exportacao.test.mjs`: **11 passaram**.
- `node --test`: **114 passaram**. Servidor estático: **3 testes passaram**.
- Chrome, com backend HTTP real e SQLite descartável: arquivo recebido até o
  fim, nome `indicadores_2026-11-24.csv`, bytes/SHA-256 iguais à resposta da API,
  incluindo BOM/acentos; filtros corretos; 404 e 503 sem download/sucesso.
- Desktop 1440 px e celular 390 px sem transbordamento; nenhum erro JavaScript.
- [Registro](evidencias/US10-T02-FE-verificacao.json) e imagens
  `csv-indicadores-desktop.jpg`, `csv-indicadores-mobile.jpg`,
  `csv-indicadores-indisponivel.jpg`, `csv-indicadores-erro.jpg`.
- `tests/fixtures/indicadores-us10.json` guarda os bytes em base64 e os
  cabeçalhos da resposta real de ensaio, com dados **sintéticos**.

Não houve alteração no backend, acesso à Aiven ou publicação. Os exemplos não
comprovam consolidação operacional da SPTrans; precisam da revisão do cartão.
