# Clima e trânsito no mapa ao vivo (US06 + US08 no mapa da US22)

O mapa **Ônibus ao vivo** ([mapa.html](../mapa.html)) ganhou o seletor **VISUALIZAÇÃO**:

| Opção | O que mostra | Consulta |
|---|---|---|
| Ônibus | As posições da frota, como antes | `GET /posicoes/atuais` |
| Chuva | Um ponto por estação meteorológica, colorido pela chuva acumulada na janela | `GET /mapas/clima?instante=…` |
| Temperatura | Os mesmos pontos, coloridos pela temperatura no fim da janela | `GET /mapas/clima?instante=…` |
| Trânsito | Os trechos da linha escolhida no filtro LINHA, coloridos pela velocidade média dos ônibus (proxy de trânsito da US08) | `GET /mapas/trafego?instante=…&linha=…` |

## Como funciona

- **MOMENTO** aparece nas visualizações de contexto e usa o horário de São Paulo. Vazio quer
  dizer agora, e nesse caso a camada se atualiza a cada 5 minutos.
- As janelas são as da fonte: 1 hora no INMET, 15 minutos no CGE e 15 minutos no trânsito.
- **Sem medição é cinza e nunca vira zero.** O mesmo vale para "sem chuva": 0 mm aparece como
  medição de chuva zero, e a falta de medição aparece em cinza.
- **Trânsito é por linha:** sem linha escolhida, o mapa pede para escolher uma. A rede usada é a
  versão GTFS vigente no dia do momento escolhido.
- Quando não há dado, o mapa diz o motivo em vez de ficar vazio em silêncio:
  - sem estações coletadas;
  - sem GTFS vigente;
  - linha sem trechos;
  - sem medição na janela.
- **Aviso de dado fictício:** se a resposta trouxer `aviso`, ele aparece sobre o mapa. A
  demonstração usa isso para o período anterior ao primeiro dia de coleta. O código do site não
  gera nenhum valor.
- Os ônibus continuam sendo atualizados em segundo plano. Ao voltar para "Ônibus", aparecem na
  hora.

## Código e testes

- [js/mapa/contexto.mjs](../js/mapa/contexto.mjs): funções puras para:
  - consulta;
  - faixas de cor;
  - legenda;
  - rótulos;
  - mensagens de estado.
- [js/mapa/app.mjs](../js/mapa/app.mjs): só desenha. Monta os pontos e as linhas com
  `L.geoJSON`, a legenda e os popups, que usam `textContent` e não injetam HTML vindo da API.
- [tests/mapa/contexto.test.mjs](../tests/mapa/contexto.test.mjs) testa:
  - montagem das consultas;
  - horário de São Paulo;
  - sem medição ≠ zero;
  - faixas e legenda;
  - mensagens de estado.

O menu "Clima e tráfego" passou a se chamar **Relatório de associações**. A página continua sendo
o relatório mensal da US21, e a troca evita confusão com a nova visualização do mapa.
