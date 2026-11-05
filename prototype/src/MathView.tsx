import { useMemo } from 'react';
import { renderMath } from './math';
export function MathView({ latex }: { latex: string }) {
  const markup = useMemo(() => renderMath(latex), [latex]);
  return <span className="math" dangerouslySetInnerHTML={{ __html: markup }} />;
}
