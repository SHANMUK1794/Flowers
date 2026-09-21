/* FreshPetal — Shared Frontend Utilities */

const LIVE_API_URL = 'https://freshpetal-api-production.up.railway.app/api';
const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '5000')
  ? 'http://localhost:5000/api'
  : LIVE_API_URL;

/* ===================== AUTH HELPERS ===================== */
const Auth = {
  getToken() { return localStorage.getItem('fp_token'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('fp_user')); } catch { return null; } },
  isLoggedIn() { return !!this.getToken(); },
  setSession(token, user) {
    localStorage.setItem('fp_token', token);
    localStorage.setItem('fp_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('fp_token');
    localStorage.removeItem('fp_user');
  },
  async logout() {
    await api.post('/auth/logout');
    this.clearSession();
    window.location.href = '/pages/login.html';
  }
};

/* ===================== GOOGLE OAUTH CONFIG ===================== */
const GoogleAuth = {
  CLIENT_ID: '8948206661-li8eeecopiuhs1i4njul1bh1b6vstth5.apps.googleusercontent.com',

  isConfigured() {
    return !!this.CLIENT_ID && !this.CLIENT_ID.startsWith('YOUR_GOOGLE');
  },

  async handleCredential(response) {
    try {
      showToast('Verifying Google credentials... 🌸', 'info');
      const data = await api.post('/auth/google', { credential: response.credential });
      Auth.setSession(data.token, data.user);
      showToast(`Welcome back, ${data.user.name.split(' ')[0]}! 🌸`, 'success');

      if (data.user.role === 'admin') {
        sessionStorage.setItem('fp_admin_auth', 'true');
        sessionStorage.setItem('fp_admin_token', data.token);
        sessionStorage.setItem('fp_admin_user', JSON.stringify(data.user));
        setTimeout(() => window.location.href = '/pages/admin.html', 700);
        return;
      }

      const redirect = new URLSearchParams(window.location.search).get('redirect') || '/pages/dashboard.html';
      setTimeout(() => window.location.href = redirect, 700);
    } catch (err) {
      console.error('Google login error:', err);
      showToast(err.message || 'Google Sign-In failed.', 'error');
    }
  },

  init(containerId) {
    const doInit = () => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        setTimeout(doInit, 200);
        return;
      }

      if (!this.isConfigured()) return;

      try {
        google.accounts.id.initialize({
          client_id: this.CLIENT_ID,
          callback: (res) => this.handleCredential(res),
          auto_select: false,
          cancel_on_tap_outside: true
        });

        const container = document.getElementById(containerId);
        if (container) {
          container.innerHTML = '';
          google.accounts.id.renderButton(container, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'center'
          });

          // Once official button renders, hide custom button to avoid duplicate
          const customBtn = document.getElementById('btn-google');
          if (customBtn) customBtn.style.display = 'none';
        }
      } catch (err) {
        console.error('Error rendering Google button:', err);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doInit);
    } else {
      doInit();
    }
  },

  promptLogin() {
    if (!this.isConfigured()) {
      showToast('Google Client ID is not configured.', 'error');
      return;
    }

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: this.CLIENT_ID,
        callback: (res) => this.handleCredential(res),
        auto_select: false
      });
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.warn('Google One Tap suppressed:', notification.getNotDisplayedReason());
        }
      });
    } else {
      showToast('Loading Google identity service... please try in a moment.', 'info');
    }
  }
};

// Expose globally to window
window.GoogleAuth = GoogleAuth;

/* ===================== API WRAPPER ===================== */
const api = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (Auth.getToken()) opts.headers['Authorization'] = `Bearer ${Auth.getToken()}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Something went wrong');
    return data;
  },
  get(path)         { return this.request('GET',    path); },
  post(path, body)  { return this.request('POST',   path, body); },
  patch(path, body) { return this.request('PATCH',  path, body); },
  delete(path)      { return this.request('DELETE', path); },
};

/* ===================== CART ===================== */
const Cart = {
  STORAGE_KEY: 'fp_cart',

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; }
    catch { return []; }
  },

  save(items) { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items)); this._notifyUpdate(); },

  add(product, qty, unitLabel) {
    const items = this.getAll();
    const idx = items.findIndex(i => i.product_id === product.id);
    if (idx > -1) {
      items[idx].qty = parseFloat(items[idx].qty) + parseFloat(qty);
    } else {
      items.push({
        product_id: product.id,
        name:       product.name,
        emoji:      product.image_emoji || '🌸',
        qty:        parseFloat(qty),
        unit_label: unitLabel || product.unit_label,
        price_per_unit: parseFloat(product.price_per_unit),
        is_by_weight:   product.is_by_weight,
        line_total:     parseFloat(qty) * parseFloat(product.price_per_unit),
      });
    }
    this.save(items);
    showToast(`${product.name} added to cart 🛒`, 'success');
  },

  remove(productId) {
    const items = this.getAll().filter(i => i.product_id !== productId);
    this.save(items);
  },

  updateQty(productId, newQty) {
    const items = this.getAll().map(i => {
      if (i.product_id !== productId) return i;
      return { ...i, qty: newQty, line_total: newQty * i.price_per_unit };
    });
    this.save(items);
  },

  getCount()   { return this.getAll().length; },

  getSubtotal() {
    return this.getAll().reduce((sum, i) => sum + (parseFloat(i.qty) * parseFloat(i.price_per_unit)), 0);
  },

  getDeliveryCharge() { return this.getSubtotal() >= 299 ? 0 : 40; },

  getTotal() { return this.getSubtotal() + this.getDeliveryCharge(); },

  clear() { localStorage.removeItem(this.STORAGE_KEY); this._notifyUpdate(); },

  _notifyUpdate() {
    document.dispatchEvent(new CustomEvent('cartUpdated'));
    updateCartBadges();
  }
};

/* ===================== TOAST ===================== */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: '🌸', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '🌸'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(10px)'; setTimeout(() => toast.remove(), 300); }, duration);
}

/* ===================== CART BADGE SYNC ===================== */
function updateCartBadges() {
  const count = Cart.getCount();
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

/* ===================== HEADER NAV RENDER ===================== */
function renderHeader(activePage = '') {
  const user = Auth.getUser();
  const navLinks = [
    { href: '/index.html',                 label: 'Home',          key: 'home' },
    { href: '/pages/shop.html',            label: 'Shop Flowers',  key: 'shop' },
    { href: '/pages/subscriptions.html',   label: 'Subscriptions', key: 'subscriptions' },
    { href: '/pages/events.html',          label: 'Events',        key: 'events' },
    { href: '/pages/about.html',           label: 'About Us',      key: 'about' },
    { href: '/pages/contact.html',         label: 'Contact',       key: 'contact' },
  ];

  const navHtml = navLinks.map(l =>
    `<a href="${l.href}" class="nav-link${activePage === l.key ? ' active' : ''}">${l.label}</a>`
  ).join('');

  const mobileNavHtml = navLinks.map(l =>
    `<a href="${l.href}" class="mobile-nav-link${activePage === l.key ? ' active' : ''}">${l.label}</a>`
  ).join('');

  const authActions = user
    ? `<a href="/pages/dashboard.html" class="btn btn-rose-outline btn-sm header-cta">👤 ${user.name.split(' ')[0]}</a>`
    : `<a href="/pages/login.html" class="btn btn-rose btn-sm header-cta">Login / Sign Up</a>`;

  return `
    <div class="announce-bar">
      🚚 <strong>Free Delivery</strong> on orders above ₹299 &nbsp;|&nbsp;
      Daily subscriptions from <strong>₹49/day</strong> &nbsp;|&nbsp;
      Hyderabad: Uppal to Shamshabad &nbsp;
      <a href="/pages/shop.html">Shop Now →</a>
    </div>
    <header class="site-header" id="site-header">
      <div class="container header-inner">
        <a href="/index.html" class="site-logo">
          <div class="logo-icon">🌸</div>
          <div>
            <span class="logo-text">FreshPetal</span>
            <span class="logo-tagline">Hyderabad's Flower Concierge</span>
          </div>
        </a>

        <nav class="main-nav">${navHtml}</nav>

        <div class="header-actions">
          <a href="/pages/shop.html" class="header-icon-btn" title="Shop">🛍️</a>
          <button class="header-icon-btn" id="cart-header-btn" title="Cart" onclick="toggleCartDrawer()">
            🛒
            <span class="cart-badge" id="cart-badge-header" style="display:none">0</span>
          </button>
          ${authActions}
          <button class="hamburger" id="hamburger-btn" onclick="toggleMobileNav()">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <nav class="mobile-nav" id="mobile-nav">
        ${mobileNavHtml}
        <div class="mobile-nav-divider"></div>
        <div class="mobile-nav-footer">
          ${user
            ? `<a href="/pages/dashboard.html" class="btn btn-rose btn-sm w-full">My Dashboard</a>`
            : `<a href="/pages/login.html" class="btn btn-rose btn-sm w-full">Login</a>
               <a href="/pages/signup.html" class="btn btn-rose-outline btn-sm w-full">Sign Up</a>`}
        </div>
      </nav>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="footer-logo">
              <div class="footer-logo-icon">🌸</div>
              <span class="footer-logo-text">FreshPetal</span>
            </div>
            <p class="footer-tagline">Hyderabad's trusted fresh flower & pooja essentials delivery. Serving gated communities from Uppal to Shamshabad — delivered fresh at your door every morning.</p>
            <div class="footer-social">
              <a href="https://wa.me/919949054899" class="social-btn" target="_blank" title="WhatsApp">💬</a>
              <a href="tel:+919949054899" class="social-btn" title="Call">📞</a>
            </div>
          </div>

          <div>
            <h4 class="footer-heading">Shop</h4>
            <ul class="footer-links">
              <li><a href="/pages/shop.html?cat=fresh-flowers">Fresh Flowers</a></li>
              <li><a href="/pages/shop.html?cat=pooja-essentials">Pooja Essentials</a></li>
              <li><a href="/pages/shop.html?cat=garlands">Garlands & Strings</a></li>
              <li><a href="/pages/shop.html?cat=bundles">Ready Bundles</a></li>
            </ul>
          </div>

          <div>
            <h4 class="footer-heading">Services</h4>
            <ul class="footer-links">
              <li><a href="/pages/subscriptions.html">Daily Subscriptions</a></li>
              <li><a href="/pages/subscriptions.html">Weekly Packages</a></li>
              <li><a href="/pages/events.html">Events & Functions</a></li>
              <li><a href="/pages/how-it-works.html">How It Works</a></li>
            </ul>
          </div>

          <div>
            <h4 class="footer-heading">Contact</h4>
            <ul class="footer-links">
              <li><a href="tel:+919949054899">📞 +91 99490 54899</a></li>
              <li><a href="https://wa.me/919949054899?text=Namaste%20FreshPetal!" target="_blank">💬 WhatsApp (+91 99490 54899)</a></li>
              <li><a href="mailto:hello@freshpetal.in">✉️ hello@freshpetal.in</a></li>
              <li><a href="/pages/contact.html">Contact Form</a></li>
            </ul>
            <p style="margin-top:16px;font-size:0.82rem;opacity:0.6;">Open: 5 AM – 8 PM daily<br>Delivery: Uppal to Shamshabad, Hyd</p>
          </div>
        </div>

        <div class="footer-bottom">
          <span>© 2026 FreshPetal. Made with 🌸 in Hyderabad.</span>
          <div class="footer-bottom-links">
            <a href="/pages/admin.html" style="color: #fbbf24; font-weight: 600;">🔐 Admin Portal</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Refund Policy</a>
          </div>
        </div>
      </div>
    </footer>
  `;
}

/* ===================== CART DRAWER ===================== */
function renderCartDrawer() {
  return `
    <div class="cart-overlay" id="cart-overlay" onclick="toggleCartDrawer()"></div>
    <div class="cart-drawer" id="cart-drawer">
      <div class="cart-header">
        <h3>🛒 My Cart</h3>
        <button class="btn-close-cart" onclick="toggleCartDrawer()">✕</button>
      </div>
      <div class="cart-body" id="cart-body"></div>
      <div class="cart-footer" id="cart-footer"></div>
    </div>
  `;
}

function toggleCartDrawer() {
  const overlay = document.getElementById('cart-overlay');
  const drawer  = document.getElementById('cart-drawer');
  if (!overlay || !drawer) return;
  const isOpen = drawer.classList.contains('open');
  overlay.classList.toggle('open');
  drawer.classList.toggle('open');
  if (!isOpen) renderCartContents();
}

function renderCartContents() {
  const body   = document.getElementById('cart-body');
  const footer = document.getElementById('cart-footer');
  if (!body) return;

  const items    = Cart.getAll();
  const subtotal = Cart.getSubtotal();
  const delivery = Cart.getDeliveryCharge();
  const total    = Cart.getTotal();

  if (!items.length) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🧺</div>
        <p>Your cart is empty.</p>
        <a href="/pages/shop.html" class="btn btn-rose btn-sm mt-2" onclick="toggleCartDrawer()">Shop Now</a>
      </div>`;
    footer.innerHTML = '';
    return;
  }

  body.innerHTML = items.map(item => {
    const lineTotal = parseFloat(item.qty) * parseFloat(item.price_per_unit);
    const qtyDisplay = item.is_by_weight ? `${item.qty}${item.unit_label}` : `${item.qty} ${item.unit_label}`;
    return `
      <div class="cart-item">
        <div class="cart-item-thumb">${item.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-meta">${qtyDisplay} × ₹${item.price_per_unit}/${item.unit_label}</div>
          <div class="cart-item-actions">
            <span class="cart-item-price">₹${lineTotal.toFixed(2)}</span>
            <button class="btn-remove" onclick="Cart.remove(${item.product_id}); renderCartContents();">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const freeThreshold = 299;
  const remaining = freeThreshold - subtotal;
  footer.innerHTML = `
    ${remaining > 0
      ? `<div style="background:var(--blush);padding:10px 14px;border-radius:var(--radius-sm);font-size:0.82rem;font-family:var(--font-head);font-weight:700;color:var(--rose);text-align:center;margin-bottom:14px;">
          Add <strong>₹${remaining.toFixed(0)} more</strong> for FREE delivery! 🚚
         </div>`
      : `<div style="background:var(--sage-pale);padding:10px 14px;border-radius:var(--radius-sm);font-size:0.82rem;font-family:var(--font-head);font-weight:700;color:var(--sage);text-align:center;margin-bottom:14px;">
          🎉 You've got FREE delivery!
         </div>`}
    <div class="cart-total-row">
      <span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span>
    </div>
    <div class="cart-total-row" style="font-size:0.88rem;color:var(--text-muted);font-weight:500;">
      <span>Delivery</span>
      <span>${delivery === 0 ? '<span style="color:var(--sage)">FREE</span>' : `₹${delivery}`}</span>
    </div>
    <div class="cart-total-row" style="font-size:1.15rem;margin-top:10px;border-top:2px solid var(--border-light);padding-top:10px;">
      <span>Total</span><span class="cart-total-price">₹${total.toFixed(2)}</span>
    </div>
    <div class="cart-checkout-btns">
      <a href="/pages/checkout.html" class="btn btn-rose w-full" onclick="toggleCartDrawer()">Proceed to Checkout →</a>
      <a href="https://wa.me/919949054899?text=${encodeURIComponent('Hi! I want to place an order:\n' + items.map(i=>`• ${i.name}: ${i.qty}${i.unit_label}`).join('\n') + `\nTotal: ₹${total.toFixed(2)}`)}"
         class="btn btn-whatsapp w-full" target="_blank">
        💬 Order via WhatsApp
      </a>
    </div>`;
}

/* ===================== MOBILE NAV ===================== */
function toggleMobileNav() {
  document.getElementById('mobile-nav')?.classList.toggle('open');
}

/* ===================== STICKY HEADER ===================== */
function initStickyHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  });
}

/* ===================== PAGE LOADER ===================== */
function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) { loader.classList.add('fade-out'); setTimeout(() => loader.remove(), 400); }
}

/* ===================== PAGE BOOTSTRAP ===================== */
function initPage(activePage = '') {
  // Inject header
  const headerTarget = document.getElementById('header-mount');
  if (headerTarget) headerTarget.innerHTML = renderHeader(activePage);

  // Inject footer
  const footerTarget = document.getElementById('footer-mount');
  if (footerTarget) footerTarget.innerHTML = renderFooter();

  // Inject cart drawer
  document.body.insertAdjacentHTML('beforeend', renderCartDrawer());

  // Sync cart badges
  updateCartBadges();
  document.addEventListener('cartUpdated', updateCartBadges);

  // Sticky header
  initStickyHeader();

  // Hide loader
  hideLoader();
}
