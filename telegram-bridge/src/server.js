const express = require('express');

const app = express();
app.use(express.json({ limit: '2mb' }));

const config = {
  port: Number(process.env.PORT || 8080),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramSecretToken: process.env.TELEGRAM_SECRET_TOKEN || '',
  unoWebhookUrl: process.env.UNO_WEBHOOK_URL || 'https://unoraiz.up.railway.app/api/telegram/webhook',
  unoApiToken: process.env.UNO_API_TOKEN || '',
  unoTimeoutMs: Number(process.env.UNO_TIMEOUT_MS || 15000),
};

function getUpdateType(update) {
  if (update.message) return 'message';
  if (update.edited_message) return 'edited_message';
  if (update.callback_query) return 'callback_query';
  if (update.channel_post) return 'channel_post';
  if (update.my_chat_member) return 'my_chat_member';
  return 'unknown';
}

function normalizeUpdate(update) {
  const message = update.message || update.edited_message || update.channel_post || null;
  const callback = update.callback_query || null;
  const actor = callback?.from || message?.from || update.my_chat_member?.from || null;
  const chat = callback?.message?.chat || message?.chat || null;

  return {
    source: 'telegram',
    updateType: getUpdateType(update),
    updateId: update.update_id || null,
    chat: chat
      ? {
          id: chat.id,
          type: chat.type,
          title: chat.title || null,
          username: chat.username || null,
        }
      : null,
    from: actor
      ? {
          id: actor.id,
          isBot: actor.is_bot || false,
          firstName: actor.first_name || null,
          lastName: actor.last_name || null,
          username: actor.username || null,
          languageCode: actor.language_code || null,
        }
      : null,
    message: message
      ? {
          messageId: message.message_id,
          date: message.date || null,
          text: message.text || message.caption || null,
          hasPhoto: Array.isArray(message.photo) && message.photo.length > 0,
          hasDocument: Boolean(message.document),
          hasVideo: Boolean(message.video),
          hasAudio: Boolean(message.audio || message.voice),
        }
      : null,
    callbackQuery: callback
      ? {
          id: callback.id,
          data: callback.data || null,
        }
      : null,
    raw: update,
  };
}

async function forwardToUno(payload) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Bridge-Source': 'telegram-bridge',
  };

  if (config.unoApiToken) {
    headers.Authorization = `Bearer ${config.unoApiToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.unoTimeoutMs);

  try {
    const response = await fetch(config.unoWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function setTelegramWebhook(webhookUrl) {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN ausente');
  }

  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: config.telegramSecretToken || undefined,
      allowed_updates: ['message', 'edited_message', 'callback_query', 'channel_post', 'my_chat_member'],
      drop_pending_updates: false,
    }),
  });

  const data = await response.text();
  return { status: response.status, body: data };
}

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    service: 'telegram-bridge',
    unoWebhookUrl: config.unoWebhookUrl,
    hasUnoApiToken: Boolean(config.unoApiToken),
    hasTelegramBotToken: Boolean(config.telegramBotToken),
  });
});

app.post('/telegram/webhook', async (req, res) => {
  try {
    if (
      config.telegramSecretToken &&
      req.get('X-Telegram-Bot-Api-Secret-Token') !== config.telegramSecretToken
    ) {
      return res.status(403).json({ ok: false, error: 'invalid telegram secret token' });
    }

    const payload = normalizeUpdate(req.body || {});
    const forwarded = await forwardToUno(payload);

    return res.status(200).json({
      ok: true,
      forwarded,
      updateType: payload.updateType,
      updateId: payload.updateId,
    });
  } catch (error) {
    console.error('telegram webhook error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/telegram/set-webhook', async (req, res) => {
  try {
    const webhookUrl = req.body?.url || process.env.PUBLIC_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(400).json({ ok: false, error: 'url ausente' });
    }

    const result = await setTelegramWebhook(webhookUrl);
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('set webhook error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.listen(config.port, () => {
  console.log(`telegram-bridge listening on ${config.port}`);
});