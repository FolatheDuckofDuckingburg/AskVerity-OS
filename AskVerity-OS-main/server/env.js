import { readFileSync } from 'node:fs';

/**
 * Minimal `.env` reader. Keeps AskVerity OS dependency-free: no dotenv package,
 * just the handful of key=value rules we actually use.
 *
 * Existing process values win, so `AI_PROVIDER=mock npm start` still works.
 */
export function loadEnv(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return {}; // .env is optional
  }

  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Never override a value the shell already provided.
    if (process.env[key] === undefined) process.env[key] = value;
    parsed[key] = value;
  }
  return parsed;
}
