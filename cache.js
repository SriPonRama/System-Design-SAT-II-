const { createClient } = require('redis');
const config = require('./config');

let client;
let connected = false;

async function getClient() {
  if (connected && client?.isReady) return client;
  if (!client) {
    client = createClient({ url: config.redisUrl });
    client.on('error', (err) => console.warn('Redis unavailable; cache bypassed:', err.message));
  }
  try {
    if (!client.isOpen) await client.connect();
    connected = client.isReady;
    return connected ? client : null;
  } catch (error) {
    connected = false;
    return null;
  }
}

async function get(key) {
  try {
    const redis = await getClient();
    if (!redis) return null;
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function set(key, value, ttlSeconds = config.cacheTtlSeconds) {
  try {
    const redis = await getClient();
    if (redis) await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    // Cache failures must not make durable database operations fail.
  }
}

async function del(key) {
  try {
    const redis = await getClient();
    if (redis) await redis.del(key);
  } catch {
    // Best-effort invalidation; TTL limits stale cache duration.
  }
}

async function close() {
  if (client?.isOpen) await client.quit();
  connected = false;
}

module.exports = { get, set, del, close };
