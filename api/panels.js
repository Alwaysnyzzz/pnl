// api/panels.js
const { ghRead, ghWrite, ghDelete, ghList } = require("./_github");
const { pteroApp } = require("./_ptero");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  try {
    // ─── CREATE PANEL ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "create") {
      const { ownerUsername, ownerRole, panelUsername, panelPassword, serverName, email,
              nodeId, locationId, eggId, nestId, memory, disk, cpu } = req.body;

      // 1. Create user in Pterodactyl
      const userRes = await pteroApp("POST", "/users", {
        email,
        username: panelUsername,
        first_name: panelUsername,
        last_name: "Panel",
        password: panelPassword,
        root_admin: false,
      });
      const userId = userRes.attributes.id;

      // 2. Get free allocation on node
      const allocRes = await pteroApp("GET", `/nodes/${nodeId}/allocations?per_page=100`);
      const freeAlloc = allocRes.data?.find(a => !a.attributes.assigned);
      if (!freeAlloc) throw new Error("Tidak ada port alokasi tersedia di node ini!");

      // 3. Get egg details for docker image & startup
      const eggRes = await pteroApp("GET", `/nests/${nestId}/eggs/${eggId}?include=variables`);
      const eggAttr = eggRes.attributes;

      // Build environment from egg variables
      const environment = {};
      (eggAttr.relationships?.variables?.data || []).forEach(v => {
        environment[v.attributes.env_variable] = v.attributes.default_value || "";
      });

      // 4. Create server
      const serverRes = await pteroApp("POST", "/servers", {
        name: serverName,
        user: userId,
        egg: eggId,
        docker_image: eggAttr.docker_image,
        startup: eggAttr.startup,
        environment,
        limits: { memory: parseInt(memory), swap: 0, disk: parseInt(disk), io: 500, cpu: parseInt(cpu) },
        feature_limits: { databases: 5, backups: 2, allocations: 1 },
        allocation: { default: freeAlloc.attributes.id },
      });

      const serverId = serverRes.attributes.id;
      const serverUUID = serverRes.attributes.uuid;

      // 5. Save to GitHub
      const isOwnReseller = ownerRole === "own_reseller";
      const dir = isOwnReseller ? `ownpanel_resseller/${ownerUsername}` : `panel_resseller/${ownerUsername}`;
      const panelData = {
        serverName, panelUsername, email, serverId, serverUUID,
        nodeId, memory, disk, cpu,
        ownerUsername, ownerRole,
        createdAt: new Date().toISOString(),
      };
      await ghWrite(`${dir}/${serverName}.json`, panelData);

      return res.status(200).json({ ok: true, serverId, serverUUID });
    }

    // ─── LIST MY PANELS ─────────────────────────────────────────────────
    if (req.method === "GET" && action === "list-mine") {
      const { ownerUsername, ownerRole } = req.query;
      const isOwn = ownerRole === "own_reseller";
      const dir = isOwn ? `ownpanel_resseller/${ownerUsername}` : `panel_resseller/${ownerUsername}`;
      const files = await ghList(dir);
      const panels = await Promise.all(
        files.filter(f => f.name.endsWith(".json")).map(async f => {
          const { data } = await ghRead(`${dir}/${f.name}`);
          return data;
        })
      );
      return res.status(200).json({ panels: panels.filter(Boolean) });
    }

    // ─── LIST ALL PANELS (developer) ────────────────────────────────────
    if (req.method === "GET" && action === "list-all") {
      const pteroData = await pteroApp("GET", "/servers?per_page=100&include=user");
      return res.status(200).json({ servers: pteroData.data || [] });
    }

    // ─── LIST ALL USERS (developer) ─────────────────────────────────────
    if (req.method === "GET" && action === "list-all-users") {
      const pteroData = await pteroApp("GET", "/users?per_page=100");
      return res.status(200).json({ users: pteroData.data || [] });
    }

    // ─── DELETE PANEL ───────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "delete") {
      const { serverId, serverName, ownerUsername, ownerRole } = req.body;
      await pteroApp("DELETE", `/servers/${serverId}`);
      // Remove from GitHub
      const isOwn = ownerRole === "own_reseller";
      const dir = isOwn ? `ownpanel_resseller/${ownerUsername}` : `panel_resseller/${ownerUsername}`;
      const { sha } = await ghRead(`${dir}/${serverName}.json`);
      if (sha) await ghDelete(`${dir}/${serverName}.json`, sha);
      return res.status(200).json({ ok: true });
    }

    // ─── DELETE USER FROM PTERODACTYL ───────────────────────────────────
    if (req.method === "DELETE" && action === "delete-ptero-user") {
      const { userId } = req.body;
      await pteroApp("DELETE", `/users/${userId}`);
      return res.status(200).json({ ok: true });
    }

    // ─── SUSPEND / UNSUSPEND ────────────────────────────────────────────
    if (req.method === "PATCH" && action === "suspend") {
      const { serverId, suspend } = req.body;
      const endpoint = suspend ? "suspend" : "unsuspend";
      await pteroApp("POST", `/servers/${serverId}/${endpoint}`);
      return res.status(200).json({ ok: true });
    }

    // ─── SERVER STATS ───────────────────────────────────────────────────
    if (req.method === "GET" && action === "stats") {
      const { serverId } = req.query;
      const data = await pteroApp("GET", `/servers/${serverId}?include=allocations`);
      return res.status(200).json({ server: data.attributes });
    }

    // ─── GET NODES ──────────────────────────────────────────────────────
    if (req.method === "GET" && action === "nodes") {
      const data = await pteroApp("GET", "/nodes?per_page=100");
      return res.status(200).json({ nodes: data.data || [] });
    }

    // ─── GET LOCATIONS ──────────────────────────────────────────────────
    if (req.method === "GET" && action === "locations") {
      const data = await pteroApp("GET", "/locations?per_page=100");
      return res.status(200).json({ locations: data.data || [] });
    }

    // ─── GET NESTS ──────────────────────────────────────────────────────
    if (req.method === "GET" && action === "nests") {
      const data = await pteroApp("GET", "/nests?per_page=100");
      return res.status(200).json({ nests: data.data || [] });
    }

    // ─── GET EGGS ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "eggs") {
      const { nestId } = req.query;
      const data = await pteroApp("GET", `/nests/${nestId}/eggs?per_page=100`);
      return res.status(200).json({ eggs: data.data || [] });
    }

    // ─── GET ALLOCATIONS ────────────────────────────────────────────────
    if (req.method === "GET" && action === "allocations") {
      const { nodeId } = req.query;
      const data = await pteroApp("GET", `/nodes/${nodeId}/allocations?per_page=100`);
      return res.status(200).json({ allocations: data.data || [] });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
