
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import mongoose from 'mongoose';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';

// Fix MongoDB Atlas SRV DNS resolution
// Use Google and Cloudflare public DNS servers.
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  try {
    console.log('[ECN] Starting Encrypted Communication Network...');

    // Connect to MongoDB Atlas
    await connectDB();

    console.log('[ECN] MongoDB connected successfully.');

    // Initialize Express application
    const app = createApp();

    let server;

    // Configure HTTPS or HTTP
    if (env.tlsKeyPath && env.tlsCertPath) {
      server = https.createServer(
        {
          key: fs.readFileSync(env.tlsKeyPath),
          cert: fs.readFileSync(env.tlsCertPath)
        },
        app
      );

      console.log('[ECN] TLS enabled (native HTTPS).');
    } else {
      server = http.createServer(app);

      if (env.isProd) {
        console.log(
          '[ECN] Plain HTTP listener - make sure TLS is terminated by your host/proxy.'
        );
      }
    }

    // Initialize Socket.IO
    initSockets(server);

    // Start server
    server.listen(env.port, () => {
      console.log(
        `[ECN] CONNECT. ENCRYPT. COMMUNICATE. listening on :${env.port} (${env.isProd ? 'production' : 'development'})`
      );

      console.log(
        `[ECN] Allowed client origins: ${env.clientOrigins.join(', ')}`
      );
    });

    // Graceful shutdown
    const shutdown = async (sig) => {
      console.log(`[ECN] ${sig} received, shutting down...`);

      server.close();

      await mongoose.disconnect().catch(() => {});

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('[ECN] FATAL:', err.message);

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
}

main();
