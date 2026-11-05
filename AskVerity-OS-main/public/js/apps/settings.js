import { uiIcon } from '../icons.js';
import { bus } from '../bus.js';
import { fromHTML } from '../ui.js';
import {
  MOTION_OPTIONS,
  PERSONALITIES,
  PERSONALITY_LABELS,
  SETTINGS_DEFAULTS,
  THEMES,
  WALLPAPERS,
  storageAvailable,
} from '../store.js';
import { describeStatus, getAssistantStatus } from '../status.js';

const THEME_OPTIONS = [
  { value: 'daylight', label: 'Classic', hint: 'Grey chrome, navy bars.', swatch: 'swatch--daylight' },
  { value: 'dusk', label: 'Warm grey', hint: 'Brick title bars.', swatch: 'swatch--dusk' },
  { value: 'midnight', label: 'Midnight', hint: 'Dark grey chrome.', swatch: 'swatch--midnight' },
];

const WALLPAPER_OPTIONS = [
  { value: 'sky', label: 'Sky', hint: 'Clouds and hills', swatch: 'swatch--sky' },
  { value: 'lavender', label: 'Teal', hint: 'Classic flat teal', swatch: 'swatch--lavender' },
  { value: 'sunrise', label: 'Sand', hint: 'Warm beige', swatch: 'swatch--sunrise' },
  { value: 'pixel', label: 'Blueprint', hint: 'Navy grid', swatch: 'swatch--pixel' },
  { value: 'midnight', label: 'Night', hint: 'Stars on navy', swatch: 'swatch--midnightwall' },
];

const MOTION_COPY = {
  auto: { label: 'Follow system', hint: 'Respect the OS motion setting.' },
  full: { label: 'Full motion', hint: 'Animations and blinks on.' },
  reduced: { label: 'Reduced motion', hint: 'No animation, calm UI.' },
};

const MOTION_VALUES = MOTION_OPTIONS;
const THEME_VALUES = THEMES;
const WALLPAPER_VALUES = WALLPAPERS;

function radioOption({ name, value, label, hint, swatch, checked }) {
  return `
    <label class="option">
      <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} />
      ${swatch ? `<span class="swatch ${swatch}" aria-hidden="true"></span>` : ''}
      <span class="option__label">${label}</span>
      ${hint ? `<span class="option__hint">${hint}</span>` : ''}
    </label>`;
}

export default {
  id: 'settings',
  title: 'Settings',
  size: { w: 760, h: 640 },

  mount(body, ctx) {
    let settings = { ...ctx.getSettings() };
    let status = null;
    let notifyTimer = null;

    const root = fromHTML(`
      <div class="settings">
        <section class="settings__card">
          <h2 class="settings__heading">${uiIcon('palette')}<span>Appearance</span></h2>
          <div class="option-grid" data-themes></div>
          <div class="option-grid" data-wallpapers></div>
        </section>

        <section class="settings__card">
          <h2 class="settings__heading">${uiIcon('volume')}<span>Sound &amp; motion</span></h2>
          <div class="setting-row">
            <div class="setting-row__text">
              <p class="setting-row__title">Sound effects</p>
              <p class="setting-row__hint">Short generated tones for windows and notifications.</p>
            </div>
            <button class="switch" type="button" role="switch" data-sound aria-label="Sound effects" aria-checked="true"></button>
          </div>
          <div>
            <p class="setting-row__title">Motion</p>
            <p class="setting-row__hint" style="margin-bottom:6px">Overrides your system preference for this desktop.</p>
            <div class="option-grid" data-motion></div>
          </div>
        </section>

        <section class="settings__card">
          <h2 class="settings__heading">${uiIcon('sparkle')}<span>Verity</span></h2>
          <div>
            <p class="setting-row__title">Personality</p>
            <p class="setting-row__hint" style="margin-bottom:6px">Changes how Verity writes, not what Verity can do.</p>
            <div class="option-grid" data-personality></div>
          </div>
          <div class="provider-card" data-provider>
            <span class="provider-card__row"><span class="dot" aria-hidden="true"></span><span>Checking the assistant…</span></span>
          </div>
          <div class="settings__actions">
            <button class="btn btn--small" type="button" data-check>${uiIcon('refresh')}<span>Check again</span></button>
            <button class="btn btn--small btn--primary" type="button" data-open-assistant>${uiIcon('chat')}<span>Ask Verity</span></button>
          </div>
          <p class="settings__note">
            The assistant runs on the AskVerity OS server. To use a local model, copy
            <code>.env.example</code> to <code>.env</code>, set <code>OLLAMA_MODEL</code>, and restart with
            <code>npm start</code>. No API key is needed, and none is ever sent to the browser.
          </p>
        </section>

        <section class="settings__card">
          <h2 class="settings__heading">${uiIcon('shield')}<span>Data &amp; privacy</span></h2>
          <div class="setting-row">
            <div class="setting-row__text">
              <p class="setting-row__title">Local storage</p>
              <p class="setting-row__hint" data-storage>Checking browser storage…</p>
            </div>
            <span class="chip" data-storage-chip>—</span>
          </div>
          <div class="settings__actions">
            <button class="btn btn--small" type="button" data-welcome>${uiIcon('info')}<span>Show welcome tour again</span></button>
            <button class="btn btn--small" type="button" data-reset>${uiIcon('restore')}<span>Reset preferences</span></button>
          </div>
          <p class="settings__note">
            Notes, chats, bookmarks, simulated files and preferences stay in this browser.
            There is no account, no analytics and no tracking. The desktop never reads real
            files from your computer.
          </p>
        </section>
      </div>`);

    body.appendChild(root);

    const themesEl = root.querySelector('[data-themes]');
    const wallpapersEl = root.querySelector('[data-wallpapers]');
    const motionEl = root.querySelector('[data-motion]');
    const personalityEl = root.querySelector('[data-personality]');
    const soundButton = root.querySelector('[data-sound]');
    const providerEl = root.querySelector('[data-provider]');
    const storageEl = root.querySelector('[data-storage]');
    const storageChip = root.querySelector('[data-storage-chip]');

    function renderOptions() {
      themesEl.innerHTML = THEME_OPTIONS.map((option) =>
        radioOption({
          name: 'theme',
          value: option.value,
          label: option.label,
          hint: option.hint,
          swatch: option.swatch,
          checked: settings.theme === option.value,
        }),
      ).join('');

      wallpapersEl.innerHTML = WALLPAPER_OPTIONS.map((option) =>
        radioOption({
          name: 'wallpaper',
          value: option.value,
          label: option.label,
          hint: option.hint,
          swatch: option.swatch,
          checked: settings.wallpaper === option.value,
        }),
      ).join('');

      motionEl.innerHTML = MOTION_VALUES.map((value) =>
        radioOption({
          name: 'motion',
          value,
          label: MOTION_COPY[value].label,
          hint: MOTION_COPY[value].hint,
          checked: settings.motion === value,
        }),
      ).join('');

      personalityEl.innerHTML = PERSONALITIES.map((value) =>
        radioOption({
          name: 'personality',
          value,
          label: PERSONALITY_LABELS[value].name,
          hint: PERSONALITY_LABELS[value].hint,
          checked: settings.personality === value,
        }),
      ).join('');

      soundButton.setAttribute('aria-checked', String(settings.sound));
    }

    function announceSetting(label) {
      clearTimeout(notifyTimer);
      notifyTimer = setTimeout(() => {
        ctx.notify({ title: 'Settings updated', body: label, tone: 'success', duration: 2400 });
      }, 120);
    }

    function apply(patch, label) {
      settings = { ...settings, ...patch };
      bus.emit('settings:changed', settings);
      announceSetting(label);
    }

    root.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
      const { name, value } = input;

      if (name === 'theme' && THEME_VALUES.includes(value)) apply({ theme: value }, `Theme: ${value}`);
      if (name === 'wallpaper' && WALLPAPER_VALUES.includes(value)) {
        apply({ wallpaper: value }, `Wallpaper: ${value}`);
      }
      if (name === 'motion' && MOTION_VALUES.includes(value)) apply({ motion: value }, `Motion: ${value}`);
      if (name === 'personality' && PERSONALITIES.includes(value)) {
        apply({ personality: value }, `Personality: ${PERSONALITY_LABELS[value].name}`);
      }
    });

    soundButton.addEventListener('click', () => {
      settings = { ...settings, sound: !settings.sound };
      soundButton.setAttribute('aria-checked', String(settings.sound));
      bus.emit('settings:changed', settings);
      announceSetting(`Sound ${settings.sound ? 'on' : 'off'}`);
    });

    function providerStateMarkup(info) {
      const description = describeStatus(info);
      providerEl.innerHTML = `
        <span class="provider-card__row">
          <span class="dot" data-state="${description.state}" aria-hidden="true"></span>
          <span data-provider-label></span>
        </span>
        <p data-provider-message></p>
        <p data-provider-detail></p>`;

      providerEl.querySelector('[data-provider-label]').textContent =
        info.offline ? 'Assistant service offline' : info.providerLabel ?? 'Assistant';
      providerEl.querySelector('[data-provider-message]').textContent = info.message ?? '';
      providerEl.querySelector('[data-provider-detail]').textContent = info.model
        ? `Model: ${info.model}${info.baseUrl ? ` · endpoint ${info.baseUrl}` : ''}`
        : info.hint ?? '';
    }

    async function refreshProvider(force = false) {
      providerEl.innerHTML = `<span class="provider-card__row"><span class="dot" aria-hidden="true"></span><span>Checking the assistant…</span></span>`;
      status = await getAssistantStatus({ force });
      providerStateMarkup(status);
    }

    root.querySelector('[data-check]').addEventListener('click', async () => {
      await refreshProvider(true);
      ctx.notify({
        title: status?.mode === 'local' ? 'Local AI connected' : 'Demo mode active',
        body: status?.mode === 'local' ? `Using ${status.model}.` : 'No local model answered. Verity stays in demo mode.',
        tone: status?.mode === 'local' ? 'success' : 'info',
        duration: 4200,
      });
    });

    root.querySelector('[data-open-assistant]').addEventListener('click', () => ctx.openApp('assistant'));

    root.querySelector('[data-welcome]').addEventListener('click', () => {
      apply({ welcomeSeen: false }, 'Welcome tour will appear the next time AskVerity OS starts.');
    });

    root.querySelector('[data-reset]').addEventListener('click', () => {
      const confirmed = window.confirm(
        'Reset every preference to its default? Notes, chats and files are not affected.',
      );
      if (!confirmed) return;
      settings = { ...SETTINGS_DEFAULTS, welcomeSeen: settings.welcomeSeen };
      bus.emit('settings:changed', settings);
      renderOptions();
      ctx.notify({ title: 'Preferences reset', body: 'Theme, wallpaper, motion and personality are back to defaults.', tone: 'success', duration: 3600 });
    });

    const available = storageAvailable();
    storageEl.textContent = available
      ? 'Notes, chats, files and settings are saved in this browser.'
      : 'This browser is blocking local storage. Notes and settings will reset on reload.';
    storageChip.textContent = available ? 'Saving locally' : 'Blocked';
    storageChip.className = available ? 'chip chip--local' : 'chip chip--demo';

    renderOptions();
    refreshProvider();

    ctx.onCleanup(() => {
      clearTimeout(notifyTimer);
    });
  },
};
