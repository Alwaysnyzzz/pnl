// api/users.js
const { ghRead, ghWrite, ghDelete, ghList } = require("./_github");
const { pteroApp } = require("./_ptero");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  try {
    // ─── CREATE DEVELOPER ───────────────────────────────────────────────
    if (req.method === "POST" && action === "create-developer") {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "username & password required" });

      const { data: existing } = await ghRead(`data_developer/${username}.json`);
      if (existing) return res.status(409).json({ error: "Username sudah ada" });

      // Create admin user in Pterodactyl
      const pteroUser = await pteroApp("POST", "/users", {
        email: `${username}@developer.local`,
        username,
        first_name: username,
        last_name: "Developer",
        password,
        root_admin: true,
      });

      const userData = {
        username,
        password,
        role: "developer",
        pteroId: pteroUser.attributes.id,
        createdAt: new Date().toISOString(),
      };
      await ghWrite(`data_developer/${username}.json`, userData);
      return res.status(200).json({ ok: true, pteroId: pteroUser.attributes.id });
    }

    // ─── CREATE OWN RESELLER ────────────────────────────────────────────
    if (req.method === "POST" && action === "create-own-reseller") {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "username & password required" });

      const { data: existing } = await ghRead(`data_ownresseller/${username}.json`);
      if (existing) return res.status(409).json({ error: "Username sudah ada" });

      const userData = {
        username,
        password,
        role: "own_reseller",
        createdAt: new Date().toISOString(),
      };
      await ghWrite(`data_ownresseller/${username}.json`, userData);
      return res.status(200).json({ ok: true });
    }

    // ─── CREATE RESELLER ────────────────────────────────────────────────
    if (req.method === "POST" && action === "create-reseller") {
      const { username, password, createdBy } = req.body;
      if (!username || !password) return res.status(400).json({ error: "username & password required" });

      const { data: existing } = await ghRead(`data_resseller/${username}.json`);
      if (existing) return res.status(409).json({ error: "Username sudah ada" });

      const userData = {
        username,
        password,
        role: "reseller",
        createdBy: createdBy || "developer",
        createdAt: new Date().toISOString(),
      };
      await ghWrite(`data_resseller/${username}.json`, userData);
      return res.status(200).json({ ok: true });
    }

    // ─── LIST DEVELOPERS ────────────────────────────────────────────────
    if (req.method === "GET" && action === "list-developers") {
      const files = await ghList("data_developer");
      const users = await Promise.all(
        files.filter(f => f.name.endsWith(".json")).map(async f => {
          const { data } = await ghRead(`data_developer/${f.name}`);
          return data ? { username: data.username, pteroId: data.pteroId, createdAt: data.createdAt } : null;
        })
      );
      return res.status(200).json({ users: users.filter(Boolean) });
    }

    // ─── LIST OWN RESELLERS ─────────────────────────────────────────────
    if (req.method === "GET" && action === "list-own-resellers") {
      const files = await ghList("data_ownresseller");
      const users = await Promise.all(
        files.filter(f => f.name.endsWith(".json")).map(async f => {
          const { data } = await ghRead(`data_ownresseller/${f.name}`);
          return data ? { username: data.username, createdAt: data.createdAt } : null;
        })
      );
      return res.status(200).json({ users: users.filter(Boolean) });
    }

    // ─── LIST RESELLERS ─────────────────────────────────────────────────
    if (req.method === "GET" && action === "list-resellers") {
      const { createdBy } = req.query;
      const files = await ghList("data_resseller");
      let users = await Promise.all(
        files.filter(f => f.name.endsWith(".json")).map(async f => {
          const { data } = await ghRead(`data_resseller/${f.name}`);
          return data ? { username: data.username, createdBy: data.createdBy, createdAt: data.createdAt } : null;
        })
      );
      users = users.filter(Boolean);
      if (createdBy) users = users.filter(u => u.createdBy === createdBy);
      return res.status(200).json({ users });
    }

    // ─── DELETE DEVELOPER ───────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-developer") {
      const { username } = req.body;
      const { data, sha } = await ghRead(`data_developer/${username}.json`);
      if (!data) return res.status(404).json({ error: "User tidak ditemukan" });
      if (data.pteroId) {
        try { await pteroApp("DELETE", `/users/${data.pteroId}`); } catch (_) {}
      }
      await ghDelete(`data_developer/${username}.json`, sha);
      return res.status(200).json({ ok: true });
    }

    // ─── DELETE OWN RESELLER ────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-own-reseller") {
      const { username } = req.body;
      const { data, sha } = await ghRead(`data_ownresseller/${username}.json`);
      if (!data) return res.status(404).json({ error: "User tidak ditemukan" });
      await ghDelete(`data_ownresseller/${username}.json`, sha);
      return res.status(200).json({ ok: true });
    }

    // ─── DELETE RESELLER ────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete-reseller") {
      const { username } = req.body;
      const { data, sha } = await ghRead(`data_resseller/${username}.json`);
      if (!data) return res.status(404).json({ error: "User tidak ditemukan" });
      await ghDelete(`data_resseller/${username}.json`, sha);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
