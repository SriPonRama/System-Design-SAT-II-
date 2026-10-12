const test = require('node:test');
const assert = require('node:assert/strict');

function createCacheAside({ cache, database }) {
  return async function getExam(id) {
    const key = `exam:${id}`;
    const hit = await cache.get(key);
    if (hit) return { value: hit, source: 'cache' };
    const value = await database.getExam(id);
    if (value) await cache.set(key, value, 30);
    return value ? { value, source: 'database' } : null;
  };
}

test('cache hit avoids database lookup', async () => {
  let dbCalls = 0;
  const cache = { get: async () => ({ id: 'e1' }), set: async () => {} };
  const database = { getExam: async () => { dbCalls++; return { id: 'e1' }; } };
  const result = await createCacheAside({ cache, database })('e1');
  assert.equal(result.source, 'cache');
  assert.equal(dbCalls, 0);
});

test('cache miss loads database and populates cache with TTL', async () => {
  let stored;
  const cache = { get: async () => null, set: async (key, value, ttl) => { stored = { key, value, ttl }; } };
  const database = { getExam: async () => ({ id: 'e2' }) };
  const result = await createCacheAside({ cache, database })('e2');
  assert.equal(result.source, 'database');
  assert.equal(stored.key, 'exam:e2');
  assert.equal(stored.ttl, 30);
});

test('missing database record is not cached', async () => {
  let writes = 0;
  const cache = { get: async () => null, set: async () => { writes++; } };
  const database = { getExam: async () => null };
  const result = await createCacheAside({ cache, database })('missing');
  assert.equal(result, null);
  assert.equal(writes, 0);
});
