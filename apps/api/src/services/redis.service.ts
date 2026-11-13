import { Redis as RedisClient } from "ioredis";
import RedisMock from "ioredis-mock";

let redisInstance: RedisClient | null = null;
let isMock = false;

export function getRedisClient(): RedisClient {
  if (redisInstance) {
    return redisInstance;
  }

  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  // If running in test or if REDIS_URL is not provided and redis port is not actively open, use mock
  if (process.env.NODE_ENV === "test" || process.env.USE_REDIS_MOCK === "true") {
    redisInstance = new (RedisMock as unknown as new () => RedisClient)();
    isMock = true;
    return redisInstance;
  }

  try {
    const client = new RedisClient({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null, // Fail fast and fallback without spamming retry loops
    });

    let loggedOfflineWarning = false;
    client.on("error", (err) => {
      if (!loggedOfflineWarning) {
        loggedOfflineWarning = true;
        console.warn("[Redis] Local Redis server offline; running with in-memory fallback store:", err.message);
      }
    });

    redisInstance = client;
    return redisInstance;
  } catch {
    redisInstance = new (RedisMock as unknown as new () => RedisClient)();
    isMock = true;
    return redisInstance;
  }
}

export function createRedisConnection(): RedisClient {
  if (isMock || process.env.NODE_ENV === "test" || process.env.USE_REDIS_MOCK === "true") {
    return new (RedisMock as unknown as new () => RedisClient)();
  }

  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  return new RedisClient({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: () => null, // Don't infinite loop if offline
  });
}
