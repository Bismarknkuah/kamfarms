/**
 * Reads the numbers out of a prediction question typed in plain words, for the built-in answerer (Claude, when connected, reads the
 * question itself). Careful rather than clever: it only answers when the question is clearly about milling and has a number and a
 * unit it understands, so an ordinary question that happens to contain "50 bags" is left alone.
 *
 *   "I milled 5 bags size 4, what should it give?"          -> 5 bags of paddy, grade Size 4
 *   "how much paddy and power for 100 bags of rice?"         -> 100 bags of packaged rice
 *   "what will 200 kWh give?"                                -> 200 kWh
 */
export interface YieldQuestion { paddy_bags?: number; rice_bags?: number; kwh?: number; grade?: string }

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const toNumber = (s: string) => Number(s.replace(/,/g, ''));
const ABOUT_MILLING = /(mill|recover|produc|yield|predict|expect|\bgive|\bneed|\bwant|how much|how many|kwh|kilowatt|electric|\bpower)/;

export function parseYieldQuestion(question: string): YieldQuestion | null {
  const q = question.toLowerCase();
  if (!ABOUT_MILLING.test(q)) return null;

  const out: YieldQuestion = {};
  const grade = q.match(/\bsize\s*(\d)\b/);
  if (grade) out.grade = `size ${grade[1]}`;

  const kwh = q.match(new RegExp(`${NUM}\\s*(?:kwh|kilowatt)`));
  if (kwh) {
    const amount = toNumber(kwh[1]);
    // "What does 1 kWh produce?" is the standing question with its own answer; only a specific amount (or a grade) is a calculation.
    if (amount === 1 && !out.grade) return null;
    return { ...out, kwh: amount };
  }

  // Bags of PADDY: "5 bags of paddy", "5 bags of Size 4", "5 bags size 4 paddy", before rice, because "paddy rice" means paddy.
  const paddy = q.match(new RegExp(`${NUM}\\s*bags?(?:\\s+of)?\\s+(?:size\\s*\\d\\s+)?paddy`)) ?? q.match(new RegExp(`${NUM}\\s*bags?(?:\\s+of)?\\s+size\\s*\\d`));
  if (paddy) return { ...out, paddy_bags: toNumber(paddy[1]) };

  // Bags of packaged RICE recovered or wanted.
  const rice = q.match(new RegExp(`${NUM}\\s*bags?(?:\\s+of)?\\s+(?:packaged\\s+|finished\\s+|polished\\s+|milled\\s+|recovered\\s+)?rice\\b`));
  if (rice) return { ...out, rice_bags: toNumber(rice[1]) };

  // "milled 5 bags" or "sent 5 bags to the mill": people mill paddy.
  const milled = q.match(new RegExp(`(?:milled|milling|mill|processed|sent)\\s+(?:about\\s+|around\\s+)?${NUM}\\s*bags?`));
  if (milled) return { ...out, paddy_bags: toNumber(milled[1]) };

  return null;
}
