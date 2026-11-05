/**
 * A small, safe arithmetic parser shared by the Calculator app and
 * Verity's demo brain. No eval(), no Function(), ever.
 *
 * Grammar
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('+' | '-') unary | primary
 *   primary    := number '%'? | '(' expression ')' '%'?
 */

export class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalcError';
  }
}

const MAX_LENGTH = 160;

const NORMALISE = [
  [/[×xX✕]/g, '*'],
  [/[÷]/g, '/'],
  [/[−–—]/g, '-'],
  [/[,]/g, ''],
  [/π/g, String(Math.PI)],
];

export function evaluate(input) {
  if (typeof input !== 'string') {
    throw new CalcError('Enter a calculation to solve.');
  }

  let source = input.trim();
  if (!source) throw new CalcError('Enter a calculation to solve.');
  if (source.length > MAX_LENGTH) {
    throw new CalcError('That calculation is a little too long for me.');
  }

  for (const [pattern, replacement] of NORMALISE) {
    source = source.replace(pattern, replacement);
  }

  // "50%" on its own is a common way to type 0.5.
  if (/^[\d.]+%$/.test(source)) source = `(${source})`;

  let index = 0;

  const skipSpace = () => {
    while (source[index] === ' ') index += 1;
  };

  const peek = () => source[index];

  function parseExpression() {
    let value = parseTerm();
    for (;;) {
      skipSpace();
      const char = peek();
      if (char !== '+' && char !== '-') return value;
      index += 1;
      const right = parseTerm();
      value = char === '+' ? value + right : value - right;
    }
  }

  function parseTerm() {
    let value = parseUnary();
    for (;;) {
      skipSpace();
      const char = peek();
      if (char !== '*' && char !== '/' && char !== '%') return value;
      index += 1;
      const right = parseUnary();
      if (char === '*') {
        value *= right;
      } else if (char === '/') {
        if (right === 0) throw new CalcError("I can't divide by zero.");
        value /= right;
      } else {
        if (right === 0) throw new CalcError("I can't divide by zero.");
        value %= right;
      }
    }
  }

  function parseUnary() {
    skipSpace();
    const char = peek();
    if (char === '-') {
      index += 1;
      return -parseUnary();
    }
    if (char === '+') {
      index += 1;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    skipSpace();
    const char = peek();

    if (char === '(') {
      index += 1;
      const value = parseExpression();
      skipSpace();
      if (peek() !== ')') throw new CalcError('A closing parenthesis is missing.');
      index += 1;
      return applyPercent(value);
    }

    const match = /^\d*\.?\d+/.exec(source.slice(index));
    if (match) {
      index += match[0].length;
      return applyPercent(Number.parseFloat(match[0]));
    }

    if (char === undefined) {
      throw new CalcError('The calculation looks incomplete.');
    }
    if (char === ')') {
      throw new CalcError('There is an extra closing parenthesis.');
    }
    throw new CalcError(`I don't understand "${char}".`);
  }

  function applyPercent(value) {
    skipSpace();
    if (peek() !== '%') return value;

    // "50%" is a percentage, but "7 % 3" is a modulo. Only a trailing percent
    // sign (not followed by another operand) divides by one hundred.
    const next = source.slice(index + 1).trimStart()[0];
    if (next !== undefined && /[\d(.]/.test(next)) return value;

    index += 1;
    return value / 100;
  }

  const result = parseExpression();
  skipSpace();

  if (index < source.length) {
    throw new CalcError(`I don't understand "${source[index]}".`);
  }

  if (!Number.isFinite(result)) {
    throw new CalcError('That result is too large to display.');
  }

  // Pull floating point noise back to something a person would write.
  return Number.parseFloat(result.toPrecision(12));
}

export function formatResult(value) {
  if (!Number.isFinite(value)) return 'Error';
  const rounded = Number.parseFloat(value.toPrecision(12));
  if (Number.isInteger(rounded) && Math.abs(rounded) < 1e21) {
    return String(rounded);
  }
  return String(rounded);
}
