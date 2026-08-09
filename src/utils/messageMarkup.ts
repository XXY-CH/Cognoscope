/**
 * Small, dependency-free Markdown and LaTeX subset for local AI messages.
 * The parser returns data, not HTML, so React remains responsible for escaping
 * text and applying safe link attributes.
 */

export type MathNode =
  | { kind: 'text'; value: string }
  | {
      kind: 'element';
      name: MathElementName;
      children: MathNode[];
      attrs?: Record<string, string>;
    };

export type MathElementName =
  | 'math'
  | 'mrow'
  | 'mi'
  | 'mn'
  | 'mo'
  | 'mtext'
  | 'mfrac'
  | 'msqrt'
  | 'msup'
  | 'msub'
  | 'msubsup'
  | 'mspace';

export type MessageInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'math'; value: string }
  | { type: 'strong' | 'em' | 'del'; children: MessageInline[] }
  | { type: 'link'; label: MessageInline[]; href: string }
  | { type: 'break' };

export type MessageBlock =
  | { type: 'paragraph' | 'heading' | 'blockquote'; children: MessageInline[]; level?: number }
  | { type: 'list'; ordered: boolean; items: MessageInline[][] }
  | { type: 'code'; language: string; value: string }
  | { type: 'math'; value: string }
  | { type: 'rule' };

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const MATH_SYMBOLS: Record<string, { value: string; operator?: boolean }> = {
  cdot: { value: '⋅', operator: true }, times: { value: '×', operator: true },
  pm: { value: '±', operator: true }, mp: { value: '∓', operator: true },
  le: { value: '≤', operator: true }, leq: { value: '≤', operator: true },
  ge: { value: '≥', operator: true }, geq: { value: '≥', operator: true },
  neq: { value: '≠', operator: true }, approx: { value: '≈', operator: true },
  propto: { value: '∝', operator: true }, in: { value: '∈', operator: true },
  notin: { value: '∉', operator: true }, to: { value: '→', operator: true },
  rightarrow: { value: '→', operator: true }, leftarrow: { value: '←', operator: true },
  leftrightarrow: { value: '↔', operator: true }, infty: { value: '∞' },
  partial: { value: '∂' }, nabla: { value: '∇' }, forall: { value: '∀', operator: true },
  exists: { value: '∃', operator: true }, emptyset: { value: '∅' },
  sum: { value: '∑', operator: true }, prod: { value: '∏', operator: true },
  int: { value: '∫', operator: true }, cup: { value: '∪', operator: true },
  cap: { value: '∩', operator: true }, land: { value: '∧', operator: true },
  lor: { value: '∨', operator: true },
};

function mathText(value: string, attrs?: Record<string, string>): MathNode {
  return { kind: 'element', name: 'mtext', children: [{ kind: 'text', value }], attrs };
}

function mathElement(
  name: MathElementName,
  children: MathNode[],
  attrs?: Record<string, string>,
): MathNode {
  return { kind: 'element', name, children, ...(attrs ? { attrs } : {}) };
}

function mathRow(children: MathNode[]): MathNode {
  return children.length === 1 ? children[0] : mathElement('mrow', children);
}

function tokenizeLatex(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /\\[A-Za-z]+|\\.|[A-Za-z]+|\d+(?:\.\d+)?|\s+|./g;
  for (const match of source.matchAll(pattern)) tokens.push(match[0]);
  return tokens;
}

function mathNodeText(node: MathNode): string {
  if (node.kind === 'text') return node.value;
  return node.children.map(mathNodeText).join('');
}

/** Convert the common formula vocabulary emitted by AI models to MathML data. */
export function parseLatexMath(source: string, display = false): MathNode {
  const tokens = tokenizeLatex(source.trim());
  let cursor = 0;

  const parseSequence = (stopAtBrace = false): MathNode[] => {
    const children: MathNode[] = [];
    while (cursor < tokens.length) {
      if (stopAtBrace && tokens[cursor] === '}') {
        cursor += 1;
        break;
      }
      if (/^\s+$/.test(tokens[cursor])) {
        cursor += 1;
        continue;
      }
      children.push(parseTerm());
    }
    return children;
  };

  const parseArgument = (): MathNode => {
    if (tokens[cursor] === '{') {
      cursor += 1;
      return mathRow(parseSequence(true));
    }
    return parseTerm();
  };

  const parseBase = (): MathNode => {
    const token = tokens[cursor++] ?? '';
    if (token === '{') return mathRow(parseSequence(true));
    if (token.startsWith('\\')) {
      const command = token.slice(1);
      if (command === 'frac') return mathElement('mfrac', [parseArgument(), parseArgument()]);
      if (command === 'sqrt') return mathElement('msqrt', [parseArgument()]);
      if (command === 'text' || command === 'mathrm' || command === 'operatorname') {
        return mathText(mathNodeText(parseArgument()));
      }
      if (command === 'left' || command === 'right') return parseBase();
      if (command === ',' || command === ';' || command === '!') {
        return mathElement('mspace', [], { width: command === '!' ? '0em' : '0.1667em' });
      }
      if (GREEK[command]) return mathElement('mi', [{ kind: 'text', value: GREEK[command] }]);
      const symbol = MATH_SYMBOLS[command];
      if (symbol) {
        return mathElement(symbol.operator ? 'mo' : 'mi', [{ kind: 'text', value: symbol.value }]);
      }
      return mathText(`\\${command}`);
    }
    if (/^\d/.test(token)) return mathElement('mn', [{ kind: 'text', value: token }]);
    if (/^[A-Za-z]+$/.test(token)) return mathElement('mi', [{ kind: 'text', value: token }]);
    return mathElement('mo', [{ kind: 'text', value: token }]);
  };

  const parseTerm = (): MathNode => {
    const base = parseBase();
    let sub: MathNode | null = null;
    let sup: MathNode | null = null;
    while (tokens[cursor] === '^' || tokens[cursor] === '_') {
      const marker = tokens[cursor++];
      const argument = parseArgument();
      if (marker === '^') sup = argument;
      else sub = argument;
    }
    if (sub && sup) return mathElement('msubsup', [base, sub, sup]);
    if (sub) return mathElement('msub', [base, sub]);
    if (sup) return mathElement('msup', [base, sup]);
    return base;
  };

  return mathElement('math', [mathRow(parseSequence())], {
    xmlns: 'http://www.w3.org/1998/Math/MathML',
    ...(display ? { display: 'block' } : {}),
  });
}

function appendText(target: MessageInline[], value: string): void {
  if (!value) return;
  const previous = target[target.length - 1];
  if (previous?.type === 'text') previous.value += value;
  else target.push({ type: 'text', value });
}

function findClosing(source: string, delimiter: string, from: number): number {
  let index = from;
  while ((index = source.indexOf(delimiter, index)) >= 0) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
    index += delimiter.length;
  }
  return -1;
}

function safeHref(href: string): string | null {
  const value = href.trim();
  return /^(?:https?:\/\/|mailto:|\/|#)/i.test(value) ? value : null;
}

export function parseMessageInline(source: string): MessageInline[] {
  const result: MessageInline[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === '\n') {
      result.push({ type: 'break' });
      cursor += 1;
      continue;
    }
    if (source.startsWith('```', cursor)) {
      appendText(result, '`');
      cursor += 1;
      continue;
    }
    if (source[cursor] === '`') {
      const end = findClosing(source, '`', cursor + 1);
      if (end > cursor + 1) {
        result.push({ type: 'code', value: source.slice(cursor + 1, end) });
        cursor = end + 1;
        continue;
      }
    }
    if (source.startsWith('\\(', cursor)) {
      const end = findClosing(source, '\\)', cursor + 2);
      if (end >= 0) {
        result.push({ type: 'math', value: source.slice(cursor + 2, end) });
        cursor = end + 2;
        continue;
      }
    }
    if (source[cursor] === '$' && source[cursor + 1] !== '$') {
      const end = findClosing(source, '$', cursor + 1);
      if (end > cursor + 1 && !source.slice(cursor + 1, end).includes('\n')) {
        result.push({ type: 'math', value: source.slice(cursor + 1, end) });
        cursor = end + 1;
        continue;
      }
    }
    const linkMatch = source.slice(cursor).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const href = safeHref(linkMatch[2]);
      if (href) {
        result.push({ type: 'link', label: parseMessageInline(linkMatch[1]), href });
        cursor += linkMatch[0].length;
        continue;
      }
    }
    let matched = false;
    for (const [delimiter, type] of [
      ['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em'],
    ] as const) {
      if (!source.startsWith(delimiter, cursor)) continue;
      const end = findClosing(source, delimiter, cursor + delimiter.length);
      if (end <= cursor + delimiter.length) continue;
      result.push({ type, children: parseMessageInline(source.slice(cursor + delimiter.length, end)) });
      cursor = end + delimiter.length;
      matched = true;
      break;
    }
    if (matched) continue;
    if (source[cursor] === '\\' && source[cursor + 1]) {
      appendText(result, source[cursor + 1]);
      cursor += 2;
      continue;
    }
    appendText(result, source[cursor]);
    cursor += 1;
  }
  return result;
}

function isBlockStarter(line: string): boolean {
  return /^\s*(?:#{1,6}\s|```|\$\$|\\\[|>|[-*+]\s|\d+\.\s)/.test(line);
}

export function parseMessageMarkdown(source: string): MessageBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MessageBlock[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      cursor += 1;
      continue;
    }
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      cursor += 1;
      const code: string[] = [];
      while (cursor < lines.length && !/^\s*```\s*$/.test(lines[cursor])) code.push(lines[cursor++]);
      if (cursor < lines.length) cursor += 1;
      blocks.push({ type: 'code', language: fence[1] ?? '', value: code.join('\n') });
      continue;
    }
    const displayMath = line.match(/^\s*\$\$\s*(.*?)\s*\$\$\s*$/);
    if (displayMath) {
      blocks.push({ type: 'math', value: displayMath[1] });
      cursor += 1;
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line) || /^\s*\\\[\s*$/.test(line)) {
      const close = /^\s*\$\$\s*$/.test(line) ? /^\s*\$\$\s*$/ : /^\s*\\\]\s*$/;
      cursor += 1;
      const math: string[] = [];
      while (cursor < lines.length && !close.test(lines[cursor])) math.push(lines[cursor++]);
      if (cursor < lines.length) cursor += 1;
      blocks.push({ type: 'math', value: math.join('\n') });
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseMessageInline(heading[2]) });
      cursor += 1;
      continue;
    }
    if (/^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:-\s*){3,}$/.test(line)) {
      blocks.push({ type: 'rule' });
      cursor += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (cursor < lines.length && /^\s*>/.test(lines[cursor])) {
        quote.push(lines[cursor++].replace(/^\s*>\s?/, ''));
      }
      blocks.push({ type: 'blockquote', children: parseMessageInline(quote.join('\n')) });
      continue;
    }
    const list = line.match(/^\s*((?:[-*+])|(?:\d+\.))\s+(.+)$/);
    if (list) {
      const ordered = /\d+\./.test(list[1]);
      const items: MessageInline[][] = [];
      while (cursor < lines.length) {
        const item = lines[cursor].match(/^\s*((?:[-*+])|(?:\d+\.))\s+(.+)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        items.push(parseMessageInline(item[2]));
        cursor += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [line];
    cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() && !isBlockStarter(lines[cursor])) {
      paragraph.push(lines[cursor++]);
    }
    blocks.push({ type: 'paragraph', children: parseMessageInline(paragraph.join('\n')) });
  }
  return blocks;
}
