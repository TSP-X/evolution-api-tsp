const express = require('express');
const path = require('path');

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

app.get('/admin', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/api/health', requireBridgeAuth, (_, res) => {
  res.json({
    ok: true,
    evolutionApiUrl: config.evolutionApiUrl || null,
    hasEvolutionApiKey: Boolean(config.evolutionApiKey),
    unoWebhookUrl: config.unoWebhookUrl,
    hasUnoApiToken: Boolean(config.unoApiToken),
    instancePrefix: config.instancePrefix,
  });
});

app.get('/admin/api/instances', requireBridgeAuth, async (_, res) => {
  try {
    const result = await evolutionFetch('/instance/fetchInstances');
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin list instances error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/instances', requireBridgeAuth, async (req, res) => {
  try {
    const { instanceName, integration, qrcode, token, number } = req.body || {};

    if (!instanceName || typeof instanceName !== 'string') {
      return res.status(400).json({ ok: false, error: 'instanceName obrigatorio' });
    }

    const body = {
      instanceName,
      integration: integration || 'WHATSAPP-BAILEYS',
      qrcode: qrcode !== false,
    };
    if (token) body.token = token;
    if (number) body.number = number;

    const result = await evolutionFetch('/instance/create', { method: 'POST', body });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin create instance error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.get('/admin/api/instances/:name/connect', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/instance/connect/${encodeURIComponent(req.params.name)}`);
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin connect error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.get('/admin/api/instances/:name/status', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(req.params.name)}`);
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin status error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/instances/:name/restart', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/instance/restart/${encodeURIComponent(req.params.name)}`, {
      method: 'POST',
    });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin restart error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/instances/:name/logout', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/instance/logout/${encodeURIComponent(req.params.name)}`, {
      method: 'DELETE',
    });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin logout error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.delete('/admin/api/instances/:name', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/instance/delete/${encodeURIComponent(req.params.name)}`, {
      method: 'DELETE',
    });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin delete error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.get('/admin/api/instances/:name/webhook', requireBridgeAuth, async (req, res) => {
  try {
    const result = await evolutionFetch(`/webhook/find/${encodeURIComponent(req.params.name)}`);
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin webhook get error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/instances/:name/webhook', requireBridgeAuth, async (req, res) => {
  try {
    const { url, webhook_by_events, events } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: 'url obrigatoria' });
    }

    const result = await evolutionFetch(`/webhook/set/${encodeURIComponent(req.params.name)}`, {
      method: 'POST',
      body: {
        url,
        webhook_by_events: webhook_by_events === true,
        events: Array.isArray(events) ? events : undefined,
      },
    });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin webhook set error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/instances/:name/send', requireBridgeAuth, async (req, res) => {
  try {
    const { number, text } = req.body || {};

    if (!number || !text) {
      return res.status(400).json({ ok: false, error: 'number e text obrigatorios' });
    }

    const result = await evolutionFetch(`/message/sendText/${encodeURIComponent(req.params.name)}`, {
      method: 'POST',
      body: { number, text },
    });
    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
    });
  } catch (error) {
    console.error('admin send error', error);
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
