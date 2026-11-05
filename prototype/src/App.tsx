import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PdfPage } from './PdfPage';
import { regionsForRange, regionsForText, type PageText } from './pdf';
import { canonical, formulaFor, formulaRegions, formulaSpans, segments, type Formula, type Region, type Segment } from './model';
import { MathView } from './MathView';
import { FormulaPopover, type FormulaAnchor } from './FormulaPopover';

type Repair = { kind: 'segment'; id: number } | { kind: 'formula'; id: string };
type Connector = { d: string; width: number; height: number };
type Side = 'en' | 'ru';

function Translation({ segment, formulas, onOpen }: {
  segment: Segment; formulas: Formula[]; onOpen: (anchor: FormulaAnchor) => void;
}) {
  const formulaButton = (formula: Formula) => {
    const current = formulas.find(f => f.id === formula.id)!;
    return <button key={formula.id} className="formula-inline" data-formula={formula.id} data-side="ru"
      title={current.spoken} aria-label={'Чтение формулы ' + formula.id}
      onClick={event => { event.stopPropagation(); onOpen({ id: formula.id, side: 'ru' }); }}>
      <MathView latex={current.latex} />
    </button>;
  };
  const display = formulaFor(segment.id);
  if (display) return formulaButton(display);
  const parts: React.ReactNode[] = [];
  let position = 0;
  for (const span of formulaSpans(segment, 'ru')) {
    parts.push(segment.ru.slice(position, span.start), formulaButton(span.formula));
    position = span.end;
  }
  parts.push(segment.ru.slice(position));
  return <>{parts}</>;
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
  const [formulaAnchor, setFormulaAnchor] = useState<FormulaAnchor | null>(null);
  const editedFormulaRegions = useRef(new Set<string>());
  const [repair, setRepair] = useState<Repair | null>(null);
  const [draft, setDraft] = useState<Region[]>([]);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [scrollAnchor, setScrollAnchor] = useState<number | null>(null);
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null), gutter = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const expectedScroll = useRef(new Map<HTMLElement, number>());
  const connectorFrame = useRef(0);
  const suppressHover = useRef(false);
  const initialPositioned = useRef(false);
  const loaded = pages.length === 3;
  const onReady = useCallback((data: PageText) => {
    setPages(prev => [...prev.filter(p => p.page !== data.page), data].sort((a, b) => a.page - b.page));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const next: Record<number, Region[]> = {};
    const formulaMatches = new Map<string, Region[]>();
    for (const segment of segments) {
      if (formulaFor(segment.id)) continue;
      next[segment.id] = regionsForText(pages, segment.en);
      const query = canonical(segment.en);
      const page = pages.find(p => p.text.includes(query));
      if (!page) continue;
      const sentenceStart = page.text.indexOf(query);
      for (const span of formulaSpans(segment, 'en')) {
        const start = sentenceStart + canonical(segment.en.slice(0, span.start)).length;
        const end = sentenceStart + canonical(segment.en.slice(0, span.end)).length;
        formulaMatches.set(span.formula.id, regionsForRange(page, start, end));
      }
    }
    setMapped(next);
    setFormulas(prev => prev.map(f => {
      const rs = formulaMatches.get(f.id);
      return rs?.length && !editedFormulaRegions.current.has(f.id) ? { ...f, region: rs[0], regions: rs } : f;
    }));
  }, [pages, loaded]);

  const regions = useMemo(() => {
    const rs: Record<number, Region[]> = { ...mapped };
    for (const segment of segments) {
      const display = formulaFor(segment.id);
      if (display) rs[segment.id] = formulaRegions(formulas.find(f => f.id === display.id)!);
    }
    Object.assign(rs, manual);
    if (repair?.kind === 'segment' && draft.length) rs[repair.id] = draft;
    return rs;
  }, [mapped, manual, formulas, repair, draft]);
  const visibleFormulas = useMemo(() => formulas.map(f =>
    repair?.kind === 'formula' && repair.id === f.id && draft.length ? { ...f, region: draft[0], regions: draft } : f), [formulas, repair, draft]);
  const chosenFormula = formulas.find(f => f.id === formulaAnchor?.id);
  const matchedCount = segments.filter(s => regions[s.id]?.length).length;
  const unmatched = segments.filter(s => !regions[s.id]?.length);

  const sourceBounds = useCallback((id: number) => {
    const first = regions[id]?.[0];
    if (!first) return null;
    const element = left.current?.querySelector<HTMLElement>('[data-page="' + first.page + '"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top + first.y * rect.height, bottom: rect.top + (first.y + first.height) * rect.height };
  }, [regions]);
  const translationBounds = useCallback((id: number) =>
    right.current?.querySelector<HTMLElement>('[data-segment="' + id + '"] .translation-body')?.getBoundingClientRect(), []);

  const updateConnector = useCallback(() => {
    if (active === null || !gutter.current || !left.current || !right.current) { setConnector(null); return; }
    const a = sourceBounds(active), b = translationBounds(active);
    const g = gutter.current.getBoundingClientRect();
    const l = left.current.getBoundingClientRect(), r = right.current.getBoundingClientRect();
    if (!a || !b || a.bottom < l.top || a.top > l.bottom || b.bottom < r.top || b.top > r.bottom) { setConnector(null); return; }
    const clamp = (y: number) => Math.max(0, Math.min(g.height, y - g.top));
    const a1 = clamp(a.top), a2 = clamp(a.bottom), b1 = clamp(b.top), b2 = clamp(b.bottom);
    const mid = g.width / 2;
    setConnector({ width: g.width, height: g.height, d: 'M 0 ' + a1 + ' C ' + mid + ' ' + a1 + ', ' + mid + ' ' + b1 + ', ' + g.width + ' ' + b1 + ' L ' + g.width + ' ' + b2 + ' C ' + mid + ' ' + b2 + ', ' + mid + ' ' + a2 + ', 0 ' + a2 + ' Z' });
  }, [active, sourceBounds, translationBounds]);
  const scheduleConnector = useCallback(() => {
    cancelAnimationFrame(connectorFrame.current);
    connectorFrame.current = requestAnimationFrame(updateConnector);
  }, [updateConnector]);
  useEffect(() => {
    const resize = () => {
      if (screen.current) screen.current.style.setProperty('--reader-height', screen.current.clientHeight + 'px');
      scheduleConnector();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (screen.current) observer.observe(screen.current);
    return () => { observer.disconnect(); cancelAnimationFrame(connectorFrame.current); };
  }, [scheduleConnector]);

  const writeScroll = useCallback((element: HTMLElement, desired: number) => {
    const top = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, desired));
    expectedScroll.current.set(element, top);
    element.scrollTop = top;
    expectedScroll.current.set(element, element.scrollTop);
  }, []);
  const alignPair = useCallback((id: number, origin: Side) => {
    const a = sourceBounds(id), b = translationBounds(id);
    if (!a || !b || !left.current || !right.current) return;
    if (origin === 'en') writeScroll(right.current, right.current.scrollTop + b.top - a.top);
    else writeScroll(left.current, left.current.scrollTop + a.top - b.top);
    setScrollAnchor(id);
    scheduleConnector();
  }, [sourceBounds, translationBounds, writeScroll, scheduleConnector]);

  const select = useCallback((id: number, origin: Side = 'en') => {
    setSelected(id); setHovered(null);
    const l = left.current!, r = right.current!;
    const a = sourceBounds(id), b = translationBounds(id);
    const ensure = (element: HTMLElement, bounds: { top: number; bottom: number } | null | undefined) => {
      if (!bounds) return;
      const panel = element.getBoundingClientRect();
      if (bounds.top < panel.top + 16 || bounds.top > panel.bottom - 40)
        writeScroll(element, element.scrollTop + bounds.top - panel.top - 80);
    };
    if (linked) {
      const originPanel = origin === 'en' ? l : r;
      ensure(originPanel, origin === 'en' ? a : b);
      // A scroll-into-view event can arrive after the click. It belongs to this
      // selection, not to a new user scroll choosing a different anchor.
      expectedScroll.current.set(originPanel, originPanel.scrollTop);
      alignPair(id, origin);
    } else {
      ensure(l, a); ensure(r, b);
    }
    scheduleConnector();
  }, [linked, sourceBounds, translationBounds, writeScroll, alignPair, scheduleConnector]);

  // Re-align after PDF geometry is rebuilt, not on hover or popup changes.
  const restoreSelection = useRef<() => void>(() => {});
  restoreSelection.current = () => {
    if (loaded && selected !== null && linked) select(selected, 'en');
  };
  useEffect(() => restoreSelection.current(), [loaded, mapped]);

  // Start at the prepared excerpt, rather than unrelated text earlier on page 3.
  useEffect(() => {
    if (!loaded || !mapped[0]?.length || initialPositioned.current) return;
    initialPositioned.current = true;
    const a = sourceBounds(0), l = left.current!;
    if (a) writeScroll(l, l.scrollTop + a.top - l.getBoundingClientRect().top - 80);
    alignPair(0, 'en');
  }, [loaded, mapped, sourceBounds, writeScroll, alignPair]);

  const closeFormula = useCallback(() => setFormulaAnchor(null), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        suppressHover.current = true;
        setSelected(null); setHovered(null); setFormulaAnchor(null); setRepair(null); setDraft([]);
        window.getSelection()?.removeAllRanges();
        const focused = document.activeElement as HTMLElement | null;
        if (focused?.closest('.reader, .formula-popover, .selection-toolsbar')) focused.blur();
        return;
      }
      if ((event.target as HTMLElement).closest('input, textarea, select') || repair) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        suppressHover.current = true;
        select(Math.max(0, Math.min(41, (selected ?? -1) + (event.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, repair, select]);

  const hover = useCallback((id: number | null) => {
    if (!suppressHover.current || id === null) setHovered(id);
  }, []);
  const syncScroll = (source: HTMLDivElement) => {
    scheduleConnector();
    if (!linked || repair) return;
    const expected = expectedScroll.current.get(source);
    if (expected !== undefined && Math.abs(source.scrollTop - expected) < 1.5) return;
    expectedScroll.current.delete(source);
    const panel = source.getBoundingClientRect();
    const reference = panel.top + source.clientHeight * .25;
    const origin: Side = source === left.current ? 'en' : 'ru';
    const anchors = segments.flatMap(s => {
      const bounds = origin === 'en' ? sourceBounds(s.id) : translationBounds(s.id);
      if (!bounds || bounds.top < panel.top || bounds.top > panel.bottom) return [];
      return [{ id: s.id, distance: Math.abs(bounds.top - reference) }];
    }).sort((a, b) => a.distance - b.distance);
    if (anchors[0]) alignPair(anchors[0].id, origin);
  };
  const beginRepair = (target: Repair) => { setRepair(target); setDraft([]); setHovered(null); setFormulaAnchor(null); };
  const finishRepair = () => {
    if (!repair || !draft.length) return;
    if (repair.kind === 'segment') setManual(prev => ({ ...prev, [repair.id]: draft }));
    else {
      editedFormulaRegions.current.add(repair.id);
      setFormulas(prev => prev.map(f => f.id === repair.id ? { ...f, region: draft[0], regions: draft } : f));
    }
    setRepair(null); setDraft([]);
  };

  return <div className="app" onPointerMoveCapture={event => {
    if (event.movementX || event.movementY) suppressHover.current = false;
  }}>
    <header className="header">
      <div className="brand"><span className="brand-icon">Sr</span><div><h1>SciReader <span>EN–RU</span></h1><p>НАУЧНЫЕ СТАТЬИ · ПАРАЛЛЕЛЬНОЕ ЧТЕНИЕ</p></div></div>
      <span className="prototype-badge">Технический прототип</span>
    </header>
    <div className="article-bar"><div><span className="eyebrow">SENSORS · 2023 · ОБЗОР</span><h2>A Survey on Deep Reinforcement Learning Algorithms for Robotic Manipulation</h2><p>Han, Mulyana, Stankovic, Cheng · страницы 3–5</p></div><a href="./sample.pdf" target="_blank" rel="noreferrer">Открыть PDF ↗</a></div>
    <nav className="toolbar" aria-label="Инструменты чтения">
      <div className="toolbar-group">
        <button aria-pressed={linked} onClick={() => {
          expectedScroll.current.clear();
          if (!linked) alignPair(selected ?? scrollAnchor ?? 0, 'en');
          setLinked(v => !v);
        }}>↕ {linked ? 'Связанная прокрутка' : 'Независимая прокрутка'}</button>
        <label>Масштаб <select aria-label="Масштаб PDF" value={scale} onChange={event => { setFormulaAnchor(null); setPages([]); setScale(Number(event.target.value)); }}>
          {[.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s}>{s * 100}%</option>)}
        </select></label>
      </div>
      <div className="toolbar-group"><button aria-label="Предыдущее предложение" disabled={selected === 0} onClick={() => select(Math.max(0, (selected ?? 1) - 1))}>←</button><span>{selected === null ? 'Выберите предложение' : 'Фрагмент ' + (selected + 1) + ' / 42'}</span><button aria-label="Следующее предложение" disabled={selected === 41} onClick={() => select(Math.min(41, (selected ?? -1) + 1))}>→</button></div>
    </nav>
    <div className="selection-toolsbar">
      <span data-testid="selection-status">{selected === null ? 'Нажмите на предложение для выбора' : manual[selected] ? 'Привязка исправлена вручную' : 'Выбран фрагмент ' + (selected + 1)}</span>
      <button disabled={selected === null || !!repair} onClick={() => selected !== null && beginRepair({ kind: 'segment', id: selected })}>Исправить привязку</button>
      <button disabled={selected === null || !manual[selected]} onClick={() => setManual(prev => { const next = { ...prev }; if (selected !== null) delete next[selected]; return next; })}>Сбросить</button>
    </div>
    {repair && <div className="repair-bar" role="status"><span>Выделите прямоугольником текст в PDF. {repair.kind === 'segment' ? 'Можно добавить несколько областей.' : 'Для формулы используется одна область.'} Областей: {draft.length}</span><button disabled={!draft.length} onClick={finishRepair}>Применить привязку</button><button onClick={() => { setRepair(null); setDraft([]); }}>Отмена</button></div>}
    <div className="reader-head"><span>EN <b>Оригинал PDF</b><small>Исходная вёрстка</small></span><span>RU <b>Русский перевод</b><small>Подготовленный пример · не проверен</small></span></div>
    <div className="reader" ref={screen} data-sync-anchor={scrollAnchor ?? ''}>
      <div className="pdf-panel" ref={left} data-testid="pdf-panel" onScroll={event => syncScroll(event.currentTarget)}>
        {[3, 4, 5].map(page => <PdfPage key={page} page={page} scale={scale} regions={regions} active={active}
          formulas={visibleFormulas} repair={!!repair} onReady={onReady} onHover={hover} onSelect={id => select(id, 'en')}
          onFormula={id => setFormulaAnchor({ id, side: 'en' })}
          onRepair={r => setDraft(prev => repair?.kind === 'formula' ? [r] : [...prev, r])} />)}
      </div>
      <div className="gutter" ref={gutter} aria-hidden="true">{connector && <svg data-testid="connector" width={connector.width} height={connector.height}><path d={connector.d} /></svg>}</div>
      <div className="translation-panel" ref={right} data-testid="translation-panel" onScroll={event => syncScroll(event.currentTarget)}>
        <div className="translation-spacer" aria-hidden="true" />
        <div className="translation-intro"><span className="eyebrow">HOME READING 3</span><h3>От методов отбора к алгоритмам обучения</h3><p>Наведите на текст, чтобы увидеть соответствие. Нажмите на формулу для подсказки по чтению.</p></div>
        {segments.map(segment => <article key={segment.id} data-segment={segment.id}
          className={'segment ' + (active === segment.id ? 'is-active' : '') + (selected === segment.id ? ' is-selected' : '')}
          onMouseEnter={() => { if (!repair) hover(segment.id); }} onMouseMove={() => { if (!repair) hover(segment.id); }}
          onMouseLeave={() => hover(null)}>
          <div className="segment-text">
            <button className="segment-select" aria-label={'Выбрать фрагмент ' + (segment.id + 1)}
              aria-pressed={selected === segment.id} onClick={() => select(segment.id, 'ru')}>{String(segment.id + 1).padStart(2, '0')}</button>
            <div className="translation-body" onClick={event => {
              if (!(event.target as Element).closest('button') && !window.getSelection()?.toString()) select(segment.id, 'ru');
            }}><Translation segment={segment} formulas={formulas} onOpen={setFormulaAnchor} /></div>
          </div>
          {!regions[segment.id]?.length && loaded && <span className="unmatched">Нужна привязка</span>}
        </article>)}
        <div className="translation-end">Конец подготовленного отрывка</div>
        <div className="translation-spacer" aria-hidden="true" />
      </div>
    </div>
    {chosenFormula && formulaAnchor && <FormulaPopover formula={chosenFormula} anchor={formulaAnchor}
      onClose={closeFormula} onChange={changes => setFormulas(prev => prev.map(f => f.id === chosenFormula.id ? { ...f, ...changes } : f))}
      onRepair={() => beginRepair({ kind: 'formula', id: chosenFormula.id })} />}
    <footer><span role="status" data-testid="mapping-status">{loaded ? 'Связано ' + matchedCount + ' из 42 фрагментов' : 'Загрузка страниц и текстового слоя…'}</span><span>Изменения действуют до перезагрузки страницы · ← → переход · Esc снять выбор</span></footer>
    {loaded && unmatched.length > 0 && <details className="diagnostics"><summary>Не найдены: {unmatched.map(s => s.id + 1).join(', ')}</summary>{unmatched.map(s => <p key={s.id}>{s.id + 1}. {s.en}</p>)}</details>}
  </div>;
}
