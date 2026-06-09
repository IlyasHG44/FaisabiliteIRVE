// Fetch avec timeout : évite qu'une API lente/indisponible ne fige l'outil.
const DEFAULT_TIMEOUT_MS = 10000;

export async function timedFetch(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
