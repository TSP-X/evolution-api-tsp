# UNO Bridge

Servico separado para ativacao self-service de WhatsApp por prestador dentro do app UNO. Atua como proxy autenticado entre o backend UNO e a Evolution API.

## Fluxo

1. Prestador pede para conectar o WhatsApp no app UNO
2. Backend UNO chama `POST /providers/activate` neste bridge com o `providerId`
3. Bridge cria a instancia `provider-{providerId}` na Evolution API com integracao `WHATSAPP-BAILEYS`
4. Bridge busca o QR Code e retorna ao UNO
5. Prestador escaneia o QR no proprio celular
6. Evolution envia webhooks (`QRCODE_UPDATED`, `CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `CALL`) para o bridge
7. Bridge normaliza o payload com `providerId` e encaminha para o UNO

## Variaveis esperadas

- `PORT` (default `8080`)
- `EVOLUTION_API_URL` (obrigatorio, ex: `http://evolution-api:8080`)
- `EVOLUTION_API_KEY` (obrigatorio, mesma `AUTHENTICATION_API_KEY` da Evolution)
- `BRIDGE_API_TOKEN` (obrigatorio, token que o UNO usa para chamar este bridge)
- `UNO_WEBHOOK_URL` (destino para onde os eventos normalizados sao encaminhados)
- `UNO_API_TOKEN` (Bearer token enviado ao UNO)
- `UNO_TIMEOUT_MS` (default `15000`)
- `EVOLUTION_WEBHOOK_SECRET` (opcional, valida header `apikey` ou `X-Webhook-Secret` no `/evolution/webhook`)

## Rotas

Todas as rotas `/providers/*` exigem `Authorization: Bearer ${BRIDGE_API_TOKEN}`.

- `GET /health`
- `POST /providers/activate` — body `{ "providerId": "123", "providerName": "Fulano" }`
- `GET /providers/:providerId/status`
- `POST /providers/:providerId/logout`
- `DELETE /providers/:providerId`
- `POST /evolution/webhook` — recebe webhook global da Evolution

## Exemplo

```bash
curl -X POST https://uno-bridge.up.railway.app/providers/activate \
  -H "Authorization: Bearer SEU_BRIDGE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "providerId": "123", "providerName": "Prestador 123" }'
```

Resposta:

```json
{
  "ok": true,
  "providerId": "123",
  "instanceName": "provider-123",
  "created": true,
  "alreadyExisted": false,
  "qrcode": {
    "pairingCode": null,
    "code": "2@...",
    "base64": "data:image/png;base64,iVBOR..."
  }
}
```

## Payload normalizado para o UNO

O UNO recebe `POST ${UNO_WEBHOOK_URL}` com:

```json
{
  "source": "evolution",
  "event": "CONNECTION_UPDATE",
  "providerId": "123",
  "instanceName": "provider-123",
  "timestamp": "2026-04-17T12:00:00.000Z",
  "data": { "state": "open" },
  "raw": { "...": "payload original da Evolution" }
}
```

O header `Authorization: Bearer ${UNO_API_TOKEN}` e enviado quando configurado. O header `X-Bridge-Source: uno-bridge` sempre e enviado.
