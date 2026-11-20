<p align="center"><img src="assets/banner.svg" alt="HACKMIND GeoSentinel — dados de observação da Terra da NASA no navegador" width="100%"></p>

# HACKMIND GeoSentinel — observação da Terra com dados da NASA

Protótipo web de código aberto para explorar imagens de satélite da **NASA GIBS** e analisar **séries temporais ambientais** da **NASA POWER** diretamente no navegador. Um detector de anomalias determinístico, baseado em mediana móvel e MAD, roda num *Web Worker*. Não exige chave de API, login nem backend, e funciona como **PWA** com cache offline.

> Este é um protótipo de apoio à decisão, não um serviço operacional de alerta. Uma anomalia é um desvio estatístico, não prova de um evento ambiental: valide os resultados com especialistas e observações independentes.

## Recursos

- **Mapa com imagens NASA GIBS**: camadas de cor real MODIS Terra ou VIIRS SNPP, com seleção de data, sobre mapa Leaflet/OpenStreetMap.
- **Séries NASA POWER**: últimos 90 dias de radiação solar (`ALLSKY_SFC_SW_DWN`), temperatura a 2 m (`T2M`) ou precipitação corrigida (`PRECTOTCORR`) no ponto clicado.
- **Detector de anomalias local**: mediana móvel e desvio absoluto mediano (MAD), com escore z robusto e limiar `|z| ≥ 3,5`, executado num Web Worker.
- **Evento de teste**: injeta um pico sintético, sempre identificado como tal, para demonstrar a detecção.
- **Modo offline**: o service worker guarda a aplicação e as respostas bem-sucedidas da NASA.
- **Exportação**: relatório JSON com local, proveniência, método, limiar, resumo e pontos analisados.
- **Contingência**: se a NASA POWER estiver indisponível, usa dados locais de demonstração, sinalizados na interface.

## Instalação

Requisitos: **Node.js 20.19+ ou 22.12+**, npm 10+ e um navegador moderno com suporte a ES modules, Web Workers e Service Workers.

```bash
git clone https://github.com/ticarollamas-arch/hackmind-geosentinel.git
cd hackmind-geosentinel
npm install
```

## Como usar

```bash
npm run dev       # abre em http://localhost:5173
npm test          # testes unitários (node --test)
npm run build     # site estático em dist/
npm run preview
```

1. O mapa abre em Nova Lima (MG). Clique em qualquer ponto para consultar aquela coordenada.
2. Escolha a camada e a data da imagem GIBS. Se os tiles ficarem em branco, tente uma data anterior.
3. Selecione a variável e consulte a NASA POWER; o gráfico destaca os pontos anômalos e mostra o tempo do worker.
4. Use **Injetar anomalia de teste** para uma demonstração e exporte o relatório em JSON.

### Deploy

- **Vercel**: importe o repositório com o preset **Vite** (build `npm run build`, saída `dist`). O `vercel.json` já inclui o fallback de SPA e o cache de assets, e nenhuma variável de ambiente é necessária.
- **Qualquer host estático**: publique o conteúdo de `dist/` e redirecione rotas desconhecidas para `/index.html`. Fora do localhost, o service worker exige HTTPS.

## Algoritmo

Para cada valor diário, o detector toma uma janela temporal local, calcula a mediana `m` e o desvio absoluto mediano:

`MAD = mediana(|xᵢ − m|)` e `zᵣ = (x − m) / (1,4826 × MAD)`

Um ponto é sinalizado quando `|zᵣ| ≥ 3,5`. O fator 1,4826 torna o MAD comparável ao desvio padrão em dados normais, e um MAD igual a zero resulta em escore zero. É um método de base transparente, sem ajuste sazonal, e não substitui um modelo validado de alerta. A arquitetura está descrita em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Limitações

- Consulta uma coordenada e uma variável por vez.
- Valores de preenchimento da NASA POWER (≤ −900) são descartados. Os valores podem vir de modelos ou reanálise, e não necessariamente de sensores locais.
- As imagens GIBS são apenas contexto visual e não entram no cálculo; podem atrasar nas datas mais recentes.
- O modo offline não garante o primeiro acesso sem rede nem cobertura completa do mapa.

## Tecnologias

React 18 · Vite · Leaflet · OpenStreetMap · NASA GIBS (WMTS) · NASA POWER API · Recharts · Web Worker · Service Worker / PWA · lucide-react

## Fontes de dados e atribuição

- **NASA POWER**: [API diária por ponto](https://power.larc.nasa.gov/api/temporal/daily/point) · [projeto](https://power.larc.nasa.gov/)
- **NASA GIBS**: [documentação](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs)
- **OpenStreetMap**: mapas © colaboradores do OpenStreetMap · [direitos autorais](https://www.openstreetmap.org/copyright) · [política de uso de tiles](https://operations.osmfoundation.org/policies/tiles/)

## Licença

MIT. Veja [LICENSE](LICENSE). Serviços e bibliotecas de terceiros mantêm seus próprios termos e exigências de atribuição.
