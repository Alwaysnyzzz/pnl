// api/ptero.js — Proxy ke Pterodactyl Application API
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const PTERO_URL = (process.env.PTERO_URL || "").replace(/\/$/, "");
  const PTERO_API_KEY = process.env.PTERO_API_KEY;

  if (!PTERO_URL || !PTERO_API_KEY) {
    return res.status(500).json({ error: "PTERO_URL atau PTERO_API_KEY belum diset di Vercel." });
  }

  const { path: pathParam, ...queryParams } = req.query;
  if (!pathParam) return res.status(400).json({ error: "path required" });

  const apiPath = Array.isArray(pathParam) ? pathParam.join("/") : pathParam;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) params.append(k, v);

  const fullUrl = PTERO_URL + "/api/application/" + apiPath + (params.toString() ? "?" + params : "");

  const opts = {
    method: req.method,
    headers: {
      Authorization: "Bearer " + PTERO_API_KEY,
      "Content-Type": "application/json",
      Accept: "Application/vnd.pterodactyl.v1+json",
    },
  };

  if (["POST", "PATCH", "PUT"].includes(req.method) && req.body) {
    opts.body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(fullUrl, opts);
    const text = await upstream.text();
    if (!text) return res.status(upstream.status).end();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
