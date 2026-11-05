import { evaluate, formatResult, CalcError } from '../public/js/lib/calc.js';

/**
 * Verity's demo brain.
 *
 * This is deliberately rule-based and lives on the server so the frontend has
 * no hard-coded answers. It is honest about being a demo: every reply it
 * produces is labelled in the UI, and it never pretends to be a language model.
 */

export const DEMO_LABEL = 'Demo reply';

const GREETING_TAILS = {
  warm: 'I was hoping you would say hello. What are we up to today?',
  balanced: 'What would you like to look at first?',
  focused: 'What do you need?',
};

const JOKES = [
  'Why did the pixel go to therapy? It had too many unresolved edges.',
  'I asked the wall clock for advice. It just gave me the runaround.',
  'A folder told me a secret. I promised to keep it contained.',
  'I tried to write a joke about windows. It kept getting minimised.',
  'My favourite kind of maths is the kind that adds up. Segfaults are less fun.',
  'Someone asked me to be more colourful, so I became a little more yellow.',
];

const SMALL_TALK = [
  "I'm doing well, thanks for asking. I like it here: the wallpaper is calm and nobody has moved my window.",
  'Pretty good. My face is 45 pixels of pure optimism.',
  "I'm cheerful by default, which is handy because it is also my only setting.",
];

function pick(list, seed) {
  const index = Math.abs(seed) % list.length;
  return list[index];
}

function timeSentence(now) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return `It is ${time} on ${day} (server clock).`;
}

function capabilityAnswer() {
  return [
    "Here is what I can actually do right now, without a language model:",
    '',
    '• Greet you and chat a little in demo mode.',
    '• Do arithmetic, like "what is 128 * 4.5".',
    '• Tell you the time, a joke, or how this desktop works.',
    '',
    'The desktop apps are all real: Notes saves to this browser, the Calculator',
    'parses expressions safely, Files has a simulated drive, and Settings changes',
    'themes, wallpaper and motion. The Browser fetches real pages through the local',
    'server without running their scripts, and can summarise the page you are reading.',
    '',
    'For open-ended conversation, start Ollama on your computer and restart the',
    'server with AI_PROVIDER=ollama. I will pick up your local model automatically.',
  ].join('\n');
}

function desktopAnswer() {
  return [
    'A quick tour of AskVerity OS:',
    '',
    '• Ask Verity — this window, with conversation history kept in your browser.',
    '• Notes — autosaving notes stored locally, with search.',
    '• Files — a simulated drive you can browse, search and tidy up.',
    '• Browser — opens real pages in a script-free reader, with bookmarks, history and a Verity panel.',
    '• Calculator — keyboard-friendly and safely parsed, no eval.',
    '• Settings — themes, wallpaper, sound, reduced motion and my personality.',
    '• Trash — deleted simulated files wait here until you restore or empty them.',
    '',
    'Everything is local. No account, no tracking, no paid API.',
  ].join('\n');
}

function honestyAnswer() {
  return [
    'I am the demo version of Verity: a rule-based brain that ships with the',
    'desktop so it works with no internet, no model and no API key.',
    '',
    'I am not a large language model and I will not pretend to be one. If you',
    'connect a local model through Ollama, the real Verity takes over and you get',
    'proper open-ended conversation — still free, still private, still on your machine.',
  ].join('\n');
}

function pageAnswer(page, question) {
  const lower = String(question).toLowerCase();
  const aboutPage =
    /summar|overview|tl;?dr|what.*(about|page|article|this)|explain|main (idea|point)|read|meaning|mean\b|topic|say/.test(
      lower,
    );
  if (!aboutPage) return null;

  const text = String(page.text ?? '').trim();
  if (!text) return null;

  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? [])
    .slice(0, 3)
    .map((sentence) => sentence.trim())
    .join(' ');
  const extract = sentences || text.slice(0, 320);

  return {
    text: [
      `“${page.title || 'This page'}”` + (page.url ? ` — ${page.url}` : ''),
      `${words} words, about ${Math.max(1, Math.round(words / 220))} minute${words > 330 ? 's' : ''} of reading.`,
      '',
      extract,
      '',
      'That is an extract from the page, not a real summary: I am on the demo brain.',
      'Connect a local model in Settings and I can reason over the whole page.',
    ].join('\n'),
    expression: 'curious',
  };
}

function mathAnswer(text) {
  const candidate = text
    .replace(/[×]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/^(what\s+is|whats|what's|calculate|compute|solve|how much is)\s+/i, '')
    .replace(/[?=]+\s*$/, '')
    .trim();

  if (!/^[\d\s().+\-*/%]+$/.test(candidate) || !/\d/.test(candidate)) return null;
  if (!/[+\-*/%]/.test(candidate)) return null;

  try {
    const value = evaluate(candidate);
    return `${candidate} = ${formatResult(value)}.`;
  } catch (error) {
    if (error instanceof CalcError) return `I could not finish that one: ${error.message}`;
    return null;
  }
}

/**
 * Produce a demo reply for the given message.
 * @returns {{ text: string, expression: string }}
 */
export function mockReply(input, options = {}) {
  const personality = options.personality in GREETING_TAILS ? options.personality : 'balanced';
  const text = String(input ?? '').trim();
  const lower = text.toLowerCase();
  const now = new Date();
  const seed = text.length + now.getHours();

  if (!text) {
    return {
      text: 'I am here. Type a question, or try one of the suggestions on the screen.',
      expression: 'curious',
    };
  }

  const math = mathAnswer(text);
  if (math) return { text: math, expression: 'excited' };

  const page = options.page;
  if (page?.text) {
    const answer = pageAnswer(page, text);
    if (answer) return answer;
  }

  if (/^(hi|hey|hello|yo|hiya|good morning|good afternoon|good evening)\b/.test(lower)) {
    return {
      text: `Hello! I'm Verity, the friendly face of this desktop. ${GREETING_TAILS[personality]}`,
      expression: 'happy',
    };
  }

  if (/^(thanks|thank you|ty|cheers)\b/.test(lower)) {
    return { text: 'Anytime. That is more or less my whole job.', expression: 'happy' };
  }

  if (/^(bye|goodbye|see you|later)\b/.test(lower)) {
    return {
      text: 'See you in a bit. I will keep the desktop tidy while you are gone.',
      expression: 'happy',
    };
  }

  if (/how are you|how's it going|how are things/.test(lower)) {
    return { text: pick(SMALL_TALK, seed), expression: 'happy' };
  }

  if (/what.*(can|could) you do|help me|capabilit|what do you do/.test(lower)) {
    return { text: capabilityAnswer(), expression: 'curious' };
  }

  if (/desktop|tour|apps|applications|what can i open/.test(lower)) {
    return { text: desktopAnswer(), expression: 'curious' };
  }

  if (/who are you|what are you|your name|are you (real|an? ai|human|a bot)/.test(lower)) {
    return {
      text: 'I am Verity. I am a small, cheerful assistant who lives in this desktop.\n\n' +
        'Right now I am running on the built-in demo brain, so I am honest but limited.',
      expression: 'happy',
    };
  }

  if (/are you (a )?(demo|mock)|demo mode|mock mode/.test(lower)) {
    return { text: honestyAnswer(), expression: 'curious' };
  }

  if (/ollama|local (ai|model)|connect.*model|ai provider/.test(lower)) {
    return {
      text: [
        'To give me a real language model, run these on your computer:',
        '',
        '1. Install Ollama from ollama.com',
        '2. ollama pull llama3.2',
        '3. Open AskVerity OS → Settings → AI provider, and press "Check again".',
        '',
        'The server talks to http://127.0.0.1:11434 for you, so no key ever touches',
        'the browser. If the model is not running, I stay in demo mode and say so.',
      ].join('\n'),
      expression: 'thinking',
    };
  }

  if (/(what.*time|what.*date|today|the time)/.test(lower)) {
    return { text: timeSentence(now), expression: 'happy' };
  }

  if (/joke|funny|make me laugh/.test(lower)) {
    return { text: pick(JOKES, seed), expression: 'excited' };
  }

  if (/note|notes app/.test(lower)) {
    return {
      text: 'Notes lives on the desktop and in the Start menu. It saves as you type, keeps a last-edited date, and supports search. Everything stays in this browser.',
      expression: 'curious',
    };
  }

  if (/calculator|math|arithmetic/.test(lower)) {
    return {
      text: 'Open the Calculator and type straight into it: numbers, + - * / % and parentheses all work, from the keypad or the keyboard. I can also do simple sums here in demo mode.',
      expression: 'curious',
    };
  }

  if (/file|folder/.test(lower)) {
    return {
      text: 'Files shows a simulated drive — everything in it lives in this browser, not on your computer. You can browse, search, preview, and move things to Trash.',
      expression: 'curious',
    };
  }

  if (/weather|news|stock|score|today.s headlines/.test(lower)) {
    return {
      text: 'I cannot check live information like the weather or news — demo mode has no internet access, and I will not invent an answer.',
      expression: 'confused',
    };
  }

  if (/window|close|minimi|maximi|drag/.test(lower)) {
    return {
      text: 'Drag a window by its title bar, double-click the title bar to maximise, and use the three buttons on the right to minimise, maximise or close. Minimised windows wait in the taskbar.',
      expression: 'happy',
    };
  }

  if (page?.text) {
    const opening = page.text.slice(0, 260).trim();
    return {
      text: [
        `I can only see a plain-text extract of “${page.title || 'this page'}”.`,
        '',
        opening,
        '',
        'I am on the demo brain, so I cannot reason about it properly. Connect a local model in Settings for real questions.',
      ].join('\n'),
      expression: 'curious',
    };
  }

  return {
    text: [
      'I am in demo mode, so my useful answers are limited to greetings, simple maths, the time, jokes and help with this desktop.',
      '',
      'I would rather say that than invent something. If you connect a local model through Ollama, I can hold a real conversation about this question.',
    ].join('\n'),
    expression: 'confused',
  };
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });

/**
 * Stream a demo reply in small chunks so the typing indicator feels alive.
 */
export async function* streamMockReply(input, options = {}) {
  const { text, expression } = mockReply(input, options);
  const chunks = text.match(/\S+\s*/g) ?? [text];

  for (const chunk of chunks) {
    await sleep(18 + Math.random() * 32, options.signal);
    yield { type: 'delta', text: chunk };
  }

  return expression;
}
