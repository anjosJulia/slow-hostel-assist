# SlowHostel Messenger

Extensao Chrome (Manifest V3) para a equipe do Slow Hostel gerar mensagens padronizadas de **orcamento**, **pre-reserva** e **lista de cafe da manha** a partir dos dados exibidos no HQBeds.

## Objetivo

Reduzir o tempo operacional e evitar erros de digitacao/copy-paste no atendimento diario, transformando dados da reserva em templates prontos para envio no WhatsApp.

## Funcionalidades

- Geracao de template de **orcamento**
- Geracao de template de **pre-reserva**
- Geracao de **lista de cafe da manha** (1 a 3 dias)
- Lista de **check-ins de amanha** com botao direto para o WhatsApp
- Edicao do texto antes de copiar (vale so para aquele envio)
- Copia rapida para area de transferencia

## Como funciona

A extensao abre em um painel lateral fixo do Chrome (side panel), que permanece aberto mesmo ao clicar na pagina — so fecha quando o icone da extensao e clicado novamente ou o painel e fechado manualmente. Quando acionada, ela injeta funcoes de leitura nas paginas do HQBeds (`chrome.scripting.executeScript`) para capturar os dados visiveis na interface e montar os textos automaticamente.

## Observacao importante (limitacao tecnica)

> **Por que usamos HTML/DOM scraping em vez de API oficial?**  
> Atualmente, o HQBeds possui limitacoes de API para os dados e fluxos necessarios nesta operacao.  
> Por isso, esta extensao foi codada com leitura do HTML (DOM) como solucao pratica e viavel para tornar a automacao possivel no cenario real do Slow Hostel.

### Implicacoes dessa decisao

- Se o HQBeds alterar estrutura de tela, classes ou textos, pode ser necessario ajustar os scrapers.
- A abordagem privilegia velocidade de operacao e viabilidade imediata, mesmo sem integracao oficial completa via API.

## Estrutura do projeto

- `manifest.json` - configuracao da extensao
- `background.js` - service worker que configura a abertura do side panel
- `popup.html` - marcacao do side panel (sem estilo inline)
- `popup.js` - orquestracao dos fluxos (scraping -> geracao -> exibicao)
- `css/tokens.css` - design tokens do sistema Organic + fontes locais
- `css/panel.css` - componentes visuais do painel
- `fonts/` - Caprasimo e Figtree em woff2, servidos pela propria extensao
- `js/ui/panel-view.js` - camada de apresentacao (estados da tela e rodape)
- `js/ui/guest-card.js` - card de hospede da lista de check-in
- `js/ui/icons.js` - icones SVG inline
- `js/hqbed-tab.js` - acoes de recuperacao (ir para o HQBed, recarregar aba)
- `js/scrapers.js` - extracao de dados das paginas HQBeds
- `js/generators.js` - geracao dos templates
- `js/services.js` - regras auxiliares (deteccao de quarto, formatacao etc.)
- `js/constants.js` - constantes de negocio e mensagens

## Instalacao (modo desenvolvedor)

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactacao**
4. Selecione a pasta do projeto

## Fluxo de uso

1. Acesse a tela de reserva/ocupacao no HQBeds
2. Abra a extensao
3. Clique para gerar o template desejado
4. Copie e envie no WhatsApp
