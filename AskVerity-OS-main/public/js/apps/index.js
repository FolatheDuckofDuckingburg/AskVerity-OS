import assistant from './assistant.js';
import browser from './browser.js';
import files from './files.js';
import notes from './notes.js';
import calculator from './calculator.js';
import settings from './settings.js';
import about from './about.js';
import trash from './trash.js';
import focus from './focus.js';

/** Registry order is desktop-icon and Start-menu order. */
export const APPS = [assistant, notes, files, browser, calculator, focus, settings, trash, about];

export const APPS_BY_ID = new Map(APPS.map((app) => [app.id, app]));
