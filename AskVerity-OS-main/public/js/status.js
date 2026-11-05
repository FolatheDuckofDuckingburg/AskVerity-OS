/** Shared assistant/provider status with a tiny cache. */

const TTL_MS = 6000;

let cached = null;
let cachedAt = 0;
let inflight = null;

export async function getAssistantStatus({ force = false } = {}) {
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(`/api/status${force ? '?refresh=1' : ''}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      cached = data;
      cachedAt = Date.now();
      return data;
    } catch {
      cached = {
        available: false,
        mode: 'mock',
        offline: true,
        providerLabel: 'Assistant service offline',
        model: null,
        message:
          'The AskVerity OS server is not answering, so Verity cannot reply right now. The desktop itself keeps working.',
        hint: 'Start the server with "npm start", then reload this page.',
      };
      cachedAt = Date.now();
      return cached;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function assistantStatusSync() {
  return cached;
}

export function describeStatus(status) {
  if (!status) return { text: 'Checking assistant…', state: 'unknown', title: 'Checking the assistant service.' };

  if (status.offline) {
    return {
      text: 'Server offline',
      state: 'error',
      title: status.message,
    };
  }

  if (status.mode === 'local') {
    return {
      text: `Local AI · ${status.model ?? 'model'}`,
      state: 'local',
      title: status.message,
    };
  }

  return {
    text: 'Demo brain',
    state: 'mock',
    title: status.message ?? 'Verity is running on the built-in demo brain.',
  };
}
