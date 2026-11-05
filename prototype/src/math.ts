import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', { InputJax: new TeX(), OutputJax: new SVG({ fontCache: 'none' }) });
const cache = new Map<string, string>();
export function renderMath(latex: string) {
  if (!cache.has(latex)) cache.set(latex, adaptor.outerHTML(document.convert(latex, { display: false })));
  return cache.get(latex)!;
}
