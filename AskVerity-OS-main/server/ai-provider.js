import { streamMockReply } from './mock-provider.js';

/**
 * The assistant service. The desktop UI only ever sees a stream of events
 * (`meta`, `delta`, `done`, `error`); where those words come from is this
 * module's problem. Adding a new provider means adding one method here.
 */

const DEFAULT_SYSTEM_PROMPT = `You are Verity, the resident assistant of AskVerity OS: a small, friendly desktop environment that runs in a web browser.

Who you are:
- A cheerful yellow smiley-faced character. Not a robot, not an orb, not a bee.
- You have no fixed gender. Refer to yourself as Verity, or use "they/them" if a pronoun is needed. Never describe yourself as male or female.
- Warm, curious and patient. A little playful, never childish or condescending.
- Concise by default: a couple of short paragraphs, unless detail is genuinely needed.

How you behave:
- Be honest about uncertainty. Never invent facts, sources, or capabilities.
- You cannot browse the web on your own, read real files on the user's computer, or see their screen. If asked, say so plainly. In the Browser app the person may share the text of the page they are reading; only use that text when it is given to you.
- You live inside this desktop. The apps you can direct people to are: Ask Verity, Browser, Files, Notes, Calculator, Settings, About Verity, and Trash.
- Notes, Files and settings belong to the user's browser storage. The Files drive is simulated.
- Never claim an action was taken. You can explain how to do something, but the person performs it.
- Plain text only: no markdown tables, no HTML, no emoji spam. Short lists are fine.

If a request is impossible or unsafe, say so kindly and offer the nearest thing you can actually do.`;

const PERSONALITIES = {
  warm: 'Warmth: generous. Lead with encouragement, use gentle language, and add a little colour to your replies while staying useful.',
  balanced: 'Warmth: balanced. Friendly and human, but get to the point quickly.',
  focused: 'Warmth: reserved. Be direct, compact and practical. Skip pleasantries unless the person seems to need them.',
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

const PROBE_TTL_MS = 10_000;

/** AbortSignal.any() is not available on every supported Node version. */
function combineSignals(signals) {
  const controller = new AbortController();
  const abort = () => controller.abort(signals.find((s) => s?.reason)?.reason);
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}
const MODEL_MISSING_HINT = (model) =>
  `Ollama is running, but the model "${model}" is not installed. Run: ollama pull ${model}`;

function clampMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, 6000),
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-24);
}

export function normalizeMessages(messages) {
  const cleaned = clampMessages(messages);
  if (!cleaned.length) return [];
  // Providers expect a user turn last; drop trailing assistant turns.
  while (cleaned.length && cleaned[cleaned.length - 1].role !== 'user') cleaned.pop();
  return cleaned;
}

function withSystemPrompt(messages, personality, page) {
  const flavour = PERSONALITIES[personality] ?? PERSONALITIES.balanced;
  const pageBlock =
    page && page.text
      ? `\n\nThe person is reading a page in the AskVerity Browser. Use it when they ask about it, and say when the page does not contain an answer.\nTitle: ${page.title || '(no title)'}\nAddress: ${page.url || '(unknown)'}\nPage text:\n${page.text.slice(0, 6000)}`
      : '';

  return [
    { role: 'system', content: `${DEFAULT_SYSTEM_PROMPT}\n\n${flavour}${pageBlock}` },
    ...messages,
  ];
}

function friendlyNetworkError(error) {
  const message = String(error?.message ?? '');
  if (/abort/i.test(message)) return 'Generation stopped.';
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(message)) {
    return 'I could not reach the local AI service. Is Ollama running?';
  }
  if (/timeout|timed out/i.test(message)) {
    return 'The local model took too long to answer. It may still be loading.';
  }
  return `The local AI service returned an error: ${message || 'unknown error'}`;
}

export function createAssistant(env) {
  const providerId = String(env.AI_PROVIDER ?? 'ollama').trim().toLowerCase() === 'mock'
    ? 'mock'
    : 'ollama';
  const baseUrl = String(env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = String(env.OLLAMA_MODEL ?? 'llama3.2').trim() || 'llama3.2';
  const timeoutMs = Number.parseInt(env.OLLAMA_TIMEOUT_MS ?? '60000', 10) || 60_000;

  let probeCache = { at: 0, result: null };

  async function probe() {
    const now = Date.now();
    if (probeCache.result && now - probeCache.at < PROBE_TTL_MS) return probeCache.result;

    if (providerId === 'mock') {
      probeCache = {
        at: now,
        result: {
          available: false,
          reason: 'mock-configured',
          detail: 'Demo brain selected (AI_PROVIDER=mock).',
        },
      };
      return probeCache.result;
    }

    let result;
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const names = Array.isArray(payload?.models)
        ? payload.models.map((m) => String(m?.name ?? ''))
        : [];
      const installed = names.some(
        (name) => name === model || name.startsWith(`${model}:`) || name.startsWith(model),
      );

      result = installed
        ? { available: true, detail: `Connected to Ollama · ${model}` }
        : { available: false, reason: 'model-missing', detail: MODEL_MISSING_HINT(model) };
    } catch (error) {
      result = {
        available: false,
        reason: 'unreachable',
        detail: `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve", or keep using demo mode.`,
        error: friendlyNetworkError(error),
      };
    }

    probeCache = { at: now, result };
    return result;
  }

  async function status() {
    const probeResult = await probe();
    const reachable = probeResult.available;
    return {
      configuredProvider: providerId,
      mode: reachable ? 'local' : 'mock',
      available: reachable,
      providerLabel: reachable ? 'Local AI (Ollama)' : 'Demo brain',
      model: providerId === 'ollama' ? model : null,
      baseUrl: providerId === 'ollama' ? baseUrl : null,
      message: reachable
        ? `Connected to your local Ollama model "${model}". Nothing leaves this computer.`
        : probeResult.detail,
      hint: reachable
        ? 'Responses are generated by the model above, through the AskVerity OS server.'
        : 'No API key is needed. Copy .env.example to .env to change the model or provider.',
      personalities: PERSONALITY_IDS,
      checkedAt: new Date().toISOString(),
    };
  }

  async function* streamOllama({ messages, personality, page, signal }) {
    const combined = combineSignals([signal, AbortSignal.timeout(timeoutMs)]);

    let response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        signal: combined,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: withSystemPrompt(messages, personality, page),
          stream: true,
          options: { temperature: 0.7 },
        }),
      });
    } catch (error) {
      yield { type: 'error', message: friendlyNetworkError(error) };
      return;
    }

    if (!response.ok || !response.body) {
      let detail = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (payload?.error) detail = String(payload.error);
      } catch {
        /* keep the status code */
      }
      yield {
        type: 'error',
        message: /not found/i.test(detail)
          ? MODEL_MISSING_HINT(model)
          : `Ollama rejected the request: ${detail}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
          if (!line) continue;

          let payload;
          try {
            payload = JSON.parse(line);
          } catch {
            continue;
          }

          if (payload?.error) throw new Error(String(payload.error));
          const chunk = payload?.message?.content;
          if (typeof chunk === 'string' && chunk) {
            yield { type: 'delta', text: chunk };
          }
        }
      }
    } catch (error) {
      if (/abort/i.test(String(error?.message))) return;
      yield { type: 'error', message: friendlyNetworkError(error) };
      return;
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
    }

    yield { type: 'done', finishReason: 'stop' };
  }

  /** @returns {AsyncGenerator<{type:string, [key:string]: unknown}>} */
  async function* chat({ messages, personality = 'balanced', page = null, signal }) {
    const safeMessages = normalizeMessages(messages);
    if (!safeMessages.length) {
      yield { type: 'error', message: 'There was no message to send.' };
      return;
    }

    if (providerId === 'mock') {
      yield {
        type: 'meta',
        mode: 'mock',
        provider: 'demo',
        demo: true,
        notice: 'Verity is running on the built-in demo brain.',
      };
      let expression = 'happy';
      try {
        expression = (yield* streamMockReply(safeMessages.at(-1).content, {
          personality,
          page,
          signal,
        })) ?? 'happy';
      } catch {
        if (!signal?.aborted) {
          yield { type: 'error', message: 'Something interrupted that reply. Try again?' };
        }
        return;
      }
      yield { type: 'done', finishReason: 'stop', expression, demo: true };
      return;
    }

    const probeResult = await probe();
    if (!probeResult.available) {
      yield {
        type: 'meta',
        mode: 'mock',
        provider: 'demo',
        demo: true,
        notice: probeResult.detail,
      };
      let expression = 'happy';
      try {
        expression = (yield* streamMockReply(safeMessages.at(-1).content, {
          personality,
          page,
          signal,
        })) ?? 'happy';
      } catch {
        return;
      }
      yield {
        type: 'done',
        finishReason: 'stop',
        expression,
        demo: true,
        providerNotice: probeResult.detail,
      };
      return;
    }

    yield {
      type: 'meta',
      mode: 'local',
      provider: 'ollama',
      model,
      demo: false,
    };

    yield* streamOllama({ messages: safeMessages, personality, page, signal });
  }

  function warmUp() {
    if (providerId === 'ollama') {
      probe().catch(() => {});
    }
  }

  return { status, chat, warmUp, providerId, model };
}
