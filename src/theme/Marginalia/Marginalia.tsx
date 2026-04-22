import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { MarginaliaContext, type MarginaliaAside } from './MarginaliaContext';
import styles from './styles.module.css';

const GAP = 10;
const READING_LINE = 0.32;
const TOC_RESERVE = 34;
const CASCADE_TOLERANCE = 60;
const MAX_COMPACTION_ITERATIONS = 16;

// Module-level counter so concurrent Marginalia instances don't fight over
// the body class. Body class flips off only when the last instance unmounts.
let bodyClassRefCount = 0;

const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

const shallowArrayEqual = (a?: string[], b?: string[]): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const asideValueEqual = (a: MarginaliaAside, b: Omit<MarginaliaAside, 'id' | 'cardId'>): boolean =>
  a.kind === b.kind &&
  a.kindLabel === b.kindLabel &&
  a.title === b.title &&
  a.body === b.body &&
  a.cta === b.cta &&
  a.ctaHref === b.ctaHref &&
  shallowArrayEqual(a.meta, b.meta);

const toCardId = (id: string) => `marginalia-card-${id.replace(/[:]/g, '_')}`;

type Heading = {
  id: string;
  text: string;
  level: number;
};

type LineGeom = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type MarginaliaProps = {
  children?: React.ReactNode;
  showToc?: boolean;
};

export default function Marginalia({ children, showToc = true }: MarginaliaProps): JSX.Element {
  const [asides, setAsides] = useState<MarginaliaAside[]>([]);
  const [hotId, setHotId] = useState<string | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [lineGeom, setLineGeom] = useState<LineGeom | null>(null);
  const [compactIds, setCompactIds] = useState<Set<string>>(() => new Set());

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const marginRef = useRef<HTMLElement | null>(null);
  const tocRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const anchorRefs = useRef<Map<string, HTMLElement>>(new Map());
  const asidesRef = useRef<MarginaliaAside[]>(asides);
  const compactIdsRef = useRef<Set<string>>(compactIds);

  useEffect(() => {
    asidesRef.current = asides;
  }, [asides]);
  useEffect(() => {
    compactIdsRef.current = compactIds;
  }, [compactIds]);

  const register = useCallback((id: string, data: Omit<MarginaliaAside, 'id' | 'cardId'>) => {
    setAsides(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx >= 0) {
        if (asideValueEqual(prev[idx], data)) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx], ...data };
        return next;
      }
      return [...prev, { id, cardId: toCardId(id), ...data }];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setAsides(prev => {
      if (prev.every(a => a.id !== id)) return prev;
      return prev.filter(a => a.id !== id);
    });
    cardRefs.current.delete(id);
    anchorRefs.current.delete(id);
  }, []);

  const setAnchorRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) anchorRefs.current.set(id, el);
    else anchorRefs.current.delete(id);
  }, []);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const getCardId = useCallback((id: string) => toCardId(id), []);

  const prefersReducedMotion = useCallback(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const scrollCardIntoView = useCallback(
    (id: string) => {
      const cardEl = cardRefs.current.get(id);
      if (!cardEl) return;
      cardEl.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      if (!prefersReducedMotion() && cardEl.animate) {
        cardEl.animate([{ transform: 'translateX(-10px)' }, { transform: 'translateX(-4px)' }], {
          duration: 300,
          easing: 'cubic-bezier(.2,.7,.2,1)',
        });
      }
    },
    [prefersReducedMotion]
  );

  // positionCards computes desired top for each visible card and, on overflow
  // or cascade, picks ONE card to add to the compact set. A caller that
  // repeatedly hits this path (e.g. the layout effect) is bounded by
  // MAX_COMPACTION_ITERATIONS by the number of asides in the worst case.
  const positionCards = useCallback(() => {
    const margin = marginRef.current;
    const main = mainRef.current;
    if (!margin || !main) return;
    const marginRect = margin.getBoundingClientRect();
    if (marginRect.width < 100) return;

    const items = asidesRef.current
      .map(a => {
        const anchorEl = anchorRefs.current.get(a.id);
        const cardEl = cardRefs.current.get(a.id);
        if (!anchorEl || !cardEl) return null;
        const r = anchorEl.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null; // hidden (e.g. inside a collapsed Tab)
        return {
          id: a.id,
          cardEl,
          naturalTop: r.top - marginRect.top + r.height / 2,
          height: cardEl.offsetHeight,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.naturalTop - b.naturalTop);

    let cursor = 0;
    if (tocRef.current) {
      cursor = tocRef.current.offsetHeight + TOC_RESERVE;
    }

    const mainHeight = main.offsetHeight;
    const pushedOverflow: Array<{ id: string; height: number }> = [];
    const pushedCascade: Array<{ id: string; height: number }> = [];

    items.forEach(it => {
      const naturalCentered = it.naturalTop - it.height / 2;
      const desired = Math.max(naturalCentered, cursor);
      it.cardEl.style.top = `${desired}px`;
      it.cardEl.style.visibility = 'visible';
      cursor = desired + it.height + GAP;
      if (desired + it.height > mainHeight) {
        pushedOverflow.push({ id: it.id, height: it.height });
      }
      if (desired - naturalCentered > CASCADE_TOLERANCE) {
        pushedCascade.push({ id: it.id, height: it.height });
      }
    });

    const current = compactIdsRef.current;
    // Pick the tallest not-already-compact contributor — compacting it yields
    // the largest vertical savings and is most likely to fix the cascade in
    // fewer iterations than blaming a random culprit.
    const candidates = pushedCascade.length > 0 ? pushedCascade : pushedOverflow;
    const toCompact = candidates
      .filter(c => !current.has(c.id))
      .sort((a, b) => b.height - a.height)[0]?.id;

    if (toCompact) {
      const next = new Set(current);
      next.add(toCompact);
      setCompactIds(next);
    }
  }, []);

  const computeLine = useCallback((id: string | null) => {
    if (!id) {
      setLineGeom(null);
      return;
    }
    const wrap = wrapRef.current;
    const anchorEl = anchorRefs.current.get(id);
    const cardEl = cardRefs.current.get(id);
    if (!wrap || !anchorEl || !cardEl) {
      setLineGeom(null);
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const aRect = anchorEl.getBoundingClientRect();
    const cRect = cardEl.getBoundingClientRect();
    const x1 = aRect.right - wrapRect.left;
    const y1 = aRect.top + aRect.height / 2 - wrapRect.top;
    const x2 = cRect.left - wrapRect.left;
    const y2 = cRect.top + cRect.height / 2 - wrapRect.top;
    if (x2 <= x1) {
      setLineGeom(null);
      return;
    }
    setLineGeom({ x1, y1, x2, y2 });
  }, []);

  // Drop stale compact ids when their asides unregister.
  useEffect(() => {
    setCompactIds(prev => {
      if (prev.size === 0) return prev;
      const liveIds = new Set(asides.map(a => a.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (liveIds.has(id)) next.add(id);
        else changed = true;
      });
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [asides]);

  // Position cards after DOM commit. An iteration cap guards against an
  // unexpected oscillation: if positionCards keeps picking new compactions
  // beyond MAX_COMPACTION_ITERATIONS, bail.
  const compactionIterationsRef = useRef(0);
  useIsomorphicLayoutEffect(() => {
    if (compactionIterationsRef.current > MAX_COMPACTION_ITERATIONS) return;
    compactionIterationsRef.current += 1;
    positionCards();
  }, [asides, compactIds, positionCards]);

  useEffect(() => {
    // Reset iteration counter when the aside set changes (new content =
    // fresh budget).
    compactionIterationsRef.current = 0;
  }, [asides]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        compactionIterationsRef.current = 0;
        positionCards();
        computeLine(hotId);
      });
    };
    window.addEventListener('resize', schedule);
    const t1 = setTimeout(schedule, 300);
    const t2 = setTimeout(schedule, 1200);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && mainRef.current) {
      ro = new ResizeObserver(schedule);
      ro.observe(mainRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [positionCards, computeLine, hotId]);

  useEffect(() => {
    if (!mainRef.current) return;
    const collect = () => {
      if (!mainRef.current) return;
      const els = mainRef.current.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]');
      const list: Heading[] = Array.from(els).map(el => ({
        id: el.id,
        text: el.textContent || '',
        level: Number(el.tagName.slice(1)),
      }));
      setHeadings(prev => {
        if (prev.length === list.length && prev.every((h, i) => h.id === list[i].id)) {
          return prev;
        }
        return list;
      });
    };
    collect();
    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(collect);
      ro.observe(mainRef.current);
    }
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(collect);
      mo.observe(mainRef.current, { childList: true, subtree: true });
    }
    const t = setTimeout(collect, 400);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let pending = false;

    const run = () => {
      pending = false;
      const readerY = window.innerHeight * READING_LINE;

      if (mainRef.current) {
        const mRect = mainRef.current.getBoundingClientRect();
        const total = mRect.height - window.innerHeight;
        const scrolled = -mRect.top;
        const pct =
          total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : scrolled > 0 ? 100 : 0;
        setProgress(prev => (Math.abs(prev - pct) < 0.5 ? prev : pct));

        const headingEls = mainRef.current.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]');
        let activeId: string | null = null;
        headingEls.forEach(h => {
          if (h.getBoundingClientRect().top - readerY < 0) {
            activeId = h.id;
          }
        });
        setActiveHeadingId(prev => (prev === activeId ? prev : activeId));
      }

      let best: string | null = null;
      let bestDist = Infinity;
      asidesRef.current.forEach(a => {
        const el = anchorRefs.current.get(a.id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const mid = r.top + r.height / 2;
        const inView = r.bottom > 0 && r.top < window.innerHeight;
        const dist = Math.abs(mid - readerY);
        if (inView && dist < bestDist) {
          best = a.id;
          bestDist = dist;
        }
      });
      setHotId(prev => (prev === best ? prev : best));
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(run);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    run();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    bodyClassRefCount += 1;
    document.body.classList.add('marginalia-active');
    return () => {
      bodyClassRefCount = Math.max(0, bodyClassRefCount - 1);
      if (bodyClassRefCount === 0) {
        document.body.classList.remove('marginalia-active');
      }
    };
  }, []);

  useEffect(() => {
    computeLine(hotId);
  }, [hotId, computeLine]);

  const stableApi = useMemo(
    () => ({ register, unregister, setAnchorRef, setHotId, scrollCardIntoView, getCardId }),
    [register, unregister, setAnchorRef, scrollCardIntoView, getCardId]
  );

  const ctx = useMemo(() => ({ ...stableApi, hotId }), [stableApi, hotId]);

  return (
    <MarginaliaContext.Provider value={ctx}>
      <div ref={wrapRef} className={styles.wrap}>
        <div ref={mainRef} className={styles.main}>
          {children}
        </div>
        <aside
          ref={marginRef as React.RefObject<HTMLElement>}
          className={styles.margin}
          aria-label="Marginalia"
        >
          {showToc && headings.length > 0 && (
            <nav
              ref={tocRef as React.RefObject<HTMLElement>}
              className={styles.toc}
              aria-label="Table of contents"
            >
              <h5 className={styles.tocLabel}>On this page</h5>
              <ol className={styles.tocList}>
                {headings.map(h => (
                  <li
                    key={h.id}
                    className={clsx(
                      styles.tocItem,
                      styles[`tocLevel${h.level}`],
                      activeHeadingId === h.id && styles.tocActive
                    )}
                  >
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ol>
              <div className={styles.progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </nav>
          )}
          {asides.map(a => (
            <Card
              key={a.id}
              aside={a}
              hot={hotId === a.id}
              compact={compactIds.has(a.id)}
              setHotId={setHotId}
              setCardRef={setCardRef}
              anchorRefs={anchorRefs}
            />
          ))}
        </aside>
        {lineGeom && (
          <svg className={styles.lineLayer} aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <line
              x1={lineGeom.x1}
              y1={lineGeom.y1}
              x2={lineGeom.x2}
              y2={lineGeom.y2}
              className={styles.line}
            />
          </svg>
        )}
      </div>
    </MarginaliaContext.Provider>
  );
}

type CardProps = {
  aside: MarginaliaAside;
  hot: boolean;
  compact: boolean;
  setHotId: (id: string | null) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  anchorRefs: React.MutableRefObject<Map<string, HTMLElement>>;
};

const Card = React.memo(function Card({
  aside,
  hot,
  compact,
  setHotId,
  setCardRef,
  anchorRefs,
}: CardProps): JSX.Element {
  const refCallback = useCallback(
    (el: HTMLDivElement | null) => setCardRef(aside.id, el),
    [setCardRef, aside.id]
  );
  return (
    <div
      ref={refCallback}
      id={aside.cardId}
      role="note"
      data-kind={aside.kind || 'note'}
      data-marginalia-id={aside.id}
      className={clsx(styles.card, hot && styles.hot, compact && styles.compact)}
      onMouseEnter={() => setHotId(aside.id)}
      onMouseLeave={() => setHotId(null)}
      onClick={() => {
        const el = anchorRefs.current.get(aside.id);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }}
    >
      {compact ? <CompactFace aside={aside} /> : <CardInner aside={aside} />}
      {compact && (
        <div className={styles.compactExpanded} aria-hidden={!hot}>
          <CardInner aside={aside} />
        </div>
      )}
    </div>
  );
});

function CompactFace({ aside }: { aside: MarginaliaAside }): JSX.Element {
  return (
    <>
      {aside.kindLabel && (
        <div className={styles.kind}>
          <span className={styles.kindSwatch} />
          {aside.kindLabel}
        </div>
      )}
      {aside.title && <div className={styles.title}>{aside.title}</div>}
    </>
  );
}

export function CardInner({ aside }: { aside: MarginaliaAside }): JSX.Element {
  return (
    <>
      {aside.kindLabel && (
        <div className={styles.kind}>
          <span className={styles.kindSwatch} />
          {aside.kindLabel}
        </div>
      )}
      {aside.title && <div className={styles.title}>{aside.title}</div>}
      {aside.body !== undefined && aside.body !== null && (
        <div className={styles.body}>{aside.body}</div>
      )}
      {aside.meta && aside.meta.length > 0 && (
        <div className={styles.metaRow}>
          {aside.meta.map((m, i) => (
            <span key={i} className={styles.pill}>
              {m}
            </span>
          ))}
        </div>
      )}
      {aside.cta &&
        (aside.ctaHref ? (
          <a href={aside.ctaHref} className={styles.cta} onClick={e => e.stopPropagation()}>
            {aside.cta}
          </a>
        ) : (
          <span className={styles.cta}>{aside.cta}</span>
        ))}
    </>
  );
}
