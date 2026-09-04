const cacheName = "__swcrypts_v1";

async function getCache() {
  return await caches.open(cacheName);
}

function getPasswordRequest(basePath: string) {
  return new Request(`__swcrypts/passwords${basePath}`);
}

export async function savePasswordInCache(
  basePath: string,
  hashedPassword: string,
) {
  const cache = await getCache();
  const passwordRequest = getPasswordRequest(basePath);
  await cache.put(passwordRequest, new Response(hashedPassword));
}

export async function getPasswordFromCache(basePath: string) {
  const cache = await getCache();
  const passwordRequest = getPasswordRequest(basePath);
  const response = await cache.match(passwordRequest);

  if (!response || !response.ok) return null;
  return await response.text();
}

export async function removeCache() {
  return await caches.delete(cacheName);
}
