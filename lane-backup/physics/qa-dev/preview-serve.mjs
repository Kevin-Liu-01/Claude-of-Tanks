import { preview } from 'vite';
const root = process.argv[2], port = Number(process.argv[3] ?? 5490);
const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
console.log('serving', root, 'on', port);
process.on('SIGTERM', () => server.httpServer.close(() => process.exit(0)));
