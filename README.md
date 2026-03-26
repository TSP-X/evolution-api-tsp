# Evolution API - TSP Group

Configuração da Evolution API preparada para deploy no Railway com:

- painel web de gerenciamento em /manager
- persistência em PostgreSQL, Redis e volume para sessões
- suporte operacional para WhatsApp, Telegram e Meta/WhatsApp Business
- webhooks para integrar com outro projeto seu no Railway
- chaves para integrações com agentes de IA como OpenAI, Dify, Flowise, n8n e Chatwoot

## O que este repositório entrega

- Dockerfile ajustado para Railway
- docker-compose para subir localmente com a mesma base de produção
- variáveis de ambiente revisadas
- persistência de mensagens, contatos, chats, labels e histórico
- manager habilitado por padrão
- imagem oficial atual da Evolution API

## Limites reais da Evolution API

É importante alinhar isso corretamente antes do deploy:

- WhatsApp: suportado nativamente via Baileys e também via integração Meta/WhatsApp Business
- Telegram: suportado nativamente por instância
- Ligações no WhatsApp: a API expõe eventos de chamada e permite rejeitar chamada com mensagem automática; não é uma central VoIP completa para originar chamadas de voz arbitrárias
- Instagram e Facebook Messenger: não estão no mesmo nível de suporte nativo do WhatsApp e Telegram dentro da Evolution API v2; o caminho pragmático é usar Meta App + webhooks + seu outro serviço no Railway, ou uma camada como Chatwoot/n8n/Dify para orquestrar respostas

Se o objetivo é responder usuários com IA em múltiplos canais, a arquitetura mais estável é:

1. Evolution API recebe eventos dos canais suportados.
2. Evolution API envia webhooks para o seu outro backend no Railway.
3. Seu backend chama OpenAI, Dify, Flowise, n8n ou outra automação.
4. Seu backend responde de volta pela própria Evolution API.

## Deploy no Railway

### 1. Criar os serviços no projeto Railway

No mesmo projeto Railway, crie:

1. Um serviço web a partir deste repositório
2. Um PostgreSQL gerenciado
3. Um Redis gerenciado
4. Um volume montado em /evolution/instances

Sem o volume, você corre risco de perder sessão, QR e arquivos de instância após restart ou novo deploy.

### 2. Deploy usando Dockerfile

O Railway detecta o Dockerfile automaticamente. O contêiner expõe a porta 8080.

Este repositório usa a imagem oficial atual da Evolution API em vez da imagem antiga da atendai.

### 3. Variáveis obrigatórias no serviço web

Defina pelo menos estas variáveis no Railway:

```env
SERVER_URL=https://SEU_DOMINIO_PUBLICO.up.railway.app
SERVER_PORT=8080
SERVER_DISABLE_MANAGER=false
SERVER_DISABLE_DOCS=false
LANGUAGE=pt-BR

AUTHENTICATION_API_KEY=uma-chave-forte-aqui
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=<referencia-da-DATABASE_URL-do-servico-Postgres>
DATABASE_CONNECTION_CLIENT_NAME=evolution_api_tsp
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=<referencia-da-REDIS_URL-do-servico-Redis>
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=true
CACHE_LOCAL_ENABLED=false

WHATSAPP_BAILEYS_DEFAULT=true
CONFIG_SESSION_PHONE_CLIENT=TSP Group
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30
QRCODE_COLOR=#175197

WEBSOCKET_ENABLED=true
WEBSOCKET_GLOBAL_EVENTS=false

WA_BUSINESS_TOKEN_WEBHOOK=evolution
WA_BUSINESS_URL=https://graph.facebook.com
WA_BUSINESS_VERSION=v20.0
WA_BUSINESS_LANGUAGE=en_US

WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_GLOBAL_URL=
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false

OPENAI_ENABLED=false
DIFY_ENABLED=false
FLOWISE_ENABLED=false
N8N_ENABLED=false
EVOAI_ENABLED=false
CHATWOOT_ENABLED=false

TELEMETRY=false
LOG_LEVEL=ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,WEBHOOKS
LOG_COLOR=true
LOG_BAILEYS=error
```

Se o Railway injetar uma porta dinâmica, ele normalmente também expõe PORT. A Evolution API seguirá funcionando porque o container permanece publicado na 8080 internamente.

### 4. Verificar se o deploy subiu

Abra a raiz do serviço. A resposta esperada contém:

- status 200
- version
- manager apontando para /manager

Exemplo de URL do painel:

```text
https://SEU_DOMINIO_PUBLICO.up.railway.app/manager
```

## Integração com seu outro projeto no Railway

Se você já tem outro backend no Railway para agentes de IA, use webhook global ou por instância.

Exemplo de webhook global:

```env
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://seu-outro-servico.up.railway.app/webhooks/evolution
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=true
```

Se o backend de destino aceitar apenas uma rota base sem sufixos por evento, use:

```env
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://seu-outro-servico.up.railway.app/api/whatsapp/webhook
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
```

Esse formato e o correto para integracoes como o UNO, porque a Evolution API pode anexar caminhos como `/connection-update` quando `WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=true`.

Eventos úteis para automação:

- MESSAGES_UPSERT
- MESSAGES_UPDATE
- SEND_MESSAGE
- CONNECTION_UPDATE
- CALL
- QRCODE_UPDATED
- ERRORS

## Configuração dos canais

Substitua https://SEU_DOMINIO_PUBLICO.up.railway.app pela URL pública do Railway.

### WhatsApp via QR Code

Criar instância:

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "whatsapp-tsp",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'
```

Buscar QR Code:

```bash
curl https://SEU_DOMINIO_PUBLICO.up.railway.app/instance/connect/whatsapp-tsp \
  -H "apikey: SUA_API_KEY"
```

### Telegram

Pré-requisito: token do bot criado no BotFather.

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "telegram-tsp",
    "integration": "TELEGRAM",
    "token": "SEU_TELEGRAM_BOT_TOKEN"
  }'
```

### Meta / WhatsApp Business

Use quando quiser operar via infraestrutura oficial da Meta.

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "meta-tsp",
    "integration": "META",
    "token": "SEU_META_ACCESS_TOKEN",
    "number": "SEU_PHONE_NUMBER_ID"
  }'
```

## Envio de mensagens

### WhatsApp

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/message/sendText/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "Olá, aqui é o TSP Group. Como posso ajudar?"
  }'
```

### Telegram

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/message/sendText/telegram-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "CHAT_ID",
    "text": "Olá. Recebi sua mensagem e vou te ajudar agora." 
  }'
```

## Ligações no WhatsApp

Para tratar ligações recebidas com automação, configure os eventos de chamada e ajuste a instância para rejeitar chamada com mensagem.

Exemplo:

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/settings/set/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rejectCall": true,
    "msgCall": "No momento atendemos por mensagem. Me diga sua dúvida que eu respondo aqui."
  }'
```

Isso é o comportamento mais confiável para agentes de IA: detectar chamada, rejeitar, responder por texto e seguir o fluxo automatizado.

## Webhook por instância

Se quiser separar canais por destino:

```bash
curl -X POST https://SEU_DOMINIO_PUBLICO.up.railway.app/webhook/set/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-outro-servico.up.railway.app/webhooks/whatsapp",
    "webhook_by_events": true,
    "events": [
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
      "SEND_MESSAGE",
      "CALL",
      "ERRORS"
    ]
  }'
```

## IA e agentes

A Evolution API consegue servir como camada de canais. Para a inteligência, o padrão recomendado é seu outro serviço receber os webhooks e decidir a resposta. Ainda assim, o container já fica preparado para habilitar integrações por variável:

- OPENAI_ENABLED
- DIFY_ENABLED
- FLOWISE_ENABLED
- N8N_ENABLED
- EVOAI_ENABLED
- CHATWOOT_ENABLED

Ative apenas o que você realmente usar.

## Deploy local com Docker Compose

```bash
docker compose up -d
```

Depois acesse:

- API: http://localhost:8080
- Manager: http://localhost:8080/manager

## Arquivos úteis

- Dockerfile: imagem e porta do container
- docker-compose.yml: ambiente local equivalente
- .env.example: base para variáveis
- railway.json: instruções de build e healthcheck para Railway

## Telegram fora da Evolution API

Esta instalação da Evolution API não suporta Telegram como `integration` nativa.

Para esse caso, o repositório inclui um serviço separado em [telegram-bridge/README.md](telegram-bridge/README.md) para deploy no Railway. Esse bridge:

- recebe webhooks do bot do Telegram
- normaliza os eventos recebidos
- encaminha o payload para o backend do UNO

Variáveis principais do bridge:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET_TOKEN`
- `UNO_WEBHOOK_URL`
- `UNO_API_TOKEN`

Sem `UNO_API_TOKEN`, o serviço sobe e recebe eventos, mas o UNO pode responder `401` nas rotas protegidas.
