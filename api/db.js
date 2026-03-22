// api/db.js — Baca/tulis JSON ke GitHub repo

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

const BASE = "https://api.github.com/repos/" + GITHUB_REPO + "/contents";

const FILES = {
  developers:         "data/developers.json",
  data_resseller:     "data/data_resseller.json",
  data_ownresseller:  "data/data_ownresseller.json",
  panel_resseller:    "data/panel_resseller.json",
  ownpanel_resseller: "data/ownpanel_resseller.json",
  activity_log:       "data/activity_log.json",
  api_keys:           "data/api_keys.json",
};

const DEFAULTS = {
  developers:         { admin: { password: "admin123", pteroId: null, createdAt: new Date().toISOString() } },
  data_resseller:     {},
  data_ownresseller:  {},
  panel_resseller:    {},
  ownpanel_resseller: {},
  activity_log:       [],
  api_keys:           {},
};

async function ghGet(path) {
  const res = await fetch(BASE + "/" + path + "?ref=" + GITHUB_BRANCH, {
    headers: {
      Authorization: "Bearer " + GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub GET " + path + ": " + res.status);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: data.sha };
}

async function ghPut(path, content, sha) {
  const body = {
    message: "update " + path,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(BASE + "/" + path, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error("GitHub PUT " + path + ": " + err.message);
  }
  return await res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const { key } = req.query;
      if (!FILES[key]) return res.status(400).json({ error: "Invalid key: " + key });
      const result = await ghGet(FILES[key]);
      if (!result) {
        return res.status(200).json({ data: DEFAULTS[key] !== undefined ? DEFAULTS[key] : {}, sha: null });
      }
      return res.status(200).json(result);
    }

    if (req.method === "POST") {
      const { key, data, sha } = req.body;
      if (!FILES[key]) return res.status(400).json({ error: "Invalid key: " + key });
      const result = await ghPut(FILES[key], data, sha);
      const newSha = result.content?.sha || null;
      return res.status(200).json({ ok: true, sha: newSha });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
