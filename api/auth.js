// api/auth.js
const { ghRead } = require("./_github");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { role, username, password } = req.body;
  if (!role || !username || !password)
    return res.status(400).json({ error: "role, username, password required" });

  try {
    let filePath;
    if (role === "developer") filePath = `data_developer/${username}.json`;
    else if (role === "own_reseller") filePath = `data_ownresseller/${username}.json`;
    else filePath = `data_resseller/${username}.json`;

    const { data } = await ghRead(filePath);
    if (!data) return res.status(401).json({ error: "Username tidak ditemukan" });
    if (data.password !== password) return res.status(401).json({ error: "Password salah" });

    return res.status(200).json({ ok: true, user: { username, role, email: data.email || "" } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
