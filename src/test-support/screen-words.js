/**
 * Counting what a rendered screen says, for the "copy budget" tests: each screen's words are capped,
 * so the next feature can't quietly make it heavier again.
 *
 * A word is a stretch of non-space characters with a letter or a digit in it (the audit's own
 * measure). What counts is what a diver can read: the text of every <Text>, and a text field's
 * placeholder while it is empty. Anything inside a closed Disclosure isn't rendered, so it isn't
 * counted: that is the point of putting an explanation behind one.
 */

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** How many words are in a piece of text. */
export function countWords(text) {
  return String(text)
    .split(/\s+/)
    .filter((word) => HAS_LETTER_OR_DIGIT.test(word)).length;
}

function flatten(node) {
  if (typeof node === 'string') return node;
  if (!node || !node.children) return '';
  return node.children.map(flatten).join('');
}

/**
 * The separate pieces of text on a screen, in reading order (toJSON() of a react-test-renderer tree).
 * A text field's example text (its placeholder) is left out unless asked for, as in the audit that set the
 * budgets: it is not copy the screen explains itself with, and it goes as soon as the diver types.
 */
export function screenTexts(json, { placeholders = false } = {}) {
  const out = [];
  const walk = (node) => {
    if (node == null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'Text') {
      out.push(flatten(node));
      return;
    }
    if (node.type === 'TextInput') {
      if (placeholders && !node.props.value && node.props.placeholder) out.push(String(node.props.placeholder));
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(json);
  return out;
}

/** Every word the screen shows. */
export function screenWords(json, options) {
  return screenTexts(json, options).reduce((sum, text) => sum + countWords(text), 0);
}

/** How many times a piece of text is on the screen as a whole text of its own. */
export function timesShown(json, text) {
  return screenTexts(json).filter((shown) => shown.trim() === text).length;
}

/** The texts of the headings on the screen (what a screen reader can jump between). */
export function headingTexts(json) {
  const out = [];
  const walk = (node) => {
    if (node == null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'Text' && node.props.accessibilityRole === 'header') out.push(flatten(node).trim());
    (node.children ?? []).forEach(walk);
  };
  walk(json);
  return out;
}
