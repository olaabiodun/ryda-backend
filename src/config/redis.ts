import Redis from 'ioredis';

const redisConfig = process.env.REDIS_URL || 'redis://localhost:6379';

// Setup local fallback for environments without Redis
const localData = new Map<string, Map<string, string>>();

let isRedisAvailable = false;
const redis = new Redis(redisConfig, {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  retryStrategy: (times) => {
    return null; // Don't retry, use fallback
  }
});

// Attempt connection once
redis.connect().catch(() => {
    console.warn('⚠️ Redis not found. Using in-memory fallback for locations.');
});

redis.on('connect', () => {
    console.log('Connected to Redis 🛡️');
    isRedisAvailable = true;
});

redis.on('error', (err) => {
    // Suppress repeated logs if desired, but keep for debugging
    if (isRedisAvailable) {
        console.error('Redis connection lost ❌');
        isRedisAvailable = false;
    }
});

// Wrapper to handle fallback
const redisWrapper = {
    hset: async (key: string, field: string, value: string) => {
        if (isRedisAvailable) {
            try { return await redis.hset(key, field, value); } 
            catch { /* fallback to local below */ }
        }
        if (!localData.has(key)) localData.set(key, new Map());
        localData.get(key)!.set(field, value);
    },
    hget: async (key: string, field: string) => {
        if (isRedisAvailable) {
            try { return await redis.hget(key, field); }
            catch { /* fallback to local below */ }
        }
        return localData.get(key)?.get(field) || null;
    },
    hgetall: async (key: string) => {
        if (isRedisAvailable) {
            try { return await redis.hgetall(key); }
            catch { /* fallback to local below */ }
        }
        const map = localData.get(key);
        if (!map) return {};
        return Object.fromEntries(map);
    },
    del: async (key: string) => {
        if (isRedisAvailable) {
          try { return await redis.del(key); }
          catch { }
        }
        return localData.delete(key);
    }
};

export default redisWrapper;
