// Tiny static server for running the dashboard on a computer.
// All app logic lives in public/ (it also ships inside the Android app),
// so this does nothing but serve the files.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n  Crypto paper-trader running:  http://localhost:${PORT}`);
  console.log('  Mode: PAPER (simulated only — no real orders)\n');
});
