/* Servidor local para probar el sitio con la IA real.
 *
 *   $env:MINIMAX_API_KEY = "sk-..."
 *   node servidor-local.js
 *   → http://localhost:8080
 *
 * Para que la calculadora peguele al modelo de verdad:
 *   http://localhost:8080/dashboard.html?ia=real
 *
 * Sin la variable definida, la calculadora lo avisa en pantalla y
 * devuelve un resultado de ejemplo (modo prueba).
 *
 * ESM a propósito: package.json declara "type": "module" para que
 * api/analizar.js funcione igual en local que en Vercel.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import analizar from './api/analizar.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = process.env.PORT || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/* La función de Vercel usa res.status(codigo).json(cuerpo).
   Acá se le pasa un res compatible. */
function adaptarRes(res) {
  res.status = (codigo) => ({
    json: (cuerpo) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(cuerpo));
      return res;
    },
  });
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  /* --- La ruta de la IA --- */
  if (url === '/api/analizar') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Método no permitido' }));
      return;
    }

    let crudo = '';
    let demasiadoGrande = false;
    const MAX_CUERPO = 6 * 1024 * 1024; // 6 MB

    req.on('data', (t) => {
      crudo += t;
      if (crudo.length > MAX_CUERPO) {
        demasiadoGrande = true;
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (demasiadoGrande) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'La imagen es demasiado grande' }));
        return;
      }
      try {
        req.body = JSON.parse(crudo || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Cuerpo inválido' }));
        return;
      }
      try {
        await analizar(req, adaptarRes(res));
      } catch (e) {
        console.error('Error en /api/analizar:', e);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Error interno' }));
        }
      }
    });
    return;
  }

  /* --- Archivos estáticos --- */
  const relativa = url.replace(/^\/+/, '') || 'index.html';
  const archivo = path.join(RAIZ, relativa);

  if (!archivo.startsWith(RAIZ)) {
    res.writeHead(403);
    res.end('prohibido');
    return;
  }

  if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('no encontrado: ' + relativa);
    return;
  }

  const ext = path.extname(archivo).toLowerCase();

  res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
});

server.listen(PUERTO, () => {
  const clave = process.env.MINIMAX_API_KEY;
  console.log('');
  console.log('  Eclipse Ink — servidor local');
  console.log('  ─────────────────────────────');
  console.log('  http://localhost:' + PUERTO);
  console.log('');
  if (clave) {
    console.log('  MINIMAX_API_KEY: encontrada.');
    console.log('  IA real:  http://localhost:' + PUERTO + '/dashboard.html?ia=real');
  } else {
    console.log('  MINIMAX_API_KEY: NO esta definida.');
    console.log('  La calculadora va a funcionar en modo prueba.');
    console.log('  Para la IA real, exportala antes de arrancar:');
    console.log('    $env:MINIMAX_API_KEY = "sk-..."');
  }
  console.log('');
});
