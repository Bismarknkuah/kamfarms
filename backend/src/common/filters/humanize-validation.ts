/**
 * Turns the validator's technical sentences into plain ones a person can act on:
 *   "items.0.productId must be a UUID"  ->  "Item 1: choose a valid product."
 *   "bagCount must not be less than 1"  ->  "Bag count must be at least 1."
 * A message that is not in the validator's usual shape is passed through unchanged.
 */
const words = (camel: string) => camel.replace(/Id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
const singular = (w: string) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') ? w.slice(0, -1) : w);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function humanizeValidationMessage(message: string): string {
  const m = /^([A-Za-z_][\w]*(?:\.[\w]+)*) (must be .+|must not be .+|should not be .+|must contain .+|must match .+|is not .+)$/.exec(message);
  if (!m) return message;
  const segments = m[1].split('.');
  const field = segments[segments.length - 1];
  if (/^\d+$/.test(field)) return message;
  // "items.0" becomes "Item 1: "
  const parents: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    if (/^\d+$/.test(segments[i])) continue;
    const next = segments[i + 1];
    parents.push(/^\d+$/.test(next) ? `${cap(singular(words(segments[i])))} ${Number(next) + 1}` : cap(words(segments[i])));
  }
  const prefix = parents.length > 0 ? parents.join(', ') + ': ' : '';
  const name = words(field);
  const rule = m[2];
  let body: string;
  let r: RegExpExecArray | null;
  if (rule === 'must be a UUID') body = `choose a valid ${name}.`;
  else if (rule === 'should not be empty') body = `${name} is required.`;
  else if ((r = /^must not be less than (.+)$/.exec(rule))) body = `${name} must be at least ${r[1]}.`;
  else if ((r = /^must not be greater than (.+)$/.exec(rule))) body = `${name} must be at most ${r[1]}.`;
  else if (rule === 'must be a string') body = `${name} must be text.`;
  else if (rule === 'must be an integer number') body = `${name} must be a whole number.`;
  else if (rule.startsWith('must be a number')) body = `${name} must be a number.`;
  else if (rule === 'must be an email') body = `${name} must be a valid email address.`;
  else if ((r = /^must be one of the following values: (.+)$/.exec(rule))) body = `${name} must be one of: ${r[1]}.`;
  else body = `${name} ${rule}.`;
  return prefix ? cap(prefix) + body : cap(body);
}

export function humanizeValidationMessages(messages: unknown[]): string[] {
  return messages.map((m) => (typeof m === 'string' ? humanizeValidationMessage(m) : String(m)));
}
