import { fromHTML } from '../ui.js';
import { read, write, uid } from '../store.js';

const PRESETS = [15, 25, 45];

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export default {
  id: 'focus',
  title: 'Focus Space',
  size: { w: 520, h: 590 },

  mount(body, ctx) {
    let selectedMinutes = 25;
    let remaining = selectedMinutes * 60;
    let interval = null;
    let running = false;
    let tasks = read('focus-tasks', []);
    if (!Array.isArray(tasks)) tasks = [];
    tasks = tasks.filter((task) => task && typeof task.text === 'string').slice(0, 50);

    const root = fromHTML(`
      <div class="focus">
        <section class="focus__timer" aria-label="Focus timer">
          <p class="focus__eyebrow">A little space to concentrate</p>
          <div class="focus__clock" data-clock role="timer" aria-live="off">25:00</div>
          <p class="focus__status" data-status role="status" aria-live="polite">Ready when you are.</p>
          <div class="focus__presets" aria-label="Timer length">
            ${PRESETS.map((minutes) => `<button class="btn focus__preset" type="button" data-preset="${minutes}" aria-pressed="${minutes === 25}">${minutes} min</button>`).join('')}
          </div>
          <div class="focus__controls">
            <button class="btn btn--primary" type="button" data-toggle>Start focus</button>
            <button class="btn" type="button" data-reset>Reset</button>
          </div>
          <div class="focus__track" aria-hidden="true"><span data-progress></span></div>
          <p class="focus__hint">The timer runs only while this window is open. No pressure to finish — pause whenever you need.</p>
        </section>
        <section class="focus__tasks">
          <div class="focus__tasks-head">
            <div><p class="focus__eyebrow">Your tiny task list</p><h2>One thing at a time</h2></div>
            <span class="focus__count" data-count>0 tasks</span>
          </div>
          <form class="focus__form" data-form>
            <label class="sr-only" for="focus-task-input">Add a task</label>
            <input id="focus-task-input" data-input maxlength="80" placeholder="What would you like to work on?" autocomplete="off" />
            <button class="btn btn--primary" type="submit">Add</button>
          </form>
          <ul class="focus__list" data-list aria-label="Focus tasks"></ul>
          <p class="focus__empty" data-empty>No tasks yet. Add one small thing to begin.</p>
          <button class="btn focus__clear" type="button" data-clear>Clear completed</button>
        </section>
      </div>`);

    body.appendChild(root);

    const clock = root.querySelector('[data-clock]');
    const status = root.querySelector('[data-status]');
    const toggle = root.querySelector('[data-toggle]');
    const progress = root.querySelector('[data-progress]');
    const list = root.querySelector('[data-list]');
    const count = root.querySelector('[data-count]');
    const empty = root.querySelector('[data-empty]');
    const input = root.querySelector('[data-input]');

    function persistTasks() {
      if (!write('focus-tasks', tasks)) {
        ctx.notify({ title: 'Tasks not saved', body: 'This browser could not save local data. Your list may not survive a reload.', tone: 'error' });
      }
    }

    function renderTimer() {
      clock.textContent = formatTime(remaining);
      toggle.textContent = running ? 'Pause' : 'Start focus';
      toggle.setAttribute('aria-label', running ? 'Pause focus timer' : 'Start focus timer');
      progress.style.width = `${((selectedMinutes * 60 - remaining) / (selectedMinutes * 60)) * 100}%`;
      root.querySelectorAll('[data-preset]').forEach((button) => {
        const active = Number(button.dataset.preset) === selectedMinutes;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
        button.disabled = running;
      });
    }

    function stopTimer() {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
      running = false;
    }

    function tick() {
      remaining = Math.max(0, remaining - 1);
      renderTimer();
      if (remaining === 0) {
        stopTimer();
        status.textContent = 'Session complete. Take a break or choose another length.';
        renderTimer();
        ctx.notify({ title: 'Focus session complete', body: 'Nice work showing up. Take a break if you want one.', tone: 'success', duration: 6000 });
      }
    }

    toggle.addEventListener('click', () => {
      if (running) {
        stopTimer();
        status.textContent = 'Paused. Resume whenever you are ready.';
      } else if (remaining > 0) {
        running = true;
        interval = window.setInterval(tick, 1000);
        status.textContent = 'You are in a focus session. You can pause at any time.';
      }
      renderTimer();
    });

    root.querySelector('[data-reset]').addEventListener('click', () => {
      stopTimer();
      remaining = selectedMinutes * 60;
      status.textContent = 'Timer reset. Ready when you are.';
      renderTimer();
    });

    root.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        stopTimer();
        selectedMinutes = Number(button.dataset.preset);
        remaining = selectedMinutes * 60;
        status.textContent = `${selectedMinutes} minute session selected.`;
        renderTimer();
      });
    });

    function renderTasks() {
      list.replaceChildren();
      const activeCount = tasks.filter((task) => !task.done).length;
      count.textContent = `${activeCount} remaining`;
      empty.hidden = tasks.length > 0;
      root.querySelector('[data-clear]').disabled = !tasks.some((task) => task.done);

      for (const task of tasks) {
        const item = document.createElement('li');
        item.className = 'focus__task';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(task.done);
        checkbox.setAttribute('aria-label', `Mark ${task.text} ${task.done ? 'incomplete' : 'complete'}`);
        checkbox.addEventListener('change', () => {
          task.done = checkbox.checked;
          persistTasks();
          renderTasks();
        });
        const label = document.createElement('span');
        label.className = task.done ? 'is-done' : '';
        label.textContent = task.text;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'focus__remove';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove task: ${task.text}`);
        remove.addEventListener('click', () => {
          tasks = tasks.filter((entry) => entry.id !== task.id);
          persistTasks();
          renderTasks();
        });
        item.append(checkbox, label, remove);
        list.appendChild(item);
      }
    }

    root.querySelector('[data-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      if (tasks.length >= 50) {
        ctx.notify({ title: 'Task list is full', body: 'Remove a few tasks before adding more.', tone: 'info' });
        return;
      }
      tasks.unshift({ id: uid('task'), text, done: false });
      input.value = '';
      persistTasks();
      renderTasks();
      input.focus();
    });

    root.querySelector('[data-clear]').addEventListener('click', () => {
      tasks = tasks.filter((task) => !task.done);
      persistTasks();
      renderTasks();
    });

    ctx.onCleanup(stopTimer);
    renderTimer();
    renderTasks();
    root.setAttribute('data-app-ready', 'true');
  },
};
