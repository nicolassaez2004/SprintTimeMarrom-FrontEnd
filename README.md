# Mapa público ao vivo — US22-T02

Protótipo estático sem etapa de build para o repositório frontend ainda vazio. Abra `index.html` em um servidor HTTP estático. A URL da API é configurada em `src/config.js`; o padrão de desenvolvimento é `http://localhost:5000`.

Consome `GET /posicoes/atuais` e `GET /posicoes/atuais?linha=<código Olho Vivo>`, conforme o contrato da US22-T01. Usa Leaflet 1.9.4 e tiles padrão do OpenStreetMap com atribuição visível.

A navegação e os marcadores são limitados ao município de São Paulo pelo polígono oficial (código IBGE 3550308), armazenado em `data/municipio-sp-3550308.geojson`. O contorno aparece no mapa, sem máscara opaca no entorno. Fonte: [API de Malhas Municipais do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3550308?formato=application/vnd.geo+json&qualidade=maxima).
