# US21-T04-FE — Relatório mensal de associações

Página `associacoes.html` ("Clima e tráfego" no menu). Segue o fluxo 2 do diagrama de
componentes: Frontend → `GET /api/relatorios/associacoes?mes=AAAA-MM` (US21-T04) →
QueryService/AssociationService. A página só exibe o relatório pronto
(RelatorioAssociacao/ResultadoAssociacao); não calcula nada.

| Arquivo | Papel |
|---|---|
| [js/relatorios/cliente.mjs](../js/relatorios/cliente.mjs) | Chamada HTTP; 200, 404 e 409 são situações; 400, 429, 503 e falha de rede são erros |
| [js/relatorios/modelo.mjs](../js/relatorios/modelo.mjs) | Validação do contrato, textos de leitura, escala dos intervalos |
| [js/relatorios/app.mjs](../js/relatorios/app.mjs), [associacoes.html](../associacoes.html), [css/associacoes.css](../css/associacoes.css) | Tela |
| [tests/relatorios.test.mjs](../tests/relatorios.test.mjs) | Testes sobre respostas reais |
| [scripts/gerar_fixture_relatorio_us21.py](../scripts/gerar_fixture_relatorio_us21.py) → [tests/fixtures/relatorio-us21.json](../tests/fixtures/relatorio-us21.json) | Respostas reais do ensaio controlado do backend (dados e revisão FICTÍCIOS) |

## O que a tela mostra

- Mês de referência, registro, data da revisão e o aviso **"Associação observada, não causa"**,
  com a interpretação e o desfecho enviados pela API (não é atraso absoluto nem pontualidade).
- **Por modelo** (principal e secundário):
  - coeficiente, intervalo de 95%, erro padrão e p-valor, cada um com sua unidade;
  - um gráfico do intervalo com a linha do zero;
  - uma frase de leitura: o intervalo que inclui zero é apresentado como "não há
    associação clara"; os demais como "associação observada, não prova de causa";
  - amostra (trechos-mês), exclusões, grupos, graus de liberdade e limitações.
- **Fontes**: cada mês da base com versão, clima, tráfego e hash.
- **Método e versões**: cálculo, estimador, incerteza, plano, revisão e bibliotecas.
- **Verificações**: as que a própria API lista como exigidas.
- **Situações sem relatório**:
  - 404: "Ainda não há relatório publicado";
  - 409: "considerado inválido", com o motivo e sem nenhum coeficiente;
  - em nenhum dos dois casos a ausência é tratada como associação nula.

## Verificação

- `node --test "tests/**/*.test.mjs"` → 212 testes, sem falhas (6 novos em `relatorios.test.mjs`).
- No navegador, com o backend real servindo o ensaio controlado:
  - jan/2025: publicado; chuva 2,18 s (IC95% 1,51 a 2,84) no principal; chuva 2,00 s e
    velocidade 0,50 s no secundário; 160 trechos-mês; 8 fontes;
  - fev/2025: sem relatório;
  - mar/2025: inválido (`MATRIZ_SEM_POSTO_COMPLETO`).

O cartão pede revisar os textos com o PO; essa etapa não foi feita aqui.
