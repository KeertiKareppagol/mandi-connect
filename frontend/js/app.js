// ─────────────────────────────────────────────
// CONFIG & STATE
// ─────────────────────────────────────────────
const API = 'http://localhost:3000/api';
let token = localStorage.getItem('mc_token');
let currentUser = JSON.parse(localStorage.getItem('mc_user') || 'null');
let selectedHarvest = null;
let harvestPhoto = null;
let harvestLat = null, harvestLng = null;
let regLat = null, regLng = null;
let mapInstances = {};
let selectedRole = 'farmer';
let pendingDeleteId = null;

// ─────────────────────────────────────────────
// INDEXEDDB - OFFLINE STORAGE
// ─────────────────────────────────────────────
let idb;
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('MandiConnect', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror = reject;
  });
}

async function idbSave(store, data) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function idbGetAll(store) {
  return new Promise((resolve) => {
    const tx = idb.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function idbClear(store) {
  return new Promise((resolve) => {
    const tx = idb.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
  });
}

async function saveToOfflineQueue(action) {
  const entry = { id: 'act_' + Date.now() + Math.random().toString(36).slice(2), ...action, timestamp: Date.now() };
  await idbSave('queue', entry);
  showToast('📵 ' + t('offline_msg'));
}

async function syncOfflineQueue() {
  if (!idb) return;
  const queue = await idbGetAll('queue');
  if (!queue.length) return;
  try {
    const res = await apiFetch('/sync', { method: 'POST', body: { actions: queue } });
    if (res.success) {
      await idbClear('queue');
      showToast(`✅ Synced ${res.synced} offline actions!`, 'success');
    }
  } catch (e) {}
}

async function cacheData(key, data) {
  if (!idb) return;
  await idbSave('cache', { key, data, ts: Date.now() });
}
async function getCached(key) {
  if (!idb) return null;
  return new Promise(resolve => {
    const tx = idb.transaction('cache', 'readonly');
    const req = tx.objectStore('cache').get(key);
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = () => resolve(null);
  });
}

// ─────────────────────────────────────────────
// ONLINE/OFFLINE
// ─────────────────────────────────────────────
function updateOnlineStatus() {
  const offline = !navigator.onLine;
  document.getElementById('offlineBanner').style.display = offline ? 'block' : 'none';
  const dot = document.getElementById('onlineDot');
  if (dot) { dot.classList.toggle('offline', offline); dot.title = offline ? 'Offline' : 'Online'; }
  if (navigator.onLine) syncOfflineQueue();
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ─────────────────────────────────────────────
// API HELPER
// ─────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const res = await fetch(API + endpoint, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3200);
}

// ─────────────────────────────────────────────
// GPS LOCATION
// ─────────────────────────────────────────────
function getGPS(callback) {
  if (!navigator.geolocation) { showToast('GPS not supported on this device'); return; }
  showToast('📍 Getting your location...');
  navigator.geolocation.getCurrentPosition(
    pos => callback(pos.coords.latitude, pos.coords.longitude),
    err => showToast('❌ Location denied: ' + err.message)
  );
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await openIDB();
  updateOnlineStatus();
  createParticles();
  if (token && currentUser) {
    showApp();
  } else {
    showScreen('welcomeScreen');
  }
  setupWelcome();
  setupAuth();
  setupModals();
  setupWalletPage();
  setupTracking();
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showApp() {
  showScreen('appScreen');
  setupHeader();
  setupSidebar();
  navigateTo('dashboard');
}

// ─────────────────────────────────────────────
// WELCOME PARTICLES
// ─────────────────────────────────────────────
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const emojis = ['🌾', '🍅', '🧅', '🥕', '🌽', '🥔', '🥬', '🍇'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = emojis[i % emojis.length];
    p.style.cssText = `left: ${Math.random() * 100}%; font-size: ${1 + Math.random() * 1.5}rem; animation-duration: ${8 + Math.random() * 12}s; animation-delay: ${Math.random() * 8}s; opacity: 0.2;`;
    container.appendChild(p);
  }
}

// ─────────────────────────────────────────────
// WELCOME
// ─────────────────────────────────────────────
function setupWelcome() {
  document.getElementById('welcomeLoginBtn')?.addEventListener('click', () => {
    showScreen('authScreen');
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector('[data-tab="login"]').classList.add('active');
    document.getElementById('loginForm').classList.add('active');
  });
  document.getElementById('welcomeRegisterBtn')?.addEventListener('click', () => {
    showScreen('authScreen');
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector('[data-tab="register"]').classList.add('active');
    document.getElementById('registerForm').classList.add('active');
  });
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
function setupAuth() {
  document.getElementById('authBackBtn')?.addEventListener('click', () => showScreen('welcomeScreen'));

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab + 'Form').classList.add('active');
    });
  });

  document.querySelectorAll('.role-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedRole = opt.dataset.role;
      document.getElementById('villageGroup').style.display = selectedRole === 'farmer' ? 'block' : 'none';
      document.getElementById('cityGroup').style.display = selectedRole === 'retailer' ? 'block' : 'none';
    });
  });

  document.getElementById('getLocationBtn')?.addEventListener('click', () => {
    getGPS((lat, lng) => {
      regLat = lat; regLng = lng;
      const el = document.getElementById('gpsResult');
      el.style.display = 'block';
      el.textContent = `📍 Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      showToast('✅ Location captured!', 'success');
    });
  });

  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!phone || !password) return showAuthError('Please fill all fields');
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'Logging in...';
    try {
      const data = await apiFetch('/auth/login', { method: 'POST', body: { phone, password } });
      token = data.token; currentUser = data.user;
      localStorage.setItem('mc_token', token);
      localStorage.setItem('mc_user', JSON.stringify(currentUser));
      showApp();
    } catch (e) {
      showAuthError(e.message);
      btn.textContent = 'Login →';
    }
  });

  document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const village = document.getElementById('regVillage').value.trim();
    const city = document.getElementById('regCity').value.trim();
    if (!name || !phone || !password) return showAuthError('Please fill all fields');
    const btn = document.getElementById('registerBtn');
    btn.textContent = 'Creating...';
    try {
      const data = await apiFetch('/auth/register', { method: 'POST', body: { name, phone, password, role: selectedRole, village, city, lat: regLat, lng: regLng } });
      token = data.token; currentUser = data.user;
      localStorage.setItem('mc_token', token);
      localStorage.setItem('mc_user', JSON.stringify(currentUser));
      showApp();
    } catch (e) {
      showAuthError(e.message);
      btn.textContent = 'Create Account →';
    }
  });
}

function showAuthError(msg) {
  document.getElementById('authError').textContent = '⚠️ ' + msg;
  setTimeout(() => document.getElementById('authError').textContent = '', 4000);
}

// ─────────────────────────────────────────────
// HEADER & SIDEBAR
// ─────────────────────────────────────────────
function setupHeader() {
  document.getElementById('userAvatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('headerBalance').textContent = '₹' + (currentUser.balance || 0).toLocaleString();
  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

function setupSidebar() {
  document.getElementById('sbAvatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('sbName').textContent = currentUser.name;
  document.getElementById('sbRole').textContent = currentUser.role;
  const items = getNavItems();
  document.getElementById('sidebarNav').innerHTML = items.map(i =>
    `<div class="nav-item" data-page="${i.page}"><span class="nav-icon">${i.icon}</span>${i.label}</div>`
  ).join('');
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { navigateTo(item.dataset.page); closeSidebar(); });
  });
}

function getNavItems() {
  const base = [{ icon: '🏠', label: t('dashboard'), page: 'dashboard' }];
  if (currentUser.role === 'farmer') return [
    ...base,
    { icon: '📦', label: t('my_listings'), page: 'listings' },
    { icon: '📋', label: t('my_orders'), page: 'orders' },
    { icon: '🚦', label: t('order_tracking'), page: 'tracking' },
    { icon: '🗺️', label: t('farmer_map'), page: 'map' },
    { icon: '💰', label: t('wallet'), page: 'wallet' },
    { icon: '🚚', label: t('logistics_label'), page: 'logistics' }
  ];
  if (currentUser.role === 'retailer') return [
    ...base,
    { icon: '🛒', label: t('marketplace'), page: 'marketplace' },
    { icon: '📋', label: t('my_orders'), page: 'orders' },
    { icon: '🚦', label: t('order_tracking'), page: 'tracking' },
    { icon: '🗺️', label: t('farmer_map'), page: 'map' },
    { icon: '💰', label: t('wallet'), page: 'wallet' },
    { icon: '🚚', label: t('logistics_label'), page: 'logistics' }
  ];
  return [
    ...base,
    { icon: '🚚', label: 'Deliveries', page: 'logistics' },
    { icon: '💰', label: t('wallet'), page: 'wallet' }
  ];
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function logout() {
  localStorage.removeItem('mc_token');
  localStorage.removeItem('mc_user');
  token = null; currentUser = null;
  showScreen('welcomeScreen');
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  loadPage(page);
}
function loadPage(page) {
  const map = {
    dashboard: loadDashboard,
    marketplace: loadMarketplace,
    listings: loadListings,
    orders: loadOrders,
    tracking: loadTracking,
    map: loadFarmerMap,
    wallet: loadWallet,
    logistics: loadLogistics
  };
  map[page]?.();
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('dashGreeting').textContent = `${g}, ${currentUser.name.split(' ')[0]} 👋`;
  try {
    const data = await apiFetch('/dashboard');
    await cacheData('dashboard', data);
    renderDashStats(data.stats);
    currentUser.balance = data.user?.balance || currentUser.balance;
    localStorage.setItem('mc_user', JSON.stringify(currentUser));
    document.getElementById('headerBalance').textContent = '₹' + (currentUser.balance || 0).toLocaleString();
  } catch {
    const cached = await getCached('dashboard');
    if (cached) renderDashStats(cached.stats);
    else document.getElementById('dashStats').innerHTML = '<div class="empty-state">Could not load stats</div>';
  }

  document.getElementById('recentActivity').innerHTML = `
    <div class="activity-item"><div class="activity-icon">🌾</div><div class="activity-text">Welcome to MandiConnect! Use the menu to navigate.</div><div class="activity-time">Now</div></div>
    <div class="activity-item"><div class="activity-icon">🌐</div><div class="activity-text">Language switcher available at the top — supports 6 languages!</div><div class="activity-time">Tip</div></div>
    <div class="activity-item"><div class="activity-icon">🚦</div><div class="activity-text">Check Order Tracking to see real-time delivery status.</div><div class="activity-time">Tip</div></div>
    <div class="activity-item"><div class="activity-icon">📵</div><div class="activity-text">Works offline! Orders are saved locally and sync when you reconnect.</div><div class="activity-time">Tip</div></div>
  `;
}

function renderDashStats(s) {
  let html = '';
  if (currentUser.role === 'farmer') {
    html = `
      <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-num">${s.harvests||0}</div><div class="stat-label">Total Listings</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-num">${s.activeListings||0}</div><div class="stat-label">Active</div></div>
      <div class="stat-card"><div class="stat-icon">🛒</div><div class="stat-num">${s.orders||0}</div><div class="stat-label">Orders</div></div>
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-num">₹${(s.earnings||0).toLocaleString()}</div><div class="stat-label">Earnings</div></div>
    `;
  } else {
    html = `
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-num">${s.orders||0}</div><div class="stat-label">Total Orders</div></div>
      <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-num">${s.pending||0}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-icon">💸</div><div class="stat-num">₹${(s.spent||0).toLocaleString()}</div><div class="stat-label">Total Spent</div></div>
      <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-num">₹${(s.balance||0).toLocaleString()}</div><div class="stat-label">Balance</div></div>
    `;
  }
  document.getElementById('dashStats').innerHTML = html;
}

// ─────────────────────────────────────────────
// MARKETPLACE
// ─────────────────────────────────────────────
async function loadMarketplace(crop = '', village = '') {
  const grid = document.getElementById('marketplaceGrid');
  grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Loading...</div>';
  let harvests = [];
  try {
    const params = new URLSearchParams();
    if (crop) params.set('crop', crop);
    if (village) params.set('village', village);
    const data = await apiFetch('/harvests?' + params);
    harvests = data.harvests;
    await cacheData('harvests', harvests);
  } catch {
    const cached = await getCached('harvests');
    if (cached) { harvests = cached; showToast('📵 Showing cached data'); }
  }

  if (!harvests.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🌾</div>No harvests found</div>';
    return;
  }

  grid.innerHTML = harvests.map(h => `
    <div class="harvest-card">
      ${h.photo ? `<img class="hcard-photo" src="${h.photo}" alt="${h.crop}"/>` : `<div class="hcard-top"><div class="hcard-emoji">${h.image}</div><div class="hcard-crop">${h.crop}</div></div>`}
      ${h.photo ? `<div style="padding:0.8rem 1rem 0;font-family:var(--font);font-weight:800;font-size:1.05rem">${h.crop}</div>` : ''}
      <div class="hcard-body">
        <div class="hcard-price">₹${h.pricePerUnit}<span>/kg</span></div>
        <div class="hcard-meta">
          <div class="hcard-row">📦 <span>${h.quantity} kg available</span></div>
          <div class="hcard-row">👤 <span>${h.farmerName}</span></div>
          <div class="hcard-row">📍 <span>${h.village}</span></div>
          <div class="hcard-row">📅 <span>From ${h.availableFrom}</span></div>
          ${h.description ? `<div class="hcard-row">ℹ️ <span>${h.description}</span></div>` : ''}
        </div>
      </div>
      <div class="hcard-actions">
        ${currentUser.role === 'retailer' ? `<button class="btn-order" onclick="openOrderModal('${h.id}')">🛒 Order</button>` : ''}
        <button class="btn-map-pin" onclick="showFarmerOnMap(${h.lat||16.40},${h.lng||74.38},'${h.farmerName}','${h.village}')">📍</button>
      </div>
    </div>
  `).join('');

  document.getElementById('gridViewBtn').onclick = () => {
    document.getElementById('marketplaceGrid').style.display = 'grid';
    document.getElementById('marketplaceMap').style.display = 'none';
    document.getElementById('gridViewBtn').classList.add('active');
    document.getElementById('mapViewBtn').classList.remove('active');
  };
  document.getElementById('mapViewBtn').onclick = () => {
    document.getElementById('marketplaceGrid').style.display = 'none';
    document.getElementById('marketplaceMap').style.display = 'block';
    document.getElementById('gridViewBtn').classList.remove('active');
    document.getElementById('mapViewBtn').classList.add('active');
    initMarketplaceMap(harvests);
  };
}

function initMarketplaceMap(harvests) {
  const el = document.getElementById('marketplaceMap');
  if (mapInstances.marketplace) { mapInstances.marketplace.invalidateSize(); return; }
  const map = L.map(el).setView([16.42, 74.40], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  harvests.forEach(h => {
    if (!h.lat) return;
    const icon = L.divIcon({ html: `<div style="background:var(--green);color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${h.image}</div>`, iconSize: [36,36], className: '' });
    L.marker([h.lat, h.lng], { icon }).addTo(map).bindPopup(`<b>${h.crop}</b><br>₹${h.pricePerUnit}/kg<br>${h.farmerName}<br>${h.village}`);
  });
  mapInstances.marketplace = map;
}

function showFarmerOnMap(lat, lng, name, village) {
  navigateTo('map');
  setTimeout(() => {
    if (mapInstances.farmerFull) { mapInstances.farmerFull.setView([lat, lng], 14); }
  }, 400);
}

document.getElementById('searchBtn')?.addEventListener('click', () => {
  loadMarketplace(document.getElementById('searchCrop').value, document.getElementById('searchVillage').value);
});

// ─────────────────────────────────────────────
// FARMER MAP PAGE
// ─────────────────────────────────────────────
async function loadFarmerMap() {
  let farmers = [];
  try {
    const data = await apiFetch('/map/farmers');
    farmers = data.farmers;
    await cacheData('farmers_map', farmers);
  } catch {
    const cached = await getCached('farmers_map');
    if (cached) farmers = cached;
  }

  const el = document.getElementById('farmerMapFull');
  if (!mapInstances.farmerFull) {
    const map = L.map(el).setView([16.42, 74.40], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    farmers.forEach(f => {
      const icon = L.divIcon({ html: `<div style="background:#2d7a3a;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;box-shadow:0 2px 10px rgba(0,0,0,0.3);border:2px solid #fff">🧑‍🌾</div>`, iconSize: [40,40], className: '' });
      L.marker([f.lat, f.lng], { icon }).addTo(map).bindPopup(`<b>${f.name}</b><br>📍 ${f.village}<br>📱 ${f.phone}<br>📦 ${f.harvests} active listings<br><a href="tel:${f.phone}" style="color:green;font-weight:bold">📞 Call Now</a>`);
    });
    mapInstances.farmerFull = map;
  } else {
    mapInstances.farmerFull.invalidateSize();
  }

  document.getElementById('nearbyFarmersList').innerHTML = farmers.map(f => `
    <div class="nearby-farmer-card">
      <div class="farmer-avatar-map">🧑‍🌾</div>
      <div class="farmer-map-info">
        <div class="farmer-map-name">${f.name}</div>
        <div class="farmer-map-meta">📍 ${f.village} · 📦 ${f.harvests} listings</div>
        <div class="farmer-map-meta">📱 ${f.phone}</div>
      </div>
      <a href="tel:${f.phone}" class="btn-call">📞 Call</a>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// LISTINGS (with delete)
// ─────────────────────────────────────────────
async function loadListings() {
  const container = document.getElementById('myListings');
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Loading...</div>';
  try {
    const data = await apiFetch('/harvests');
    const mine = data.harvests.filter(h => h.farmerId === currentUser.id);
    if (!mine.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>No listings yet. Add your first harvest!</div>';
      return;
    }
    container.innerHTML = mine.map(h => `
      <div class="listing-card" id="listing-${h.id}">
        ${h.photo ? `<img class="listing-thumb" src="${h.photo}" alt="${h.crop}" style="width:56px;height:56px;border-radius:10px;object-fit:cover"/>` : `<div class="listing-thumb">${h.image}</div>`}
        <div class="listing-info">
          <div class="listing-name">${h.crop}</div>
          <div class="listing-meta">${h.quantity} kg · ₹${h.pricePerUnit}/kg · ${h.village}</div>
          <div class="listing-meta">Available: ${h.availableFrom}</div>
        </div>
        <span class="listing-status status-${h.status}">${h.status}</span>
        <button class="btn-delete" onclick="promptDeleteHarvest('${h.id}', '${h.crop}')">🗑️ ${t('delete_harvest').split(' ')[0]}</button>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="empty-state">Could not load listings</div>';
  }
}

document.getElementById('addHarvestBtn')?.addEventListener('click', () => {
  document.getElementById('hDate').value = new Date().toISOString().split('T')[0];
  harvestPhoto = null;
  harvestLat = currentUser.lat || null;
  harvestLng = currentUser.lng || null;
  document.getElementById('photoPreview').innerHTML = '<div class="photo-placeholder"><span>📷</span><span>Tap to add photo</span></div>';
  openModal('harvestModal');
});

// ── ENHANCED DELETE WITH CONFIRM MODAL ──────────
function promptDeleteHarvest(id, cropName) {
  pendingDeleteId = id;
  document.getElementById('deleteModalContent').innerHTML = `
    <div style="text-align:center;padding:1.5rem 0">
      <div style="font-size:3rem;margin-bottom:0.8rem">⚠️</div>
      <p style="font-family:var(--font);font-weight:700;font-size:1.05rem;margin-bottom:0.5rem">${t('delete_confirm')}</p>
      <p style="color:var(--muted);font-size:0.88rem;margin-bottom:0.4rem"><b>${cropName}</b></p>
      <p style="color:var(--muted);font-size:0.82rem">${t('delete_warn')}</p>
    </div>
    <div style="display:flex;gap:0.8rem;margin-top:0.5rem">
      <button class="btn-primary" onclick="confirmDeleteHarvest()" style="background:var(--red);box-shadow:0 4px 16px rgba(217,79,61,0.35)">🗑️ ${t('yes_delete')}</button>
      <button class="btn-primary" onclick="closeModal('deleteModal')" style="background:var(--muted);">${t('cancel')}</button>
    </div>
  `;
  openModal('deleteModal');
}

async function confirmDeleteHarvest() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  pendingDeleteId = null;
  closeModal('deleteModal');

  // Optimistic UI — fade out the card immediately
  const card = document.getElementById('listing-' + id);
  if (card) {
    card.style.transition = 'opacity 0.4s, transform 0.4s';
    card.style.opacity = '0';
    card.style.transform = 'translateX(30px)';
    setTimeout(() => card.remove(), 400);
  }

  try {
    await apiFetch('/harvests/' + id, { method: 'DELETE' });
    showToast('✅ Listing deleted successfully', 'success');
    // Reload to ensure sync
    setTimeout(loadListings, 600);
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
    loadListings(); // Restore on error
  }
}

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────
async function loadOrders() {
  const container = document.getElementById('ordersList');
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Loading...</div>';
  let orders = [];
  try {
    const data = await apiFetch('/orders');
    orders = data.orders;
    await cacheData('my_orders', orders);
  } catch {
    const cached = await getCached('my_orders');
    if (cached) { orders = cached; showToast('📵 Showing cached orders'); }
  }

  if (!orders.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No orders yet</div>';
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-top">
        <div class="order-crop">${o.crop}</div>
        <span class="order-badge badge-${o.status}">${getStatusLabel(o.status)}</span>
      </div>
      <div class="order-details">
        <div class="order-detail">Qty: <b>${o.quantity} kg</b></div>
        <div class="order-detail">Rate: <b>₹${o.pricePerUnit}/kg</b></div>
        <div class="order-detail">${currentUser.role==='farmer'?'Buyer':'Seller'}: <b>${currentUser.role==='farmer'?o.retailerName:o.farmerName}</b></div>
        <div class="order-detail">Payment: <b>${o.paymentStatus}</b></div>
        ${o.upiRef ? `<div class="order-detail">Ref: <b>${o.upiRef}</b></div>` : ''}
      </div>
      <div class="order-amount">₹${o.totalAmount?.toLocaleString()}</div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.7rem">
        <button class="order-map-btn" onclick="openTrackingModal('${o.id}')">🚦 Track Order</button>
        ${o.farmerLat ? `<button class="order-map-btn" onclick="showFarmerOnMap(${o.farmerLat},${o.farmerLng},'${o.farmerName}','')">🗺️ View Location</button>` : ''}
        ${o.upiLink ? `<button class="order-upi-btn" onclick="openUPIModal('${o.upiLink}','${o.farmerName}',${o.totalAmount},'${o.id}','${o.crop}',${o.quantity})">💳 Pay via UPI</button>` : ''}
      </div>
      ${o.logistics ? `<div style="margin-top:0.7rem;padding-top:0.7rem;border-top:1px dashed var(--border);font-size:0.82rem;color:var(--muted)">🚚 ${o.logistics.providerName} · Pickup: ${o.logistics.pickupDate} · ₹${o.logistics.fee}</div>` : (currentUser.role==='retailer' ? `<button class="order-map-btn" onclick="assignLogistics('${o.id}')">🚚 Arrange Pickup</button>` : '')}
    </div>
  `).join('');
}

function getStatusLabel(status) {
  const map = {
    pending: t('status_pending'),
    confirmed: t('status_confirmed'),
    dispatched: t('status_dispatched'),
    in_transit: t('status_in_transit'),
    delivered: t('status_delivered'),
    cancelled: t('status_cancelled')
  };
  return map[status] || status;
}

async function assignLogistics(orderId) {
  try {
    const data = await apiFetch('/logistics/available');
    if (!data.providers.length) return showToast('No logistics available');
    const p = data.providers[0];
    const date = prompt('Pickup date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!date) return;
    await apiFetch('/logistics/assign', { method: 'POST', body: { orderId, logisticsId: p.id, pickupDate: date, fee: 500 } });
    showToast('✅ Logistics assigned!', 'success');
    loadOrders();
  } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ─────────────────────────────────────────────
// ORDER TRACKING
// ─────────────────────────────────────────────
function setupTracking() {
  document.getElementById('trackingSearchBtn')?.addEventListener('click', () => {
    loadTracking(document.getElementById('trackingSearch').value);
  });
  document.getElementById('trackingSearch')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') loadTracking(document.getElementById('trackingSearch').value);
  });
}

async function loadTracking(searchTerm = '') {
  const container = document.getElementById('trackingList');
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div>Loading...</div>';
  let orders = [];
  try {
    const data = await apiFetch('/orders');
    orders = data.orders;
  } catch {
    const cached = await getCached('my_orders');
    if (cached) orders = cached;
  }

  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    orders = orders.filter(o =>
      o.id?.toLowerCase().includes(q) ||
      o.crop?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q)
    );
  }

  if (!orders.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🚦</div>No orders found</div>';
    return;
  }

  container.innerHTML = orders.map(o => renderTrackingCard(o)).join('');
}

function renderTrackingCard(o) {
  const steps = ['pending', 'confirmed', 'dispatched', 'in_transit', 'delivered'];
  const stepLabels = [t('status_pending'), t('status_confirmed'), t('status_dispatched'), t('status_in_transit'), t('status_delivered')];
  const stepIcons = ['🕐', '✅', '📦', '🚚', '🏠'];
  const currentStep = steps.indexOf(o.status);
  const isCancelled = o.status === 'cancelled';

  const stepsHtml = steps.map((step, i) => {
    let cls = 'track-step';
    if (isCancelled) cls += ' track-cancelled';
    else if (i < currentStep) cls += ' track-done';
    else if (i === currentStep) cls += ' track-active';
    else cls += ' track-pending-step';

    return `
      <div class="${cls}">
        <div class="track-icon">${stepIcons[i]}</div>
        <div class="track-label">${stepLabels[i]}</div>
        ${i === currentStep && !isCancelled ? `<div class="track-pulse"></div>` : ''}
      </div>
      ${i < steps.length - 1 ? `<div class="track-line ${i < currentStep && !isCancelled ? 'track-line-done' : ''}"></div>` : ''}
    `;
  }).join('');

  const eta = getETA(o.status, o.createdAt);

  return `
    <div class="tracking-card">
      <div class="tracking-header">
        <div>
          <div class="tracking-id">Order #${o.id?.slice(-6).toUpperCase() || 'N/A'}</div>
          <div class="tracking-crop">🌾 ${o.crop} · ${o.quantity} kg</div>
        </div>
        <div style="text-align:right">
          <span class="order-badge badge-${o.status}">${getStatusLabel(o.status)}</span>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem">₹${o.totalAmount?.toLocaleString()}</div>
        </div>
      </div>

      ${isCancelled ?
        `<div class="tracking-cancelled-msg">❌ This order was cancelled</div>` :
        `<div class="track-steps-row">${stepsHtml}</div>`
      }

      <div class="tracking-details">
        <div class="tracking-detail-row">
          <span>👤 ${currentUser.role === 'farmer' ? 'Buyer' : 'Seller'}</span>
          <b>${currentUser.role === 'farmer' ? o.retailerName : o.farmerName}</b>
        </div>
        ${eta ? `<div class="tracking-detail-row"><span>⏱️ Estimated Delivery</span><b>${eta}</b></div>` : ''}
        ${o.logistics ? `<div class="tracking-detail-row"><span>🚚 Vehicle</span><b>${o.logistics.providerName}</b></div>` : ''}
        <div class="tracking-detail-row"><span>💳 Payment</span><b>${o.paymentStatus || 'Pending'}</b></div>
      </div>

      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.8rem">
        <button class="btn-track-detail" onclick="openTrackingModal('${o.id}')">📍 Full Details</button>
        ${o.upiLink && o.paymentStatus !== 'paid' ? `<button class="order-upi-btn" onclick="openUPIModal('${o.upiLink}','${o.farmerName}',${o.totalAmount},'${o.id}','${o.crop}',${o.quantity})">💳 Pay Now</button>` : ''}
      </div>
    </div>
  `;
}

function getETA(status, createdAt) {
  const now = new Date();
  const daysMap = { pending: 5, confirmed: 4, dispatched: 2, in_transit: 1, delivered: 0 };
  const days = daysMap[status];
  if (days === 0) return 'Delivered';
  if (!days) return null;
  const eta = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return eta.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function openTrackingModal(orderId) {
  let orders = [];
  try {
    const data = await apiFetch('/orders');
    orders = data.orders;
  } catch {
    orders = await getCached('my_orders') || [];
  }
  const o = orders.find(x => x.id === orderId);
  if (!o) return;

  const steps = [
    { key: 'pending', label: t('status_pending'), icon: '🕐', desc: 'Order received and awaiting confirmation from farmer' },
    { key: 'confirmed', label: t('status_confirmed'), icon: '✅', desc: 'Farmer confirmed the order and is preparing harvest' },
    { key: 'dispatched', label: t('status_dispatched'), icon: '📦', desc: 'Harvest has been packed and handed to logistics' },
    { key: 'in_transit', label: t('status_in_transit'), icon: '🚚', desc: 'On the way to your location' },
    { key: 'delivered', label: t('status_delivered'), icon: '🏠', desc: 'Successfully delivered' }
  ];
  const currentStep = steps.findIndex(s => s.key === o.status);

  document.getElementById('trackingModalContent').innerHTML = `
    <div class="tracking-modal-header">
      <div class="tracking-modal-id">Order #${o.id?.slice(-6).toUpperCase()}</div>
      <div class="tracking-modal-crop">🌾 ${o.crop} · ${o.quantity} kg · ₹${o.totalAmount?.toLocaleString()}</div>
    </div>

    <div class="tracking-steps-vertical">
      ${steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const pending = i > currentStep;
        return `
          <div class="track-step-v ${done ? 'done' : active ? 'active' : 'pending'}">
            <div class="track-v-icon">${step.icon}</div>
            <div class="track-v-body">
              <div class="track-v-label">${step.label}</div>
              <div class="track-v-desc">${step.desc}</div>
              ${active ? `<div class="track-v-time">Now · In Progress</div>` : ''}
              ${done ? `<div class="track-v-time">✓ Completed</div>` : ''}
            </div>
            ${i < steps.length - 1 ? `<div class="track-v-line ${done ? 'done' : ''}"></div>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    <div class="tracking-info-grid">
      <div class="tracking-info-item"><span>👤 ${currentUser.role === 'farmer' ? 'Buyer' : 'Farmer'}</span><b>${currentUser.role === 'farmer' ? o.retailerName : o.farmerName}</b></div>
      <div class="tracking-info-item"><span>💳 Payment</span><b>${o.paymentStatus || 'Pending'}</b></div>
      ${o.logistics ? `<div class="tracking-info-item"><span>🚚 Logistics</span><b>${o.logistics.providerName}</b></div>` : ''}
      ${o.logistics ? `<div class="tracking-info-item"><span>📅 Pickup Date</span><b>${o.logistics.pickupDate}</b></div>` : ''}
      <div class="tracking-info-item"><span>⏱️ Est. Delivery</span><b>${getETA(o.status, o.createdAt) || 'TBD'}</b></div>
    </div>

    ${o.upiLink && o.paymentStatus !== 'paid' ?
      `<button class="btn-primary" onclick="openUPIModal('${o.upiLink}','${o.farmerName}',${o.totalAmount},'${o.id}','${o.crop}',${o.quantity})" style="margin-top:1rem">💳 Pay Now</button>` : ''
    }
  `;
  openModal('trackingModal');
}

// ─────────────────────────────────────────────
// UPI MODAL
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// WALLET
// ─────────────────────────────────────────────
function loadWallet() {
  document.getElementById('walletBalance').textContent = '₹' + (currentUser.balance || 0).toLocaleString();
}

function setupWalletPage() {
  document.getElementById('upiPayBtn')?.addEventListener('click', async () => {
    const upiId = document.getElementById('upiId').value.trim();
    const amount = parseFloat(document.getElementById('upiAmount').value);
    if (!upiId || !amount) return showToast('Please enter UPI ID and amount');
    const btn = document.getElementById('upiPayBtn');
    btn.textContent = '⏳ Processing...';
    try {
      const data = await apiFetch('/payment/wallet', { method: 'POST', body: { amount } });
      currentUser.balance = data.newBalance;
      localStorage.setItem('mc_user', JSON.stringify(currentUser));
      document.getElementById('walletBalance').textContent = '₹' + currentUser.balance.toLocaleString();
      document.getElementById('headerBalance').textContent = '₹' + currentUser.balance.toLocaleString();
      showToast('✅ ₹' + amount + ' added!', 'success');
      document.getElementById('txnHistory').innerHTML = `
        <div class="activity-item"><div class="activity-icon">💳</div><div class="activity-text">Added ₹${amount} via UPI (${upiId})<br><span style="color:var(--muted);font-size:0.78rem">Txn: TXN${Date.now()}</span></div><div class="activity-time">Now</div></div>
      ` + document.getElementById('txnHistory').innerHTML;
      document.getElementById('upiId').value = '';
      document.getElementById('upiAmount').value = '';
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    btn.textContent = '💳 Add Money';
  });
}

// ─────────────────────────────────────────────
// LOGISTICS
// ─────────────────────────────────────────────
async function loadLogistics() {
  const c = document.getElementById('logisticsContent');
  try {
    const data = await apiFetch('/logistics/available');
    c.innerHTML = data.providers.map(p => `
      <div class="logistics-card">
        <div class="logistics-icon">🚚</div>
        <div class="logistics-info">
          <div class="logistics-name">${p.name}</div>
          <div class="logistics-meta">📱 ${p.phone} · 🚛 ${p.vehicle || 'Truck'}</div>
        </div>
        <a href="tel:${p.phone}" class="btn-hire">📞 Call</a>
      </div>
    `).join('');
  } catch { c.innerHTML = '<div class="empty-state">Could not load logistics</div>'; }
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function setupModals() {
  document.querySelectorAll('.modal-close').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.modal))
  );
  document.querySelectorAll('.modal-overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
  );

  // PHOTO UPLOAD
  const photoInput = document.getElementById('photoInput');
  document.getElementById('cameraBtn')?.addEventListener('click', () => {
    photoInput.setAttribute('capture', 'environment'); photoInput.click();
  });
  document.getElementById('galleryBtn')?.addEventListener('click', () => {
    photoInput.removeAttribute('capture'); photoInput.click();
  });
  document.getElementById('photoUploadArea')?.addEventListener('click', e => {
    if (e.target.closest('.photo-btns')) return; photoInput.click();
  });
  photoInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      harvestPhoto = ev.target.result;
      document.getElementById('photoPreview').innerHTML = `<img src="${harvestPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"/>`;
    };
    reader.readAsDataURL(file);
  });

  // GPS for harvest
  document.getElementById('harvestGpsBtn')?.addEventListener('click', () => {
    getGPS((lat, lng) => {
      harvestLat = lat; harvestLng = lng;
      const el = document.getElementById('harvestGpsResult');
      el.style.display = 'block';
      el.textContent = `📍 Location set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      showToast('✅ Farm location captured!', 'success');
    });
  });

  // SUBMIT HARVEST
  document.getElementById('submitHarvest')?.addEventListener('click', async () => {
    const body = {
      crop: document.getElementById('hCrop').value,
      quantity: document.getElementById('hQty').value,
      pricePerUnit: document.getElementById('hPrice').value,
      availableFrom: document.getElementById('hDate').value,
      description: document.getElementById('hDesc').value,
      photo: harvestPhoto,
      lat: harvestLat,
      lng: harvestLng,
    };
    if (!body.quantity || !body.pricePerUnit || !body.availableFrom) return showToast('Please fill all fields');
    try {
      if (!navigator.onLine) {
        await saveToOfflineQueue({ type: 'add_harvest', data: body });
        closeModal('harvestModal'); return;
      }
      await apiFetch('/harvests', { method: 'POST', body });
      closeModal('harvestModal');
      showToast('✅ Harvest listed!', 'success');
      loadListings();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
  });

  // ORDER QTY
  document.getElementById('orderQty')?.addEventListener('input', updateOrderSummary);

  // SUBMIT ORDER
  document.getElementById('submitOrder')?.addEventListener('click', async () => {
    if (!selectedHarvest) return;
    const qty = parseInt(document.getElementById('orderQty').value);
    if (!qty || qty <= 0) return showToast('Enter valid quantity');
    if (!navigator.onLine) {
      await saveToOfflineQueue({ type: 'place_order', data: { harvestId: selectedHarvest.id, quantity: qty } });
      closeModal('orderModal'); return;
    }
    const btn = document.getElementById('submitOrder');
    btn.textContent = '⏳ Processing...';
    try {
      const data = await apiFetch('/orders', { method: 'POST', body: { harvestId: selectedHarvest.id, quantity: qty } });
      closeModal('orderModal');
      showToast('✅ Order placed! ₹' + data.order.totalAmount.toLocaleString(), 'success');
      currentUser.balance = (currentUser.balance || 0) - data.order.totalAmount;
      localStorage.setItem('mc_user', JSON.stringify(currentUser));
      document.getElementById('headerBalance').textContent = '₹' + (currentUser.balance || 0).toLocaleString();
      setTimeout(() => openUPIModal(data.order.upiLink, data.order.farmerName, data.order.totalAmount, data.order.id, data.order.crop, data.order.quantity), 500);
      loadMarketplace();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    btn.textContent = '✅ Confirm Order & Pay';
  });
}

async function openOrderModal(harvestId) {
  let harvests = [];
  try { const d = await apiFetch('/harvests'); harvests = d.harvests; }
  catch { harvests = await getCached('harvests') || []; }
  const h = harvests.find(x => x.id === harvestId);
  if (!h) return;
  selectedHarvest = h;

  document.getElementById('orderModalContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;background:var(--green-pale);border-radius:12px;padding:1rem;margin-bottom:1rem">
      ${h.photo ? `<img src="${h.photo}" style="width:60px;height:60px;border-radius:10px;object-fit:cover"/>` : `<span style="font-size:2.5rem">${h.image}</span>`}
      <div>
        <div style="font-family:var(--font);font-weight:800;font-size:1.1rem">${h.crop}</div>
        <div style="font-size:0.85rem;color:var(--muted)">by ${h.farmerName} · ${h.village}</div>
        <div style="font-family:var(--font);font-weight:700;color:var(--green)">₹${h.pricePerUnit}/kg · ${h.quantity}kg available</div>
      </div>
    </div>
  `;

  document.getElementById('orderQty').value = '';
  document.getElementById('orderSummary').innerHTML = '';

  const mapEl = document.getElementById('orderFarmerMap');
  if (h.lat && h.lng) {
    mapEl.style.display = 'block';
    setTimeout(() => {
      if (mapInstances.orderMap) { mapInstances.orderMap.remove(); delete mapInstances.orderMap; }
      const map = L.map(mapEl).setView([h.lat, h.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      const icon = L.divIcon({ html: '<div style="background:#2d7a3a;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:1.3rem">🧑‍🌾</div>', iconSize: [36,36], className: '' });
      L.marker([h.lat, h.lng], { icon }).addTo(map).bindPopup(`<b>${h.farmerName}</b><br>${h.village}`).openPopup();
      mapInstances.orderMap = map;
    }, 300);
  } else { mapEl.style.display = 'none'; }

  document.getElementById('upiApps').innerHTML = `
    <div class="upi-app-btn" onclick="showToast('Complete payment after placing order')"><span>🟢</span><span>GPay</span></div>
    <div class="upi-app-btn" onclick="showToast('Complete payment after placing order')"><span>🟣</span><span>PhonePe</span></div>
    <div class="upi-app-btn" onclick="showToast('Complete payment after placing order')"><span>🔵</span><span>Paytm</span></div>
  `;

  openModal('orderModal');
}

function updateOrderSummary() {
  if (!selectedHarvest) return;
  const qty = parseInt(document.getElementById('orderQty').value) || 0;
  const total = qty * selectedHarvest.pricePerUnit;
  document.getElementById('orderSummary').innerHTML = qty > 0 ?
    `${qty} kg × ₹${selectedHarvest.pricePerUnit} = <b>₹${total.toLocaleString()}</b><br>Balance after: ₹${((currentUser.balance||0)-total).toLocaleString()}` : '';
}