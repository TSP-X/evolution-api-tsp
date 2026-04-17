const express = require('express');

const app = express();
app.use(express.json({ limit: '2mb' }));

const config = {
  port: Number(process.env.PORT || 8080),
  evolutionApiUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, ''),
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  bridgeApiToken: process.env.BRIDGE_API_TOKEN || '',
  unoWebhookUrl: process.env.UNO_WEBHOOK_URL || 'https://unoraiz.up.railway.app/api/whatsapp/webhook',
  unoApiToken: process.env.UNO_API_TOKEN || '',
  unoTimeoutMs: Number(process.env.UNO_TIMEOUT_MS || 15000),
  evolutionWebhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
  instancePrefix: 'provider-',
};

function instanceNameFor(providerId) {
  return `${config.instancePrefix}${providerId}`;
}

function providerIdFrom(instanceName) {
  if (!instanceName || !instanceName.startsWith(config.instancePrefix)) return null;
  return instanceName.slice(config.instancePrefix.length);
}

async function evolutionFetch(path, { method = 'GET', body } = {}) {
  if (!config.evolutionApiUrl) {
    throw new Error('EVOLUTION_API_URL ausente');
  }
  if (!config.evolutionApiKey) {
    throw new Error('EVOLUTION_API_KEY ausente');
  }

  const headers = {
    apikey: config.evolutionApiKey,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${config.evolutionApiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: response.ok, status: response.status, data };
}

async function forwardToUno(payload) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Bridge-Source': 'uno-bridge',
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

function requireBridgeAuth(req, res, next) {
  if (!config.bridgeApiToken) {
    return res.status(500).json({ ok: false, error: 'BRIDGE_API_TOKEN nao configurado' });
  }

  const header = req.get('Authorization') || '';
  const expected = `Bearer ${config.bridgeApiToken}`;

  if (header !== expected) {
    return res.status(401).json({ ok: false, error: 'invalid bridge token' });
  }

  return next();
}

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    service: 'uno-bridge',
    evolutionApiUrl: config.evolutionApiUrl || null,
    hasEvolutionApiKey: Boolean(config.evolutionApiKey),
    hasBridgeApiToken: Boolean(config.bridgeApiToken),
    unoWebhookUrl: config.unoWebhookUrl,
    hasUnoApiToken: Boolean(config.unoApiToken),
  });
});

app.post('/providers/activate', requireBridgeAuth, async (req, res) => {
  try {
    const { providerId, providerName } = req.body || {};

    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ ok: false, error: 'providerId obrigatorio' });
    }

    const instanceName = instanceNameFor(providerId);

    const createResult = await evolutionFetch('/instance/create', {
      method: 'POST',
      body: {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      },
    });

    const alreadyExists =
      !createResult.ok &&
      (createResult.status === 403 || createResult.status === 409 ||
        (typeof createResult.data === 'object' && createResult.data?.response?.message?.toString?.().toLowerCase?.().includes('exist')));

    if (!createResult.ok && !alreadyExists) {
      return res.status(createResult.status || 502).json({
        ok: false,
        stage: 'create',
        providerId,
        providerName: providerName || null,
        evolution: createResult.data,
      });
    }

    const connectResult = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);

    return res.status(200).json({
      ok: true,
      providerId,
      providerName: providerName || null,
      instanceName,
      created: createResult.ok,
      alreadyExisted: alreadyExists,
      qrcode: connectResult.data || null,
      connectStatus: connectResult.status,
    });
  } catch (error) {
    console.error('activate error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.get('/providers/:providerId/status', requireBridgeAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const instanceName = instanceNameFor(providerId);

    const result = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);

    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      providerId,
      instanceName,
      evolution: result.data,
    });
  } catch (error) {
    console.error('status error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/providers/:providerId/logout', requireBridgeAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const instanceName = instanceNameFor(providerId);

    const result = await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
    });

    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      providerId,
      instanceName,
      evolution: result.data,
    });
  } catch (error) {
    console.error('logout error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.delete('/providers/:providerId', requireBridgeAuth, async (req, res) => {
  try {
    const { providerId } = req.params;
    const instanceName = instanceNameFor(providerId);

    const result = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
    });

    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      providerId,
      instanceName,
      evolution: result.data,
    });
  } catch (error) {
    console.error('delete error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/evolution/webhook', async (req, res) => {
  try {
    if (config.evolutionWebhookSecret) {
      const provided = req.get('apikey') || req.get('X-Webhook-Secret') || '';
      if (provided !== config.evolutionWebhookSecret) {
        return res.status(403).json({ ok: false, error: 'invalid evolution webhook secret' });
      }
    }

    const update = req.body || {};
    const instanceName = update.instance || update.instanceName || null;
    const providerId = providerIdFrom(instanceName);
    const event = update.event || null;

    const payload = {
      source: 'evolution',
      event,
      providerId,
      instanceName,
      timestamp: update.date_time || update.dateTime || new Date().toISOString(),
      data: update.data || null,
      raw: update,
    };

    let forwarded = null;
    if (providerId) {
      forwarded = await forwardToUno(payload);
    }

    return res.status(200).json({
      ok: true,
      event,
      providerId,
      instanceName,
      forwarded,
    });
  } catch (error) {
    console.error('evolution webhook error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.listen(config.port, () => {
  console.log(`uno-bridge listening on ${config.port}`);
});
