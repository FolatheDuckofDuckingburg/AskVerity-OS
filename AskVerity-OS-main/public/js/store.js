/** Namespaced localStorage helpers and the persisted preference model. */

const PREFIX = 'askverity';

const hasStorage = (() => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
})();

const key = (name) => `${PREFIX}.${name}.v1`;

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function read(name, fallback) {
  if (!hasStorage) return clone(fallback);
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return clone(fallback);
    const parsed = JSON.parse(raw);
    return parsed ?? clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function write(name, value) {
  if (!hasStorage) return false;
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(name) {
  if (!hasStorage) return;
  try {
    localStorage.removeItem(key(name));
  } catch {
    /* storage can be full or blocked; nothing to recover here */
  }
}

export function storageAvailable() {
  return hasStorage;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SETTINGS_DEFAULTS = {
  theme: 'daylight',
  wallpaper: 'sky',
  sound: true,
  motion: 'auto',
  personality: 'balanced',
  welcomeSeen: false,
};

export const THEMES = ['daylight', 'dusk', 'midnight'];
export const WALLPAPERS = ['sky', 'lavender', 'sunrise', 'pixel', 'midnight'];
export const MOTION_OPTIONS = ['auto', 'full', 'reduced'];
export const PERSONALITIES = ['warm', 'balanced', 'focused'];

export const PERSONALITY_LABELS = {
  warm: {
    name: 'Warm',
    hint: 'Encouraging, gentle, a little chatty.',
  },
  balanced: {
    name: 'Balanced',
    hint: 'Friendly and efficient.',
  },
  focused: {
    name: 'Focused',
    hint: 'Direct, compact, all business.',
  },
};

export function loadSettings() {
  const stored = read('settings', {});
  const settings = { ...SETTINGS_DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };

  if (!THEMES.includes(settings.theme)) settings.theme = SETTINGS_DEFAULTS.theme;
  if (!WALLPAPERS.includes(settings.wallpaper)) settings.wallpaper = SETTINGS_DEFAULTS.wallpaper;
  if (!MOTION_OPTIONS.includes(settings.motion)) settings.motion = SETTINGS_DEFAULTS.motion;
  if (!PERSONALITIES.includes(settings.personality)) {
    settings.personality = SETTINGS_DEFAULTS.personality;
  }
  settings.sound = Boolean(settings.sound);
  settings.welcomeSeen = Boolean(settings.welcomeSeen);

  return settings;
}

export function saveSettings(settings) {
  return write('settings', settings);
}

/** Push settings into the document so CSS can react. */
export function applySettings(settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.wallpaper = settings.wallpaper;
  root.dataset.motion = settings.motion;

  const desktop = document.getElementById('desktop-surface');
  if (desktop) desktop.dataset.wallpaper = settings.wallpaper;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = settings.theme === 'midnight' ? 'dark' : 'light';
}
