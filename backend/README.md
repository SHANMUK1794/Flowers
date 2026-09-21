# FreshPetal — Backend

Node.js + Express API for FreshPetal, Hyderabad's gated community flower delivery service.

## Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### Steps:
1. `railway login`
2. `railway init` (in this directory)
3. Add PostgreSQL plugin in Railway dashboard
4. Set environment variables (see `.env.example`)
5. `railway up`

## Environment Variables Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | Auto-set by Railway PostgreSQL plugin |
| `JWT_SECRET` | Random 64-char string |
| `JWT_REFRESH_SECRET` | Random 64-char string |
| `ALLOWED_ORIGINS` | Your frontend domain (e.g. `https://yourapp.vercel.app`) |
| `NODE_ENV` | Set to `production` |

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Register user |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | ✅ | Get current user |
| GET | `/api/products` | — | List all products |
| GET | `/api/products/packages` | — | List subscription packages |
| POST | `/api/products/calculate` | — | Live price calculator |
| POST | `/api/orders` | ✅ | Place order |
| GET | `/api/orders` | ✅ | Order history |
| POST | `/api/subscriptions` | ✅ | Subscribe to plan |
| PATCH | `/api/subscriptions/:id/pause` | ✅ | Pause subscription |
| PATCH | `/api/subscriptions/:id/resume` | ✅ | Resume subscription |
| GET | `/api/societies` | — | List all societies |
| POST | `/api/societies/nominate` | — | Nominate new society |
| POST | `/api/contact` | — | Contact form |
| GET | `/api/health` | — | Health check |

## Delivery Logic

- **Package subscription** → ₹0 delivery always
- **One-time order < ₹299** → ₹40 delivery charge
- **One-time order ≥ ₹299** → FREE delivery
- **Event/bulk order ≥ ₹499** → FREE delivery
