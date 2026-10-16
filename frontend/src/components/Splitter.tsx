// Resizable divider – cột Bảng | Gantt (tỷ lệ lưu localStorage).
import React, { useCallback, useEffect, useRef } from 'react';

export interface SplitterProps {
  /** Tỷ lệ vế trái / tổng (0..1). */
  ratio: number;
  /** Sự kiện khi kéo (gọi với tỷ lệ mới). */
  onDrag: (ratio: number) => void;
  /** Tỷ lệ nhỏ nhất chấp nhận. */
  min?: number;
  /** Tỷ lệ lớn nhất chấp nhận. */
  max?: number;
  /** Class bổ sung. */
  className?: string;
  'aria-label'?: string;
}

export default function Splitter({
  ratio,
  onDrag,
  min = 0.2,
  max = 0.8,
  className,
  'aria-label': ariaLabel,
}: SplitterProps) {
  const start = useRef({ x: 0, ratio: 0 });
  const active = useRef(false);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      active.current = true;
      start.current = { x: e.clientX, ratio };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [ratio],
  );

  const move = useCallback(
    (e: globalThis.PointerEvent) => {
      if (!active.current) return;
      const dx = e.clientX - start.current.x;
      const raw = start.current.ratio - dx / 100;
      const next = Math.min(max, Math.max(min, raw));
      onDrag(next);
    },
    [min, max, onDrag],
  );

  const end = useCallback((e: globalThis.PointerEvent) => {
    active.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    if (!active.current) return;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
  }, [move, end]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className={`eqms-splitter ${className ?? ''}`}
      onPointerDown={startDrag}
      style={{ cursor: 'col-resize' }}
    >
      <div className="eqms-splitter-bar" />
    </div>
  );
}
