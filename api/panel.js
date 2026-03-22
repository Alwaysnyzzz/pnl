// api/panel.js — Public API untuk developer
// Endpoint: POST /api/panel?action=xxx
// Header: X-API-Key: dev_xxxxxxxxxx

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

// ── GitHub helpers ──
async function ghGet(path) {
  const res = await fetch(`${BASE}/${path}?ref=${GITHUB_BRANCH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
  const data = await res.json();
  return { data: JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')), sha: data.sha };
}

async function ghPut(path, content, sha) {
  const body = {
    message: `api: update ${path}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${BASE}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
  return await res.json();
}

// ── Generate random API key ──
function genKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'dev_';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

// ── CORS headers ──
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-API-Key');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ════════════════════════════════════════════
  // MANAGEMENT ENDPOINTS (butuh login developer)
  // Diakses dari dashboard web, pakai header X-Dev-Auth
  // ════════════════════════════════════════════

  // GET /api/panel?action=list_keys — list semua API key milik developer
  if (req.method === 'GET' && action === 'list_keys') {
    const devUser = req.headers['x-dev-user'];
    const devPass = req.headers['x-dev-pass'];
    if (!devUser || !devPass) return res.status(401).json({ error: 'Header X-Dev-User dan X-Dev-Pass required' });

    const devDB = await ghGet('data/developers.json');
    if (!devDB || !devDB.data[devUser] || devDB.data[devUser].password !== devPass)
      return res.status(401).json({ error: 'Kredensial developer salah' });

    const keysDB = await ghGet('data/api_keys.json');
    const keys = keysDB ? keysDB.data : {};
    const myKeys = Object.entries(keys)
      .filter(([,v]) => v.owner === devUser)
      .map(([k,v]) => ({ key: k, label: v.label, createdAt: v.createdAt, usageCount: v.usageCount || 0 }));

    return res.status(200).json({ ok: true, keys: myKeys });
  }

  // POST /api/panel?action=create_key — buat API key baru
  if (req.method === 'POST' && action === 'create_key') {
    const devUser = req.headers['x-dev-user'];
    const devPass = req.headers['x-dev-pass'];
    const { label } = req.body || {};
    if (!devUser || !devPass) return res.status(401).json({ error: 'Header X-Dev-User dan X-Dev-Pass required' });

    const devDB = await ghGet('data/developers.json');
    if (!devDB || !devDB.data[devUser] || devDB.data[devUser].password !== devPass)
      return res.status(401).json({ error: 'Kredensial developer salah' });

    const keysDB = await ghGet('data/api_keys.json');
    const keys = keysDB ? keysDB.data : {};

    const newKey = genKey();
    keys[newKey] = {
      owner: devUser,
      label: label || 'API Key',
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };

    await ghPut('data/api_keys.json', keys, keysDB?.sha || null);
    return res.status(200).json({ ok: true, key: newKey, label: keys[newKey].label });
  }

  // DELETE /api/panel?action=delete_key — hapus API key
  if (req.method === 'DELETE' && action === 'delete_key') {
    const devUser = req.headers['x-dev-user'];
    const devPass = req.headers['x-dev-pass'];
    const { key } = req.body || {};
    if (!devUser || !devPass) return res.status(401).json({ error: 'Header required' });

    const devDB = await ghGet('data/developers.json');
    if (!devDB || !devDB.data[devUser] || devDB.data[devUser].password !== devPass)
      return res.status(401).json({ error: 'Kredensial salah' });

    const keysDB = await ghGet('data/api_keys.json');
    if (!keysDB) return res.status(404).json({ error: 'Tidak ada API key' });

    const keys = keysDB.data;
    if (!keys[key]) return res.status(404).json({ error: 'Key tidak ditemukan' });
    if (keys[key].owner !== devUser) return res.status(403).json({ error: 'Bukan milikmu' });

    delete keys[key];
    await ghPut('data/api_keys.json', keys, keysDB.sha);
    return res.status(200).json({ ok: true, message: 'API key dihapus' });
  }

  // ════════════════════════════════════════════
  // PUBLIC API ENDPOINTS (pakai X-API-Key)
  // ════════════════════════════════════════════

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({
    error: 'API Key required',
    hint: 'Tambahkan header: X-API-Key: dev_xxxxxxxx'
  });

  // Validasi API key
  const keysDB = await ghGet('data/api_keys.json');
  if (!keysDB || !keysDB.data[apiKey]) {
    return res.status(401).json({ error: 'API Key tidak valid atau sudah dihapus' });
  }

  const keyMeta = keysDB.data[apiKey];

  // ── Increment usage count ──
  async function incrementUsage() {
    try {
      const fresh = await ghGet('data/api_keys.json');
      if (fresh && fresh.data[apiKey]) {
        fresh.data[apiKey].usageCount = (fresh.data[apiKey].usageCount || 0) + 1;
        fresh.data[apiKey].lastUsed = new Date().toISOString();
        await ghPut('data/api_keys.json', fresh.data, fresh.sha);
      }
    } catch {}
  }

  // ── Log activity ──
  async function logAct(action, detail) {
    try {
      const logDB = await ghGet('data/activity_log.json');
      const arr = Array.isArray(logDB?.data) ? logDB.data : [];
      arr.unshift({ action, detail, actor: `[API] ${keyMeta.owner}`, role: 'developer', ts: new Date().toISOString() });
      await ghPut('data/activity_log.json', arr.slice(0, 200), logDB?.sha || null);
    } catch {}
  }

  // ────────────────────────────────────────────
  // POST /api/panel?action=create_reseller
  // Body: { username, password }
  // ────────────────────────────────────────────
  if (req.method === 'POST' && action === 'create_reseller') {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'Body harus berisi username dan password' });
    if (username.length < 3)
      return res.status(400).json({ error: 'Username minimal 3 karakter' });

    const db = await ghGet('data/data_resseller.json');
    const data = db ? db.data : {};

    if (data[username])
      return res.status(409).json({ error: `Username "${username}" sudah ada` });

    data[username] = {
      password,
      createdBy: keyMeta.owner,
      createdVia: 'api',
      createdAt: new Date().toISOString(),
    };

    await ghPut('data/data_resseller.json', data, db?.sha || null);
    await incrementUsage();
    await logAct('create_reseller', `Reseller "${username}" dibuat via API oleh ${keyMeta.owner}`);

    return res.status(201).json({
      ok: true,
      message: `Reseller "${username}" berhasil dibuat`,
      data: { username, role: 'reseller', createdAt: data[username].createdAt }
    });
  }

  // ────────────────────────────────────────────
  // POST /api/panel?action=create_own_reseller
  // Body: { username, password }
  // ────────────────────────────────────────────
  if (req.method === 'POST' && action === 'create_own_reseller') {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'Body harus berisi username dan password' });
    if (username.length < 3)
      return res.status(400).json({ error: 'Username minimal 3 karakter' });

    const db = await ghGet('data/data_ownresseller.json');
    const data = db ? db.data : {};

    if (data[username])
      return res.status(409).json({ error: `Username "${username}" sudah ada` });

    data[username] = {
      password,
      createdBy: keyMeta.owner,
      createdVia: 'api',
      createdAt: new Date().toISOString(),
    };

    await ghPut('data/data_ownresseller.json', data, db?.sha || null);
    await incrementUsage();
    await logAct('create_own_reseller', `Own Reseller "${username}" dibuat via API oleh ${keyMeta.owner}`);

    return res.status(201).json({
      ok: true,
      message: `Own Reseller "${username}" berhasil dibuat`,
      data: { username, role: 'own_reseller', createdAt: data[username].createdAt }
    });
  }

  // ────────────────────────────────────────────
  // DELETE /api/panel?action=delete_reseller
  // Body: { username }
  // ────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'delete_reseller') {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username required' });

    const db = await ghGet('data/data_resseller.json');
    const data = db ? db.data : {};
    if (!data[username]) return res.status(404).json({ error: `Reseller "${username}" tidak ditemukan` });

    delete data[username];
    await ghPut('data/data_resseller.json', data, db?.sha || null);
    await incrementUsage();
    await logAct('delete_reseller', `Reseller "${username}" dihapus via API`);

    return res.status(200).json({ ok: true, message: `Reseller "${username}" dihapus` });
  }

  // ────────────────────────────────────────────
  // DELETE /api/panel?action=delete_own_reseller
  // Body: { username }
  // ────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'delete_own_reseller') {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username required' });

    const db = await ghGet('data/data_ownresseller.json');
    const data = db ? db.data : {};
    if (!data[username]) return res.status(404).json({ error: `Own Reseller "${username}" tidak ditemukan` });

    delete data[username];
    await ghPut('data/data_ownresseller.json', data, db?.sha || null);
    await incrementUsage();
    await logAct('delete_own_reseller', `Own Reseller "${username}" dihapus via API`);

    return res.status(200).json({ ok: true, message: `Own Reseller "${username}" dihapus` });
  }

  // ────────────────────────────────────────────
  // GET /api/panel?action=list_reseller
  // ────────────────────────────────────────────
  if (req.method === 'GET' && action === 'list_reseller') {
    const db = await ghGet('data/data_resseller.json');
    const data = db ? db.data : {};
    const list = Object.entries(data).map(([u,d]) => ({
      username: u, createdAt: d.createdAt, createdBy: d.createdBy, createdVia: d.createdVia || 'web'
    }));
    await incrementUsage();
    return res.status(200).json({ ok: true, total: list.length, data: list });
  }

  // ────────────────────────────────────────────
  // GET /api/panel?action=list_own_reseller
  // ────────────────────────────────────────────
  if (req.method === 'GET' && action === 'list_own_reseller') {
    const db = await ghGet('data/data_ownresseller.json');
    const data = db ? db.data : {};
    const list = Object.entries(data).map(([u,d]) => ({
      username: u, createdAt: d.createdAt, createdBy: d.createdBy, createdVia: d.createdVia || 'web'
    }));
    await incrementUsage();
    return res.status(200).json({ ok: true, total: list.length, data: list });
  }

  return res.status(400).json({
    error: 'Action tidak dikenal',
    available_actions: [
      'create_reseller', 'delete_reseller', 'list_reseller',
      'create_own_reseller', 'delete_own_reseller', 'list_own_reseller'
    ]
  });
};
