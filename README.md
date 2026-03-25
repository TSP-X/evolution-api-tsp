# Evolution API - TSP Group

Servidor Evolution API configurado para **WhatsApp**, **Instagram** e **Telegram**.

## Deploy Rápido (Render)

1. Conecte este repositório ao [Render](https://render.com)
2. Use o arquivo `render.yaml` (Blueprint) para deploy automático
3. O Render criará: API + PostgreSQL + Redis

## Deploy Local (Docker Compose)

```bash
docker compose up -d
```

Acesse: `http://localhost:8080`

## Configuração dos Canais

### WhatsApp (QR Code)

Criar instância WhatsApp:

```bash
curl -X POST http://localhost:8080/instance/create \
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
curl http://localhost:8080/instance/connect/whatsapp-tsp \
  -H "apikey: SUA_API_KEY"
```

### Instagram

Pré-requisitos:
- Conta Meta Business
- App configurado no [Meta Developers](https://developers.facebook.com)
- Token de acesso do Instagram

```bash
curl -X POST http://localhost:8080/instance/create \
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
curl -X POST http://localhost:8080/instance/create \
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
curl -X POST http://localhost:8080/message/sendText/whatsapp-tsp \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "Olá do TSP Group!"
  }'
```

### Telegram

```bash
curl -X POST http://localhost:8080/message/sendText/telegram-tsp \
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
curl -X POST http://localhost:8080/webhook/set/whatsapp-tsp \
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
