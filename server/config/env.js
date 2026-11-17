import 'dotenv/config';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

function list(v, fallback) {
  return (v || fallback)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function parseTrustProxy(v) {
  if (v === undefined || v === '') return 1;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isInteger(n) ? n : v;
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) {
    console.error('[ECN] FATAL: SESSION_SECRET is required in production (min 32 chars).');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(48).toString('base64url');
  console.warn('[ECN] SESSION_SECRET not set - using an ephemeral dev secret.');
} else if (sessionSecret.length < 32) {
  console.error('[ECN] FATAL: SESSION_SECRET must be at least 32 characters.');
  process.exit(1);
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  sessionSecret,
  // Origins allowed to call the API / open sockets (comma separated).
  clientOrigins: list(process.env.CLIENT_ORIGIN, 'http://localhost:5173,http://localhost:5000'),
  // Set CROSS_SITE=true only if the browser talks to this API directly from another site
  // (SameSite=None cookies). The recommended Vercel setup proxies /api so this stays false.
  crossSite: process.env.CROSS_SITE === 'true',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  forceHttps: process.env.FORCE_HTTPS === 'true',
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || '',
  serveClient: process.env.SERVE_CLIENT !== 'false',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  ticketTtlMs: 60 * 1000,
};

env.cookieSecure = isProd || env.crossSite;
