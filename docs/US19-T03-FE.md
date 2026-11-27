# US19-T03-FE — Ranking mensal de trechos no painel

Execução: Bernardo, 27/11/2026. **Revisão por outra pessoa pendente.**
Base frontend `d7570bc`; contrato backend US19-T03 conferido em `f8d8b47`.

## Resultado

O **Histórico por linha** (`series.html`) tem a seção **Ranking mensal de
trechos**, com mês, linha opcional e sentido. Começa no mês atual e, quando
presentes no endereço, usa linha/sentido como seleção inicial. Alterar os
filtros dessa seção refaz a consulta pública `GET /api/atrasos/ranking`.
Esse alias já existe na US19-T03, usa a mesma função de `/atrasos/ranking`
e está liberado pelo CORS atual para o frontend local. A rota sem `/api`
ainda não tem essa liberação; não foi necessário modificar o backend.

A consulta é mensal e independente das datas, faixa diária e indicador do
histórico. A separação aparece ao lado dos controles. O ranking continua
acessível mesmo quando a consulta de séries não tem dados ou falha.

A tela mantém **a ordem recebida** e apresenta posição, origem/destino,
código do trecho, linha, sentido, trajeto, aumento/redução em segundos, amostras,
cobertura e versões de rede/cálculo/correspondência/conjunto. As versões de
reconstrução/estimativa de entrada também aparecem quando informadas.
Exibe mês, período operacional, fuso, métrica, critério e totais de trechos com
e sem valor. Os nulos excluídos pela API não são reinseridos no ranking.

Não ordena novamente, não calcula média/mediana, não agrega amostras e não
deduz cobertura a partir das contagens. A cobertura recebida (razão entre 0 e 1)
é formatada em percentual com duas casas, com a **razão publicada completa**
disponível no detalhe. Cobertura nula aparece como não informada. A variação
mantém unidade, precisão numérica e sinal, incluindo zero e valores negativos.

Carregamento limpa o resultado anterior; lista vazia é diferente de erro.
HTTP 409 `METRICA_PENDENTE` informa que a métrica ainda aguarda definição,
sem escolher uma na tela. HTTP 429 respeita `Retry-After`. Erros, respostas
incompatíveis e indisponibilidade oferecem nova tentativa. Uma resposta
cancelada não troca o resultado dos filtros atuais. Acesso sem login.

## Arquivos

- `js/series/ranking-modelo.mjs`: filtros, validação e formatação.
- `js/series/ranking-cliente.mjs`: HTTP público e estados de indisponibilidade.
- `js/series/ranking.mjs`: seção e tabela na ordem da resposta.
- `series.html`, `js/series/app.mjs` e `css/series.css`: integração ao painel.

## Verificação

- `node --test tests/series-ranking.test.mjs`: **22 passaram**.
- `node --test`: **191 passaram**.
- Servidor estático: **3 testes passaram**.
- Chrome com API HTTP real em SQLite em memória: ordem e valores idênticos
  à amostra C20, versões, cobertura parcial, zero/redução, troca de filtros,
  carregamento, lista vazia, erro, nova tentativa, cancelamento e tela celular.
  HTTP 409/429/503 e cobertura nula foram simulados no transporte para testar
  esses estados da interface; não representam falhas do ambiente da equipe.
  O teste também exige o cabeçalho CORS real para a origem 127.0.0.1:5173.
- Desktop 1440 px e celular 390 px sem transbordamento; zero erros JavaScript.
- [Registro da verificação](evidencias/US19-T03-FE-verificacao.json),
  [desktop](evidencias/ranking-us19-desktop.jpg),
  [celular](evidencias/ranking-us19-mobile.jpg),
  [lista vazia](evidencias/ranking-us19-vazio.jpg),
  [erro](evidencias/ranking-us19-erro.jpg).

`tests/fixtures/ranking-us19.json` é uma resposta real de ensaio, produzida
pela cadeia US19-T01 → publicação → US19-T03. Dados sintéticos identificados:
BC +240 s, AB +80 s, DE 0 s, CD −30 s, CD/DE com 2 de 3 amostras; EF sem
valor fica fora do ranking. Isso valida a interface, sem comprovar operação
SPTrans ou aceite institucional.

## Reproduzir

Uso normal: iniciar o backend configurado, executar `python servidor.py` no
frontend e abrir `http://127.0.0.1:5173/series.html`. A API segue o endereço
central de `js/comum/config.mjs`. Se a métrica estiver pendente no backend,
a mensagem de indisponibilidade é o resultado esperado; o frontend não muda
a configuração do PO.

Os testes Node usam somente a captura e dispensam banco/credenciais. A
verificação opcional no navegador (`scripts/conferir_ranking_navegador_us19.cjs`)
usa Playwright no ambiente de QA e a amostra C20. Para repetir essa evidência,
o script de demonstração entregue na branch **US19-T04 do backend** pode
servir a amostra: `python -m scripts.demonstrar_ranking_us19 --porta 5095`.
O código de produção do frontend depende apenas da rota US19-T03.

Com o frontend em 5173 e a demonstração em 5095:

```powershell
node scripts/conferir_ranking_navegador_us19.cjs --api http://127.0.0.1:5095
```

`PLAYWRIGHT_MODULE` e `CHROME_PATH` permitem instalações de QA existentes.
`--frontend` permite outra porta local (a evidência usou 5185). O encaminhamento
da origem padrão para a API de ensaio ocorre somente durante o teste.

Não houve publicação, geração de ranking no navegador ou alteração do banco
compartilhado. Revisão do cartão continua pendente.

## Revisão integrada US19/US20/US21/US30 (27/11/2026)

- Controlador da seção coberto por `tests/series-ranking-tela.test.mjs`: carregamento,
  lista vazia, erro 503, envio do mês escolhido e troca rápida de mês com a resposta
  antiga chegando depois (não sobrescreve a seleção atual). Nenhuma correção de código foi necessária.
- Conferência em Chrome headless (`google-chrome-stable --headless=new`) com a API de
  demonstração C20 em SQLite na memória (`python -m scripts.demonstrar_ranking_us19 --porta 5000`):
  ordem BC +240, AB +80, DE 0, CD −30 s, cobertura 66,67% em CD/DE e "4 de 4 trechos com valor · 1 sem valor".
  Captura: [ranking-us19-revisao-chrome.png](evidencias/ranking-us19-revisao-chrome.png). Dados sintéticos.
- Parecer completo no backend: `docs/reviews/us19-us20-us21-us30.md`.
