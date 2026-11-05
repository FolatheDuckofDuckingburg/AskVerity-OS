import { uiIcon } from './icons.js';
import { clear } from './ui.js';

const MAX_TOASTS = 4;
const DEFAULT_DURATION = 4600;

/**
 * Small, dismissible toasts. Nothing interrupts typing and each one leaves on
 * its own; hovering or focusing pauses the timer.
 */
export function createNotifications({ container, isSoundOn, playSound }) {
  const active = new Set();

  function dismiss(toast) {
    if (!active.has(toast)) return;
    active.delete(toast);
    toast.classList.add('is-leaving');
    const remove = () => toast.remove();
    toast.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400);
  }

  function notify({ title, body = '', tone = 'info', duration = DEFAULT_DURATION }) {
    if (!container) return;

    while (active.size >= MAX_TOASTS) {
      dismiss(active.values().next().value);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

    const iconName = { info: 'info', success: 'check', error: 'alert', tip: 'sparkle' }[tone] ?? 'info';

    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${uiIcon(iconName)}</span>
      <div class="toast__content">
        <p class="toast__title"></p>
        <p class="toast__body" hidden></p>
      </div>
      <button class="toast__close" type="button" aria-label="Dismiss notification">
        <span aria-hidden="true">✕</span>
      </button>`;

    toast.querySelector('.toast__title').textContent = String(title ?? '');
    const bodyEl = toast.querySelector('.toast__body');
    if (body) {
      bodyEl.textContent = String(body);
      bodyEl.hidden = false;
    }

    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.setAttribute('aria-label', `Dismiss notification: ${title ?? ''}`);
    closeBtn.addEventListener('click', () => dismiss(toast));

    container.appendChild(toast);
    active.add(toast);
    playSound?.('notify', isSoundOn?.() ?? false);

    let timer = null;
    let remaining = duration;
    let startedAt = Date.now();

    const start = () => {
      startedAt = Date.now();
      timer = setTimeout(() => dismiss(toast), remaining);
    };

    const pause = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      remaining = Math.max(600, remaining - (Date.now() - startedAt));
    };

    const resume = () => {
      if (timer !== null) return;
      start();
    };

    if (duration > 0) {
      start();
      toast.addEventListener('mouseenter', pause);
      toast.addEventListener('mouseleave', resume);
      toast.addEventListener('focusin', pause);
      toast.addEventListener('focusout', resume);
    }

    toast.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss(toast);
      }
    });

    return { dismiss: () => dismiss(toast) };
  }

  function clearAll() {
    for (const toast of [...active]) dismiss(toast);
  }

  /** Remove every toast immediately (used when the desktop resets). */
  function reset() {
    clear(container);
    active.clear();
  }

  return { notify, clearAll, reset };
}
