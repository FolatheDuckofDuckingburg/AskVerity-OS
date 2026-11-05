import { fromHTML } from '../ui.js';
import { CalcError, evaluate, formatResult } from '../lib/calc.js';

const KEY_ROWS = [
  [
    { label: 'C', action: 'clear', cls: 'calc__key--danger', aria: 'Clear calculation' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
    { label: '⌫', action: 'backspace', aria: 'Delete last character' },
  ],
  [
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '÷', value: '÷', cls: 'calc__key--op', aria: 'Divide' },
  ],
  [
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '×', value: '×', cls: 'calc__key--op', aria: 'Multiply' },
  ],
  [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '−', value: '−', cls: 'calc__key--op', aria: 'Subtract' },
  ],
  [
    { label: '0', value: '0' },
    { label: '.', value: '.' },
    { label: '%', value: '%', cls: 'calc__key--op', aria: 'Percent' },
    { label: '+', value: '+', cls: 'calc__key--op', aria: 'Add' },
  ],
  [{ label: '=', action: 'equals', cls: 'calc__key--accent calc__key--wide', aria: 'Equals' }],
];

const OPERATORS = new Set(['+', '−', '×', '÷', '*', '/', '%']);

export default {
  id: 'calculator',
  title: 'Calculator',
  size: { w: 360, h: 540 },

  mount(body, ctx) {
    let expression = '';
    let result = '';
    let error = '';
    let justEvaluated = false;

    const root = fromHTML(`
      <div class="calc">
        <div class="calc__display">
          <div class="calc__expression" data-expression>0</div>
          <div class="calc__result" data-result role="status" aria-live="polite" aria-atomic="true">0</div>
        </div>
        <div class="calc__keys" data-keys></div>
        <p class="calc__hint" data-hint>Keyboard: digits, + − × ÷ %, ( ), Enter =, Backspace, Esc</p>
      </div>`);

    body.appendChild(root);

    const keysEl = root.querySelector('[data-keys]');
    const expressionEl = root.querySelector('[data-expression]');
    const resultEl = root.querySelector('[data-result]');
    const hintEl = root.querySelector('[data-hint]');
    const defaultHint = hintEl.textContent;

    for (const row of KEY_ROWS) {
      for (const key of row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `calc__key ${key.cls ?? ''}`.trim();
        button.textContent = key.label;
        if (key.aria) button.setAttribute('aria-label', key.aria);
        button.dataset.key = key.value ?? key.action;
        button.addEventListener('click', () => press(key));
        keysEl.appendChild(button);
      }
    }

    function previewValue() {
      if (!expression.trim()) return '';
      const trimmed = expression.trim();
      if (!/[\d)]$/.test(trimmed)) return '';
      try {
        return formatResult(evaluate(expression));
      } catch {
        return '';
      }
    }

    function render() {
      expressionEl.textContent = expression || '0';

      if (error) {
        resultEl.textContent = 'Error';
      } else if (result !== '') {
        resultEl.textContent = result;
      } else {
        const preview = previewValue();
        resultEl.textContent = preview || '0';
      }

      hintEl.textContent = error || defaultHint;
      hintEl.style.color = error ? 'var(--danger)' : '';
    }

    function appendValue(value) {
      if (justEvaluated) {
        if (OPERATORS.has(value)) {
          expression = `${result || '0'}${value}`;
        } else if (value === '.' || /\d/.test(value)) {
          expression = '';
        } else if (value === '(' || value === ')') {
          expression = '';
        }
        result = '';
        justEvaluated = false;
      }

      if (value === '.') {
        const tail = expression.match(/(\d*\.?\d*)$/)?.[0] ?? '';
        if (tail.includes('.')) return;
        if (!tail) expression += '0';
      }

      if (OPERATORS.has(value) && expression) {
        const lastChar = expression.slice(-1);
        if (OPERATORS.has(lastChar) && value !== '%' && value !== '(') {
          expression = expression.slice(0, -1);
        }
      }

      if (expression.length >= 120) {
        error = 'That calculation is getting long.';
        render();
        return;
      }

      expression += value;
      error = '';
      render();
    }

    function backspace() {
      if (justEvaluated) {
        justEvaluated = false;
        result = '';
      }
      expression = expression.slice(0, -1);
      error = '';
      render();
    }

    function clear() {
      expression = '';
      result = '';
      error = '';
      justEvaluated = false;
      render();
    }

    function equals() {
      if (!expression.trim()) return;
      try {
        const value = evaluate(expression);
        result = formatResult(value);
        error = '';
        justEvaluated = true;
      } catch (caught) {
        error = caught instanceof CalcError ? caught.message : 'I could not work that out.';
        result = '';
        justEvaluated = false;
      }
      render();
    }

    function press(key) {
      if (key.action === 'clear') clear();
      else if (key.action === 'backspace') backspace();
      else if (key.action === 'equals') equals();
      else appendValue(key.value);
    }

    function onKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const targetIsButton = event.target instanceof HTMLElement && event.target.closest('button');
      if (targetIsButton && (event.key === 'Enter' || event.key === ' ')) return;

      const { key } = event;

      if (/^[0-9]$/.test(key) || ['+', '-', '*', '/', '%', '(', ')', '.'].includes(key)) {
        event.preventDefault();
        const mapped = key === '*' ? '×' : key === '/' ? '÷' : key === '-' ? '−' : key;
        appendValue(mapped);
        return;
      }

      if (key === 'Enter' || key === '=') {
        event.preventDefault();
        equals();
        return;
      }

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        if (key === 'Delete') clear();
        else backspace();
        return;
      }

      if (key === 'Escape' || key.toLowerCase() === 'c') {
        event.preventDefault();
        clear();
      }
    }

    ctx.el.addEventListener('keydown', onKeyDown);
    ctx.onCleanup(() => ctx.el.removeEventListener('keydown', onKeyDown));

    root.setAttribute('data-app-ready', 'true');
    render();
  },
};
