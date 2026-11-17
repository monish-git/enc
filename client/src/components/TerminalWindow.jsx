import { useEffect, useRef } from 'react';
import { fmtClock } from '../utils/format.js';

// Terminal-style log: "[20:42:01] USER AUTHENTICATED". Lines never contain keys or message content.
export default function TerminalWindow({ lines, height = 220, empty = 'NO EVENTS YET' }) {
  const ref = useRef(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      className="term"
      style={{ height, maxHeight: '60vh' }}
      role="log"
      aria-label="Security log"
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      }}
    >
      {lines.length === 0 && <div className="term-line dim">{empty}</div>}
      {lines.map((l) => (
        <div key={l.id} className={`term-line ${l.level === 'warn' ? 'warn' : l.level === 'alert' ? 'bad' : ''}`}>
          <span className="ts">[{fmtClock(l.ts)}]</span> {l.message}
        </div>
      ))}
      <div className="term-line cursor">&gt; </div>
    </div>
  );
}
