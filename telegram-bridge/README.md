# Telegram Bridge

Servico separado para receber webhooks do Telegram e encaminhar eventos normalizados ao UNO.

Variaveis esperadas:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_SECRET_TOKEN
- UNO_WEBHOOK_URL
- UNO_API_TOKEN
- UNO_TIMEOUT_MS
- PUBLIC_WEBHOOK_URL

Rotas:

- GET /health
- POST /telegram/webhook
- POST /telegram/set-webhook