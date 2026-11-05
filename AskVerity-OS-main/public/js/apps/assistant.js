import { createVerity, veritySVG } from '../verity.js';
import { uiIcon } from '../icons.js';
import { formatTime, formatRelative, fromHTML } from '../ui.js';
import { read, uid, write } from '../store.js';
import { getAssistantStatus, describeStatus } from '../status.js';

const MAX_CHATS = 24;
const MAX_MESSAGES = 160;
const MAX_INPUT = 4000;
const IDLE_SLEEP_MS = 80_000;
const SUGGESTIONS = ['What can you do?', 'What is on this desktop?', 'What is 128 * 4.5?', 'Tell me a joke'];

let inputSeq = 0;

function newChat() {
  return {
    id: uid('chat'),
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

function normalizeChat(raw) {
  return {
    id: String(raw.id),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'New chat',
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
    messages: Array.isArray(raw.messages)
      ? raw.messages
          .filter(
            (message) =>
              message &&
              typeof message.content === 'string' &&
              (message.role === 'user' || message.role === 'assistant'),
          )
          .slice(-MAX_MESSAGES)
          .map((message) => ({
            id: String(message.id ?? uid('m')),
            role: message.role,
            content: message.content,
            ts: Number(message.ts) || Date.now(),
            mode: message.mode === 'demo' || message.mode === 'local' ? message.mode : null,
            error: typeof message.error === 'string' ? message.error : null,
            stopped: Boolean(message.stopped),
          }))
      : [],
  };
}

function loadChats() {
  const stored = read('chats', { activeId: null, items: [] });
  const items = Array.isArray(stored.items)
    ? stored.items.filter((chat) => chat && typeof chat.id === 'string').map(normalizeChat)
    : [];
  return { activeId: stored.activeId ?? null, items };
}

function friendlyFetchError(error) {
  if (error?.name === 'AbortError') return null;
  const message = String(error?.message ?? error);
  if (/fetch|network|load failed/i.test(message)) {
    return 'I could not reach the assistant service. The local AskVerity OS server may not be running. Start it with "npm start" and try again.';
  }
  return message || 'Something went wrong while answering that.';
}

/** Parse a text/event-stream body into (event, payload) callbacks. */
export async function readEventStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        /* ignore malformed event */
      }
    }
  }
}

export default {
  id: 'assistant',
  title: 'Ask Verity',
  size: { w: 820, h: 640 },

  mount(body, ctx) {
    const state = {
      chats: loadChats(),
      activeId: null,
      streaming: null,
      status: null,
      sleepTimer: null,
    };

    const inputId = `verity-input-${++inputSeq}`;

    const root = fromHTML(`
      <div class="assistant">
        <header class="assistant__head">
          <span class="assistant__avatar" data-avatar aria-hidden="true"></span>
          <div class="assistant__identity">
            <p class="assistant__name">
              Verity
              <span class="chip chip--demo" data-mode-chip hidden>Demo mode</span>
            </p>
            <p class="assistant__sub"><span data-status>Checking the assistant…</span></p>
          </div>
          <div class="assistant__tools">
            <button class="icon-button" type="button" data-chats-toggle aria-expanded="false" aria-haspopup="true" aria-label="Conversation history" title="Conversation history">${uiIcon('chat')}</button>
            <button class="icon-button" type="button" data-new aria-label="New chat" title="New chat">${uiIcon('plus')}</button>
            <button class="icon-button" type="button" data-clear aria-label="Clear this conversation" title="Clear this conversation">${uiIcon('trash')}</button>
          </div>
        </header>
        <p class="assistant__notice" data-notice hidden></p>
        <p class="sr-only" data-announcer role="status" aria-live="polite"></p>
        <div class="assistant__log" data-log></div>
        <div class="composer">
          <label class="sr-only" for="${inputId}">Message Verity</label>
          <textarea class="composer__field" id="${inputId}" data-input rows="1" maxlength="${MAX_INPUT}" placeholder="Ask Verity anything…" spellcheck="true"></textarea>
          <button class="composer__send" type="button" data-send aria-label="Send message" title="Send">${uiIcon('send')}</button>
        </div>
        <div class="composer__foot">
          <span>Enter sends · Shift+Enter adds a line</span>
          <span data-count>0 / ${MAX_INPUT}</span>
        </div>
        <div class="assistant__chats" data-chats hidden>
          <div class="assistant__chats-head">
            <span>Conversations</span>
            <button class="icon-button" type="button" data-new-chat aria-label="Start a new chat" title="New chat">${uiIcon('plus')}</button>
          </div>
          <div data-chat-list></div>
        </div>
      </div>`);

    body.appendChild(root);

    const el = {
      avatar: root.querySelector('[data-avatar]'),
      status: root.querySelector('[data-status]'),
      modeChip: root.querySelector('[data-mode-chip]'),
      notice: root.querySelector('[data-notice]'),
      announcer: root.querySelector('[data-announcer]'),
      log: root.querySelector('[data-log]'),
      input: root.querySelector('[data-input]'),
      send: root.querySelector('[data-send]'),
      count: root.querySelector('[data-count]'),
      chatsPanel: root.querySelector('[data-chats]'),
      chatList: root.querySelector('[data-chat-list]'),
      chatsToggle: root.querySelector('[data-chats-toggle]'),
      newChat: root.querySelector('[data-new-chat]'),
    };

    const avatar = createVerity(el.avatar, { expression: 'happy' });

    function persist() {
      const items = [...state.chats.items]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CHATS);
      write('chats', { activeId: state.chats.activeId, items });
    }

    function activeChat() {
      let chat = state.chats.items.find((item) => item.id === state.chats.activeId);
      if (!chat) {
        chat = state.chats.items[0];
        if (!chat) {
          chat = newChat();
          state.chats.items.unshift(chat);
        }
        state.chats.activeId = chat.id;
      }
      return chat;
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                          */
    /* ------------------------------------------------------------------ */

    function renderIntro(log) {
      const intro = document.createElement('div');
      intro.className = 'assistant__intro';
      intro.innerHTML = `
        <div class="assistant__intro-face" aria-hidden="true">${veritySVG('curious')}</div>
        <h3>Hello, I'm Verity.</h3>
        <p data-intro-copy></p>
        <div class="suggestions" data-suggestions></div>`;

      const copy = intro.querySelector('[data-intro-copy]');
      copy.textContent =
        state.status?.mode === 'local'
          ? 'I am connected to your local model, so we can talk properly. Nothing leaves this computer.'
          : 'I am on my demo brain right now: greetings, simple maths, the time, jokes and help with this desktop. For open-ended conversation, connect a local model in Settings.';

      const suggestions = intro.querySelector('[data-suggestions]');
      for (const suggestion of SUGGESTIONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'suggestion';
        button.textContent = suggestion;
        button.addEventListener('click', () => sendMessage(suggestion));
        suggestions.appendChild(button);
      }

      log.appendChild(intro);
    }

    function metaNode(message) {
      const meta = document.createElement('div');
      meta.className = 'msg__meta';

      const time = document.createElement('time');
      time.dateTime = new Date(message.ts).toISOString();
      time.textContent = formatTime(message.ts);
      meta.appendChild(time);

      if (message.mode === 'demo') {
        const chip = document.createElement('span');
        chip.className = 'chip chip--demo';
        chip.textContent = 'Demo reply';
        meta.appendChild(chip);
      } else if (message.mode === 'local') {
        const chip = document.createElement('span');
        chip.className = 'chip chip--local';
        chip.textContent = 'Local AI';
        meta.appendChild(chip);
      }

      if (message.stopped) {
        const stopped = document.createElement('span');
        stopped.textContent = 'stopped';
        meta.appendChild(stopped);
      }

      if (message.error) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Try again';
        retry.setAttribute('aria-label', 'Try that question again');
        retry.addEventListener('click', () => retryMessage(message, meta.closest('.msg')));
        meta.appendChild(retry);
      }

      return meta;
    }

    function messageNode(message, { typing = false } = {}) {
      const node = document.createElement('article');
      node.className = `msg ${message.role === 'user' ? 'msg--user' : 'msg--assistant'}`;
      node.dataset.messageId = message.id;

      const avatarWrap = document.createElement('span');
      avatarWrap.setAttribute('aria-hidden', 'true');
      if (message.role === 'user') {
        avatarWrap.className = 'msg__avatar msg__avatar--user';
        avatarWrap.textContent = 'You';
      } else {
        avatarWrap.className = 'msg__avatar';
        avatarWrap.innerHTML = veritySVG('happy', { decorative: true });
      }

      const stack = document.createElement('div');
      stack.className = 'msg__stack';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      const textEl = document.createElement('span');
      textEl.className = 'bubble__text';

      let typingEl = null;
      if (typing) {
        typingEl = document.createElement('span');
        typingEl.className = 'typing';
        typingEl.innerHTML = '<i></i><i></i><i></i><span class="sr-only">Verity is typing</span>';
        bubble.appendChild(typingEl);
      } else {
        textEl.textContent = message.content;
        bubble.appendChild(textEl);
      }

      const meta = metaNode(message);
      stack.append(bubble, meta);
      node.append(avatarWrap, stack);

      return { node, bubble, textEl, meta, typingEl };
    }

    function paintMessage(view, message) {
      view.bubble.classList.toggle('bubble--error', Boolean(message.error));

      if (view.typingEl) {
        view.typingEl.remove();
        view.typingEl = null;
        if (!view.bubble.contains(view.textEl)) view.bubble.appendChild(view.textEl);
      }

      view.textEl.textContent = message.error
        ? `Something went wrong. ${message.error}`
        : message.content;

      const freshMeta = metaNode(message);
      view.meta.replaceWith(freshMeta);
      view.meta = freshMeta;
    }

    function renderLog() {
      el.log.innerHTML = '';
      const chat = activeChat();

      if (!chat.messages.length) {
        renderIntro(el.log);
      } else {
        for (const message of chat.messages) {
          el.log.appendChild(messageNode(message).node);
        }
      }

      requestAnimationFrame(() => {
        el.log.scrollTop = el.log.scrollHeight;
      });
    }

    function announce(text) {
      el.announcer.textContent = '';
      requestAnimationFrame(() => {
        el.announcer.textContent = text;
      });
    }

    function nearBottom() {
      return el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 120;
    }

    function scrollIfNeeded(shouldScroll) {
      if (!shouldScroll) return;
      el.log.scrollTop = el.log.scrollHeight;
    }

    function updateCount() {
      el.count.textContent = `${el.input.value.length} / ${MAX_INPUT}`;
    }

    function autoSize() {
      el.input.style.height = 'auto';
      el.input.style.height = `${Math.min(el.input.scrollHeight, 132)}px`;
    }

    function setSendMode(mode) {
      if (mode === 'stop') {
        el.send.dataset.mode = 'stop';
        el.send.setAttribute('aria-label', 'Stop generating');
        el.send.title = 'Stop generating';
        el.send.innerHTML = uiIcon('stop');
      } else {
        el.send.dataset.mode = 'send';
        el.send.setAttribute('aria-label', 'Send message');
        el.send.title = 'Send';
        el.send.innerHTML = uiIcon('send');
      }
    }

    /* ------------------------------------------------------------------ */
    /* Conversations                                                      */
    /* ------------------------------------------------------------------ */

    function renderChatList() {
      el.chatList.innerHTML = '';
      const chats = [...state.chats.items].sort((a, b) => b.updatedAt - a.updatedAt);

      for (const chat of chats) {
        const row = document.createElement('div');
        row.className = `chat-row${chat.id === state.chats.activeId ? ' is-active' : ''}`;

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'chat-row__main';
        const title = document.createElement('span');
        title.className = 'chat-row__title';
        title.textContent = chat.title;
        const meta = document.createElement('span');
        meta.className = 'chat-row__meta';
        meta.textContent = `${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'} · ${formatRelative(chat.updatedAt)}`;
        main.append(title, meta);
        main.addEventListener('click', () => {
          state.chats.activeId = chat.id;
          persist();
          closeChats();
          renderLog();
          updateStatusLine();
          el.input.focus();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chat-row__delete';
        remove.setAttribute('aria-label', `Delete conversation: ${chat.title}`);
        remove.title = 'Delete conversation';
        remove.innerHTML = uiIcon('close');
        remove.addEventListener('click', () => {
          state.chats.items = state.chats.items.filter((item) => item.id !== chat.id);
          if (state.chats.activeId === chat.id) {
            state.chats.activeId = state.chats.items[0]?.id ?? null;
          }
          persist();
          renderChatList();
          renderLog();
          ctx.notify({ title: 'Conversation deleted', body: chat.title, tone: 'info', duration: 3200 });
        });

        row.append(main, remove);
        el.chatList.appendChild(row);
      }
    }

    function openChats() {
      renderChatList();
      el.chatsPanel.hidden = false;
      el.chatsToggle.setAttribute('aria-expanded', 'true');
    }

    function closeChats() {
      el.chatsPanel.hidden = true;
      el.chatsToggle.setAttribute('aria-expanded', 'false');
    }

    function startNewChat() {
      stopStreaming();
      const chat = newChat();
      state.chats.items.unshift(chat);
      state.chats.activeId = chat.id;
      persist();
      renderLog();
      closeChats();
      el.input.focus();
      announce('New chat started.');
    }

    /* ------------------------------------------------------------------ */
    /* Streaming                                                          */
    /* ------------------------------------------------------------------ */

    function updateStatusLine() {
      if (!state.status) return;
      el.status.textContent = describeStatus(state.status).text;
      el.modeChip.hidden = state.status.mode === 'local';
      el.modeChip.textContent = state.status.offline ? 'Server offline' : 'Demo mode';

      if (state.status.mode === 'local') {
        el.notice.hidden = true;
      } else {
        el.notice.hidden = false;
        el.notice.innerHTML = `${uiIcon('info')}<span data-notice-text></span>`;
        el.notice.querySelector('[data-notice-text]').textContent =
          state.status.message ?? 'Verity is running on the built-in demo brain.';
      }
    }

    async function refreshStatus(force = false) {
      state.status = await getAssistantStatus({ force });
      updateStatusLine();
      if (!activeChat().messages.length) renderLog();
    }

    function stopStreaming() {
      state.streaming?.controller.abort();
    }

    function scheduleSleep() {
      clearTimeout(state.sleepTimer);
      state.sleepTimer = setTimeout(() => {
        if (!state.streaming) avatar.set('sleeping');
      }, IDLE_SLEEP_MS);
    }

    async function runStream(chat, reply, view) {
      const controller = new AbortController();
      state.streaming = { controller, chat, reply, view };
      reply.error = null;
      reply.stopped = false;
      reply.pending = true;
      reply.mode = null;

      const shouldScroll = nearBottom();
      setSendMode('stop');
      avatar.set('thinking');
      clearTimeout(state.sleepTimer);
      announce('Verity is answering.');

      let expression = 'happy';
      let finished = false;

      const finish = (kind) => {
        if (finished) return;
        finished = true;
        state.streaming = null;
        reply.pending = false;
        delete reply.pending;

        if (kind === 'stopped') {
          reply.stopped = true;
          if (!reply.content.trim()) reply.content = 'Generation stopped.';
        }

        chat.updatedAt = Date.now();
        persist();
        setSendMode('send');
        paintMessage(view, reply);
        avatar.set(kind === 'error' ? 'confused' : expression);
        announce(kind === 'error' ? 'Verity could not answer that.' : 'Verity replied.');
        scheduleSleep();
        scrollIfNeeded(nearBottom());
      };

      const payload = chat.messages
        .filter((message) => message.id !== reply.id && message.content.trim())
        .slice(-20)
        .map((message) => ({ role: message.role, content: message.content }));

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify({
            messages: payload,
            personality: ctx.getSettings().personality,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let message = `The assistant service answered with HTTP ${response.status}.`;
          try {
            const data = await response.json();
            if (data?.error) message = data.error;
          } catch {
            /* keep the status message */
          }
          throw new Error(message);
        }

        await readEventStream(response.body, (event, data) => {
          if (event === 'meta') {
            reply.mode = data.mode === 'local' ? 'local' : 'demo';
            if (data.notice) {
              state.status = {
                ...(state.status ?? {}),
                mode: 'mock',
                message: data.notice,
              };
              updateStatusLine();
            } else if (data.mode === 'local') {
              state.status = {
                ...(state.status ?? {}),
                mode: 'local',
                model: data.model,
                message: 'Connected to your local model.',
              };
              updateStatusLine();
            }
          } else if (event === 'delta') {
            reply.content += String(data.text ?? '');
            if (view.typingEl) {
              view.typingEl.remove();
              view.typingEl = null;
              view.bubble.appendChild(view.textEl);
            }
            view.textEl.textContent = reply.content;
            scrollIfNeeded(shouldScroll || nearBottom());
          } else if (event === 'done') {
            if (data.expression) expression = String(data.expression);
            if (data.demo && !reply.mode) reply.mode = 'demo';
            if (!reply.mode) reply.mode = 'local';
            finish('stop');
          } else if (event === 'error') {
            reply.error = String(data.message ?? 'The assistant could not finish that reply.');
            finish('error');
          }
        });

        if (!finished) finish('stop');
      } catch (error) {
        const friendly = friendlyFetchError(error);
        if (!friendly) {
          finish('stopped');
          return;
        }
        reply.error = friendly;
        finish('error');
      } finally {
        if (state.streaming?.controller === controller) state.streaming = null;
        if (!finished) finish('stop');
      }
    }

    function sendMessage(rawText) {
      const text = String(rawText ?? '').trim().slice(0, MAX_INPUT);
      if (!text || state.streaming) return;

      const chat = activeChat();
      const userMessage = {
        id: uid('m'),
        role: 'user',
        content: text,
        ts: Date.now(),
        mode: null,
      };
      chat.messages.push(userMessage);

      if (chat.title === 'New chat') {
        chat.title = text.replace(/\s+/g, ' ').slice(0, 48);
      }
      chat.updatedAt = Date.now();

      el.input.value = '';
      autoSize();
      updateCount();
      renderLog();
      persist();
      announce('Message sent.');

      const reply = {
        id: uid('m'),
        role: 'assistant',
        content: '',
        ts: Date.now(),
        mode: null,
      };
      chat.messages.push(reply);

      if (chat.messages.length > MAX_MESSAGES) {
        chat.messages = chat.messages.slice(-MAX_MESSAGES);
      }

      const view = messageNode(reply, { typing: true });
      el.log.appendChild(view.node);
      scrollIfNeeded(true);

      runStream(chat, reply, view);
    }

    function retryMessage(message, node) {
      if (state.streaming) return;
      const chat = activeChat();
      if (!chat.messages.includes(message)) return;

      message.error = null;
      message.content = '';
      message.stopped = false;
      message.ts = Date.now();

      let view = node ? { node } : null;
      if (view) {
        const bubble = view.node.querySelector('.bubble');
        const textEl = view.node.querySelector('.bubble__text');
        const meta = view.node.querySelector('.msg__meta');
        if (!bubble || !textEl || !meta) view = null;
        else view = { ...view, bubble, textEl, meta, typingEl: null };
      }

      if (!view) {
        view = messageNode(message);
        el.log.appendChild(view.node);
      } else {
        paintMessage(view, message);
      }

      runStream(chat, message, view);
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                             */
    /* ------------------------------------------------------------------ */

    el.send.addEventListener('click', () => {
      if (state.streaming) stopStreaming();
      else sendMessage(el.input.value);
    });

    el.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!state.streaming) sendMessage(el.input.value);
      }
      if (event.key === 'Escape' && state.streaming) {
        event.preventDefault();
        stopStreaming();
      }
    });

    el.input.addEventListener('input', () => {
      updateCount();
      autoSize();
      clearTimeout(state.sleepTimer);
      if (!state.streaming) {
        avatar.set(el.input.value.trim() ? 'curious' : 'happy');
      }
      scheduleSleep();
    });

    el.input.addEventListener('focus', () => {
      if (!state.streaming && avatar.expression === 'sleeping') avatar.set('happy');
    });

    root.querySelector('[data-chats-toggle]').addEventListener('click', () => {
      if (el.chatsPanel.hidden) openChats();
      else closeChats();
    });

    el.newChat.addEventListener('click', startNewChat);
    el.chatsToggle.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeChats();
    });

    root.querySelector('[data-new]').addEventListener('click', startNewChat);

    root.querySelector('[data-clear]').addEventListener('click', () => {
      const chat = activeChat();
      if (!chat.messages.length) {
        ctx.notify({ title: 'Nothing to clear', body: 'This conversation is already empty.', tone: 'info', duration: 2600 });
        return;
      }
      stopStreaming();
      chat.messages = [];
      chat.title = 'New chat';
      chat.updatedAt = Date.now();
      persist();
      renderLog();
      closeChats();
      announce('Conversation cleared.');
      ctx.notify({ title: 'Chat cleared', body: 'The conversation history in this chat was removed.', tone: 'success', duration: 3200 });
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.chatsPanel.hidden) {
        closeChats();
        el.chatsToggle.focus();
      }
    });

    const onOutsidePointer = (event) => {
      if (el.chatsPanel.hidden) return;
      if (el.chatsPanel.contains(event.target) || el.chatsToggle.contains(event.target)) return;
      closeChats();
    };
    document.addEventListener('pointerdown', onOutsidePointer, true);

    ctx.onCleanup(() => {
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      clearTimeout(state.sleepTimer);
      if (state.streaming) {
        state.streaming.controller.abort();
        persist();
      }
    });

    setSendMode('send');
    renderLog();
    updateCount();
    autoSize();
    scheduleSleep();
    refreshStatus();
  },
};
