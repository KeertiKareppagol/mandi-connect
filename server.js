// server.js — MandiConnect Backend v2.1
// New: /orders/:id/rate, distance surcharge in order creation

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '.')));

// ─────────────────────────────────────────────
// DISTANCE HELPER
// ─────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceSurchargePerKg(km) {
  if (km <= 50)  return 0;
  if (km <= 150) return 2;
  if (km <= 300) return 5;
  return 10;
}

// ─────────────────────────────────────────────
// IN-MEMORY DATABASE
// ─────────────────────────────────────────────

let db = {
  users: [
    { id: 'f1', name: 'Ramesh Patil',      phone: '9876543210', role: 'farmer',    village: 'Nipani',      password: '1234', balance: 12000, lat: 16.4088, lng: 74.3830 },
    { id: 'f2', name: 'Sunita Desai',      phone: '9823456789', role: 'farmer',    village: 'Sankeshwar',  password: '1234', balance: 8500,  lat: 16.5167, lng: 74.4833 },
    { id: 'f3', name: 'Krishna Gowda',     phone: '9845001234', role: 'farmer',    village: 'Hubli',       password: '1234', balance: 6000,  lat: 15.3647, lng: 75.1240 },
    { id: 'r1', name: 'City Fresh Mart',   phone: '9811223344', role: 'retailer',  city: 'Pune',           password: '1234', balance: 50000, lat: 18.5204, lng: 73.8567 },
    { id: 'r2', name: 'Green Basket Store',phone: '9822334455', role: 'retailer',  city: 'Mumbai',         password: '1234', balance: 75000, lat: 19.0760, lng: 72.8777 },
    { id: 'l1', name: 'Shiva Transport',   phone: '9833445566', role: 'logistics', vehicle: 'Truck',       password: '1234', balance: 5000,  lat: 16.4500, lng: 74.4000 },
    { id: 'l2', name: 'Ravi Cargo',        phone: '9844556677', role: 'logistics', vehicle: 'Mini Truck',  password: '1234', balance: 3000,  lat: 16.4200, lng: 74.3600 },
  ],
  harvests: [
    { id: 'h1', farmerId: 'f1', farmerName: 'Ramesh Patil', crop: 'Tomatoes', image: '🍅', quantity: 500, pricePerUnit: 25, availableFrom: '2026-03-15', village: 'Nipani', description: 'Grade A, fresh from farm', lat: 16.4088, lng: 74.3830, status: 'available', createdAt: new Date().toISOString() },
    { id: 'h2', farmerId: 'f1', farmerName: 'Ramesh Patil', crop: 'Onions',   image: '🧅', quantity: 800, pricePerUnit: 18, availableFrom: '2026-03-16', village: 'Nipani', description: 'Red onions, cleaned', lat: 16.4088, lng: 74.3830, status: 'available', createdAt: new Date().toISOString() },
    { id: 'h3', farmerId: 'f2', farmerName: 'Sunita Desai', crop: 'Wheat',    image: '🌾', quantity: 2000,pricePerUnit: 22, availableFrom: '2026-03-18', village: 'Sankeshwar', description: 'Premium quality wheat', lat: 16.5167, lng: 74.4833, status: 'available', createdAt: new Date().toISOString() },
    { id: 'h4', farmerId: 'f2', farmerName: 'Sunita Desai', crop: 'Grapes',   image: '🍇', quantity: 300, pricePerUnit: 60, availableFrom: '2026-03-20', village: 'Sankeshwar', description: 'Seedless grapes', lat: 16.5167, lng: 74.4833, status: 'available', createdAt: new Date().toISOString() },
    { id: 'h5', farmerId: 'f3', farmerName: 'Krishna Gowda',crop: 'Corn',     image: '🌽', quantity: 400, pricePerUnit: 15, availableFrom: '2026-03-14', village: 'Hubli', description: 'Sweet corn', lat: 15.3647, lng: 75.1240, status: 'available', createdAt: new Date().toISOString() },
  ],
  orders: [
    {
      id: 'o1', harvestId: 'h1', farmerId: 'f1', farmerName: 'Ramesh Patil', farmerPhone: '9876543210',
      retailerId: 'r1', retailerName: 'City Fresh Mart',
      crop: 'Tomatoes', quantity: 100, pricePerUnit: 25, totalAmount: 2500,
      status: 'delivered', paymentStatus: 'paid', upiRef: 'TXN1001',
      upiLink: 'upi://pay?pa=9876543210@upi&pn=RameshPatil&am=2500&cu=INR',
      farmerLat: 16.4088, farmerLng: 74.3830,
      distanceKm: 280, distanceSurcharge: 5,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      logistics: { providerName: 'Shiva Transport', pickupDate: '2026-03-16', fee: 500 },
      rating: 4
    },
    {
      id: 'o2', harvestId: 'h3', farmerId: 'f2', farmerName: 'Sunita Desai', farmerPhone: '9823456789',
      retailerId: 'r1', retailerName: 'City Fresh Mart',
      crop: 'Wheat', quantity: 500, pricePerUnit: 22, totalAmount: 11000,
      status: 'in_transit', paymentStatus: 'paid', upiRef: 'TXN1002',
      upiLink: 'upi://pay?pa=9823456789@upi&pn=SunitaDesai&am=11000&cu=INR',
      farmerLat: 16.5167, farmerLng: 74.4833,
      distanceKm: 250, distanceSurcharge: 5,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      logistics: { providerName: 'Ravi Cargo', pickupDate: '2026-03-14', fee: 800 }
    },
    {
      id: 'o3', harvestId: 'h2', farmerId: 'f1', farmerName: 'Ramesh Patil', farmerPhone: '9876543210',
      retailerId: 'r2', retailerName: 'Green Basket Store',
      crop: 'Onions', quantity: 200, pricePerUnit: 18, totalAmount: 3600,
      status: 'pending', paymentStatus: 'pending',
      upiLink: 'upi://pay?pa=9876543210@upi&pn=RameshPatil&am=3600&cu=INR',
      farmerLat: 16.4088, farmerLng: 74.3830,
      distanceKm: 300, distanceSurcharge: 5,
      createdAt: new Date().toISOString()
    },
  ],
  transactions: [],
  logistics: [],
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function uid() { return crypto.randomBytes(8).toString('hex'); }
function generateToken(userId) { return 'tok_' + userId + '_' + Date.now(); }

const cropEmojis = {
  Tomatoes: '🍅', Onions: '🧅', Potatoes: '🥔', Cabbage: '🥬',
  Wheat: '🌾', Rice: '🍚', Corn: '🌽', Carrots: '🥕',
  Spinach: '🥬', Grapes: '🍇', Mango: '🥭', Sugarcane: '🌿',
};

const sessions = {};

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  const session = sessions[token];
  if (!session) return res.status(401).json({ message: 'Session expired. Please login again.' });
  req.userId = session.userId;
  req.user = db.users.find(u => u.id === session.userId);
  next();
}

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ message: 'Phone and password required' });
  const user = db.users.find(u => u.phone === phone && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid phone or password' });
  const token = generateToken(user.id);
  sessions[token] = { userId: user.id };
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/register', (req, res) => {
  const { name, phone, password, role, village, city, lat, lng } = req.body;
  if (!name || !phone || !password || !role) return res.status(400).json({ message: 'All fields required' });
  if (db.users.find(u => u.phone === phone)) return res.status(400).json({ message: 'Phone already registered' });
  const user = {
    id: uid(), name, phone, password, role,
    village: village || '', city: city || '',
    lat: lat || 16.4088, lng: lng || 74.3830,
    balance: 0,
  };
  db.users.push(user);
  const token = generateToken(user.id);
  sessions[token] = { userId: user.id };
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

app.get('/api/dashboard', authMiddleware, (req, res) => {
  const user = req.user;
  const userOrders = db.orders.filter(o =>
    user.role === 'farmer' ? o.farmerId === user.id : o.retailerId === user.id
  );
  let stats = {};
  if (user.role === 'farmer') {
    const myHarvests = db.harvests.filter(h => h.farmerId === user.id);
    const ordersWithRatings = userOrders.filter(o => o.rating);
    const avgRating = ordersWithRatings.length
      ? (ordersWithRatings.reduce((s, o) => s + o.rating, 0) / ordersWithRatings.length).toFixed(1)
      : null;
    stats = {
      harvests: myHarvests.length,
      activeListings: myHarvests.filter(h => h.status === 'available').length,
      orders: userOrders.length,
      earnings: userOrders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + o.totalAmount, 0),
      avgRating,
    };
  } else {
    stats = {
      orders: userOrders.length,
      pending: userOrders.filter(o => o.status === 'pending').length,
      spent: userOrders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + o.totalAmount, 0),
      balance: user.balance,
    };
  }
  const { password: _, ...safeUser } = user;
  res.json({ stats, user: safeUser });
});

// ─────────────────────────────────────────────
// HARVESTS
// ─────────────────────────────────────────────

app.get('/api/harvests', authMiddleware, (req, res) => {
  let harvests = [...db.harvests];
  if (req.query.crop) {
    const q = req.query.crop.toLowerCase();
    harvests = harvests.filter(h => h.crop.toLowerCase().includes(q));
  }
  if (req.query.village) {
    const q = req.query.village.toLowerCase();
    harvests = harvests.filter(h => h.village.toLowerCase().includes(q));
  }
  res.json({ harvests });
});

app.post('/api/harvests', authMiddleware, (req, res) => {
  const user = req.user;
  if (user.role !== 'farmer') return res.status(403).json({ message: 'Only farmers can list harvests' });
  const { crop, quantity, pricePerUnit, availableFrom, description, photo, lat, lng } = req.body;
  if (!crop || !quantity || !pricePerUnit || !availableFrom) {
    return res.status(400).json({ message: 'Crop, quantity, price, and date required' });
  }
  const harvest = {
    id: uid(), farmerId: user.id, farmerName: user.name,
    crop, quantity: parseFloat(quantity), pricePerUnit: parseFloat(pricePerUnit),
    availableFrom, description: description || '',
    image: cropEmojis[crop] || '🌾', photo: photo || null,
    lat: lat || user.lat || 16.4088, lng: lng || user.lng || 74.3830,
    village: user.village || '', status: 'available',
    createdAt: new Date().toISOString(),
  };
  db.harvests.push(harvest);
  res.json({ harvest, message: 'Harvest listed successfully' });
});

app.delete('/api/harvests/:id', authMiddleware, (req, res) => {
  const user = req.user;
  const harvestId = req.params.id;
  const harvest = db.harvests.find(h => h.id === harvestId);
  if (!harvest) return res.status(404).json({ message: 'Harvest not found' });
  if (harvest.farmerId !== user.id) return res.status(403).json({ message: 'Not authorized to delete this harvest' });
  const pendingOrders = db.orders.filter(o => o.harvestId === harvestId && o.status === 'pending');
  if (pendingOrders.length > 0) {
    return res.status(400).json({ message: 'Cannot delete harvest with pending orders. Cancel orders first.' });
  }
  db.harvests = db.harvests.filter(h => h.id !== harvestId);
  res.json({ message: 'Harvest deleted successfully' });
});

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────

app.get('/api/orders', authMiddleware, (req, res) => {
  const user = req.user;
  const orders = db.orders.filter(o =>
    user.role === 'farmer' ? o.farmerId === user.id : o.retailerId === user.id
  );
  res.json({ orders });
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const user = req.user;
  if (user.role !== 'retailer') return res.status(403).json({ message: 'Only retailers can place orders' });

  const { harvestId, quantity, effectivePrice, distanceKm, distanceSurcharge } = req.body;
  const harvest = db.harvests.find(h => h.id === harvestId);
  if (!harvest) return res.status(404).json({ message: 'Harvest not found' });
  if (harvest.status !== 'available') return res.status(400).json({ message: 'Harvest not available' });

  const qty = parseInt(quantity);
  if (qty <= 0 || qty > harvest.quantity) return res.status(400).json({ message: `Only ${harvest.quantity} kg available` });

  const farmer  = db.users.find(u => u.id === harvest.farmerId);
  const upiId   = farmer?.phone + '@upi';

  // Distance-based pricing
  let kmDist    = parseFloat(distanceKm) || 0;
  let surcharge = parseFloat(distanceSurcharge) || 0;

  // Server-side calculation as fallback (more accurate)
  if (!kmDist && farmer?.lat && farmer?.lng && user.lat && user.lng) {
    kmDist    = haversineKm(harvest.lat, harvest.lng, user.lat, user.lng);
    surcharge = distanceSurchargePerKg(kmDist);
  }

  const finalPricePerKg = parseFloat(effectivePrice) || (harvest.pricePerUnit + surcharge);
  const totalAmount     = qty * finalPricePerKg;

  const order = {
    id: uid(),
    harvestId,
    farmerId:      harvest.farmerId,
    farmerName:    harvest.farmerName,
    farmerPhone:   farmer?.phone || '',
    retailerId:    user.id,
    retailerName:  user.name,
    crop:          harvest.crop,
    quantity:      qty,
    pricePerUnit:  finalPricePerKg,
    basePricePerUnit: harvest.pricePerUnit,
    distanceKm:    Math.round(kmDist),
    distanceSurcharge: surcharge,
    totalAmount,
    status:        'pending',
    paymentStatus: 'pending',
    upiLink:       `upi://pay?pa=${upiId}&pn=${encodeURIComponent(harvest.farmerName)}&am=${totalAmount}&cu=INR&tn=MandiConnect+Order`,
    farmerLat:     harvest.lat,
    farmerLng:     harvest.lng,
    createdAt:     new Date().toISOString(),
  };

  db.orders.push(order);
  harvest.quantity -= qty;
  if (harvest.quantity <= 0) harvest.status = 'sold';

  res.json({ order, message: 'Order placed successfully' });
});

// ── UPDATE ORDER STATUS ──────────────────────

app.patch('/api/orders/:id/status', authMiddleware, (req, res) => {
  const user  = req.user;
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.farmerId !== user.id && order.retailerId !== user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const validStatuses = ['pending', 'confirmed', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
  const { status, paymentStatus, upiRef } = req.body;
  if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  order.status    = status;
  order.updatedAt = new Date().toISOString();
  if (paymentStatus) order.paymentStatus = paymentStatus;
  if (upiRef)        order.upiRef = upiRef;
  if (status === 'delivered') order.paymentStatus = 'paid';

  res.json({ order, message: 'Order status updated' });
});

// ─────────────────────────────────────────────
// ★ NEW: CROP RATING ENDPOINT
// ─────────────────────────────────────────────

/**
 * POST /api/orders/:id/rate
 * Body: { rating: 1–5 }
 * Only the retailer who placed the order can rate, and only once delivered.
 */
app.post('/api/orders/:id/rate', authMiddleware, (req, res) => {
  const user   = req.user;
  const order  = db.orders.find(o => o.id === req.params.id);

  if (!order)                      return res.status(404).json({ message: 'Order not found' });
  if (order.retailerId !== user.id) return res.status(403).json({ message: 'Only the buyer can rate this order' });
  if (order.status !== 'delivered') return res.status(400).json({ message: 'Can only rate delivered orders' });

  const rating = parseInt(req.body.rating);
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5' });

  order.rating = rating;
  order.ratedAt = new Date().toISOString();

  // Update farmer's aggregated rating
  const farmer = db.users.find(u => u.id === order.farmerId);
  if (farmer) {
    const farmerOrders = db.orders.filter(o => o.farmerId === farmer.id && o.rating);
    farmer.avgRating = (farmerOrders.reduce((s, o) => s + o.rating, 0) / farmerOrders.length).toFixed(1);
    farmer.totalRatings = farmerOrders.length;
  }

  res.json({ order, message: 'Rating submitted successfully', farmerAvgRating: farmer?.avgRating });
});

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────

app.get('/api/map/farmers', authMiddleware, (req, res) => {
  const farmers = db.users
    .filter(u => u.role === 'farmer' && u.lat && u.lng)
    .map(u => ({
      id: u.id, name: u.name, phone: u.phone,
      village: u.village, lat: u.lat, lng: u.lng,
      harvests: db.harvests.filter(h => h.farmerId === u.id && h.status === 'available').length,
      avgRating: u.avgRating || null,
      totalRatings: u.totalRatings || 0
    }));
  res.json({ farmers });
});

// ─────────────────────────────────────────────
// PAYMENT / WALLET
// ─────────────────────────────────────────────

app.post('/api/payment/wallet', authMiddleware, (req, res) => {
  const user = req.user;
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
  user.balance = (user.balance || 0) + parseFloat(amount);
  const txn = { id: uid(), userId: user.id, type: 'credit', amount: parseFloat(amount), ts: Date.now() };
  db.transactions.push(txn);
  res.json({ newBalance: user.balance, transaction: txn });
});

// ─────────────────────────────────────────────
// LOGISTICS
// ─────────────────────────────────────────────

app.get('/api/logistics/available', authMiddleware, (req, res) => {
  const providers = db.users
    .filter(u => u.role === 'logistics')
    .map(u => ({ id: u.id, name: u.name, phone: u.phone, vehicle: u.vehicle || 'Truck', lat: u.lat, lng: u.lng }));
  res.json({ providers });
});

app.post('/api/logistics/assign', authMiddleware, (req, res) => {
  const { orderId, logisticsId, pickupDate, fee } = req.body;
  const order    = db.orders.find(o => o.id === orderId);
  const provider = db.users.find(u => u.id === logisticsId);
  if (!order || !provider) return res.status(404).json({ message: 'Order or provider not found' });
  order.logistics = { providerId: logisticsId, providerName: provider.name, pickupDate, fee: fee || 500 };
  order.status = 'confirmed';
  res.json({ order, message: 'Logistics assigned' });
});

// ─────────────────────────────────────────────
// OFFLINE SYNC
// ─────────────────────────────────────────────

app.post('/api/sync', authMiddleware, (req, res) => {
  const { actions } = req.body;
  let synced = 0;
  for (const action of (actions || [])) {
    try {
      if (action.type === 'add_harvest') {
        const user = req.user;
        const h = action.data;
        db.harvests.push({
          id: uid(), farmerId: user.id, farmerName: user.name,
          crop: h.crop, quantity: parseFloat(h.quantity),
          pricePerUnit: parseFloat(h.pricePerUnit),
          availableFrom: h.availableFrom, description: h.description || '',
          image: cropEmojis[h.crop] || '🌾', photo: h.photo || null,
          lat: h.lat || user.lat, lng: h.lng || user.lng,
          village: user.village || '', status: 'available',
          createdAt: new Date().toISOString(),
        });
        synced++;
      } else if (action.type === 'place_order') {
        synced++;
      }
    } catch(e) {}
  }
  res.json({ success: true, synced });
});

// ─────────────────────────────────────────────
// CATCH-ALL (SPA)
// ─────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🌾  MandiConnect Server v2.1            ║
║   http://localhost:${PORT}                   ║
║                                           ║
║   NEW FEATURES:                           ║
║   ⭐ Retailer crop rating system          ║
║   📍 Distance-based delivery pricing     ║
║   📱 WhatsApp payment receipt (PPT-style)║
║                                           ║
║   Demo accounts (password: 1234):         ║
║   🧑‍🌾 Farmer:  9876543210                  ║
║   🏪 Retailer: 9811223344                 ║
╚═══════════════════════════════════════════╝
  `);
});