// ================================================================
// PteroReseller — app.js
// ================================================================

// ──────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────
const SESSION = { role: '', username: '', userData: null };
let currentTab = 'reseller';

let DB = {
  developers:        {},
  data_resseller:    {},
  data_ownresseller: {},
  panel_resseller:   {},
  ownpanel_resseller:{},
  activity_log:      [],
};
let SHAS = {};

// ──────────────────────────────────────────────────────────────
// API HELPERS
// ──────────────────────────────────────────────────────────────
async function apiPtero(method, path, body = null, extraParams = {}) {
  const params = new URLSearchParams({ path, ...extraParams });
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/ptero?${params}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.detail || data?.error || `HTTP ${res.status}`);
  return data;
}

async function dbRead(key) {
  const res = await fetch(`/api/db?key=${key}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'DB read failed');
  SHAS[key] = data.sha;
  return data.data;
}

async function dbWrite(key, data) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data, sha: SHAS[key] || null }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'DB write failed');
  if (result.sha) SHAS[key] = result.sha;
  DB[key] = data;
  return result;
}

async function loadAllDB() {
  const keys = ['developers','data_resseller','data_ownresseller','panel_resseller','ownpanel_resseller','activity_log'];
  await Promise.all(keys.map(async k => { DB[k] = await dbRead(k); }));
}

// ──────────────────────────────────────────────────────────────
// ACTIVITY LOG
// ──────────────────────────────────────────────────────────────
const ACTION_ICONS = {
  'create_panel':        '🖥️',
  'delete_panel':        '🗑️',
  'create_user':         '👤',
  'delete_user':         '❌',
  'create_reseller':     '👤',
  'delete_reseller':     '🗑️',
  'create_own_reseller': '👑',
  'delete_own_reseller': '🗑️',
  'create_developer':    '🛠️',
  'delete_developer':    '🗑️',
  'suspend_panel':       '🚫',
  'unsuspend_panel':     '✅',
  'login':               '🔑',
};

const ACTION_LABELS = {
  'create_panel':        'Buat Panel',
  'delete_panel':        'Hapus Panel',
  'create_user':         'Buat User',
  'delete_user':         'Hapus User',
  'create_reseller':     'Buat Reseller',
  'delete_reseller':     'Hapus Reseller',
  'create_own_reseller': 'Buat Own Reseller',
  'delete_own_reseller': 'Hapus Own Reseller',
  'create_developer':    'Buat Developer',
  'delete_developer':    'Hapus Developer',
  'suspend_panel':       'Suspend Panel',
  'unsuspend_panel':     'Unsuspend Panel',
  'login':               'Login',
};

async function logActivity(action, detail) {
  try {
    const logs = await dbRead('activity_log');
    const arr = Array.isArray(logs) ? logs : [];
    arr.unshift({
      action,
      detail,
      actor: SESSION.username,
      role: SESSION.role,
      ts: new Date().toISOString(),
    });
    // Simpan max 200 log
    await dbWrite('activity_log', arr.slice(0, 200));
  } catch(e) {
    console.warn('Log activity failed:', e.message);
  }
}

function fmtTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  return `${days[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ──────────────────────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────────────────────
function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const titles = {
    reseller: '🔐 Login sebagai Reseller',
    own_reseller: '🔐 Login sebagai Own Reseller',
    developer: '🔐 Login sebagai Developer',
  };
  document.getElementById('login-title').textContent = titles[tab];
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-err').style.display = 'none';
}

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-err');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (!user || !pass) { showErr('Username dan password wajib diisi!'); return; }

  btn.innerHTML = '<span class="spinner"></span> Memuat...';
  btn.disabled = true;

  try {
    await loadAllDB();

    let ok = false;
    const maps = { reseller: 'data_resseller', own_reseller: 'data_ownresseller', developer: 'developers' };
    const map = maps[currentTab];
    if (DB[map][user] && DB[map][user].password === pass) {
      SESSION.role = currentTab;
      SESSION.username = user;
      SESSION.userData = DB[map][user];
      ok = true;
    }

    if (!ok) { showErr('Username atau password salah!'); return; }

    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('hdr-user').textContent = user;
    document.getElementById('hdr-role').textContent =
      { reseller:'Reseller', own_reseller:'Own Reseller', developer:'Developer' }[SESSION.role];

    // Log login
    logActivity('login', `Login sebagai ${SESSION.role}`);

    renderDashboard();
    toast(`Selamat datang, ${user}! 👋`, 'success');
  } catch(e) {
    showErr('Error: ' + e.message);
  } finally {
    btn.innerHTML = 'Masuk';
    btn.disabled = false;
  }

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

function doLogout() {
  SESSION.role = ''; SESSION.username = ''; SESSION.userData = null;
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ──────────────────────────────────────────────────────────────
// DASHBOARD RENDER
// ──────────────────────────────────────────────────────────────
function renderDashboard() {
  const navMap = {
    reseller: [
      { id:'buat-panel',   icon:'🖥️', label:'Buat Panel' },
      { id:'panel-saya',   icon:'📋', label:'Panel Saya' },
    ],
    own_reseller: [
      { id:'buat-panel',      icon:'🖥️', label:'Buat Panel' },
      { id:'panel-saya',      icon:'📋', label:'Panel Saya' },
      { id:'akun-reseller',   icon:'👤', label:'Akun Reseller' },
    ],
    developer: [
      { id:'dev-developer',    icon:'🛠️', label:'Developer' },
      { id:'dev-own-reseller', icon:'👑', label:'Own Reseller' },
      { id:'dev-reseller',     icon:'👤', label:'Reseller' },
      { id:'dev-all-panel',    icon:'🌐', label:'Semua Panel' },
      { id:'dev-all-user',     icon:'👥', label:'Semua User' },
      { id:'dev-buat-panel',   icon:'🖥️', label:'Buat Panel' },
      { id:'dev-aktivitas',    icon:'📊', label:'Aktivitas' },
      { id:'dev-api',           icon:'🔑', label:'Sistem API' },
    ],
  };

  const items = navMap[SESSION.role] || [];

  // Desktop sidebar
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '<div class="sidebar-label">Menu</div>' +
    items.map(i =>
      `<button class="sidebar-item" data-id="${i.id}" onclick="showSection('${i.id}',this)">
        <span class="sidebar-icon">${i.icon}</span>${i.label}
      </button>`
    ).join('');

  // Mobile bottom nav
  const mobileInner = document.getElementById('mobile-nav-inner');
  if (mobileInner) {
    mobileInner.innerHTML = items.map(i =>
      `<button class="mobile-nav-btn" data-id="${i.id}" onclick="showSection('${i.id}',this)">
        <span class="mn-icon">${i.icon}</span>
        <span>${i.label}</span>
      </button>`
    ).join('');
  }

  if (items.length) showSection(items[0].id);
}

function showSection(id, clickedEl) {
  // Update desktop sidebar active
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  const sideBtn = document.querySelector(`.sidebar-item[data-id="${id}"]`);
  if (sideBtn) sideBtn.classList.add('active');

  // Update mobile nav active
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  const mobBtn = document.querySelector(`.mobile-nav-btn[data-id="${id}"]`);
  if (mobBtn) mobBtn.classList.add('active');

  const main = document.getElementById('main-content');
  main.scrollTop = 0;

  const sections = {
    'buat-panel':        () => renderBuatPanel(main, SESSION.role, SESSION.username),
    'panel-saya':        () => renderPanelSaya(main),
    'akun-reseller':     () => renderAkunReseller(main),
    'dev-own-reseller':  () => renderDevOwnReseller(main),
    'dev-reseller':      () => renderDevReseller(main),
    'dev-developer':     () => renderDevDeveloper(main),
    'dev-all-panel':     () => renderDevAllPanel(main),
    'dev-all-user':      () => renderDevAllUser(main),
    'dev-buat-panel':    () => renderBuatPanel(main, 'developer', SESSION.username),
    'dev-aktivitas':     () => renderAktivitas(main),
    'dev-api':           () => renderSistemAPI(main),
  };
  if (sections[id]) sections[id]();
}

// ──────────────────────────────────────────────────────────────
// SECTION: BUAT PANEL
// ──────────────────────────────────────────────────────────────
async function renderBuatPanel(main, role, owner) {
  main.innerHTML = `
    <div class="page-header"><h2>Buat Panel Baru</h2><p>Deploy server di Pterodactyl</p></div>
    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">🖥️</div><span>Buat Panel</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="bp-form">
        <div class="empty-state"><div class="spinner"></div><p>Memuat data API...</p></div>
      </div>
    </div>`;
  await loadBuatPanelForm('bp-form', role, owner);
}

async function loadBuatPanelForm(containerId, role, owner) {
  const el = document.getElementById(containerId);
  try {
    const [nodesRes, nestsRes, locsRes] = await Promise.all([
      apiPtero('GET', 'nodes', null, { per_page: 100 }),
      apiPtero('GET', 'nests', null, { per_page: 100 }),
      apiPtero('GET', 'locations', null, { per_page: 100 }),
    ]);
    const nodes = nodesRes.data || [];
    const nests = nestsRes.data || [];
    const locs  = locsRes.data  || [];

    // Build RAM dropdown 1-30 GB + Unlimited
    const ramOptions = [
      ...Array.from({length:30},(_,i)=>{
        const gb = i+1;
        const mb = gb*1024;
        return `<option value="${mb}" data-disk="${mb}" data-cpu="${gb*100}">${gb} GB — ${mb} MB Disk — CPU ${gb*100}%</option>`;
      }),
      `<option value="0" data-disk="0" data-cpu="0">♾️ Unlimited</option>`
    ].join('');

    el.innerHTML = `
      <div class="grid-2" style="margin-bottom:12px">
        <div class="field"><label>Username Panel</label><input type="text" id="fp-user" placeholder="paneluser" /></div>
        <div class="field"><label>Password Panel</label><input type="password" id="fp-pass" placeholder="password" /></div>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div class="field"><label>Node</label>
          <select id="fp-node">${nodes.map(n=>`<option value="${n.attributes.id}">${n.attributes.name}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Nest</label>
          <select id="fp-nest" onchange="loadEggs(this.value)">
            ${nests.map(n=>`<option value="${n.attributes.id}">${n.attributes.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>Egg</label>
        <select id="fp-egg"><option>Pilih nest dulu...</option></select>
      </div>
      <div class="field" style="margin-bottom:6px">
        <label>Paket RAM</label>
        <select id="fp-ram" onchange="updateResources(this)">${ramOptions}</select>
      </div>
      <div class="resource-preview" id="res-preview">
        <span>💾 Disk: <b id="prev-disk">1024 MB</b></span>
        <span>⚙️ CPU: <b id="prev-cpu">100%</b></span>
      </div>
      <button class="btn btn-primary btn-full" id="fp-btn" onclick="doCreatePanel('${role}','${owner}')" style="margin-top:16px">🚀 Buat Panel</button>`;

    if (nests.length) loadEggs(nests[0].attributes.id);
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="ei">⚠️</div><p>Gagal memuat API: ${e.message}</p></div>`;
  }
}

// Update preview disk & cpu saat RAM berubah
function updateResources(sel) {
  const opt = sel.selectedOptions[0];
  const diskMb = +opt.dataset.disk;
  const cpu = +opt.dataset.cpu;
  const pd = document.getElementById('prev-disk');
  const pc = document.getElementById('prev-cpu');
  if (pd) pd.textContent = diskMb === 0 ? '♾️ Unlimited' : diskMb + ' MB';
  if (pc) pc.textContent = cpu === 0 ? '♾️ Unlimited' : cpu + '%';
}

async function loadEggs(nestId) {
  const sel = document.getElementById('fp-egg');
  if (!sel) return;
  sel.innerHTML = '<option>Memuat...</option>';
  try {
    // Fetch eggs WITH variables so we can build environment on create
    const res = await apiPtero('GET', `nests/${nestId}/eggs`, null, { per_page: 100, include: 'variables' });
    const eggs = res.data || [];
    // Store egg data globally for use in doCreatePanel
    window._eggData = {};
    eggs.forEach(e => { window._eggData[e.attributes.id] = e.attributes; });
    sel.innerHTML = eggs.map(e =>
      `<option value="${e.attributes.id}">${e.attributes.name}</option>`
    ).join('');
  } catch(e) {
    sel.innerHTML = `<option>Error: ${e.message}</option>`;
  }
}

async function doCreatePanel(role, owner) {
  const user  = document.getElementById('fp-user').value.trim();
  const pass  = document.getElementById('fp-pass').value.trim();
  const name   = user; // nama server = username panel
  const email  = user + '@buyer.nyzz';
  const nodeId = +document.getElementById('fp-node').value;
  const eggEl  = document.getElementById('fp-egg');
  const eggId  = +eggEl.value;
  const nestId = +document.getElementById('fp-nest').value;
  const ramEl  = document.getElementById('fp-ram');
  const ram    = +ramEl.value;
  const disk   = +ramEl.selectedOptions[0].dataset.disk;
  const cpu    = +ramEl.selectedOptions[0].dataset.cpu;

  if (!user||!pass) { toast('Lengkapi Username dan Password!','error'); return; }

  const btn = document.getElementById('fp-btn');
  btn.innerHTML = '<span class="spinner"></span> Membuat...';
  btn.disabled = true;

  // Get egg data with variables
  const eggData = (window._eggData && window._eggData[eggId]) || {};
  const docker  = eggData.docker_image || 'ghcr.io/pterodactyl/yolks:java_17';
  const startup = eggData.startup || 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}';

  // Build environment from egg variables using their default values
  const environment = {};
  const eggVars = eggData.relationships?.variables?.data || [];
  eggVars.forEach(v => {
    const attr = v.attributes;
    environment[attr.env_variable] = attr.default_value || '';
  });
  // Fallback common vars if empty
  if (Object.keys(environment).length === 0) {
    environment['SERVER_JARFILE'] = 'server.jar';
  }

  try {
    const userRes = await apiPtero('POST','users', {
      email, username: user, first_name: user, last_name: 'Panel', password: pass, root_admin: false,
    });
    const userId = userRes.attributes.id;

    const allocRes = await apiPtero('GET', `nodes/${nodeId}/allocations`, null, { per_page: 100 });
    const free = (allocRes.data||[]).find(a => !a.attributes.assigned);
    if (!free) throw new Error('Tidak ada port tersedia di node ini!');

    // Unlimited = memory/disk/cpu = 0
    const srvRes = await apiPtero('POST','servers', {
      name, user: userId, egg: eggId,
      docker_image: docker, startup,
      environment,
      limits: { memory: ram, swap: -1, disk, io: 500, cpu },
      feature_limits: { databases: 5, backups: 2, allocations: 1 },
      allocation: { default: free.attributes.id },
    });
    const serverId   = srvRes.attributes.id;
    const serverUUID = srvRes.attributes.uuid;

    const dbKey = role === 'own_reseller' ? 'ownpanel_resseller' : 'panel_resseller';
    const panels = await dbRead(dbKey);
    if (!panels[owner]) panels[owner] = {};
    panels[owner][name] = { username: user, email, serverId, serverUUID, name, nestId, eggId, createdAt: new Date().toISOString() };
    await dbWrite(dbKey, panels);

    await logActivity('create_panel', `Panel "${name}" (user: ${user}, RAM: ${ram}MB, Disk: ${disk}MB)`);

    toast(`Panel "${name}" berhasil dibuat! 🎉`, 'success');
    btn.innerHTML = '🚀 Buat Panel';
    btn.disabled = false;
  } catch(e) {
    toast('Gagal: ' + e.message, 'error');
    btn.innerHTML = '🚀 Buat Panel';
    btn.disabled = false;
  }
}

// ──────────────────────────────────────────────────────────────
// SECTION: PANEL SAYA
// ──────────────────────────────────────────────────────────────
async function renderPanelSaya(main) {
  main.innerHTML = `
    <div class="page-header"><h2>Panel Saya</h2><p>Server yang kamu kelola</p></div>
    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-green">📋</div><span>Daftar Panel</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="ps-list">
        <div class="empty-state"><div class="spinner"></div><p>Memuat...</p></div>
      </div>
    </div>`;

  try {
    const dbKey = SESSION.role === 'own_reseller' ? 'ownpanel_resseller' : 'panel_resseller';
    const panels = await dbRead(dbKey);
    const mine = panels[SESSION.username] || {};
    const el = document.getElementById('ps-list');

    if (!Object.keys(mine).length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>Belum ada panel. Buat panel dulu!</p></div>';
      return;
    }
    el.innerHTML = Object.entries(mine).map(([n, p]) => `
      <div class="list-item">
        <div class="li-info">
          <div class="li-avatar">${n[0].toUpperCase()}</div>
          <div><div class="li-name">${n}</div><div class="li-sub">@${p.username} · ${p.email}</div></div>
        </div>
        <div class="btn-group">
          <div class="btn-circle btn-trash" title="Hapus"
            onclick="deleteMyPanel('${n}',${p.serverId},'${dbKey}')">🗑️</div>
        </div>
      </div>`).join('');
  } catch(e) {
    document.getElementById('ps-list').innerHTML =
      `<div class="empty-state"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
  }
}

async function deleteMyPanel(pname, serverId, dbKey) {
  confirmBox(`Hapus panel "${pname}"?`, 'Panel akan dihapus permanen dari Pterodactyl!', async () => {
    try {
      await apiPtero('DELETE', `servers/${serverId}`);
      const panels = await dbRead(dbKey);
      delete panels[SESSION.username]?.[pname];
      await dbWrite(dbKey, panels);
      await logActivity('delete_panel', `Panel "${pname}" dihapus oleh ${SESSION.username}`);
      toast(`Panel "${pname}" dihapus!`, 'success');
      renderPanelSaya(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: ' + e.message, 'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: AKUN RESELLER (Own Reseller)
// ──────────────────────────────────────────────────────────────
async function renderAkunReseller(main) {
  const resellers = await dbRead('data_resseller');
  const mine = Object.entries(resellers).filter(([,d]) => d.createdBy === SESSION.username);

  main.innerHTML = `
    <div class="page-header"><h2>Akun Reseller</h2><p>Kelola reseller di bawah akun kamu</p></div>

    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-purple">➕</div><span>Buat Akun Reseller</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field"><label>Username</label><input type="text" id="ar-user" placeholder="username reseller" /></div>
          <div class="field"><label>Password</label><input type="password" id="ar-pass" placeholder="password" /></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createReseller()">Buat Reseller</button>
      </div>
    </div>

    <div class="accordion open" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">👥</div>
          <span>List Reseller Kamu (${mine.length})</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        ${mine.length === 0
          ? '<div class="empty-state"><div class="ei">📭</div><p>Belum ada reseller.</p></div>'
          : mine.map(([u,d]) => `
            <div class="list-item">
              <div class="li-info">
                <div class="li-avatar">${u[0].toUpperCase()}</div>
                <div><div class="li-name">${u}</div><div class="li-sub">Dibuat: ${fmtDate(d.createdAt)}</div></div>
              </div>
              <div class="btn-circle btn-trash" onclick="deleteReseller('${u}')">🗑️</div>
            </div>`).join('')}
      </div>
    </div>`;
}

async function createReseller() {
  const user = document.getElementById('ar-user').value.trim();
  const pass = document.getElementById('ar-pass').value.trim();
  if (!user||!pass) { toast('Lengkapi semua field!','error'); return; }
  try {
    const data = await dbRead('data_resseller');
    if (data[user]) { toast('Username sudah ada!','error'); return; }
    data[user] = { password: pass, createdBy: SESSION.username, createdAt: new Date().toISOString() };
    await dbWrite('data_resseller', data);
    await logActivity('create_reseller', `Reseller "${user}" dibuat oleh ${SESSION.username}`);
    toast(`Reseller "${user}" dibuat!`, 'success');
    renderAkunReseller(document.getElementById('main-content'));
  } catch(e) { toast('Gagal: ' + e.message, 'error'); }
}

async function deleteReseller(username) {
  confirmBox(`Hapus reseller "${username}"?`, 'Data panel reseller juga akan dihapus.', async () => {
    try {
      const data = await dbRead('data_resseller');
      delete data[username];
      await dbWrite('data_resseller', data);
      const panels = await dbRead('panel_resseller');
      delete panels[username];
      await dbWrite('panel_resseller', panels);
      await logActivity('delete_reseller', `Reseller "${username}" dihapus`);
      toast(`Reseller "${username}" dihapus!`, 'success');
      renderAkunReseller(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: ' + e.message, 'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — OWN RESELLER
// ──────────────────────────────────────────────────────────────
async function renderDevOwnReseller(main) {
  const data = await dbRead('data_ownresseller');
  main.innerHTML = `
    <div class="page-header"><h2>Own Reseller</h2><p>Kelola akun own reseller</p></div>

    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-purple">👑</div><span>Buat Own Reseller</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field"><label>Username</label><input type="text" id="dor-user" placeholder="username" /></div>
          <div class="field"><label>Password</label><input type="password" id="dor-pass" placeholder="password" /></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="devCreateOwnReseller()">Buat Own Reseller</button>
      </div>
    </div>

    <div class="accordion" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">👥</div>
          <span>List Own Reseller (${Object.keys(data).length})</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        ${listItems(Object.entries(data), (u,d) => ({
          name: u, sub: `Own Reseller · ${fmtDate(d.createdAt)}`,
          avatarStyle: 'background:linear-gradient(135deg,var(--purple),var(--accent))',
          actions: `<div class="btn-circle btn-trash" onclick="devDeleteOwnReseller('${u}')">🗑️</div>`,
        }))}
      </div>
    </div>`;
}

async function devCreateOwnReseller() {
  const user = document.getElementById('dor-user').value.trim();
  const pass = document.getElementById('dor-pass').value.trim();
  if (!user||!pass) { toast('Lengkapi field!','error'); return; }
  try {
    const data = await dbRead('data_ownresseller');
    if (data[user]) { toast('Username sudah ada!','error'); return; }
    data[user] = { password: pass, createdAt: new Date().toISOString() };
    await dbWrite('data_ownresseller', data);
    await logActivity('create_own_reseller', `Own Reseller "${user}" dibuat`);
    toast(`Own Reseller "${user}" dibuat!`, 'success');
    renderDevOwnReseller(document.getElementById('main-content'));
  } catch(e) { toast('Gagal: '+e.message,'error'); }
}

async function devDeleteOwnReseller(username) {
  confirmBox(`Hapus own reseller "${username}"?`, '', async () => {
    try {
      const data = await dbRead('data_ownresseller');
      delete data[username];
      await dbWrite('data_ownresseller', data);
      const panels = await dbRead('ownpanel_resseller');
      delete panels[username];
      await dbWrite('ownpanel_resseller', panels);
      await logActivity('delete_own_reseller', `Own Reseller "${username}" dihapus`);
      toast(`Own Reseller "${username}" dihapus!`,'success');
      renderDevOwnReseller(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — RESELLER
// ──────────────────────────────────────────────────────────────
async function renderDevReseller(main) {
  const data = await dbRead('data_resseller');
  main.innerHTML = `
    <div class="page-header"><h2>Reseller</h2><p>Kelola semua akun reseller</p></div>

    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">👤</div><span>Buat Reseller</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field"><label>Username</label><input type="text" id="dr-user" placeholder="username" /></div>
          <div class="field"><label>Password</label><input type="password" id="dr-pass" placeholder="password" /></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="devCreateReseller()">Buat Reseller</button>
      </div>
    </div>

    <div class="accordion" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-green">👥</div>
          <span>List Semua Reseller (${Object.keys(data).length})</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        ${listItems(Object.entries(data), (u,d) => ({
          name: u, sub: fmtDate(d.createdAt),
          actions: `<div class="btn-circle btn-trash" onclick="devDeleteReseller('${u}')">🗑️</div>`,
        }))}
      </div>
    </div>`;
}

async function devCreateReseller() {
  const user = document.getElementById('dr-user').value.trim();
  const pass = document.getElementById('dr-pass').value.trim();
  if (!user||!pass) { toast('Lengkapi field!','error'); return; }
  try {
    const data = await dbRead('data_resseller');
    if (data[user]) { toast('Username sudah ada!','error'); return; }
    data[user] = { password: pass, createdBy: 'developer', createdAt: new Date().toISOString() };
    await dbWrite('data_resseller', data);
    await logActivity('create_reseller', `Reseller "${user}" dibuat oleh developer`);
    toast(`Reseller "${user}" dibuat!`,'success');
    renderDevReseller(document.getElementById('main-content'));
  } catch(e) { toast('Gagal: '+e.message,'error'); }
}

async function devDeleteReseller(username) {
  confirmBox(`Hapus reseller "${username}"?`, '', async () => {
    try {
      const data = await dbRead('data_resseller');
      delete data[username];
      await dbWrite('data_resseller', data);
      await logActivity('delete_reseller', `Reseller "${username}" dihapus`);
      toast(`Reseller "${username}" dihapus!`,'success');
      renderDevReseller(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — DEVELOPER
// ──────────────────────────────────────────────────────────────
async function renderDevDeveloper(main) {
  const data = await dbRead('developers');
  main.innerHTML = `
    <div class="page-header"><h2>Developer</h2><p>Kelola akun developer (auto buat admin panel)</p></div>

    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-yellow">🛠️</div><span>Buat Developer</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="grid-2" style="margin-bottom:12px">
          <div class="field"><label>Username</label><input type="text" id="dd-user" placeholder="username developer baru" /></div>
          <div class="field"><label>Password</label><input type="password" id="dd-pass" placeholder="password" /></div>
        </div>
        <p class="hint">⚠️ Akun admin panel akan otomatis dibuat di Pterodactyl dengan username &amp; password yang sama.</p>
        <button class="btn btn-primary btn-sm" id="dd-btn" onclick="devCreateDeveloper()">🛠️ Buat Developer</button>
      </div>
    </div>

    <div class="accordion" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-yellow">👨‍💻</div>
          <span>List Developer (${Object.keys(data).length})</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        ${Object.entries(data).map(([u,d]) => `
          <div class="list-item">
            <div class="li-info">
              <div class="li-avatar" style="background:linear-gradient(135deg,var(--yellow),#ff9500)">${u[0].toUpperCase()}</div>
              <div>
                <div class="li-name">${u}
                  ${u === SESSION.username ? '<span class="you-badge">KAMU</span>' : ''}
                </div>
                <div class="li-sub">Developer${d.pteroId ? ' · Ptero ID: '+d.pteroId : ''} · ${fmtDate(d.createdAt)}</div>
              </div>
            </div>
            ${u !== SESSION.username
              ? `<div class="btn-circle btn-trash" onclick="devDeleteDeveloper('${u}')">🗑️</div>`
              : ''}
          </div>`).join('')}
      </div>
    </div>`;
}

async function devCreateDeveloper() {
  const user = document.getElementById('dd-user').value.trim();
  const pass = document.getElementById('dd-pass').value.trim();
  if (!user||!pass) { toast('Lengkapi field!','error'); return; }
  const btn = document.getElementById('dd-btn');
  btn.innerHTML = '<span class="spinner"></span> Membuat...';
  btn.disabled = true;
  try {
    // Buat admin di Pterodactyl
    const pteroRes = await apiPtero('POST', 'users', {
      email: `${user}@developer.local`,
      username: user, first_name: user, last_name: 'Dev',
      password: pass, root_admin: true,
    });
    const pteroId = pteroRes.attributes.id;

    const data = await dbRead('developers');
    if (data[user]) { toast('Username sudah ada!','error'); btn.innerHTML='🛠️ Buat Developer'; btn.disabled=false; return; }
    data[user] = { password: pass, pteroId, createdAt: new Date().toISOString() };
    await dbWrite('developers', data);
    await logActivity('create_developer', `Developer "${user}" dibuat (Ptero ID: ${pteroId})`);
    toast(`Developer "${user}" dibuat! Admin panel ID: ${pteroId} 🎉`, 'success');
    renderDevDeveloper(document.getElementById('main-content'));
  } catch(e) {
    toast('Gagal: '+e.message,'error');
    btn.innerHTML = '🛠️ Buat Developer';
    btn.disabled = false;
  }
}

async function devDeleteDeveloper(username) {
  confirmBox(`Hapus developer "${username}"?`, 'Akun admin panel di Pterodactyl juga akan dihapus.', async () => {
    try {
      const data = await dbRead('developers');
      if (data[username]?.pteroId) {
        try { await apiPtero('DELETE', `users/${data[username].pteroId}`); } catch {}
      }
      delete data[username];
      await dbWrite('developers', data);
      await logActivity('delete_developer', `Developer "${username}" dihapus`);
      toast(`Developer "${username}" dihapus!`,'success');
      renderDevDeveloper(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — SEMUA PANEL
// ──────────────────────────────────────────────────────────────
async function renderDevAllPanel(main) {
  main.innerHTML = `
    <div class="page-header"><h2>Semua Panel</h2><p>Semua server di Pterodactyl</p></div>
    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-green">🌐</div><span>List Panel</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="dap-list">
        <div class="empty-state"><div class="spinner"></div><p>Memuat dari API...</p></div>
      </div>
    </div>`;

  try {
    const res = await apiPtero('GET','servers', null, { per_page: 100, include: 'user' });
    const servers = res.data || [];
    const el = document.getElementById('dap-list');
    if (!servers.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>Belum ada server.</p></div>';
      return;
    }
    el.innerHTML = servers.map(s => {
      const a = s.attributes;
      return `
        <div class="list-item" id="srv-${a.id}">
          <div class="li-info">
            <div class="li-avatar">${a.name[0].toUpperCase()}</div>
            <div>
              <div class="li-name">${a.name}</div>
              <div class="li-sub">ID:${a.id} · RAM:${a.limits.memory}MB · ${a.suspended?'⏸ Suspended':'▶ Active'}</div>
            </div>
          </div>
          <div class="li-badges">
            ${a.suspended ? '<div class="badge badge-star" style="color:var(--yellow)" title="Suspended">⏸</div>' : ''}
          </div>
          <div class="btn-group">
            <div class="btn-circle btn-inspect" title="Lihat Stats" onclick="showStats(${a.id},'${a.name}')">🔍</div>
            <div class="btn-circle btn-suspend" title="${a.suspended?'Unsuspend':'Suspend'}"
              onclick="toggleSuspend(${a.id},${a.suspended},'${a.name}')">🚫</div>
            <div class="btn-circle btn-trash" title="Hapus"
              onclick="devDeletePanel(${a.id},'${a.name}')">🗑️</div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('dap-list').innerHTML =
      `<div class="empty-state"><div class="ei">⚠️</div><p>Gagal: ${e.message}</p></div>`;
  }
}

async function toggleSuspend(serverId, isSuspended, name) {
  try {
    await apiPtero('POST', `servers/${serverId}/${isSuspended?'unsuspend':'suspend'}`);
    await logActivity(isSuspended?'unsuspend_panel':'suspend_panel', `Panel "${name}" (ID: ${serverId})`);
    toast(`Server berhasil ${isSuspended?'diaktifkan':'disuspend'}!`,'success');
    renderDevAllPanel(document.getElementById('main-content'));
  } catch(e) { toast('Gagal: '+e.message,'error'); }
}

async function devDeletePanel(serverId, name) {
  confirmBox(`Hapus server "${name}"?`, 'Server dihapus permanen!', async () => {
    try {
      await apiPtero('DELETE', `servers/${serverId}`);
      await logActivity('delete_panel', `Panel "${name}" (ID: ${serverId}) dihapus oleh developer`);
      toast(`Server "${name}" dihapus!`,'success');
      renderDevAllPanel(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

async function showStats(serverId, serverName) {
  openModal('stats-modal');
  document.getElementById('stats-title').textContent = `📊 ${serverName}`;
  document.getElementById('stats-content').innerHTML =
    '<div class="empty-state"><div class="spinner"></div><p>Memuat...</p></div>';
  try {
    const res = await apiPtero('GET', `servers/${serverId}`, null, { include: 'allocations' });
    const a = res.attributes;
    document.getElementById('stats-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">RAM Limit</div>
          <div class="stat-value c-blue">${a.limits.memory}<span style="font-size:11px;color:var(--text3)"> MB</span></div>
          <div class="progress-bar"><div class="progress-fill fill-blue" style="width:55%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Disk Limit</div>
          <div class="stat-value c-green">${a.limits.disk}<span style="font-size:11px;color:var(--text3)"> MB</span></div>
          <div class="progress-bar"><div class="progress-fill fill-green" style="width:40%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">CPU Limit</div>
          <div class="stat-value c-yellow">${a.limits.cpu||'∞'}<span style="font-size:11px;color:var(--text3)"> %</span></div>
          <div class="progress-bar"><div class="progress-fill fill-yellow" style="width:30%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Status</div>
          <div class="stat-value ${a.suspended?'c-red':'c-green'}" style="font-size:13px;margin-top:6px">
            ${a.suspended ? '⏸ SUSPENDED' : '▶ ACTIVE'}
          </div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);font-family:'Space Mono',monospace;line-height:1.8">
        <div>UUID: ${a.uuid}</div>
        <div>Server ID: ${a.id}</div>
        <div>Egg ID: ${a.egg}</div>
        <div>Swap: ${a.limits.swap}MB · IO: ${a.limits.io}</div>
      </div>
      <p class="hint" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        ℹ️ Stats real-time membutuhkan Client API Key dari akun pemilik server.
      </p>`;
  } catch(e) {
    document.getElementById('stats-content').innerHTML =
      `<div class="empty-state"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
  }
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — SEMUA USER
// ──────────────────────────────────────────────────────────────
async function renderDevAllUser(main) {
  main.innerHTML = `
    <div class="page-header"><h2>Semua User</h2><p>Semua user di panel Pterodactyl</p></div>
    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">👥</div><span>List User</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="dau-list">
        <div class="empty-state"><div class="spinner"></div><p>Memuat dari API...</p></div>
      </div>
    </div>`;

  try {
    const res = await apiPtero('GET','users', null, { per_page: 100 });
    const users = res.data || [];
    const el = document.getElementById('dau-list');
    if (!users.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>Tidak ada user.</p></div>';
      return;
    }
    el.innerHTML = users.map(u => {
      const a = u.attributes;
      const isAdmin = a.root_admin;
      return `
        <div class="list-item">
          <div class="li-info">
            <div class="li-avatar" style="${isAdmin?'background:linear-gradient(135deg,var(--yellow),#ff9500)':''}">${a.username[0].toUpperCase()}</div>
            <div>
              <div class="li-name">${a.username} <span style="color:var(--text3);font-weight:400;font-size:11px">&lt;${a.email}&gt;</span></div>
              <div class="li-sub">ID: ${a.id} · ${isAdmin?'Admin Panel':'User Biasa'}</div>
            </div>
          </div>
          <div class="li-badges">
            ${isAdmin ? '<div class="badge badge-star" title="Admin Panel">⭐</div>' : ''}
          </div>
          <div class="btn-group">
            <div class="btn-circle btn-trash" title="Hapus User" onclick="devDeleteUser(${a.id},'${a.username}')">🗑️</div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('dau-list').innerHTML =
      `<div class="empty-state"><div class="ei">⚠️</div><p>Gagal: ${e.message}</p></div>`;
  }
}

async function devDeleteUser(userId, username) {
  confirmBox(`Hapus user "${username}"?`, 'User dihapus dari Pterodactyl.', async () => {
    try {
      await apiPtero('DELETE', `users/${userId}`);
      await logActivity('delete_user', `User "${username}" (ID: ${userId}) dihapus`);
      toast(`User "${username}" dihapus!`,'success');
      renderDevAllUser(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — AKTIVITAS
// ──────────────────────────────────────────────────────────────
async function renderAktivitas(main) {
  main.innerHTML = `
    <div class="page-header">
      <h2>📊 Aktivitas</h2>
      <p>Log semua aktivitas buyer & developer</p>
    </div>
    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title">
          <div class="accordion-icon icon-blue">📋</div>
          <span>Log Aktivitas</span>
        </div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="act-list">
        <div class="empty-state"><div class="spinner"></div><p>Memuat log...</p></div>
      </div>
    </div>`;

  try {
    const logs = await dbRead('activity_log');
    const arr = Array.isArray(logs) ? logs : [];
    const el = document.getElementById('act-list');

    if (!arr.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>Belum ada aktivitas.</p></div>';
      return;
    }

    // Group by date
    const grouped = {};
    arr.forEach(log => {
      const dateKey = new Date(log.ts).toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(log);
    });

    el.innerHTML = `
      <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--text3)">Total: ${arr.length} aktivitas</span>
        <button class="btn btn-ghost btn-sm" onclick="clearLogs()">🗑️ Hapus Semua Log</button>
      </div>
      ${Object.entries(grouped).map(([date, items]) => `
        <div class="log-date-group">
          <div class="log-date-label">${date}</div>
          ${items.map(log => `
            <div class="log-item">
              <div class="log-icon">${ACTION_ICONS[log.action] || '📌'}</div>
              <div class="log-body">
                <div class="log-action">${ACTION_LABELS[log.action] || log.action}</div>
                <div class="log-detail">${log.detail}</div>
                <div class="log-meta">
                  <span class="log-actor">@${log.actor}</span>
                  <span class="log-role-badge log-role-${log.role}">${log.role}</span>
                  <span class="log-time">${fmtTs(log.ts)}</span>
                </div>
              </div>
            </div>`).join('')}
        </div>`).join('')}`;
  } catch(e) {
    document.getElementById('act-list').innerHTML =
      `<div class="empty-state"><div class="ei">⚠️</div><p>Gagal: ${e.message}</p></div>`;
  }
}

async function clearLogs() {
  confirmBox('Hapus semua log?', 'Log aktivitas akan dikosongkan.', async () => {
    try {
      await dbWrite('activity_log', []);
      toast('Log aktivitas dikosongkan!', 'success');
      renderAktivitas(document.getElementById('main-content'));
    } catch(e) { toast('Gagal: '+e.message,'error'); }
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION: DEVELOPER — SISTEM API
// ──────────────────────────────────────────────────────────────
async function renderSistemAPI(main) {
  main.innerHTML = `
    <div class="page-header">
      <h2>🔑 Sistem API</h2>
      <p>Kelola API Key untuk akses programatik</p>
    </div>

    <div class="accordion open">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-yellow">➕</div><span>Buat API Key Baru</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="field">
          <label>Label / Nama Key</label>
          <input type="text" id="ak-label" placeholder="contoh: Bot Telegram, Website Toko..." />
        </div>
        <button class="btn btn-primary btn-sm" id="ak-btn" onclick="createAPIKey()">🔑 Generate API Key</button>
      </div>
    </div>

    <div class="accordion open" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-blue">📋</div><span>API Key Saya</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="ak-list">
        <div class="empty-state"><div class="spinner"></div><p>Memuat...</p></div>
      </div>
    </div>

    <div class="accordion" style="margin-top:10px">
      <div class="accordion-header" onclick="toggleAcc(this)">
        <div class="accordion-title"><div class="accordion-icon icon-green">📖</div><span>Dokumentasi API</span></div>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body">
        <div class="api-doc">
          <div class="api-doc-base">
            <span class="api-label">Base URL</span>
            <code id="api-base-url">https://your-domain.vercel.app/api/panel</code>
            <button class="btn-copy" onclick="copyText('api-base-url')">📋</button>
          </div>
          <div class="api-doc-auth">
            <span class="api-label">Auth Header</span>
            <code>X-API-Key: dev_xxxxxxxxxxxxxxxx</code>
          </div>

          <div class="api-divider">Endpoints</div>

          <div class="api-endpoint">
            <div class="api-method post">POST</div>
            <div class="api-path">/api/panel?action=create_reseller</div>
          </div>
          <div class="api-body">
            <pre>{ "username": "john", "password": "pass123" }</pre>
          </div>

          <div class="api-endpoint" style="margin-top:10px">
            <div class="api-method post">POST</div>
            <div class="api-path">/api/panel?action=create_own_reseller</div>
          </div>
          <div class="api-body">
            <pre>{ "username": "john", "password": "pass123" }</pre>
          </div>

          <div class="api-endpoint" style="margin-top:10px">
            <div class="api-method get">GET</div>
            <div class="api-path">/api/panel?action=list_reseller</div>
          </div>

          <div class="api-endpoint" style="margin-top:10px">
            <div class="api-method get">GET</div>
            <div class="api-path">/api/panel?action=list_own_reseller</div>
          </div>

          <div class="api-endpoint" style="margin-top:10px">
            <div class="api-method delete">DELETE</div>
            <div class="api-path">/api/panel?action=delete_reseller</div>
          </div>
          <div class="api-body">
            <pre>{ "username": "john" }</pre>
          </div>

          <div class="api-endpoint" style="margin-top:10px">
            <div class="api-method delete">DELETE</div>
            <div class="api-path">/api/panel?action=delete_own_reseller</div>
          </div>
          <div class="api-body">
            <pre>{ "username": "john" }</pre>
          </div>

          <div class="api-divider">Contoh cURL</div>
          <div class="api-body">
            <pre id="curl-example">curl -X POST "https://your-domain.vercel.app/api/panel?action=create_reseller" \
  -H "X-API-Key: dev_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"username":"john","password":"pass123"}'</pre>
            <button class="btn-copy" onclick="copyText('curl-example')" style="margin-top:6px">📋 Copy</button>
          </div>
        </div>
      </div>
    </div>`;

  // Set base URL otomatis
  document.getElementById('api-base-url').textContent = window.location.origin + '/api/panel';
  document.getElementById('curl-example').textContent =
    `curl -X POST "${window.location.origin}/api/panel?action=create_reseller" \\
  -H "X-API-Key: dev_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"john","password":"pass123"}'`;

  loadAPIKeys();
}

async function loadAPIKeys() {
  const el = document.getElementById('ak-list');
  if (!el) return;
  try {
    const res = await fetch('/api/panel?action=list_keys', {
      headers: {
        'X-Dev-User': SESSION.username,
        'X-Dev-Pass': SESSION.userData.password,
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (!data.keys.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">🔑</div><p>Belum ada API key. Generate dulu!</p></div>';
      return;
    }

    el.innerHTML = data.keys.map(k => `
      <div class="list-item">
        <div class="li-info">
          <div class="li-avatar icon-yellow" style="background:rgba(255,192,69,.15);color:var(--yellow)">🔑</div>
          <div>
            <div class="li-name">${k.label}</div>
            <div class="li-sub">Dipakai: ${k.usageCount}x · ${fmtDate(k.createdAt)}</div>
          </div>
        </div>
        <div class="btn-group">
          <div class="btn-circle btn-inspect" title="Copy Key" onclick="copyAPIKey('${k.key}')">📋</div>
          <div class="btn-circle btn-trash" title="Hapus" onclick="deleteAPIKey('${k.key}', '${k.label}')">🗑️</div>
        </div>
      </div>
      <div class="api-key-display" id="key-display-${k.key.slice(-6)}" style="display:none">
        <code>${k.key}</code>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
  }
}

async function createAPIKey() {
  const label = document.getElementById('ak-label').value.trim() || 'API Key';
  const btn = document.getElementById('ak-btn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const res = await fetch('/api/panel?action=create_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-User': SESSION.username,
        'X-Dev-Pass': SESSION.userData.password,
      },
      body: JSON.stringify({ label })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Show key in modal
    showKeyModal(data.key, label);
    document.getElementById('ak-label').value = '';
    loadAPIKeys();
  } catch(e) {
    toast('Gagal: ' + e.message, 'error');
  } finally {
    btn.innerHTML = '🔑 Generate API Key';
    btn.disabled = false;
  }
}

function showKeyModal(key, label) {
  // Create temporary modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <h3>🎉 API Key Berhasil Dibuat</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Label: <b>${label}</b></p>
      <div class="api-key-reveal">
        <code id="new-key-val">${key}</code>
        <button class="btn btn-primary btn-sm" onclick="copyText('new-key-val');toast('Key di-copy!','success')">📋 Copy</button>
      </div>
      <p style="font-size:11px;color:var(--red);margin-top:12px">
        ⚠️ Simpan key ini sekarang! Key hanya ditampilkan sekali.
      </p>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function copyAPIKey(key) {
  navigator.clipboard.writeText(key).then(() => toast('API Key di-copy!', 'success'));
}

async function deleteAPIKey(key, label) {
  confirmBox(`Hapus API Key "${label}"?`, 'Key yang sudah dipakai tidak bisa digunakan lagi.', async () => {
    try {
      const res = await fetch('/api/panel?action=delete_key', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-User': SESSION.username,
          'X-Dev-Pass': SESSION.userData.password,
        },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('API Key dihapus!', 'success');
      loadAPIKeys();
    } catch(e) { toast('Gagal: ' + e.message, 'error'); }
  });
}

function copyText(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent)
    .then(() => toast('Disalin!', 'success'))
    .catch(() => toast('Gagal copy', 'error'));
}

// ──────────────────────────────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────────────────────────────
function toggleAcc(header) {
  header.parentElement.classList.toggle('open');
}

function listItems(entries, mapFn) {
  if (!entries.length) return '<div class="empty-state"><div class="ei">📭</div><p>Kosong.</p></div>';
  return entries.map(([u, d]) => {
    const { name, sub, avatarStyle='', actions='' } = mapFn(u, d);
    return `
      <div class="list-item">
        <div class="li-info">
          <div class="li-avatar" style="${avatarStyle}">${name[0].toUpperCase()}</div>
          <div><div class="li-name">${name}</div><div class="li-sub">${sub}</div></div>
        </div>
        ${actions}
      </div>`;
  }).join('');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  return `${days[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideIn .3s ease reverse';
    setTimeout(() => el.remove(), 280);
  }, 3500);
}

let _confirmCb = null;
function confirmBox(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  _confirmCb = cb;
  openModal('confirm-modal');
  document.getElementById('confirm-ok').onclick = () => {
    closeModal('confirm-modal');
    if (_confirmCb) _confirmCb();
  };
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});
