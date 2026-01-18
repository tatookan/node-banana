/**
 * Cache Manager for storing and retrieving generated content
 * Uses IndexedDB for large file storage (images, text outputs)
 */

// Cache data structures
export interface CacheKeyData {
  nodeId: string;
  nodeType: "nanoBanana" | "llmGenerate";
  inputs: {
    model?: string;
    resolution?: string;
    aspectRatio?: string;
    provider?: string;
    temperature?: number;
    prompt: string;
    imageCount: number;
  };
  seed: number;
}

export interface CachedGeneration {
  id: string;           // Cache key
  seed: number;
  nodeId: string;
  nodeType: "nanoBanana" | "llmGenerate";
  inputs: CacheKeyData["inputs"];
  output: {
    image?: string;    // Base64 data URL
    text?: string;     // Generated text
  };
  timestamp: number;   // When generated
  expiresAt: number;   // Expiration timestamp (0 = never)
}

// Simple hash function for strings
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Generate cache key from input data
export function generateCacheKey(data: CacheKeyData): string {
  // Hash image inputs (using length and partial content for efficiency)
  const inputSignature = JSON.stringify({
    nodeType: data.nodeType,
    model: data.inputs.model,
    resolution: data.inputs.resolution,
    aspectRatio: data.inputs.aspectRatio,
    provider: data.inputs.provider,
    temperature: data.inputs.temperature,
    promptLength: data.inputs.prompt.length,
    promptHash: simpleHash(data.inputs.prompt),
    imageCount: data.inputs.imageCount,
    seed: data.seed,
  });

  const hash = simpleHash(inputSignature);
  return `${data.nodeType}-${data.nodeId}-${hash}`;
}

// IndexedDB setup
const DB_NAME = "node-banana-cache";
const DB_VERSION = 1;
const STORE_NAME = "generations";

class CacheManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("[CacheManager] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[CacheManager] Database initialized");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for cached generations
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });

          // Create indexes for efficient queries
          store.createIndex("nodeId", "nodeId", { unique: false });
          store.createIndex("nodeType", "nodeType", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInit(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * Save generation result to cache
   */
  async save(data: Omit<CachedGeneration, "id" | "timestamp" | "expiresAt">): Promise<string> {
    await this.ensureInit();

    const cacheKey: CacheKeyData = {
      nodeId: data.nodeId,
      nodeType: data.nodeType,
      inputs: data.inputs,
      seed: data.seed,
    };

    const id = generateCacheKey(cacheKey);
    const cachedData: CachedGeneration = {
      ...data,
      id,
      timestamp: Date.now(),
      expiresAt: 0, // Never expire by default
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cachedData);

      request.onsuccess = () => {
        console.log("[CacheManager] Saved cache:", id);
        resolve(id);
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to save cache:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cached generation by key data
   */
  async get(data: CacheKeyData): Promise<CachedGeneration | null> {
    await this.ensureInit();

    const id = generateCacheKey(data);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Check if expired
          if (result.expiresAt > 0 && result.expiresAt < Date.now()) {
            console.log("[CacheManager] Cache expired:", id);
            this.delete(id).catch(console.error);
            resolve(null);
            return;
          }
          console.log("[CacheManager] Cache hit:", id);
          resolve(result as CachedGeneration);
        } else {
          console.log("[CacheManager] Cache miss:", id);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to get cache:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete specific cache entry
   */
  async delete(id: string): Promise<void> {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log("[CacheManager] Deleted cache:", id);
        resolve();
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to delete cache:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all caches for a specific node
   */
  async clearByNode(nodeId: string): Promise<number> {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("nodeId");
      const request = index.openCursor(IDBKeyRange.only(nodeId));
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          console.log("[CacheManager] Cleared", count, "caches for node:", nodeId);
          resolve(count);
        }
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to clear node caches:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpired(): Promise<number> {
    await this.ensureInit();

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("expiresAt");
      const request = index.openCursor(IDBKeyRange.upperBound(now, true)); // expiresAt < now and != 0
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          console.log("[CacheManager] Cleaned", count, "expired caches");
          resolve(count);
        }
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to clean expired caches:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ count: number; size: number }> {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        // Estimate size (rough approximation)
        const count = countRequest.result;
        const avgSize = 500_000; // ~500KB per cached image (rough estimate)
        const estimatedSize = count * avgSize;

        resolve({
          count,
          size: estimatedSize,
        });
      };

      countRequest.onerror = () => {
        console.error("[CacheManager] Failed to get stats:", countRequest.error);
        reject(countRequest.error);
      };
    });
  }

  /**
   * Clear all caches (use with caution)
   */
  async clearAll(): Promise<void> {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("[CacheManager] Cleared all caches");
        resolve();
      };

      request.onerror = () => {
        console.error("[CacheManager] Failed to clear all caches:", request.error);
        reject(request.error);
      };
    });
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
