# SprintTimeMarrom — Observa SP

Esqueleto do front-end para a plataforma de Auditoria Cidadã dos ônibus de São Paulo, baseado nos requisitos de análise de dados do transporte público.

Esta versão usa **HTML, CSS e JavaScript**, sem dependências, banco de dados, autenticação ou integração com APIs. O back-end será desenvolvido separadamente. Todos os códigos de linha, itinerários, posições e indicadores apresentados pertencem a uma **base fictícia de demonstração**.

## Como abrir

Abra o arquivo `index.html` no navegador. Não é necessário instalar pacotes ou executar um servidor. Também é possível abrir a pasta com o Live Server do VS Code, caso já utilize essa extensão.

## Telas disponíveis

- **Visão geral:** cartões de indicadores, gráfico diário de viagens, resumo de linhas e cobertura da coleta.
- **Linhas de ônibus:** busca por código ou itinerário, ordenação e detalhes de cada linha.
- **Mapa da operação:** desenho esquemático com seleção de linhas e cores por cumprimento ou cobertura. Não é um mapa geográfico nem um acompanhamento em tempo real.
- **Dados abertos:** download dos indicadores de exemplo e tabela de qualidade da coleta. Arquivos brutos e API pública estão apenas identificados como etapas futuras.
- **Sobre e metodologia:** proposta do projeto, definições dos indicadores e próximas etapas.

Os filtros de período, linha, sentido e faixa horária são compartilhados entre as telas. Os detalhes e os downloads respeitam o recorte selecionado. Os dados de exemplo cobrem 90 dias, até **15/11/2026**.

## Organização

```text
SprintTimeMarrom/
├── index.html          # Estrutura, navegação, filtros e janela de detalhes
├── assets/
│   └── favicon.svg     # Ícone do projeto
├── css/
│   └── styles.css      # Estilos e adaptação para celular
└── js/
    ├── data.js         # Base fictícia, filtros e agrupamentos dos exemplos
    ├── visuals.js      # Ícones, gráfico e mapa esquemático em SVG
    └── app.js          # Telas, navegação, busca e exportação CSV
```

## Downloads

O botão **Exportar CSV** gera indicadores por linha para o recorte selecionado. Na tela de linhas, também respeita a busca e a ordenação. O botão de download no gráfico exporta a série diária. Nos detalhes de uma linha, o download fica restrito àquela linha.

Os arquivos usam UTF-8 com BOM, ponto e vírgula como separador e nomes de colunas em português. Incluem período, sentido, faixa horária e a identificação de que a fonte é fictícia. Não contêm registros reais da SPTrans.

## Limites desta etapa

As telas são uma primeira base para discussão e desenvolvimento. Os cálculos em `data.js` apenas resumem exemplos e não implementam a metodologia completa de auditoria.

- A pontualidade exibida simula linhas com horário fixo.
- A espera é um valor fictício preparado para a demonstração, não uma estimativa calculada a partir de GPS.
- O aviso de dados incompletos usa faixas horárias de exemplo; a integração real deverá trabalhar também com as janelas de 15 minutos previstas nos requisitos.
- As cores de cumprimento são faixas ilustrativas, sem associação com metas contratuais oficiais.
- Não há persistência: atualizar a página restaura os filtros e os exemplos iniciais.
- A interface não coleta informações, não carrega fontes ou mapas externos e não faz chamadas de rede.

## Integração futura

Manter o back-end em um projeto separado. Quando ele estiver disponível, substituir a base de `js/data.js` por uma camada de consulta à API e adaptar os formatos recebidos para as telas. A coleta de posições, o armazenamento, as regras oficiais, o versionamento GTFS, os arquivos Parquet e a documentação da API ficam para essa etapa.

As primeiras referências de interface são as histórias US10, US13, US14, US16 e US23–US26. O desenho esquemático apenas antecipa o espaço do mapa previsto; não entrega a integração geográfica ou em tempo real da US22/US24.
