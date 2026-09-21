require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const cookieParser  = require('cookie-parser');
const rateLimit     = require('express-rate-limit');
const path          = require('path');

const authRoutes          = require('./src/routes/auth');
const productRoutes       = require('./src/routes/products');
const orderRoutes         = require('./src/routes/orders');
const subscriptionRoutes  = require('./src/routes/subscriptions');
const societyRoutes       = require('./src/routes/societies');
const contactRoutes       = require('./src/routes/contact');
const cartRoutes          = require('./src/routes/cart');
const adminRoutes         = require('./src/routes/admin');
const { initDB }          = require('./src/models/db');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ---- Security & Middleware ---- */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ---- CORS ---- */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5500').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

/* ---- Rate Limiting ---- */
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts, please try again later.' } });

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

/* ---- Static Frontend (for production) ---- */
app.use(express.static(path.join(__dirname, '../frontend')));

/* ---- API Routes ---- */
app.use('/api/auth',          authRoutes);
app.use('/api/products',      productRoutes);
app.use('/api/orders',        orderRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/societies',     societyRoutes);
app.use('/api/contact',       contactRoutes);
app.use('/api/cart',          cartRoutes);
app.use('/api/admin',         adminRoutes);

/* ---- Health Check ---- */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'FreshPetal API', timestamp: new Date().toISOString() });
});

/* ---- Catch-All: Serve Frontend or 404 ---- */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(__dirname, '../frontend/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

/* ---- Global Error Handler ---- */
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

/* ---- Start ---- */
app.listen(PORT, () => {
  console.log(`\n🌸 FreshPetal API running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  initDB()
    .then(() => console.log('✅ PostgreSQL tables and seeds ready'))
    .catch((err) => console.warn('⚠️ Database init warning:', err.message));
});
