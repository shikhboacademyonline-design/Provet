import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ERPDatabase } from '../src/types/erp.ts';
import {
  applyAddProduct,
  applyDamagedProduct,
  applyPurchaseInvoice,
  applyPurchaseReturn,
  applyRestockProduct,
  applySalesChallan,
  applySalesReturn,
  applyVoucher,
  createInitialSeed,
  nextCode,
} from '../src/utils/erpEngine.ts';

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
const DATA_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), 'provet-erp-data') : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'erp-db.json');

export function loadDB(): ERPDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createInitialSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(raw) as ERPDatabase;
}

export function saveDB(db: ERPDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function resetDB(): ERPDatabase {
  const seed = createInitialSeed();
  saveDB(seed);
  return seed;
}

export {
  applyAddProduct,
  applyDamagedProduct,
  applyPurchaseInvoice,
  applyPurchaseReturn,
  applyRestockProduct,
  applySalesChallan,
  applySalesReturn,
  applyVoucher,
  nextCode,
};
