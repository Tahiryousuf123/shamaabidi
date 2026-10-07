import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const memoryCache = new Map<string, CacheEntry<any>>();

const DISK_CACHE_DIR = path.join(process.cwd(), '.cache', 'discovery');

function ensureCacheDir(): boolean {
  try {
    if (!fs.existsSync(DISK_CACHE_DIR)) {
      fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

function getCacheFilePath(key: string): string {
  const safeKey = Buffer.from(key).toString('base64url').slice(0, 200);
  return path.join(DISK_CACHE_DIR, `${safeKey}.json`);
}

export async function getCached<T>(key: string): Promise<T | null> {
  const now = Date.now();

  // 1. Check in-memory cache
  const mem = memoryCache.get(key);
  if (mem && now - mem.timestamp < CACHE_TTL_MS) {
    return mem.data as T;
  }

  // 2. Check disk cache
  try {
    const filePath = getCacheFilePath(key);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);
      if (now - entry.timestamp < CACHE_TTL_MS) {
        memoryCache.set(key, entry);
        return entry.data;
      }
    }
  } catch {}

  return null;
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
  };

  memoryCache.set(key, entry);

  try {
    if (ensureCacheDir()) {
      const filePath = getCacheFilePath(key);
      fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
    }
  } catch {}
}
