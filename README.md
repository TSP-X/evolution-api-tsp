# Evolution API - TSP Group

Servidor Evolution API para **WhatsApp**, **Instagram** e **Telegram** no Railway.

## Deploy no Railway

Projeto: `e2242e14-97fc-4fe9-9f9e-2a277327017d`

### 1. Adicionar serviços no Railway

No painel do projeto, adicionar:

- **PostgreSQL**: `New Service > Database > Add PostgreSQL`
- **Redis**: `New Service > Database > Add Redis`

### 2. Configurar variáveis de ambiente

No serviço da Evolution API (`Variables`), adicionar:

| Variável | Valor |
|---|---|
| `AUTHENTICATION_API_KEY` | `TSP_GROUP_SECRET_KEY_2024` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |

> As demais variáveis já estão configuradas no Dockerfile automaticamente.
> `SERVER_URL` e `PORT` são detectados automaticamente pelo Railway.

### 3. Gerar domínio público

`Settings > Networking > Generate Domain`

### 4. Deploy

O deploy é automático ao fazer push neste repositório.

---

## Configuração dos Canais

Após o deploy, use a URL pública do Railway para configurar os canais.

### WhatsApp (QR Code)

```bash
# Criar instância
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "whatsapp-tsp",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'

# Conectar (escanear QR Code)
curl https://SEU_DOMINIO/instance/connect/whatsapp-tsp \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024"
```

### Instagram

Pré-requisitos:
- Conta Meta Business
- App no [Meta Developers](https://developers.facebook.com)

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "instagram-tsp",
    "integration": "META",
    "token": "SEU_META_ACCESS_TOKEN",
    "number": "SEU_INSTAGRAM_BUSINESS_ACCOUNT_ID"
  }'
```

### Telegram

Pré-requisito: Bot Token do [@BotFather](https://t.me/BotFather)

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "telegram-tsp",
    "integration": "TELEGRAM",
    "token": "SEU_TELEGRAM_BOT_TOKEN"
  }'
```

## Enviar Mensagens

```bash
# WhatsApp
curl -X POST https://SEU_DOMINIO/message/sendText/whatsapp-tsp \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{"number": "5511999999999", "text": "Olá do TSP Group!"}'

# Telegram
curl -X POST https://SEU_DOMINIO/message/sendText/telegram-tsp \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{"number": "CHAT_ID", "text": "Olá do TSP Group!"}'
```

## Webhooks

```bash
curl -X POST https://SEU_DOMINIO/webhook/set/whatsapp-tsp \
  -H "apikey: TSP_GROUP_SECRET_KEY_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-servidor.com/webhook",
    "webhook_by_events": true,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "SEND_MESSAGE"]
  }'
```

## Deploy Local (Docker Compose)

```bash
docker compose up -d
```

Acesse: `http://localhost:8080`
