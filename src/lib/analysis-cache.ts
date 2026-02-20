const CACHE_KEY = 'uttt-analysis-cache';
const MAX_ENTRIES = 500;

// Matches ModelResponse shape from game-store
interface CachedAnalysis {
  topMoves: { move: { boardIndex: number; cellIndex: number }; probability: number; value: number; visits?: number; continuation?: string[] }[];
  evaluation: number;
  thinkingTime: number;
}

interface CacheEntry {
  result: CachedAnalysis;
  ts: number;
}

type CacheMap = Record<string, CacheEntry>;

function positionKey(
  modelId: string,
  moves: { boardIndex: number; cellIndex: number; player: string | null }[],
  simulations: number,
): string {
  const movePart = moves.map(m => `${m.boardIndex},${m.cellIndex},${m.player}`).join(';');
  return `${modelId}|${simulations}|${movePart}`;
}

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: CacheMap) {
  try {
    // Evict oldest entries if over limit
    const entries = Object.entries(cache);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => a[1].ts - b[1].ts);
      const toRemove = entries.length - MAX_ENTRIES;
      for (let i = 0; i < toRemove; i++) {
        delete cache[entries[i][0]];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — clear old cache
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {}
  }
}

export function getCachedAnalysis(
  modelId: string,
  moves: { boardIndex: number; cellIndex: number; player: string | null }[],
  simulations: number,
): CachedAnalysis | null {
  const key = positionKey(modelId, moves, simulations);
  const cache = loadCache();
  const entry = cache[key];
  return entry ? entry.result : null;
}

export function setCachedAnalysis(
  modelId: string,
  moves: { boardIndex: number; cellIndex: number; player: string | null }[],
  simulations: number,
  result: CachedAnalysis,
) {
  const key = positionKey(modelId, moves, simulations);
  const cache = loadCache();
  cache[key] = { result, ts: Date.now() };
  saveCache(cache);
}
