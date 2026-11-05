import fixture from './fixture.json';
export type Region = { page: number; x: number; y: number; width: number; height: number };
export type Formula = { id: string; latex: string; spoken: string; region: Region };
export type Segment = { id: number; en: string; ru: string; formulas: Formula[] };
const region = (page: number, x: number, y: number, width: number, height: number): Region =>
  ({ page, x, y, width, height });

// Prepared initial regions, not automatic formula recognition.
// Fractions of the unrotated page, top-left origin.
const display: Record<number, Formula> = {
  16: { id: 'objective', latex: '\\sum_{t=0}^{\\infty}\\gamma^t r(s(t),a(t))', spoken: 'The sum from t equals zero to infinity of gamma to the power t, times r of s of t and a of t.', region: region(4, .543, .670, .134, .039) },
  28: { id: 'bellman', latex: "Q(s,a)=r(s,a)+\\gamma\\max_a Q(s',a)", spoken: 'Q of s and a equals r of s and a plus gamma times the maximum over a of Q of s prime and a.', region: region(5, .485, .528, .250, .033) },
  33: { id: 'loss', latex: "L=\\left(r+\\gamma\\max_{a'}Q(s',a';\\theta')-Q(s,a;\\theta)\\right)^2", spoken: 'L equals the quantity r plus gamma times the maximum over a prime of Q of s prime, a prime, theta prime, minus Q of s, a, theta, all squared.', region: region(5, .451, .663, .322, .041) },
  38: { id: 'sarsa', latex: "Q(s,a)=Q(s,a)+\\alpha[R+\\gamma Q(s',a')-Q(s,a)]", spoken: 'Q of s and a equals Q of s and a plus alpha times the quantity R plus gamma Q of s prime and a prime minus Q of s and a.', region: region(5, .435, .796, .351, .026) },
};
// Correct a known extraction error in the prepared HTML (zero instead of prime).
export const segments: Segment[] = fixture.map(s => ({ ...s, en: s.id === 40 ? s.en.replace(/a0/g, 'a′').replace(/s0/g, 's′') : s.en, formulas: display[s.id] ? [display[s.id]] : [] }));
segments.find(s => s.id === 9)!.formulas.push({
  id: 'state', latex: 's(t)', spoken: 's of t',
  region: region(4, .6, .43, .04, .016),
});
export const canonical = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function formulaFor(id: number) { return display[id]; }
