import { appIcon } from './icons.js';
import { verityMiniSVG } from './verity.js';
import { bus } from './bus.js';
import { clear } from './ui.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fullFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * The taskbar: running windows on the left, clock and assistant status on the right.
 */
export function createTaskbar({ startFace, appsContainer, clockButton, timeEl, dateEl, statusButton, statusDot, statusText, onActivate, onStatus }) {
  startFace.innerHTML = verityMiniSVG();

  function updateClock() {
    const now = new Date();
    timeEl.textContent = timeFormat.format(now);
    dateEl.textContent = dateFormat.format(now);
    clockButton.title = fullFormat.format(now);
    clockButton.setAttribute('aria-label', `${fullFormat.format(now)}. Show the time in a notification.`);
  }

  updateClock();
  const clockTimer = setInterval(updateClock, 15_000);

  function renderWindows(windows) {
    clear(appsContainer);
    for (const win of windows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'taskbar-app';
      button.classList.toggle('is-active', win.focused);
      button.classList.toggle('is-minimized', win.minimized);
      button.innerHTML = `${appIcon(win.appId)}<span class="taskbar-app__label"></span>`;
      button.querySelector('.taskbar-app__label').textContent = win.title;
      button.title = win.minimized ? `${win.title} (minimised)` : win.title;
      button.setAttribute(
        'aria-label',
        `${win.title}. ${win.minimized ? 'Minimised' : win.focused ? 'Active window' : 'Open window'}.`,
      );
      button.setAttribute('aria-pressed', String(Boolean(win.focused)));
      button.addEventListener('click', () => onActivate(win.id));
      appsContainer.appendChild(button);
    }
  }

  function setStatus(status) {
    if (!status) return;
    statusDot.dataset.state = status.state;
    statusText.textContent = status.text;
    statusButton.title = status.title ?? status.text;
    statusButton.setAttribute('aria-label', `Assistant status: ${status.text}. Open settings.`);
  }

  clockButton.addEventListener('click', () => bus.emit('clock:clicked'));
  statusButton.addEventListener('click', () => onStatus());

  return {
    renderWindows,
    setStatus,
    updateClock,
    destroy: () => clearInterval(clockTimer),
  };
}
