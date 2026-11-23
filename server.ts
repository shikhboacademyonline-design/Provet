import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createApiApp } from './server/app.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = createApiApp();

  // Vite middleware or production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Provet ERP server listening on http://localhost:${PORT}`);
  });
}

startServer();
