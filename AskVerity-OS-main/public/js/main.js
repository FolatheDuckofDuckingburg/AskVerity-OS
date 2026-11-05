import { APPS } from './apps/index.js';
import { WindowManager } from './window-manager.js';
import { createNotifications } from './notifications.js';
import { createTaskbar } from './taskbar.js';
import { createStartMenu } from './start-menu.js';
import { createDesktop } from './desktop.js';
import { applySettings, loadSettings, saveSettings, storageAvailable } from './store.js';
import { bus, emit } from './bus.js';
import { getAssistantStatus, describeStatus } from './status.js';
import { veritySVG } from './verity.js';
import { uiIcon } from './icons.js';
import { playTone, trapFocus } from './ui.js';

const state = {
  settings: loadSettings(),
};

applySettings(state.settings);

const elements = {
  os: document.getElementById('os'),
  desktop: document.getElementById('desktop-surface'),
  icons: document.getElementById('desktop-icons'),
  layer: document.getElementById('window-layer'),
  taskbar: document.getElementById('taskbar'),
  startButton: document.getElementById('start-button'),
  startFace: document.getElementById('start-button-face'),
  startMenu: document.getElementById('start-menu'),
  taskbarApps: document.getElementById('taskbar-apps'),
  clockButton: document.getElementById('tray-clock'),
  time: document.getElementById('tray-time'),
  date: document.getElementById('tray-date'),
  statusButton: document.getElementById('tray-status'),
  statusDot: document.getElementById('tray-status-dot'),
  statusText: document.getElementById('tray-status-text'),
  contextMenu: document.getElementById('context-menu'),
  toasts: document.getElementById('toasts'),
  welcome: document.getElementById('welcome'),
};

const notifications = createNotifications({
  container: elements.toasts,
  isSoundOn: () => state.settings.sound,
  playSound: playTone,
});

const windows = new WindowManager({
  layer: elements.layer,
  desktop: elements.desktop,
  apps: APPS,
  notify: notifications.notify,
  getSettings: () => state.settings,
});

const taskbar = createTaskbar({
  startFace: elements.startFace,
  appsContainer: elements.taskbarApps,
  clockButton: elements.clockButton,
  timeEl: elements.time,
  dateEl: elements.date,
  statusButton: elements.statusButton,
  statusDot: elements.statusDot,
  statusText: elements.statusText,
  onActivate: (id) => windows.activate(id),
  onStatus: () => windows.open('settings'),
});

const startMenu = createStartMenu({
  root: elements.startMenu,
  button: elements.startButton,
  apps: APPS,
  onOpen: (appId) => windows.open(appId),
});

const desktop = createDesktop({
  surface: elements.desktop,
  container: elements.icons,
  menu: elements.contextMenu,
  apps: APPS,
  onOpen: (appId) => windows.open(appId),
  onNewNote: () => {
    const existing = windows.windows.find((win) => win.appId === 'notes');
    if (existing) {
      windows.restore(existing);
      windows.focus(existing);
    } else {
      windows.open('notes');
    }
    emit('notes:new');
  },
  onSettings: () => windows.open('settings'),
  onAbout: () => windows.open('about'),
});

bus.on('windows:changed', (list) => taskbar.renderWindows(list));
bus.on('window:opened', () => playTone('open', state.settings.sound));
bus.on('window:closed', () => playTone('close', state.settings.sound));

bus.on('settings:changed', (next) => {
  state.settings = { ...state.settings, ...next };
  saveSettings(state.settings);
  applySettings(state.settings);
});

bus.on('clock:clicked', () => {
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now);
  notifications.notify({ title: time, body: date, tone: 'info', duration: 5200 });
});

document.addEventListener('keydown', (event) => {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === 'v') {
    event.preventDefault();
    windows.open('assistant');
  } else if (key === 's') {
    event.preventDefault();
    startMenu.toggle();
  }
});

/* -------------------------------------------------------------------------
   First-run welcome
   ------------------------------------------------------------------------- */
function buildWelcome(status) {
  const modeChip =
    status?.mode === 'local'
      ? `<span class="chip chip--local">Local AI</span>`
      : `<span class="chip chip--demo">Demo mode</span>`;

  const statusLine = status?.offline
    ? 'The AskVerity OS server is not responding, so I cannot answer questions right now. Start it with <strong>npm start</strong>.'
    : status?.mode === 'local'
      ? `I am connected to your local model <strong>${escapeForLabel(status.model)}</strong>. Nothing leaves this computer.`
      : 'I am running on my built-in demo brain: greetings, simple maths, the time, jokes and help with this desktop. No internet, no API key.';

  elements.welcome.innerHTML = `
    <div class="welcome__card" role="document">
      <div class="welcome__art">
        <span aria-hidden="true">${veritySVG('excited')}</span>
        <span class="welcome__art-caption">Hello, I'm Verity</span>
      </div>
      <div class="welcome__body">
        <p class="welcome__eyebrow">AskVerity OS · first run</p>
        <h1 class="welcome__title" id="welcome-title">A small computer with a friendly face.</h1>
        <p class="welcome__lede">
          This is a desktop that lives in your browser. Open apps from the icons or the Start
          menu, drag windows by their title bars, and ask me anything.
        </p>
        <ul class="welcome__list">
          <li>${uiIcon('grid')}<span><strong>Double-click an icon</strong> (or press Enter) to open an app.</span></li>
          <li>${uiIcon('chat')}<span><strong>Ask Verity</strong> is the app with my face on it. Press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> any time.</span></li>
          <li>${uiIcon('palette')}<span><strong>Settings</strong> changes theme, wallpaper, sound and reduced motion.</span></li>
        </ul>
        <p class="welcome__status">
          <strong>Assistant status ${modeChip}</strong>
          ${statusLine}
        </p>
        <div class="welcome__actions">
          <button class="btn btn--primary" type="button" data-welcome-open>
            ${uiIcon('chat')}<span>Meet Verity</span>
          </button>
          <button class="btn" type="button" data-welcome-look>
            ${uiIcon('grid')}<span>Look around first</span>
          </button>
          <button class="welcome__skip" type="button" data-welcome-skip>
            Skip tour
          </button>
        </div>
      </div>
    </div>`;

  function closeWelcome({ openAssistant = false } = {}) {
    elements.welcome.hidden = true;
    elements.os.removeAttribute('inert');
    state.settings.welcomeSeen = true;
    saveSettings(state.settings);
    if (openAssistant) windows.open('assistant');
    elements.startButton.focus({ preventScroll: true });
    notifications.notify({
      title: 'Verity is ready!',
      body: describeStatus(status).title,
      tone: 'tip',
    });
  }

  const card = elements.welcome.querySelector('.welcome__card');

  elements.welcome.querySelector('[data-welcome-open]').addEventListener('click', () =>
    closeWelcome({ openAssistant: true }),
  );
  elements.welcome.querySelector('[data-welcome-look]').addEventListener('click', () => closeWelcome());
  elements.welcome.querySelector('[data-welcome-skip]').addEventListener('click', () => closeWelcome());

  elements.welcome.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWelcome();
      return;
    }
    trapFocus(card, event);
  });

  elements.welcome.querySelector('[data-welcome-open]').focus({ preventScroll: true });
}

function escapeForLabel(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

async function showWelcomeIfNeeded() {
  if (state.settings.welcomeSeen) return;
  elements.welcome.hidden = false;
  elements.welcome.setAttribute('aria-label', 'Welcome to AskVerity OS');
  elements.os.setAttribute('inert', '');
  const status = await getAssistantStatus();
  buildWelcome(status);
}

/* -------------------------------------------------------------------------
   Status + boot
   ------------------------------------------------------------------------- */
async function refreshStatus({ force = false } = {}) {
  const status = await getAssistantStatus({ force });
  const description = describeStatus(status);
  taskbar.setStatus(description);
  startMenu.setStatus(description);
  return status;
}

async function boot() {
  // The taskbar starts empty; only window events should ever change it.
  await refreshStatus();

  if (!storageAvailable()) {
    notifications.notify({
      title: 'Notes will not persist',
      body: 'This browser is blocking local storage, so notes, files and settings reset when you reload.',
      tone: 'error',
      duration: 8000,
    });
  }

  await showWelcomeIfNeeded();
  await refreshStatus({ force: false });

  // Re-check the assistant when the tab comes back, but only occasionally.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStatus();
  });
}

boot();
