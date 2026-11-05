/** Small DOM helpers shared by the shell and the apps. */

const template = document.createElement('template');

/** Build an element from trusted markup. Never pass user content in here. */
export function fromHTML(markup) {
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
  return element;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function debounce(fn, wait = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const longDateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatTime(value) {
  return timeFormat.format(new Date(value));
}

export function formatShortDate(value) {
  return shortDateFormat.format(new Date(value));
}

export function formatLongDate(value) {
  return longDateFormat.format(new Date(value));
}

export function formatRelative(value) {
  const date = new Date(value);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return 'just now';
  if (abs < 3600) return relativeFormat.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 604_800) return relativeFormat.format(Math.round(diffSeconds / 86_400), 'day');
  return formatShortDate(date);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/** True when a key event belongs to a text field. */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function focusFirst(container) {
  const target = container.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  target?.focus();
}

/** Keep Tab inside a modal container. */
export function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);

  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Simple sound effects generated with WebAudio — no asset files. */
let audioContext = null;

export function playTone(kind, enabled) {
  if (!enabled) return;
  try {
    audioContext ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();

    const notes = {
      open: [660, 880],
      close: [520, 380],
      notify: [880, 1040],
      save: [740, 980],
      error: [300, 240],
      tap: [520],
    }[kind] ?? [520];

    let when = audioContext.currentTime;
    for (const frequency of notes) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.05, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(when);
      oscillator.stop(when + 0.14);
      when += 0.07;
    }
  } catch {
    /* audio is a nicety; never let it break the desktop */
  }
}
