import { useLayoutEffect, useRef, useState } from 'react';
import type { Formula } from './model';
import { MathView } from './MathView';

export type FormulaAnchor = { id: string; side: 'en' | 'ru' };
export function FormulaPopover({ formula, anchor, onClose, onChange, onRepair }: {
  formula: Formula; anchor: FormulaAnchor; onClose: () => void;
  onChange: (changes: Partial<Formula>) => void; onRepair: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const target = document.querySelector<HTMLElement>('[data-formula="' + anchor.id + '"][data-side="' + anchor.side + '"]');
      const popup = ref.current;
      if (!target || !popup) { setPosition(null); return; }
      const a = target.getBoundingClientRect();
      const panel = target.closest('.pdf-panel, .translation-panel')!.getBoundingClientRect();
      if (a.bottom < panel.top || a.top > panel.bottom || a.right < panel.left || a.left > panel.right) {
        setPosition(null); return;
      }
      const gap = 9, width = popup.offsetWidth, height = popup.offsetHeight;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, a.left));
      let top = a.bottom + gap;
      if (top + height > window.innerHeight - 12) top = a.top - height - gap;
      top = Math.max(12, Math.min(window.innerHeight - height - 12, top));
      setPosition({ left, top });
    };
    update();
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest('[data-formula]')) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('pointerdown', outside);
    };
  }, [anchor.id, anchor.side, formula, onClose]);

  return <aside ref={ref} className="formula-popover" role="dialog" aria-label="Чтение формулы"
    data-popup-for={formula.id}
    style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
    <div className="dialog-head"><h3>Как прочитать</h3><button aria-label="Закрыть формулу" onClick={onClose}>×</button></div>
    <MathView latex={formula.latex} />
    <p lang="en">{formula.spoken}</p>
    <details><summary>Изменить формулу и чтение</summary>
      <label>LaTeX<input aria-label="LaTeX" value={formula.latex} onChange={e => onChange({ latex: e.target.value })} /></label>
      <label>Английское чтение<textarea aria-label="Английское чтение" value={formula.spoken} onChange={e => onChange({ spoken: e.target.value })} /></label>
    </details>
    <button onClick={onRepair}>Исправить область формулы</button>
  </aside>;
}
