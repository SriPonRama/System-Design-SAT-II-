require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  cacheTtlSeconds: Math.max(1, Number(process.env.CACHE_TTL_SECONDS || 300))
};
