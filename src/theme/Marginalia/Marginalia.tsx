import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { MarginaliaContext, type MarginaliaAside } from './MarginaliaContext';
import styles from './styles.module.css';

const GAP = 10;
const READING_LINE = 0.32;
const TOC_RESERVE = 34;
const CASCADE_TOLERANCE = 60;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  const asidesRef = useRef(asides);
  asidesRef.current = asides;
  const compactIdsRef = useRef(compactIds);
  compactIdsRef.current = compactIds;

  const register = useCallback((id: string, data: Omit<MarginaliaAside, 'id'>) => {
    setAsides(prev => {
      const idx = prev.findIndex(a => a.id === id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { id, ...data };
        return next;
      }
      return [...prev, { id, ...data }];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setAsides(prev => prev.filter(a => a.id !== id));
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

  const scrollCardIntoView = useCallback((id: string) => {
    const cardEl = cardRefs.current.get(id);
    if (!cardEl) return;
    cardEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    cardEl.animate?.([{ transform: 'translateX(-10px)' }, { transform: 'translateX(-4px)' }], {
      duration: 300,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    });
  }, []);

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
    const overflowIds: string[] = [];
    const cascadeCulprits: string[] = [];

    items.forEach((it, i) => {
      const naturalCentered = it.naturalTop - it.height / 2;
      const desired = Math.max(naturalCentered, cursor);
      it.cardEl.style.top = `${desired}px`;
      it.cardEl.style.visibility = 'visible';
      cursor = desired + it.height + GAP;
      if (desired + it.height > mainHeight) {
        overflowIds.push(it.id);
      }
      if (i > 0 && desired - naturalCentered > CASCADE_TOLERANCE) {
        cascadeCulprits.push(items[i - 1].id);
      }
    });

    let toCompact: string | null = null;
    if (cascadeCulprits.length > 0) toCompact = cascadeCulprits[0];
    else if (overflowIds.length > 0) toCompact = overflowIds[overflowIds.length - 1];

    if (toCompact) {
      const current = compactIdsRef.current;
      if (!current.has(toCompact)) {
        const next = new Set(current);
        next.add(toCompact);
        setCompactIds(next);
      }
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

  useIsomorphicLayoutEffect(() => {
    positionCards();
  }, [asides, compactIds, positionCards]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
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
      const els = mainRef.current.querySelectorAll<HTMLElement>('h1[id], h2[id]');
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
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(collect);
      ro.observe(mainRef.current);
    }
    const t = setTimeout(collect, 400);
    return () => {
      ro?.disconnect();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const readerY = window.innerHeight * READING_LINE;

      if (mainRef.current) {
        const mRect = mainRef.current.getBoundingClientRect();
        const total = mRect.height - window.innerHeight;
        const scrolled = -mRect.top;
        const pct =
          total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : scrolled > 0 ? 100 : 0;
        setProgress(pct);

        const headingEls = mainRef.current.querySelectorAll<HTMLElement>('h1[id], h2[id]');
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
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('marginalia-active');
    return () => document.body.classList.remove('marginalia-active');
  }, []);

  useEffect(() => {
    computeLine(hotId);
  }, [hotId, computeLine]);

  const stableApi = useMemo(
    () => ({ register, unregister, setAnchorRef, setHotId, scrollCardIntoView }),
    [register, unregister, setAnchorRef, scrollCardIntoView]
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

function Card({ aside, hot, compact, setHotId, setCardRef, anchorRefs }: CardProps): JSX.Element {
  const refCallback = useCallback(
    (el: HTMLDivElement | null) => setCardRef(aside.id, el),
    [setCardRef, aside.id]
  );
  return (
    <div
      ref={refCallback}
      data-kind={aside.kind || 'note'}
      className={clsx(styles.card, hot && styles.hot, compact && styles.compact)}
      style={{ visibility: 'hidden' }}
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
}

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
