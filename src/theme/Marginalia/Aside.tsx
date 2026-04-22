import React, { useCallback, useEffect, useId, useRef } from 'react';
import clsx from 'clsx';
import type { AsideKind } from '../../types';
import { useMarginalia } from './MarginaliaContext';
import styles from './styles.module.css';

const KIND_LABELS: Record<string, string> = {
  note: 'Note',
  concept: 'Concept',
  warning: 'Heads up',
  info: 'Aside',
  link: 'Related',
  value: 'Value',
  code: 'Code',
  endpoint: 'Endpoint',
};

export type AsideProps = {
  anchor?: React.ReactNode;
  title?: string;
  kind?: AsideKind;
  kindLabel?: string;
  meta?: string[];
  cta?: string;
  ctaHref?: string;
  /** Optional ARIA label when the anchor content is non-textual. */
  'aria-label'?: string;
  children?: React.ReactNode;
};

export default function Aside({
  anchor,
  title,
  kind = 'note',
  kindLabel,
  meta,
  cta,
  ctaHref,
  'aria-label': ariaLabel,
  children,
}: AsideProps): JSX.Element {
  const id = useId();
  const ctx = useMarginalia();
  const anchorElRef = useRef<HTMLButtonElement | null>(null);

  const inlineLabel = anchor ?? children;
  const body = anchor ? children : null;
  const resolvedKindLabel = kindLabel ?? KIND_LABELS[kind] ?? 'Note';

  const register = ctx?.register;
  const unregister = ctx?.unregister;
  const setAnchorRef = ctx?.setAnchorRef;
  const cardId = ctx?.getCardId(id);

  useEffect(() => {
    if (!register) return;
    register(id, {
      kind,
      kindLabel: resolvedKindLabel,
      title,
      body,
      meta,
      cta,
      ctaHref,
    });
    return () => unregister?.(id);
  }, [register, unregister, id, kind, resolvedKindLabel, title, body, meta, cta, ctaHref]);

  const refCallback = useCallback(
    (el: HTMLButtonElement | null) => {
      anchorElRef.current = el;
      setAnchorRef?.(id, el);
    },
    [setAnchorRef, id]
  );

  if (!ctx) {
    return (
      <span className={styles.anchor} title={title} aria-label={ariaLabel}>
        {inlineLabel}
      </span>
    );
  }

  const hot = ctx.hotId === id;
  const { setHotId, scrollCardIntoView } = ctx;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const activate = () => {
    scrollCardIntoView(id);
    if (!prefersReducedMotion && anchorElRef.current?.animate) {
      anchorElRef.current.animate(
        [
          { backgroundColor: 'var(--ifm-color-primary)', color: '#fff' },
          { backgroundColor: 'transparent', color: 'inherit' },
        ],
        { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' }
      );
    }
  };

  return (
    <button
      type="button"
      ref={refCallback}
      className={clsx(styles.anchor, hot && styles.hot)}
      title={title}
      aria-pressed={hot}
      aria-describedby={cardId}
      aria-label={ariaLabel}
      onMouseEnter={() => setHotId(id)}
      onMouseLeave={() => setHotId(null)}
      onFocus={() => setHotId(id)}
      onBlur={() => setHotId(null)}
      onClick={e => {
        e.preventDefault();
        activate();
      }}
    >
      {inlineLabel}
    </button>
  );
}
