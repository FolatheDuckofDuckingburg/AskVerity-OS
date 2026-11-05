import { uiIcon } from '../icons.js';
import { createVerity, EXPRESSIONS } from '../verity.js';
import { fromHTML } from '../ui.js';

const EXPRESSION_NOTES = {
  happy: 'Happy (default)',
  thinking: 'Thinking',
  curious: 'Curious',
  confused: 'Confused',
  excited: 'Excited',
  sleeping: 'Sleeping',
};

export default {
  id: 'about',
  title: 'About Verity',
  size: { w: 660, h: 560 },

  mount(body, ctx) {
    const root = fromHTML(`
      <div class="about">
        <section class="about__hero">
          <button class="about__face" type="button" data-face aria-label="Change Verity's expression" title="Change expression"></button>
          <div>
            <p class="about__eyebrow">AskVerity OS · v1.0.0</p>
            <h2 class="about__name">Verity</h2>
            <p class="about__tag">
              A cheerful yellow smiley face who lives in this desktop. They are happy to help,
              honest about their limits, and never pretend to be something they are not.
            </p>
            <p class="about__tag about__tag--quiet">
              Verity has no fixed gender: this desktop uses “they” when a pronoun is needed.
            </p>
          </div>
        </section>

        <div class="about__grid">
          <article class="about__card">
            <h3>${uiIcon('box')}<span>What this is</span></h3>
            <p>
              A small desktop environment built with plain HTML, CSS and JavaScript, served by a
              zero-dependency Node.js server. Windows, taskbar, apps and settings all really work.
            </p>
          </article>
          <article class="about__card">
            <h3>${uiIcon('info')}<span>What is simulated</span></h3>
            <ul>
              <li>The Files drive: it lives in your browser, not on your computer.</li>
              <li>The Browser: pages are fetched without scripts and shown as a reader, not a full engine.</li>
              <li>Without a local model, Verity's replies come from a small demo brain.</li>
            </ul>
          </article>
          <article class="about__card">
            <h3>${uiIcon('cpu')}<span>How the assistant works</span></h3>
            <p>
              The UI talks to <code>/api/chat</code> on the local server. That server either asks a
              local Ollama model or falls back to the demo brain. No API key, no subscription,
              and nothing sent to a third party.
            </p>
          </article>
          <article class="about__card">
            <h3>${uiIcon('keyboard')}<span>Keyboard shortcuts</span></h3>
            <table class="shortcut-table">
              <tbody>
                <tr><td><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd></td><td>Open Verity</td></tr>
                <tr><td><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></td><td>Start menu</td></tr>
                <tr><td><kbd>Enter</kbd> on an icon</td><td>Open that app</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close menus and popovers</td></tr>
              </tbody>
            </table>
          </article>
        </div>

        <section class="about__card">
          <h3>${uiIcon('sparkle')}<span>Three promises</span></h3>
          <p>
            No tracking, no accounts and no ads. Nothing claims to be connected when it is not.
            And no bees — Verity is a smiley face, and that is the whole mascot budget.
          </p>
        </section>

        <div class="settings__actions">
          <button class="btn btn--primary" type="button" data-talk>${uiIcon('chat')}<span>Talk to Verity</span></button>
          <button class="btn" type="button" data-settings>${uiIcon('settings')}<span>Open Settings</span></button>
          <a class="btn" href="assets/verity.svg" target="_blank" rel="noopener">
            ${uiIcon('external')}<span>Open mascot SVG</span>
          </a>
        </div>

        <p class="settings__note">
          Icons and the mascot are original SVG, drawn in this project. Motion respects your
          system setting and the Motion option in Settings.
        </p>
      </div>`);

    body.appendChild(root);

    const face = root.querySelector('[data-face]');
    const mascot = createVerity(face, { expression: 'happy', decorative: true });
    let index = 0;

    face.addEventListener('click', () => {
      index = (index + 1) % EXPRESSIONS.length;
      const next = EXPRESSIONS[index];
      mascot.set(next);
      face.setAttribute('aria-label', `Verity's expression: ${EXPRESSION_NOTES[next] ?? next}. Change expression.`);
      face.title = EXPRESSION_NOTES[next] ?? next;
    });

    face.setAttribute('aria-label', "Verity's expression: Happy (default). Change expression.");
    face.title = 'Change expression';

    root.querySelector('[data-talk]').addEventListener('click', () => ctx.openApp('assistant'));
    root.querySelector('[data-settings]').addEventListener('click', () => ctx.openApp('settings'));
  },
};
