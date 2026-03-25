# Evolution API - TSP Group

Servidor Evolution API configurado para **WhatsApp**, **Instagram** e **Telegram**.

## Deploy no Railway (Produção)

O projeto já está no Railway (ID: `e2242e14-97fc-4fe9-9f9e-2a277327017d`).

### Variáveis de ambiente necessárias no Railway:

Configure no painel do Railway (Settings > Variables):

```env
SERVER_URL=https://seu-dominio.up.railway.app
AUTHENTICATION_API_KEY=sua-chave-secreta
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

# Database (adicionar serviço PostgreSQL no Railway)
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_DATA_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true

# Redis (adicionar serviço Redis no Railway)
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=true
CACHE_LOCAL_ENABLED=false

# WhatsApp
WHATSAPP_BAILEYS_DEFAULT=true
QRCODE_LIMIT=10

# Instagram / Meta Business
WA_BUSINESS_TOKEN_WEBHOOK=evolution
WA_BUSINESS_URL=https://graph.facebook.com
WA_BUSINESS_VERSION=v20.0

# Logging
LOG_LEVEL=ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,WEBHOOKS
```

### Serviços necessários no Railway:

1. **PostgreSQL** - Adicionar via "New Service > Database > PostgreSQL"
2. **Redis** - Adicionar via "New Service > Database > Redis"
3. **Evolution API** - Deploy automático via este repositório

## Deploy Local (Docker Compose)

```bash
docker compose up -d
```

Acesse: `http://localhost:8080`

## Configuração dos Canais

### WhatsApp (QR Code)

Criar instância WhatsApp:

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "whatsapp-tsp",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'
```

Obter QR Code para conectar:

```bash
curl https://SEU_DOMINIO/instance/connect/whatsapp-tsp \
  -H "apikey: SUA_API_KEY"
```

### Instagram

Pré-requisitos:
- Conta Meta Business
- App configurado no [Meta Developers](https://developers.facebook.com)
- Token de acesso do Instagram

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "instagram-tsp",
    "integration": "META",
    "token": "SEU_META_ACCESS_TOKEN",
    "number": "SEU_INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }'
```

### Telegram

Pré-requisitos:
- Bot Token do [@BotFather](https://t.me/BotFather)

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "telegram-tsp",
    "integration": "TELEGRAM",
    "token": "SEU_TELEGRAM_BOT_TOKEN"
  }'
```

## Enviar Mensagens

### WhatsApp

```bash
curl -X POST https://SEU_DOMINIO/message/sendText/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "Olá do TSP Group!"
  }'
```

### Telegram

```bash
curl -X POST https://SEU_DOMINIO/message/sendText/telegram-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "CHAT_ID",
    "text": "Olá do TSP Group!"
  }'
```

## Webhooks

Configure webhooks por instância:

```bash
curl -X POST https://SEU_DOMINIO/webhook/set/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-servidor.com/webhook",
    "webhook_by_events": true,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
      "SEND_MESSAGE"
    ]
  }'
```

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `AUTHENTICATION_API_KEY` | Chave de autenticação da API |
| `DATABASE_CONNECTION_URI` | URI de conexão PostgreSQL |
| `CACHE_REDIS_URI` | URI de conexão Redis |
| `SERVER_URL` | URL pública do servidor |
| `PORT` | Porta do servidor (Railway define automaticamente) |
