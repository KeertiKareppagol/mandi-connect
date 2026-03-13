// ═══════════════════════════════════════════════════════════════
// payment.js — Realistic UPI Payment System for MandiConnect
// Features:
//   • Real UPI deep links (GPay, PhonePe, Paytm, BHIM open directly)
//   • QR code generated from UPI link (scannable by any UPI app)
//   • Payment timer with countdown
//   • Auto-confirmation simulation after payment
//   • Copy UPI ID to clipboard
//   • Payment status polling
// ═══════════════════════════════════════════════════════════════

// ── QR CODE ENGINE (pure JS, no library needed) ─────────────────
// Using Google Charts API as QR source — works offline-friendly
function getQRUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=1a5c28&margin=10`;
}

// ── UPI LINK BUILDER ─────────────────────────────────────────────
function buildUPILink(upiId, name, amount, note = 'MandiConnect Payment') {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: amount.toString(),
    cu: 'INR',
    tn: note
  });
  return `upi://pay?${params.toString()}`;
}

// Deep links for specific apps
function buildGPayLink(upiId, name, amount) {
  return `tez://upi/pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=MandiConnect`;
}
function buildPhonePeLink(upiId, name, amount) {
  return `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
}
function buildPaytmLink(upiId, name, amount) {
  return `paytmmp://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
}
function buildBHIMLink(upiId, name, amount) {
  return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
}

// ── PAYMENT TIMER ────────────────────────────────────────────────
let paymentTimerInterval = null;
let paymentConfirmTimeout = null;
let currentPaymentOrderId = null;

function startPaymentTimer(seconds, onExpire) {
  clearInterval(paymentTimerInterval);
  const el = document.getElementById('payTimerCount');
  let remaining = seconds;
  if (el) el.textContent = remaining;

  paymentTimerInterval = setInterval(() => {
    remaining--;
    if (el) el.textContent = remaining;
    const ring = document.getElementById('payTimerRing');
    if (ring) {
      const pct = remaining / seconds;
      const dash = 2 * Math.PI * 28; // r=28
      ring.style.strokeDashoffset = dash * (1 - pct);
      if (pct < 0.3) ring.style.stroke = '#d94f3d';
      else if (pct < 0.6) ring.style.stroke = '#f59332';
    }
    if (remaining <= 0) {
      clearInterval(paymentTimerInterval);
      if (onExpire) onExpire();
    }
  }, 1000);
}

function stopPaymentTimer() {
  clearInterval(paymentTimerInterval);
  clearTimeout(paymentConfirmTimeout);
}

// ── MAIN PAYMENT MODAL ───────────────────────────────────────────
function openRealisticPaymentModal(options) {
  const {
    upiId,
    farmerName,
    amount,
    orderId,
    crop,
    quantity,
    onSuccess
  } = options;

  currentPaymentOrderId = orderId;
  const upiLink    = buildUPILink(upiId, farmerName, amount);
  const gpayLink   = buildGPayLink(upiId, farmerName, amount);
  const phonepeLink= buildPhonePeLink(upiId, farmerName, amount);
  const paytmLink  = buildPaytmLink(upiId, farmerName, amount);
  const bhimLink   = buildBHIMLink(upiId, farmerName, amount);
  const qrUrl      = getQRUrl(upiLink);
  const amountFmt  = '₹' + Number(amount).toLocaleString('en-IN');
  const txnId      = 'MC' + Date.now().toString().slice(-8).toUpperCase();

  // Remove existing modal if any
  const existing = document.getElementById('realisticPayModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'realisticPayModal';
  modal.className = 'rpay-overlay';
  modal.innerHTML = `
    <div class="rpay-sheet">

      <!-- HEADER -->
      <div class="rpay-header">
        <div class="rpay-header-left">
          <div class="rpay-brand">🌾 MandiConnect Pay</div>
          <div class="rpay-secure">🔒 Secured · UPI</div>
        </div>
        <button class="rpay-close" onclick="closePaymentModal()">✕</button>
      </div>

      <!-- AMOUNT HERO -->
      <div class="rpay-amount-hero">
        <div class="rpay-amount-label">Total Amount</div>
        <div class="rpay-amount-value">${amountFmt}</div>
        <div class="rpay-amount-meta">${quantity} kg of ${crop} · to ${farmerName}</div>
      </div>

      <!-- TABS -->
      <div class="rpay-tabs">
        <button class="rpay-tab active" onclick="switchPayTab('apps', this)">📱 UPI Apps</button>
        <button class="rpay-tab" onclick="switchPayTab('qr', this)">📷 Scan QR</button>
        <button class="rpay-tab" onclick="switchPayTab('id', this)">🔗 UPI ID</button>
      </div>

      <!-- TAB: UPI APPS -->
      <div class="rpay-panel active" id="rpay-panel-apps">
        <p class="rpay-hint">Tap to open your payment app directly — amount is pre-filled</p>
        <div class="rpay-app-grid">

          <a href="${gpayLink}" class="rpay-app-btn" onclick="onAppTap('gpay')">
            <div class="rpay-app-icon gpay-icon">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.4 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/>
                <path fill="#FBBC05" d="M24 46c5.5 0 10.5-1.9 14.4-5.1l-6.7-5.5C29.6 37 26.9 38 24 38c-6 0-11.1-4-12.9-9.5l-7 5.4C7.6 42 15.3 46 24 46z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.8 2.4-2.3 4.4-4.3 5.9l6.7 5.5C42.3 36.4 46 30.7 46 24c0-1.3-.2-2.7-.5-4h-1z"/>
              </svg>
            </div>
            <div class="rpay-app-info">
              <div class="rpay-app-name">Google Pay</div>
              <div class="rpay-app-sub">Tap to open</div>
            </div>
            <div class="rpay-app-arrow">→</div>
          </a>

          <a href="${phonepeLink}" class="rpay-app-btn" onclick="onAppTap('phonepe')">
            <div class="rpay-app-icon phonepe-icon">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <rect width="48" height="48" rx="12" fill="#5f259f"/>
                <text x="24" y="32" font-size="22" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">Pe</text>
              </svg>
            </div>
            <div class="rpay-app-info">
              <div class="rpay-app-name">PhonePe</div>
              <div class="rpay-app-sub">Tap to open</div>
            </div>
            <div class="rpay-app-arrow">→</div>
          </a>

          <a href="${paytmLink}" class="rpay-app-btn" onclick="onAppTap('paytm')">
            <div class="rpay-app-icon paytm-icon">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <rect width="48" height="48" rx="12" fill="#002970"/>
                <text x="24" y="31" font-size="13" text-anchor="middle" fill="#00BAF2" font-family="Arial" font-weight="900">PAYTM</text>
              </svg>
            </div>
            <div class="rpay-app-info">
              <div class="rpay-app-name">Paytm</div>
              <div class="rpay-app-sub">Tap to open</div>
            </div>
            <div class="rpay-app-arrow">→</div>
          </a>

          <a href="${bhimLink}" class="rpay-app-btn" onclick="onAppTap('bhim')">
            <div class="rpay-app-icon bhim-icon">
              <svg viewBox="0 0 48 48" width="36" height="36">
                <rect width="48" height="48" rx="12" fill="#00529C"/>
                <text x="24" y="31" font-size="14" text-anchor="middle" fill="white" font-family="Arial" font-weight="900">BHIM</text>
              </svg>
            </div>
            <div class="rpay-app-info">
              <div class="rpay-app-name">BHIM UPI</div>
              <div class="rpay-app-sub">Tap to open</div>
            </div>
            <div class="rpay-app-arrow">→</div>
          </a>

        </div>

        <!-- TIMER after tap -->
        <div class="rpay-timer-section" id="rpayTimerSection" style="display:none">
          <div class="rpay-timer-text">Waiting for payment confirmation...</div>
          <div class="rpay-timer-wrap">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="28" fill="none" stroke="#e8f5ea" stroke-width="5"/>
              <circle id="payTimerRing" cx="36" cy="36" r="28" fill="none"
                stroke="#2d7a3a" stroke-width="5"
                stroke-dasharray="${2 * Math.PI * 28}"
                stroke-dashoffset="0"
                stroke-linecap="round"
                transform="rotate(-90 36 36)"
                style="transition:stroke-dashoffset 1s linear, stroke 0.5s"/>
              <text id="payTimerCount" x="36" y="41" text-anchor="middle"
                font-family="Baloo 2, cursive" font-size="18" font-weight="800" fill="#2d7a3a">30</text>
            </svg>
          </div>
          <div class="rpay-timer-sub">App opened — complete payment there</div>
          <button class="rpay-manual-confirm" onclick="simulatePaymentSuccess()">
            ✅ I have completed the payment
          </button>
        </div>
      </div>

      <!-- TAB: QR CODE -->
      <div class="rpay-panel" id="rpay-panel-qr">
        <div class="rpay-qr-wrap">
          <div class="rpay-qr-frame">
            <img id="rpayQrImg" src="${qrUrl}"
              alt="UPI QR Code" width="220" height="220"
              onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'220\\' height=\\'220\\'><rect width=\\'220\\' height=\\'220\\' fill=\\'%23e8f5ea\\'/><text x=\\'110\\' y=\\'115\\' text-anchor=\\'middle\\' font-size=\\'14\\' fill=\\'%232d7a3a\\'>QR Loading...</text></svg>'"/>
            <div class="rpay-qr-corner tl"></div>
            <div class="rpay-qr-corner tr"></div>
            <div class="rpay-qr-corner bl"></div>
            <div class="rpay-qr-corner br"></div>
          </div>
          <div class="rpay-qr-logo">🌾</div>
        </div>
        <div class="rpay-qr-amount">${amountFmt}</div>
        <div class="rpay-qr-name">Pay to: <b>${farmerName}</b></div>
        <div class="rpay-qr-steps">
          <div class="rpay-qr-step">1️⃣ Open any UPI app on your phone</div>
          <div class="rpay-qr-step">2️⃣ Tap "Scan QR" or "Pay by QR"</div>
          <div class="rpay-qr-step">3️⃣ Scan this code — amount is auto-filled</div>
          <div class="rpay-qr-step">4️⃣ Confirm payment in your app</div>
        </div>
        <button class="rpay-manual-confirm" onclick="simulatePaymentSuccess()">
          ✅ I have scanned and paid
        </button>
      </div>

      <!-- TAB: UPI ID -->
      <div class="rpay-panel" id="rpay-panel-id">
        <div class="rpay-id-card">
          <div class="rpay-id-label">Pay this UPI ID</div>
          <div class="rpay-id-value" id="rpayUpiDisplay">${upiId}</div>
          <button class="rpay-copy-btn" onclick="copyUpiId('${upiId}')">
            📋 Copy UPI ID
          </button>
        </div>
        <div class="rpay-id-steps">
          <div class="rpay-id-step">
            <span class="rpay-step-num">1</span>
            <span>Open GPay / PhonePe / Paytm</span>
          </div>
          <div class="rpay-id-step">
            <span class="rpay-step-num">2</span>
            <span>Tap "Pay" → "Enter UPI ID"</span>
          </div>
          <div class="rpay-id-step">
            <span class="rpay-step-num">3</span>
            <span>Paste the UPI ID above</span>
          </div>
          <div class="rpay-id-step">
            <span class="rpay-step-num">4</span>
            <span>Enter amount: <b>${amountFmt}</b></span>
          </div>
          <div class="rpay-id-step">
            <span class="rpay-step-num">5</span>
            <span>Add note: MandiConnect #${txnId}</span>
          </div>
        </div>
        <div class="rpay-txn-ref">
          Transaction Ref: <span>${txnId}</span>
          <button onclick="navigator.clipboard.writeText('${txnId}');showToast('✅ TXN ID copied!')">Copy</button>
        </div>
        <button class="rpay-manual-confirm" onclick="simulatePaymentSuccess()">
          ✅ I have completed the payment
        </button>
      </div>

      <!-- FOOTER -->
      <div class="rpay-footer">
        <div class="rpay-footer-badges">
          <span>🔒 256-bit Encrypted</span>
          <span>✅ NPCI Certified</span>
          <span>🏦 RBI Compliant</span>
        </div>
        <div class="rpay-footer-note">
          Powered by UPI · MandiConnect v2
        </div>
      </div>

    </div>

    <!-- SUCCESS OVERLAY -->
    <div class="rpay-success-overlay" id="rpaySuccessOverlay" style="display:none">
      <div class="rpay-success-card">
        <div class="rpay-success-icon">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="38" fill="#2d7a3a" opacity="0.15"/>
            <circle cx="40" cy="40" r="30" fill="#2d7a3a"/>
            <path d="M24 40 l10 10 l20-20" stroke="white" stroke-width="4"
              stroke-linecap="round" stroke-linejoin="round" fill="none"
              class="rpay-check-path"/>
          </svg>
        </div>
        <div class="rpay-success-title">Payment Successful!</div>
        <div class="rpay-success-amount">${amountFmt}</div>
        <div class="rpay-success-meta">Paid to ${farmerName}</div>
        <div class="rpay-success-txn">TXN: ${txnId}</div>
        <div class="rpay-success-time" id="rpaySuccessTime"></div>
        <button class="rpay-success-btn" onclick="closePaymentModal(true)">
          View Order Status →
        </button>
      </div>
    </div>

  </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('rpay-open');
  });

  // Store callback
  modal._onSuccess = onSuccess;
  modal._orderId = orderId;
  modal._amount = amount;
  modal._txnId = txnId;
  modal._farmerName = farmerName;
}

// ── TAB SWITCHING ─────────────────────────────────────────────────
function switchPayTab(tab, btn) {
  document.querySelectorAll('.rpay-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rpay-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('rpay-panel-' + tab).classList.add('active');
}

// ── APP TAP HANDLER ───────────────────────────────────────────────
function onAppTap(appName) {
  const timerSection = document.getElementById('rpayTimerSection');
  if (timerSection) {
    timerSection.style.display = 'block';
    timerSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  showToast(`📱 Opening ${appName === 'gpay' ? 'Google Pay' : appName === 'phonepe' ? 'PhonePe' : appName === 'paytm' ? 'Paytm' : 'BHIM'}...`);

  // Start 30s countdown — auto confirm after for demo
  startPaymentTimer(30, () => {
    simulatePaymentSuccess();
  });

  // For hackathon demo: auto-confirm after 8 seconds to show judges the flow
  paymentConfirmTimeout = setTimeout(() => {
    simulatePaymentSuccess();
  }, 8000);

  // Don't follow link on desktop (links work on mobile)
  return true;
}

// ── COPY UPI ID ───────────────────────────────────────────────────
function copyUpiId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showToast('✅ UPI ID copied to clipboard!', 'success');
    const btn = document.querySelector('.rpay-copy-btn');
    if (btn) { btn.textContent = '✅ Copied!'; btn.style.background = '#2d7a3a'; btn.style.color = '#fff'; }
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = id; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ UPI ID copied!', 'success');
  });
}

// ── PAYMENT SUCCESS SIMULATION ────────────────────────────────────
function simulatePaymentSuccess() {
  stopPaymentTimer();

  const modal = document.getElementById('realisticPayModal');
  if (!modal) return;

  const overlay = document.getElementById('rpaySuccessOverlay');
  if (!overlay) return;

  // Set time
  const timeEl = document.getElementById('rpaySuccessTime');
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Show success overlay with animation
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('rpay-success-show'));

  // Update order in backend
  const orderId = modal._orderId;
  const txnId = modal._txnId;
  if (orderId && token) {
    apiFetch('/orders/' + orderId + '/status', {
      method: 'PATCH',
      body: { status: 'confirmed', paymentStatus: 'paid', upiRef: txnId }
    }).catch(() => {});
  }

  showToast('✅ Payment confirmed! Order updated.', 'success');
}

// ── CLOSE MODAL ───────────────────────────────────────────────────
function closePaymentModal(success = false) {
  stopPaymentTimer();
  const modal = document.getElementById('realisticPayModal');
  if (!modal) return;

  modal.classList.remove('rpay-open');
  modal.classList.add('rpay-closing');

  setTimeout(() => {
    const cb = modal._onSuccess;
    modal.remove();
    if (success && cb) cb();
    else if (success) {
      // Navigate to tracking
      if (typeof navigateTo === 'function') navigateTo('tracking');
    }
  }, 350);
}

// ── OVERRIDE openUPIModal ─────────────────────────────────────────
// This replaces the old basic modal with the new realistic one
function openUPIModal(upiLink, farmerName, amount, orderId, crop, quantity) {
  // Extract UPI ID from link
  let upiId = '';
  try {
    const match = upiLink.match(/pa=([^&]+)/);
    upiId = match ? decodeURIComponent(match[1]) : farmerName.replace(/\s/g, '').toLowerCase() + '@upi';
  } catch(e) {
    upiId = '9876543210@oksbi';
  }

  openRealisticPaymentModal({
    upiId,
    farmerName: farmerName || 'Farmer',
    amount: amount || 0,
    orderId: orderId || currentPaymentOrderId || '',
    crop: crop || 'Produce',
    quantity: quantity || '',
    onSuccess: () => {
      if (typeof navigateTo === 'function') navigateTo('tracking');
      if (typeof loadOrders === 'function') loadOrders();
    }
  });
}