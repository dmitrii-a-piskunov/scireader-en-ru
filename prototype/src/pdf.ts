import { GlobalWorkerOptions, getDocument, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canonical, type Region } from './model';
GlobalWorkerOptions.workerSrc = workerUrl;
let documentPromise: Promise<PDFDocumentProxy> | undefined;
export function loadPdf() {
  return documentPromise ??= getDocument({ url: new URL('sample.pdf', window.location.href).href }).promise;
}
export type Character = { node: Text; offset: number; end: number };
export type PageText = { page: number; layer: HTMLDivElement; text: string; chars: Character[] };
export { TextLayer };

export function indexPage(page: number, layer: HTMLDivElement): PageText {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const chars: Character[] = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    let offset = 0;
    for (const character of node.data) {
      const clean = canonical(character);
      for (const c of clean) {
        text += c;
        chars.push({ node, offset, end: offset + character.length });
      }
      offset += character.length;
    }
  }
  return { page, layer, text, chars };
}
export function regionsForText(pages: PageText[], source: string): Region[] {
  const query = canonical(source);
  // Match within each page. Cross-page matching is intentionally not implemented
  // in this first fixture; unmatched spans are reported instead of guessed.
  for (const page of pages) {
    const start = page.text.indexOf(query);
    if (start < 0 || !query) continue;
    return regionsForRange(page, start, start + query.length);
  }
  return [];
}
export function regionsForRange(page: PageText, start: number, end: number): Region[] {
  const a = page.chars[start], b = page.chars[end - 1];
  if (!a || !b) return [];
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.end);
  const bounds = page.layer.getBoundingClientRect();
  const regions = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({
    page: page.page, x: (r.left - bounds.left) / bounds.width,
    y: (r.top - bounds.top) / bounds.height, width: r.width / bounds.width, height: r.height / bounds.height,
  }));
  // Range rectangles may be adjacent pieces of a printed line.
  const result: Region[] = [];
  for (const r of regions) {
    const prev = result.at(-1);
    if (prev && Math.abs(prev.y - r.y) < .003 && Math.abs(prev.height - r.height) < .005 && r.x <= prev.x + prev.width + .015 && r.x >= prev.x) {
      prev.width = Math.max(prev.width, r.x + r.width - prev.x);
    } else result.push({ ...r });
  }
  return result;
}
