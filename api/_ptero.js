// api/_ptero.js
// Utility to call Pterodactyl Application API

const PTERO_URL = process.env.PTERO_URL?.replace(/\/$/, "");
const PTERO_KEY = process.env.PTERO_API_KEY;

async function pteroApp(method, path, body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${PTERO_KEY}`,
      "Content-Type": "application/json",
      Accept: "Application/vnd.pterodactyl.v1+json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${PTERO_URL}/api/application${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

module.exports = { pteroApp };
