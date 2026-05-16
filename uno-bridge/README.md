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
- `BRIDGE_PUBLIC_URL` (URL publica do proprio bridge, usada para auto-configurar o webhook das instancias apontando para `${BRIDGE_PUBLIC_URL}/evolution/webhook`; no Railway o `RAILWAY_PUBLIC_DOMAIN` e usado automaticamente quando esta variavel nao esta setada)
- `UNO_WEBHOOK_URL` (destino para onde os eventos normalizados sao encaminhados)
- `UNO_API_TOKEN` (Bearer token enviado ao UNO)
- `UNO_TIMEOUT_MS` (default `15000`)
- `EVOLUTION_WEBHOOK_SECRET` (opcional, valida header `apikey` ou `X-Webhook-Secret` no `/evolution/webhook`)
- `DEFAULT_REJECT_CALL_MESSAGE` (opcional, texto enviado quando uma chamada e rejeitada automaticamente)

## Defaults automaticos por instancia

Sempre que uma instancia e criada via este bridge OU recebe `CONNECTION_UPDATE` com `state: open`, sao aplicados:

Settings (`POST /settings/set/{name}`):

- `rejectCall: true` + `msgCall: DEFAULT_REJECT_CALL_MESSAGE`
- `groupsIgnore: true`
- `alwaysOnline: true`
- `readMessages: true`
- `readStatus: true`
- `syncFullHistory: true`

Webhook (`POST /webhook/set/{name}`): habilitado em `${BRIDGE_PUBLIC_URL}/evolution/webhook` com todos os eventos relevantes (MESSAGES_*, CHATS_*, CONTACTS_*, GROUPS_*, CONNECTION_UPDATE, QRCODE_UPDATED, CALL, SEND_MESSAGE, PRESENCE_UPDATE, LABELS_*, TYPEBOT_*, APPLICATION_STARTUP, NEW_JWT_TOKEN).

WebSocket (`POST /websocket/set/{name}`): habilitado com os mesmos eventos.

Para reaplicar manualmente em instancias ja existentes use o botao "Defaults" no painel `/admin`, ou as rotas:

- `POST /admin/api/instances/{name}/apply-defaults`
- `POST /admin/api/apply-defaults-all`

## Rotas

Todas as rotas `/providers/*` exigem `Authorization: Bearer ${BRIDGE_API_TOKEN}`.

- `GET /health`
- `POST /providers/activate` — body `{ "providerId": "123", "providerName": "Fulano" }`
- `GET /providers/:providerId/status`
- `POST /providers/:providerId/logout`
- `DELETE /providers/:providerId`
- `POST /evolution/webhook` — recebe webhook global da Evolution

### Painel gerencial proprio

Em `GET /admin` o bridge serve um painel web (HTML+JS) para administrar a Evolution API sem usar o `/manager` nativo. Autenticacao por `BRIDGE_API_TOKEN` (mesmo token das rotas `/providers/*`).

Funcionalidades:

- listar instancias com status (open/connecting/close)
- criar instancia (Baileys ou Meta Business)
- exibir QR Code / pairing code
- restart / logout / delete por instancia
- configurar webhook por instancia
- enviar mensagem de teste

Rotas internas usadas pelo painel (todas exigem `Authorization: Bearer ${BRIDGE_API_TOKEN}`):

- `GET /admin/api/health`
- `GET /admin/api/instances`
- `POST /admin/api/instances`
- `GET /admin/api/instances/:name/connect`
- `GET /admin/api/instances/:name/status`
- `POST /admin/api/instances/:name/restart`
- `POST /admin/api/instances/:name/logout`
- `DELETE /admin/api/instances/:name`
- `GET /admin/api/instances/:name/webhook`
- `POST /admin/api/instances/:name/webhook`
- `POST /admin/api/instances/:name/send`

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
