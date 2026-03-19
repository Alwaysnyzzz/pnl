// lib/github-storage.js
// Utility to read/write JSON files in a GitHub repo as database

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "username/repo"
const BRANCH = process.env.GITHUB_BRANCH || "main";
const BASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents`;

const ghHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
  "User-Agent": "PteroReseller/1.0",
};

/**
 * Read a JSON file from GitHub repo
 * Returns parsed object, or null if not found
 */
async function ghRead(path) {
  try {
    const res = await fetch(`${BASE_URL}/${path}?ref=${BRANCH}`, {
      headers: ghHeaders,
    });
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw new Error(`GitHub read error: ${res.status}`);
    const json = await res.json();
    const content = Buffer.from(json.content, "base64").toString("utf8");
    return { data: JSON.parse(content), sha: json.sha };
  } catch (e) {
    if (e.message.includes("404")) return { data: null, sha: null };
    throw e;
  }
}

/**
 * Write a JSON file to GitHub repo (create or update)
 */
async function ghWrite(path, data, sha = null) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const body = {
    message: `update ${path}`,
    content,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub write error: ${res.status}`);
  }
  return await res.json();
}

/**
 * Delete a JSON file from GitHub repo
 */
async function ghDelete(path, sha) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "DELETE",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `delete ${path}`,
      sha,
      branch: BRANCH,
    }),
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json();
    throw new Error(err.message || `GitHub delete error: ${res.status}`);
  }
}

/**
 * List files in a directory path on GitHub repo
 */
async function ghList(dirPath) {
  try {
    const res = await fetch(`${BASE_URL}/${dirPath}?ref=${BRANCH}`, {
      headers: ghHeaders,
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub list error: ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch (e) {
    return [];
  }
}

module.exports = { ghRead, ghWrite, ghDelete, ghList };
