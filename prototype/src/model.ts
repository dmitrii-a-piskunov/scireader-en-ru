import fixture from './fixture.json';

export type Region = { page: number; x: number; y: number; width: number; height: number };
export type Formula = {
  id: string; segmentId: number; latex: string; spoken: string;
  source?: string; translation?: string;
  region: Region; regions?: Region[];
};
export type Segment = { id: number; en: string; ru: string; formulas: Formula[] };
export type FormulaSpan = { start: number; end: number; formula: Formula };
const region = (page: number, x: number, y: number, width: number, height: number): Region =>
  ({ page, x, y, width, height });

// Initial display-equation regions are prepared fixtures, not formula recognition.
const display: Record<number, Formula> = {
  16: { id: 'objective', segmentId: 16, latex: '\\sum_{t=0}^{\\infty}\\gamma^t r(s(t),a(t))', spoken: 'The sum from t equals zero to infinity of gamma to the power t, times r of s of t and a of t.', region: region(4, .543, .670, .134, .039) },
  28: { id: 'bellman', segmentId: 28, latex: "Q(s,a)=r(s,a)+\\gamma\\max_a Q(s',a)", spoken: 'Q of s and a equals r of s and a plus gamma times the maximum over a of Q of s prime and a.', region: region(5, .485, .528, .250, .033) },
  33: { id: 'loss', segmentId: 33, latex: "L=\\left(r+\\gamma\\max_{a'}Q(s',a';\\theta')-Q(s,a;\\theta)\\right)^2", spoken: 'L equals the quantity r plus gamma times the maximum over a prime of Q of s prime, a prime, theta prime, minus Q of s, a, theta, all squared.', region: region(5, .451, .663, .322, .041) },
  38: { id: 'sarsa', segmentId: 38, latex: "Q(s,a)=Q(s,a)+\\alpha[R+\\gamma Q(s',a')-Q(s,a)]", spoken: 'Q of s and a equals Q of s and a plus alpha times the quantity R plus gamma Q of s prime and a prime minus Q of s and a.', region: region(5, .435, .796, .351, .026) },
};

const inlineSpecs = [
  {
    "segmentId": 9,
    "id": "state",
    "source": "s(t)",
    "translation": "s(t)",
    "latex": "s(t)",
    "spoken": "s of t"
  },
  {
    "segmentId": 9,
    "id": "time",
    "source": "t",
    "translation": "t",
    "latex": "t",
    "spoken": "t"
  },
  {
    "segmentId": 9,
    "id": "action",
    "source": "a(t)",
    "translation": "a(t)",
    "latex": "a(t)",
    "spoken": "a of t"
  },
  {
    "segmentId": 9,
    "id": "next-state",
    "source": "s(t + 1)",
    "translation": "s(t + 1)",
    "latex": "s(t+1)",
    "spoken": "s of t plus one"
  },
  {
    "segmentId": 10,
    "id": "next-reward",
    "source": "r (t + 1)",
    "translation": "r(t + 1)",
    "latex": "r(t+1)",
    "spoken": "r of t plus one"
  },
  {
    "segmentId": 17,
    "id": "weight-gamma",
    "source": "γ",
    "translation": "γ",
    "latex": "\\gamma",
    "spoken": "gamma"
  },
  {
    "segmentId": 21,
    "id": "mdp-tuple",
    "source": "⟨S, A, r, T, γ⟩",
    "translation": "⟨S, A, r, T, γ⟩",
    "latex": "\\langle S,A,r,T,\\gamma\\rangle",
    "spoken": "the tuple S, A, r, T, gamma"
  },
  {
    "segmentId": 21,
    "id": "mdp-states",
    "source": "S",
    "translation": "S",
    "latex": "S",
    "spoken": "capital S"
  },
  {
    "segmentId": 21,
    "id": "mdp-actions",
    "source": "A",
    "translation": "A",
    "latex": "A",
    "spoken": "capital A"
  },
  {
    "segmentId": 21,
    "id": "reward-map",
    "source": "r, S × A → R",
    "translation": "r, S × A → R",
    "latex": "r: S\\times A\\to R",
    "spoken": "r maps S cross A to capital R"
  },
  {
    "segmentId": 21,
    "id": "transition-map",
    "source": "T : S × A × S → R",
    "translation": "T : S × A × S → R",
    "latex": "T: S\\times A\\times S\\to R",
    "spoken": "capital T maps S cross A cross S to capital R"
  },
  {
    "segmentId": 21,
    "id": "discount-gamma",
    "source": "γ",
    "translation": "γ",
    "latex": "\\gamma",
    "spoken": "gamma"
  },
  {
    "segmentId": 27,
    "id": "action-value",
    "source": "Q(s, a)",
    "translation": "Q(s, a)",
    "latex": "Q(s,a)",
    "spoken": "Q of s and a"
  },
  {
    "segmentId": 29,
    "id": "given-state",
    "source": "s",
    "translation": "s",
    "latex": "s",
    "spoken": "s"
  },
  {
    "segmentId": 30,
    "id": "discount-factor",
    "source": "γ",
    "translation": "γ",
    "latex": "\\gamma",
    "spoken": "gamma"
  },
  {
    "segmentId": 40,
    "id": "next-action",
    "source": "a′",
    "translation": "a′",
    "latex": "a'",
    "spoken": "a prime"
  },
  {
    "segmentId": 40,
    "id": "state-prime",
    "source": "s′",
    "translation": "s′",
    "latex": "s'",
    "spoken": "s prime"
  }
];
export const segments: Segment[] = fixture.map(s => ({
  ...s,
  // Repair known transcription errors in the prepared HTML, preserving the original file.
  en: s.en.replace(/a0/g, 'a′').replace(/s0/g, 's′').replace('hS, A, r, T, γi', '⟨S, A, r, T, γ⟩'),
  formulas: display[s.id] ? [display[s.id]] : inlineSpecs.filter(f => f.segmentId === s.id).map(f => ({
    ...f, region: region(0, 0, 0, 0, 0),
  })),
}));
export const canonical = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function formulaFor(id: number) { return display[id]; }
export function formulaRegions(f: Formula): Region[] {
  return f.regions ?? (f.region.width > 0 ? [f.region] : []);
}

// Tag longer expressions before individual letters, so the t inside s(t) is not
// accidentally tagged as the separate time-step variable.
export function formulaSpans(segment: Segment, side: 'en' | 'ru'): FormulaSpan[] {
  const text = segment[side], found: FormulaSpan[] = [];
  const specs = [...segment.formulas].filter(f => f.source).sort((a, b) =>
    (side === 'en' ? b.source!.length - a.source!.length : b.translation!.length - a.translation!.length));
  for (const formula of specs) {
    const token = side === 'en' ? formula.source! : formula.translation!;
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(token, from);
      if (start < 0) break;
      const end = start + token.length;
      const overlaps = found.some(f => start < f.end && end > f.start);
      const wordBoundary = token.length > 1 || !/[\p{L}\p{N}]/u.test((text[start - 1] ?? '') + (text[end] ?? ''));
      if (!overlaps && wordBoundary) { found.push({ start, end, formula }); break; }
      from = end;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
