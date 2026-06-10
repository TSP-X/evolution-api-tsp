const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));

const config = {
  port: Number(process.env.PORT || 8080),
  evolutionApiUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, ''),
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  bridgeApiToken: process.env.BRIDGE_API_TOKEN || '',
  unoWebhookUrl: process.env.UNO_WEBHOOK_URL || 'https://unoraiz.up.railway.app/api/wa-pessoal/webhook',
  unoApiToken: process.env.UNO_API_TOKEN || '',
  unoWebhookSecret: process.env.UNO_WEBHOOK_SECRET || '',
  unoTimeoutMs: Number(process.env.UNO_TIMEOUT_MS || 15000),
  evolutionWebhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
  instancePrefixes: (process.env.INSTANCE_PREFIXES || 'provider-,tsp-user-')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  instancePrefix: process.env.INSTANCE_PREFIX || 'provider-',
  bridgePublicUrl:
    (process.env.BRIDGE_PUBLIC_URL && process.env.BRIDGE_PUBLIC_URL.replace(/\/+$/, '')) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ''),
  defaultRejectCallMessage:
    process.env.DEFAULT_REJECT_CALL_MESSAGE ||
    'No momento atendemos por mensagem. Me diga sua duvida que eu respondo aqui.',
};

const DEFAULT_INSTANCE_SETTINGS = {
  rejectCall: true,
  msgCall: config.defaultRejectCallMessage,
  groupsIgnore: true,
  alwaysOnline: true,
  readMessages: true,
  readStatus: true,
  syncFullHistory: true,
};

const DEFAULT_INSTANCE_EVENTS = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_SET',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONTACTS_SET',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'PRESENCE_UPDATE',
  'CHATS_SET',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
  'CHATS_DELETE',
  'GROUPS_UPSERT',
  'GROUP_UPDATE',
  'GROUP_PARTICIPANTS_UPDATE',
  'NEW_JWT_TOKEN',
  'CALL',
  'TYPEBOT_START',
  'TYPEBOT_CHANGE_STATUS',
  'LABELS_EDIT',
  'LABELS_ASSOCIATION',
];

const appliedDefaults = new Set();

function instanceNameFor(providerId) {
  return `${config.instancePrefix}${providerId}`;
}

function providerIdFrom(instanceName) {
  if (!instanceName) return null;
  for (const prefix of config.instancePrefixes) {
    if (prefix && instanceName.startsWith(prefix)) {
      return instanceName.slice(prefix.length);
    }
  }
  return null;
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

async function applyInstanceDefaults(instanceName, { force = false } = {}) {
  if (!instanceName) return { skipped: true, reason: 'instanceName ausente' };
  if (!force && appliedDefaults.has(instanceName)) {
    return { instanceName, alreadyApplied: true };
  }

  const report = { instanceName, steps: {} };

  try {
    const r = await evolutionFetch(`/settings/set/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: { settings: DEFAULT_INSTANCE_SETTINGS, ...DEFAULT_INSTANCE_SETTINGS },
    });
    report.steps.settings = { ok: r.ok, status: r.status };
    if (!r.ok) report.steps.settings.data = r.data;
  } catch (e) {
    report.steps.settings = { ok: false, error: e.message };
  }

  if (config.bridgePublicUrl) {
    const webhookUrl = `${config.bridgePublicUrl}/evolution/webhook`;
    try {
      const r = await evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: {
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: false,
            events: DEFAULT_INSTANCE_EVENTS,
          },
          url: webhookUrl,
          webhook_by_events: false,
          events: DEFAULT_INSTANCE_EVENTS,
          enabled: true,
        },
      });
      report.steps.webhook = { ok: r.ok, status: r.status, url: webhookUrl };
      if (!r.ok) report.steps.webhook.data = r.data;
    } catch (e) {
      report.steps.webhook = { ok: false, error: e.message };
    }
  } else {
    report.steps.webhook = { ok: false, skipped: true, reason: 'BRIDGE_PUBLIC_URL ausente' };
  }

  try {
    const r = await evolutionFetch(`/websocket/set/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: {
        websocket: {
          enabled: true,
          events: DEFAULT_INSTANCE_EVENTS,
        },
        enabled: true,
        events: DEFAULT_INSTANCE_EVENTS,
      },
    });
    report.steps.websocket = { ok: r.ok, status: r.status };
    if (!r.ok) report.steps.websocket.data = r.data;
  } catch (e) {
    report.steps.websocket = { ok: false, error: e.message };
  }

  const allOk = Object.values(report.steps).every((s) => s.ok || s.skipped);
  if (allOk) appliedDefaults.add(instanceName);
  return report;
}

async function forwardToUno(payload) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Bridge-Source': 'uno-bridge',
  };

  if (config.unoApiToken) {
    headers.Authorization = `Bearer ${config.unoApiToken}`;
  }

  if (config.unoWebhookSecret) {
    headers['X-UNO-Webhook-Secret'] = config.unoWebhookSecret;
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

app.get('/', (_, res) => {
  res.json({ ok: true, service: 'uno-bridge' });
});

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    service: 'uno-bridge',
    evolutionApiUrl: config.evolutionApiUrl || null,
    hasEvolutionApiKey: Boolean(config.evolutionApiKey),
    hasBridgeApiToken: Boolean(config.bridgeApiToken),
    unoWebhookUrl: config.unoWebhookUrl,
    hasUnoApiToken: Boolean(config.unoApiToken),
    hasUnoWebhookSecret: Boolean(config.unoWebhookSecret),
    instancePrefixes: config.instancePrefixes,
  });
});

app.post('/providers/activate', requireBridgeAuth, async (req, res) => {
  try {
    const { providerId, providerName } = req.body || {};

    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ ok: false, error: 'providerId obrigatorio' });
    }

    const instanceName = instanceNameFor(providerId);

    const webhook = config.unoWebhookUrl
      ? {
          enabled: true,
          url: config.unoWebhookUrl,
          headers: config.unoWebhookSecret
            ? { 'X-UNO-Webhook-Secret': config.unoWebhookSecret }
            : undefined,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONTACTS_UPDATE',
            'CHATS_UPDATE',
            'CALL',
            'PRESENCE_UPDATE',
          ],
        }
      : undefined;

    const createResult = await evolutionFetch('/instance/create', {
      method: 'POST',
      body: {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        ...(webhook ? { webhook } : {}),
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

    const defaultsReport = await applyInstanceDefaults(instanceName, { force: createResult.ok });

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
      defaults: defaultsReport,
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

    let defaultsReport = null;
    if (result.ok) {
      defaultsReport = await applyInstanceDefaults(instanceName, { force: true });
    }

    return res.status(result.ok ? 200 : result.status || 502).json({
      ok: result.ok,
      evolution: result.data,
      defaults: defaultsReport,
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

app.post('/admin/api/instances/:name/apply-defaults', requireBridgeAuth, async (req, res) => {
  try {
    const report = await applyInstanceDefaults(req.params.name, { force: true });
    return res.status(200).json({ ok: true, defaults: report });
  } catch (error) {
    console.error('admin apply-defaults error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/admin/api/apply-defaults-all', requireBridgeAuth, async (_, res) => {
  try {
    const list = await evolutionFetch('/instance/fetchInstances');
    const raw = list.data;
    let instances = [];
    if (Array.isArray(raw)) instances = raw;
    else if (raw && Array.isArray(raw.instances)) instances = raw.instances;
    else if (raw && typeof raw === 'object') instances = Object.values(raw);

    const reports = [];
    for (const inst of instances) {
      const name = inst.name || inst.instanceName || inst.instance?.instanceName;
      if (!name) continue;
      reports.push(await applyInstanceDefaults(name, { force: true }));
    }
    return res.status(200).json({ ok: true, count: reports.length, reports });
  } catch (error) {
    console.error('admin apply-defaults-all error', error);
    return res.status(500).json({ ok: false, error: error.message || 'internal error' });
  }
});

app.post('/evolution/webhook/:secret?', async (req, res) => {
  try {
    if (config.evolutionWebhookSecret) {
      const provided =
        req.params.secret || req.get('apikey') || req.get('X-Webhook-Secret') || '';
      if (provided !== config.evolutionWebhookSecret) {
        return res.status(403).json({ ok: false, error: 'invalid evolution webhook secret' });
      }
    }

    const update = req.body || {};
    const instanceName = update.instance || update.instanceName || null;
    const providerId = providerIdFrom(instanceName);
    const event = update.event || null;
    const state = update.data?.state || null;

    if (instanceName && event === 'CONNECTION_UPDATE' && state === 'open') {
      applyInstanceDefaults(instanceName).catch((e) =>
        console.error('apply defaults on connect failed', instanceName, e),
      );
    }

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
    if (instanceName) {
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
