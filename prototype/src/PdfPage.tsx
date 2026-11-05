import { useEffect, useRef, useState } from 'react';
import { indexPage, loadPdf, TextLayer, type PageText } from './pdf';
import { formulaRegions, type Formula, type Region } from './model';
import 'pdfjs-dist/web/pdf_viewer.css';

type Props = {
  page: number; scale: number; regions: Record<number, Region[]>; active: number | null;
  formulas: Formula[]; repair: boolean;
  onReady: (data: PageText) => void;
  onSelect: (id: number) => void; onHover: (id: number | null) => void;
  onFormula: (id: string) => void; onRepair: (region: Region) => void;
};
export function PdfPage(props: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 595, height: 842 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState<Region | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const callback = useRef(props.onReady);
  callback.current = props.onReady;
  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void } | undefined;
    let text: TextLayer | undefined;
    setReady(false);
    setError('');
    (async () => {
      const pdf = await loadPdf();
      const page = await pdf.getPage(props.page);
      const viewport = page.getViewport({ scale: props.scale });
      if (cancelled) return;
      setSize({ width: viewport.width, height: viewport.height });
      const el = canvas.current!, textEl = layer.current!;
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.floor(viewport.width * dpr);
      el.height = Math.floor(viewport.height * dpr);
      el.style.width = viewport.width + 'px'; el.style.height = viewport.height + 'px';
      textEl.replaceChildren();
      textEl.style.setProperty('--scale-factor', String(props.scale));
      textEl.style.setProperty('--total-scale-factor', String(props.scale));
      const task = page.render({ canvas: el, canvasContext: el.getContext('2d')!, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      render = task;
      text = new TextLayer({ textContentSource: await page.getTextContent(), container: textEl, viewport });
      await Promise.all([task.promise, text.render()]);
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (cancelled) return;
      callback.current(indexPage(props.page, textEl));
      setReady(true);
    })().catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; render?.cancel(); text?.cancel(); };
  }, [props.page, props.scale]);

  const point = (event: React.PointerEvent) => {
    const rect = wrapper.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const hit = (p: { x: number; y: number }) => {
    for (const [id, regions] of Object.entries(props.regions)) {
      if (regions.some(r => r.page === props.page && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height)) return Number(id);
    }
    return null;
  };
  const style = (r: Region) => ({ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%' });
  return <section className="page-section" aria-label={'Страница ' + props.page}>
    <div className="page-caption">SENSORS · СТРАНИЦА {props.page} / 35</div>
    <div className={'pdf-page ' + (props.repair ? 'repairing' : '')} ref={wrapper} data-page={props.page} data-ready={ready}
      style={{ width: size.width, height: size.height }}
      onPointerMove={e => {
        if (props.repair && start.current) {
          const p = point(e), a = start.current;
          setDrawing({ page: props.page, x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(a.x - p.x), height: Math.abs(a.y - p.y) });
        } else if (!props.repair) props.onHover(hit(point(e)));
      }}
      onPointerLeave={() => props.onHover(null)}
      onPointerDown={e => { if (props.repair && e.button === 0) { e.preventDefault(); start.current = point(e); setDrawing(null); e.currentTarget.setPointerCapture(e.pointerId); } }}
      onPointerUp={e => {
        if (props.repair && start.current) {
          const p = point(e), a = start.current;
          const r = { page: props.page, x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(a.x - p.x), height: Math.abs(a.y - p.y) };
          start.current = null; setDrawing(null);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          if (r.width > .005 && r.height > .003) props.onRepair(r);
        }
      }}
      onClick={e => { if (!props.repair && !window.getSelection()?.toString()) { const id = hit(point(e as unknown as React.PointerEvent)); if (id !== null) props.onSelect(id); } }}>
      <canvas ref={canvas} />
      <div className="textLayer" ref={layer} />
      <div className="highlight-layer">
        {Object.entries(props.regions).flatMap(([id, rs]) => rs.filter(r => r.page === props.page).map((r, i) =>
          <div key={id + '-' + i} data-region={id} className={'highlight ' + (Number(id) === props.active ? 'active' : '')} style={style(r)} />))}
        {drawing && <div className="draw-region" style={style(drawing)} />}
      </div>
      {!props.repair && props.formulas.flatMap(f => formulaRegions(f).filter(r => r.page === props.page).map((r, index) =>
        <button key={f.id + '-' + index} className="formula-hit" style={style(r)}
          data-formula={f.id} data-side="en" data-formula-region={index}
          title={f.spoken} aria-label={'Чтение формулы ' + f.id}
          onClick={event => { event.stopPropagation(); props.onFormula(f.id); }} />))}
      {error && <div role="alert" className="page-error">{error}</div>}
    </div>
  </section>;
}
