import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter, csrfGuard, httpsRedirect } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(httpsRedirect);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', ...env.clientOrigins],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.clientOrigins.includes(origin.replace(/\/$/, ''))),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
    })
  );

  app.use(cookieParser());
  // Sending a message may carry an encrypted attachment, so only that route accepts a large body.
  app.use(/^\/api\/conversations\/[a-fA-F0-9]{24}\/messages$/, express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '50kb' }));

  app.use('/api', apiLimiter, csrfGuard, routes);
  app.use('/api', notFound);

  // Optional: serve the built client from the same host (single-service deployment).
  const dist = path.resolve(__dirname, '../client/dist');
  if (env.serveClient && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    // Single-page-app fallback: any other GET that is not an API/socket path returns index.html.
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    console.log('[ECN] Serving client from', dist);
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
