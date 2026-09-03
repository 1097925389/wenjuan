import 'dotenv/config';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { RegistrationStore } from './store.js';

async function main() {
  const config = loadConfig();
  if (process.env.DEV_API_ONLY !== '1') {
    const clientEntry = path.resolve(process.cwd(), 'dist', 'index.html');
    try {
      await access(clientEntry, fsConstants.R_OK);
    } catch {
      throw new Error('未找到可读取的 dist/index.html，请先运行 npm run build 并确认工作目录正确');
    }
  }
  const store = new RegistrationStore(config.dataDir, config.dataEncryptionKey);
  await store.initialize();
  const app = createApp(config, store);
  const server = createServer(app);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Registration service is listening on 0.0.0.0:${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down.`);
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Service failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
