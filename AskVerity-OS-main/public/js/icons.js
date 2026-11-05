/**
 * AskVerity OS icon set.
 *
 * Everything is original inline SVG: no icon fonts, no network requests, and
 * icons inherit `currentColor` so themes stay consistent.
 */

const appShell = (inner) =>
  `<svg viewBox="0 0 48 48" role="presentation" focusable="false" aria-hidden="true">${inner}</svg>`;

const stroke = '#292929';

export const APP_ICONS = {
  assistant: appShell(`
    <circle cx="24" cy="25" r="18" fill="#FFD60A"/>
    <ellipse cx="17" cy="15" rx="9" ry="6" fill="#FFF176" opacity="0.5"/>
    <ellipse cx="24" cy="25" r="18" fill="none" stroke="#C79A00" stroke-width="1" opacity="0.35"/>
    <ellipse cx="18.6" cy="22.4" rx="2.6" ry="4.7" fill="#241C05"/>
    <ellipse cx="29.4" cy="22.4" rx="2.6" ry="4.7" fill="#241C05"/>
    <path d="M15.8 29c1.1 5 4.4 7.2 8.2 7.2s7.1-2.2 8.2-7.2" fill="none" stroke="#241C05" stroke-width="2.7" stroke-linecap="round"/>
    <path d="M15.8 29c-.8-1.8-.6-3.1.5-3.6M32.2 29c.8-1.8.6-3.1-.5-3.6" fill="none" stroke="#241C05" stroke-width="2.4" stroke-linecap="round"/>
  `),

  browser: appShell(`
    <rect x="4" y="7" width="40" height="34" rx="6" fill="#FFFFFF" stroke="${stroke}" stroke-width="2.5"/>
    <path d="M4 16h40" stroke="${stroke}" stroke-width="2.5"/>
    <circle cx="9.5" cy="11.5" r="1.5" fill="${stroke}"/>
    <circle cx="14.5" cy="11.5" r="1.5" fill="${stroke}"/>
    <circle cx="19.5" cy="11.5" r="1.5" fill="${stroke}"/>
    <circle cx="24" cy="28" r="8" fill="#B9DDF7" stroke="${stroke}" stroke-width="2.2"/>
    <path d="M16 28h16M24 20c3 3 3 13 0 16M24 20c-3 3-3 13 0 16" fill="none" stroke="${stroke}" stroke-width="1.8"/>
  `),

  files: appShell(`
    <path d="M4 13a3 3 0 0 1 3-3h9l3.6 4H41a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V13Z" fill="#FFE66D" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M4 20.5h40" stroke="${stroke}" stroke-width="2.5"/>
    <path d="M11 28h10M11 33h16" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>
  `),

  notes: appShell(`
    <rect x="8" y="6" width="32" height="36" rx="5" fill="#FFF9E9" stroke="${stroke}" stroke-width="2.5"/>
    <path d="M15 16h18M15 23h18M15 30h10" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M30 38l7-7 4 4-7 7-4-4Z" fill="#FFE66D" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
  `),

  calculator: appShell(`
    <rect x="7" y="4" width="34" height="40" rx="6" fill="#FFFFFF" stroke="${stroke}" stroke-width="2.5"/>
    <rect x="12" y="9" width="24" height="9" rx="3" fill="#B9DDF7" stroke="${stroke}" stroke-width="2"/>
    <g fill="${stroke}">
      <rect x="12" y="23" width="6.5" height="5" rx="1.6"/>
      <rect x="20.8" y="23" width="6.5" height="5" rx="1.6"/>
      <rect x="29.6" y="23" width="6.5" height="5" rx="1.6"/>
      <rect x="12" y="30.5" width="6.5" height="5" rx="1.6"/>
      <rect x="20.8" y="30.5" width="6.5" height="5" rx="1.6"/>
      <rect x="12" y="38" width="6.5" height="3" rx="1.5"/>
    </g>
    <rect x="29.6" y="30.5" width="6.5" height="10.5" rx="1.6" fill="#FFE66D" stroke="${stroke}" stroke-width="1.8"/>
    <rect x="20.8" y="38" width="6.5" height="3" rx="1.5" fill="${stroke}"/>
  `),

  settings: appShell(`
    <circle cx="24" cy="24" r="9.5" fill="#E8DDF8" stroke="${stroke}" stroke-width="2.5"/>
    <circle cx="24" cy="24" r="3.5" fill="${stroke}"/>
    <g stroke="${stroke}" stroke-width="3" stroke-linecap="round">
      <path d="M24 5.5v6M24 36.5v6M5.5 24h6M36.5 24h6"/>
      <path d="M11.2 11.2l4.2 4.2M32.6 32.6l4.2 4.2M36.8 11.2l-4.2 4.2M15.4 32.6l-4.2 4.2"/>
    </g>
  `),

  about: appShell(`
    <circle cx="24" cy="24" r="18" fill="#B9DDF7" stroke="${stroke}" stroke-width="2.5"/>
    <circle cx="24" cy="15" r="2.6" fill="${stroke}"/>
    <path d="M24 21.5v11.5" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round"/>
  `),

  trash: appShell(`
    <path d="M10 15h28l-2.6 25a3 3 0 0 1-3 2.6H15.6a3 3 0 0 1-3-2.6L10 15Z" fill="#FFFFFF" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M6.5 15h35M19 9.5h10" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M19 22.5v13M24 22.5v13M29 22.5v13" stroke="${stroke}" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  `),
};

const line = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

export const UI_ICONS = {
  search: line('<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/>'),
  send: line('<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>'),
  stop: line('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>'),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  close: line('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: line('<path d="m5 13 4.5 4.5L19 7"/>'),
  info: line('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>'),
  alert: line('<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>'),
  chat: line('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z"/>'),
  refresh: line('<path d="M20 11a8 8 0 1 0-1.9 6.4"/><path d="M20 4v7h-7"/>'),
  back: line('<path d="M14 6l-6 6 6 6"/>'),
  forward: line('<path d="M10 6l6 6-6 6"/>'),
  home: line('<path d="M4 11 12 4l8 7"/><path d="M6.5 10v10h11V10"/>'),
  star: line('<path d="m12 4 2.5 5.1 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8L12 4Z"/>'),
  grid: line('<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>'),
  list: line('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>'),
  folder: line('<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z"/>'),
  doc: line('<path d="M6 3.5h8l4.5 4.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4.5"/>'),
  image: line('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 18 5-5 4 4 3-2.5 3.5 3.5"/>'),
  music: line('<path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17.5" r="2.6"/><circle cx="16.5" cy="15.5" r="2.6"/>'),
  sun: line('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>'),
  moon: line('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>'),
  volume: line('<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a6.5 6.5 0 0 1 0 10"/>'),
  restore: line('<path d="M4 10a8 8 0 1 1 1.6 6.6"/><path d="M4 5v5h5"/>'),
  external: line('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  link: line('<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.6 6.7"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0L5.2 13a4 4 0 1 0 5.7 5.7l1.6-1.6"/>'),
  sparkle: line('<path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z"/>'),
  cpu: line('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M10 2.5v3M14 2.5v3M10 18.5v3M14 18.5v3M2.5 10h3M2.5 14h3M18.5 10h3M18.5 14h3"/>'),
  palette: line('<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.5-1.6-1.8-1.6-3.2 0-1 .9-1.8 2.1-1.8h1.9A4.6 4.6 0 0 0 21 9c0-3.2-4-5.5-9-5.5Z"/><circle cx="8" cy="9.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="9.5" r="1.4" fill="currentColor" stroke="none"/>'),
  keyboard: line('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>'),
  shield: line('<path d="M12 3.2 5 6v5.5c0 4.2 3 7.4 7 9.3 4-1.9 7-5.1 7-9.3V6l-7-2.8Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
  pencil: line('<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>'),
  chevron: line('<path d="m9 6 6 6-6 6"/>'),
  globe: line('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14 0 17M12 3.5c-2.5 2.6-2.5 14 0 17"/>'),
  clock: line('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>'),
  bell: line('<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 19a2 2 0 0 0 4 0"/>'),
  box: line('<path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z"/><path d="M4 7.5 12 11.5l8-4M12 11.5V20"/>'),
};

export function uiIcon(name) {
  return UI_ICONS[name] ?? UI_ICONS.info;
}

export function appIcon(name) {
  return APP_ICONS[name] ?? APP_ICONS.assistant;
}
