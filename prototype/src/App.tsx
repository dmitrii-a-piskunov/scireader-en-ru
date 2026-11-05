import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PdfPage } from './PdfPage';
import { regionsForRange, regionsForText, type PageText } from './pdf';
import { canonical, formulaFor, segments, type Formula, type Region } from './model';
import { renderMath } from './math';

type Repair = { kind: 'segment'; id: number } | { kind: 'formula'; id: string };
type Connector = { d: string; width: number; height: number };
function MathView({ latex }: { latex: string }) {
  const markup = useMemo(() => renderMath(latex), [latex]);
  return <span className="math" dangerouslySetInnerHTML={{ __html: markup }} />;
}
function RuText({ text }: { text: string }) {
  return <>{text.split(/(\\\([\s\S]*?\\\))/g).map((part, i) =>
    part.startsWith('\\(') ? <MathView key={i} latex={part.slice(2, -2)} /> : <span key={i}>{part}</span>)}</>;
}
export function App() {
  const [scale, setScale] = useState(1);
  const [linked, setLinked] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? selected;
  const [pages, setPages] = useState<PageText[]>([]);
  const [mapped, setMapped] = useState<Record<number, Region[]>>({});
  const [manual, setManual] = useState<Record<number, Region[]>>({});
  const [formulas, setFormulas] = useState<Formula[]>(segments.flatMap(s => s.formulas).map(f => ({ ...f, region: { ...f.region } })));
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const editedFormulaRegions = useRef(new Set<string>());
  const [repair, setRepair] = useState<Repair | null>(null);
  const [draft, setDraft] = useState<Region[]>([]);
  const [connector, setConnector] = useState<Connector | null>(null);
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null), gutter = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const ignoredScroll = useRef<{ element: HTMLElement; top: number } | null>(null);
  const connectorFrame = useRef(0);
  const loaded = pages.length === 3;
  const onReady = useCallback((data: PageText) => {
    setPages(prev => [...prev.filter(p => p.page !== data.page), data].sort((a, b) => a.page - b.page));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const next: Record<number, Region[]> = {};
    for (const s of segments) {
      if (formulaFor(s.id)) continue;
      const source = s.en.replace('hS, A, r, T, γi', 'S, A, r, T, γ');
      next[s.id] = regionsForText(pages, source);
    }
    setMapped(next);
    const page = pages.find(p => p.page === 4)!;
    const sentence = page.text.indexOf(canonical(segments.find(s => s.id === 9)!.en));
    if (sentence >= 0) {
      const offset = page.text.indexOf(canonical('s(t)'), sentence);
      const r = regionsForRange(page, offset, offset + canonical('s(t)').length)[0];
      if (r && !editedFormulaRegions.current.has('state')) setFormulas(prev => prev.map(f => f.id === 'state' ? { ...f, region: r } : f));
    }
  }, [pages, loaded]);
  const regions = useMemo(() => {
    const rs: Record<number, Region[]> = { ...mapped };
    for (const s of segments) {
      const display = formulaFor(s.id);
      if (display) rs[s.id] = [formulas.find(f => f.id === display.id)!.region];
    }
    Object.assign(rs, manual);
    if (repair?.kind === 'segment' && draft.length) rs[repair.id] = draft;
    return rs;
  }, [mapped, manual, formulas, repair, draft]);
  const visibleFormulas = useMemo(() => formulas.map(f =>
    repair?.kind === 'formula' && repair.id === f.id && draft.length ? { ...f, region: draft[0] } : f), [formulas, repair, draft]);
  const chosenFormula = formulas.find(f => f.id === formulaId);
  const matchedCount = segments.filter(s => regions[s.id]?.length).length;
  const unmatched = segments.filter(s => !regions[s.id]?.length);

  const sourceBounds = useCallback((id: number) => {
    const first = regions[id]?.[0];
    if (!first) return null;
    const element = left.current?.querySelector<HTMLElement>('[data-page="' + first.page + '"]');
    if (!element) return null;
    const pageRect = element.getBoundingClientRect();
    return { top: pageRect.top + first.y * pageRect.height, bottom: pageRect.top + (first.y + first.height) * pageRect.height };
  }, [regions]);
  const updateConnector = useCallback(() => {
    if (active === null || !gutter.current || !left.current || !right.current) { setConnector(null); return; }
    const a = sourceBounds(active);
    const b = right.current.querySelector<HTMLElement>('[data-segment="' + active + '"]')?.getBoundingClientRect();
    const g = gutter.current.getBoundingClientRect();
    const l = left.current.getBoundingClientRect(), r = right.current.getBoundingClientRect();
    if (!a || !b || a.bottom < l.top || a.top > l.bottom || b.bottom < r.top || b.top > r.bottom) { setConnector(null); return; }
    const clamp = (y: number) => Math.max(0, Math.min(g.height, y - g.top));
    const a1 = clamp(a.top), a2 = clamp(a.bottom), b1 = clamp(b.top), b2 = clamp(b.bottom);
    const mid = g.width / 2;
    setConnector({ width: g.width, height: g.height, d: 'M 0 ' + a1 + ' C ' + mid + ' ' + a1 + ', ' + mid + ' ' + b1 + ', ' + g.width + ' ' + b1 + ' L ' + g.width + ' ' + b2 + ' C ' + mid + ' ' + b2 + ', ' + mid + ' ' + a2 + ', 0 ' + a2 + ' Z' });
  }, [active, sourceBounds]);
  const scheduleConnector = useCallback(() => {
    cancelAnimationFrame(connectorFrame.current);
    connectorFrame.current = requestAnimationFrame(updateConnector);
  }, [updateConnector]);
  useEffect(() => {
    scheduleConnector();
    const observer = new ResizeObserver(scheduleConnector);
    if (screen.current) observer.observe(screen.current);
    return () => { observer.disconnect(); cancelAnimationFrame(connectorFrame.current); };
  }, [scheduleConnector, scale, formulaId, repair]);

  const select = useCallback((id: number) => {
    setSelected(id);
    const bounds = sourceBounds(id);
    const l = left.current!, r = right.current!;
    const card = r.querySelector<HTMLElement>('[data-segment="' + id + '"]');
    if (bounds && (bounds.top < l.getBoundingClientRect().top || bounds.bottom > l.getBoundingClientRect().bottom)) {
      const desired = l.scrollTop + bounds.top - l.getBoundingClientRect().top - 90;
      ignoredScroll.current = { element: l, top: Math.max(0, Math.min(l.scrollHeight - l.clientHeight, desired)) };
      l.scrollTop = ignoredScroll.current.top;
    }
    if (card) {
      const b = card.getBoundingClientRect(), p = r.getBoundingClientRect();
      if (b.top < p.top || b.bottom > p.bottom) {
        const desired = r.scrollTop + b.top - p.top - 90;
        ignoredScroll.current = { element: r, top: Math.max(0, Math.min(r.scrollHeight - r.clientHeight, desired)) };
        r.scrollTop = ignoredScroll.current.top;
      }
    }
    scheduleConnector();
  }, [sourceBounds, scheduleConnector]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected(null); setFormulaId(null); setRepair(null); setDraft([]); return; }
      if ((e.target as HTMLElement).closest('input, textarea, select') || repair) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); setHovered(null);
        select(Math.max(0, Math.min(41, (selected ?? -1) + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, repair, select]);

  const syncScroll = (source: HTMLDivElement) => {
    scheduleConnector();
    if (!linked || repair) return;
    if (ignoredScroll.current?.element === source && Math.abs(source.scrollTop - ignoredScroll.current.top) < 2) return;
    ignoredScroll.current = null;
    const target = source === left.current ? right.current! : left.current!;
    const lp = left.current!.getBoundingClientRect(), rp = right.current!.getBoundingClientRect();
    const anchors = segments.flatMap(s => {
      const a = sourceBounds(s.id);
      const b = right.current!.querySelector<HTMLElement>('[data-segment="' + s.id + '"]')?.getBoundingClientRect();
      if (!a || !b) return [];
      return [{ l: a.top - lp.top + left.current!.scrollTop, r: b.top - rp.top + right.current!.scrollTop }];
    });
    const from = source === left.current ? 'l' : 'r', to = from === 'l' ? 'r' : 'l';
    anchors.sort((a, b) => a[from] - b[from]);
    if (!anchors.length) return;
    const position = source.scrollTop + source.clientHeight * .25;
    let previous = anchors[0], next = anchors.at(-1)!;
    for (const anchor of anchors) {
      if (anchor[from] <= position) previous = anchor;
      if (anchor[from] >= position) { next = anchor; break; }
    }
    const distance = next[from] - previous[from];
    const ratio = distance > 0 ? Math.max(0, Math.min(1, (position - previous[from]) / distance)) : 0;
    const mappedTop = previous[to] + (next[to] - previous[to]) * ratio - target.clientHeight * .25;
    const top = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, mappedTop));
    ignoredScroll.current = { element: target, top };
    target.scrollTop = top;
  };
  const beginRepair = (target: Repair) => { setRepair(target); setDraft([]); setHovered(null); };
  const finishRepair = () => {
    if (!repair || !draft.length) return;
    if (repair.kind === 'segment') setManual(prev => ({ ...prev, [repair.id]: draft }));
    else { editedFormulaRegions.current.add(repair.id); setFormulas(prev => prev.map(f => f.id === repair.id ? { ...f, region: draft[0] } : f)); }
    setRepair(null); setDraft([]);
  };

  return <div className="app">
    <header className="header">
      <div className="brand"><span className="brand-icon">Sr</span><div><h1>SciReader <span>EN–RU</span></h1><p>НАУЧНЫЕ СТАТЬИ · ПАРАЛЛЕЛЬНОЕ ЧТЕНИЕ</p></div></div>
      <span className="prototype-badge">Технический прототип</span>
    </header>
    <div className="article-bar"><div><span className="eyebrow">SENSORS · 2023 · ОБЗОР</span><h2>A Survey on Deep Reinforcement Learning Algorithms for Robotic Manipulation</h2><p>Han, Mulyana, Stankovic, Cheng · страницы 3–5</p></div><a href="./sample.pdf" target="_blank" rel="noreferrer">Открыть PDF ↗</a></div>
    <nav className="toolbar" aria-label="Инструменты чтения">
      <div className="toolbar-group">
        <button aria-pressed={linked} onClick={() => { setLinked(v => !v); ignoredScroll.current = null; }}>↕ {linked ? 'Связанная прокрутка' : 'Независимая прокрутка'}</button>
        <label>Масштаб <select aria-label="Масштаб PDF" value={scale} onChange={e => { setPages([]); setScale(Number(e.target.value)); }}>
          {[.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s}>{s * 100}%</option>)}
        </select></label>
      </div>
      <div className="toolbar-group"><button aria-label="Предыдущее предложение" disabled={selected === 0} onClick={() => select(Math.max(0, (selected ?? 1) - 1))}>←</button><span>{selected === null ? 'Выберите предложение' : 'Фрагмент ' + (selected + 1) + ' / 42'}</span><button aria-label="Следующее предложение" disabled={selected === 41} onClick={() => select(Math.min(41, (selected ?? -1) + 1))}>→</button></div>
    </nav>
    {repair && <div className="repair-bar" role="status"><span>Выделите прямоугольником текст в PDF. {repair.kind === 'segment' ? 'Можно добавить несколько областей.' : 'Для формулы используется одна область.'} Областей: {draft.length}</span><button disabled={!draft.length} onClick={finishRepair}>Применить привязку</button><button onClick={() => { setRepair(null); setDraft([]); }}>Отмена</button></div>}
    <div className="reader-head"><span>EN <b>Оригинал PDF</b><small>Исходная вёрстка</small></span><span>RU <b>Русский перевод</b><small>Подготовленный пример · не проверен</small></span></div>
    <div className="reader" ref={screen}>
      <div className="pdf-panel" ref={left} data-testid="pdf-panel" onScroll={e => syncScroll(e.currentTarget)}>
        {[3, 4, 5].map(page => <PdfPage key={page} page={page} scale={scale} regions={regions} active={active} formulas={visibleFormulas} repair={!!repair} onReady={onReady} onHover={setHovered} onSelect={select} onFormula={setFormulaId} onRepair={r => setDraft(prev => repair?.kind === 'formula' ? [r] : [...prev, r])} />)}
      </div>
      <div className="gutter" ref={gutter} aria-hidden="true">{connector && <svg data-testid="connector" width={connector.width} height={connector.height}><path d={connector.d} /></svg>}</div>
      <div className="translation-panel" ref={right} data-testid="translation-panel" onScroll={e => syncScroll(e.currentTarget)}>
        <div className="translation-intro"><span className="eyebrow">HOME READING 3</span><h3>От методов отбора к алгоритмам обучения</h3><p>Наведите на текст, чтобы увидеть соответствие. Нажмите на предложение для навигации и исправления привязки.</p></div>
        {segments.map(s => <article key={s.id} data-segment={s.id} className={'segment ' + (active === s.id ? 'is-active' : '') + (selected === s.id ? ' is-selected' : '')}
          onMouseEnter={() => { if (!repair) setHovered(s.id); }} onMouseLeave={() => setHovered(null)}>
          <button className="segment-text" aria-label={'Выбрать фрагмент ' + (s.id + 1)} aria-pressed={selected === s.id} onClick={() => select(s.id)}>
            <span className="segment-number">{String(s.id + 1).padStart(2, '0')}</span><span>{formulaFor(s.id) ? <MathView latex={formulas.find(f => f.id === formulaFor(s.id)!.id)!.latex} /> : <RuText text={s.ru} />}</span>
          </button>
          {s.formulas.map(f => <button className="formula-chip" key={f.id} title={formulas.find(x => x.id === f.id)!.spoken} onClick={() => { select(s.id); setFormulaId(f.id); }}>{f.id === 'state' && <MathView latex={formulas.find(x => x.id === f.id)!.latex} />} ƒ Как прочитать</button>)}
          {!regions[s.id]?.length && loaded && <span className="unmatched">Нужна привязка</span>}
          {selected === s.id && <div className="segment-tools"><span>{manual[s.id] ? 'Привязка исправлена вручную' : formulaFor(s.id) ? 'Область задана в примере' : regions[s.id]?.length ? 'Совпадение по тексту' : 'Совпадение не найдено'}</span><button onClick={() => beginRepair({ kind: 'segment', id: s.id })}>Исправить привязку</button>{manual[s.id] && <button onClick={() => setManual(prev => { const next = { ...prev }; delete next[s.id]; return next; })}>Сбросить</button>}</div>}
        </article>)}
        <div className="translation-end">Конец подготовленного отрывка</div>
      </div>
    </div>
    {chosenFormula && <aside className="formula-dialog" role="dialog" aria-label="Чтение формулы">
      <div className="dialog-head"><h3>Чтение формулы</h3><button aria-label="Закрыть формулу" onClick={() => setFormulaId(null)}>×</button></div>
      <MathView latex={chosenFormula.latex} />
      <p lang="en">{chosenFormula.spoken}</p>
      <details><summary>Изменить формулу и чтение</summary>
        <label>LaTeX<input aria-label="LaTeX" value={chosenFormula.latex} onChange={e => setFormulas(prev => prev.map(f => f.id === formulaId ? { ...f, latex: e.target.value } : f))} /></label>
        <label>Английское чтение<textarea aria-label="Английское чтение" value={chosenFormula.spoken} onChange={e => setFormulas(prev => prev.map(f => f.id === formulaId ? { ...f, spoken: e.target.value } : f))} /></label>
      </details>
      <button onClick={() => { beginRepair({ kind: 'formula', id: chosenFormula.id }); setFormulaId(null); }}>Исправить область формулы</button>
    </aside>}
    <footer><span role="status" data-testid="mapping-status">{loaded ? 'Связано ' + matchedCount + ' из 42 фрагментов' : 'Загрузка страниц и текстового слоя…'}</span><span>Изменения действуют до перезагрузки страницы · ← → переход · Esc снять выбор</span></footer>
    {loaded && unmatched.length > 0 && <details className="diagnostics"><summary>Не найдены: {unmatched.map(s => s.id + 1).join(', ')}</summary>{unmatched.map(s => <p key={s.id}>{s.id + 1}. {s.en}</p>)}</details>}
  </div>;
}
