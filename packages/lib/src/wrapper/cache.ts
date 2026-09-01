const cacheName = "__swcrypts_v1";

async function getCache() {
  return await caches.open(cacheName);
}

const passwordRequest = new Request("password");

export async function savePasswordInCache(hashedPassword: string) {
  const cache = await getCache();
  await cache.put(passwordRequest, new Response(hashedPassword));
}

export async function getPasswordFromCache() {
  const cache = await getCache();
  const response = await cache.match(passwordRequest);

  if (!response) return null;
  return await response.text();
}

export async function removeCache() {
  return await caches.delete(cacheName);
}
