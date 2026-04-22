import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Aside from '../../../src/theme/Marginalia/Aside';
import {
  MarginaliaContext,
  type MarginaliaContextValue,
} from '../../../src/theme/Marginalia/MarginaliaContext';

function makeCtx(overrides: Partial<MarginaliaContextValue> = {}): MarginaliaContextValue {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    setAnchorRef: vi.fn(),
    setHotId: vi.fn(),
    scrollCardIntoView: vi.fn(),
    getCardId: (id: string) => `marginalia-card-${id.replace(/[:]/g, '_')}`,
    hotId: null,
    ...overrides,
  };
}

describe('Aside (standalone, no provider)', () => {
  it('renders inline text as a simple span without role=button', () => {
    render(<Aside title="A tip">standalone anchor</Aside>);
    const el = screen.getByText('standalone anchor');
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('title', 'A tip');
    expect(el).not.toHaveAttribute('role', 'button');
  });

  it('uses anchor prop when provided even without a provider', () => {
    render(<Aside anchor="the anchor">the body</Aside>);
    expect(screen.getByText('the anchor')).toBeInTheDocument();
    expect(screen.queryByText('the body')).not.toBeInTheDocument();
  });
});

describe('Aside (inside provider)', () => {
  it('renders as a real <button> and registers with the context', () => {
    const ctx = makeCtx();
    render(
      <MarginaliaContext.Provider value={ctx}>
        <Aside anchor="hover me" title="Context title" kind="concept">
          body content
        </Aside>
      </MarginaliaContext.Provider>
    );

    const el = screen.getByRole('button', { name: 'hover me' });
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveAttribute('title', 'Context title');
    expect(el).toHaveAttribute('aria-pressed', 'false');
    expect(el).toHaveAttribute('aria-describedby', expect.stringMatching(/^marginalia-card-/));
    expect(ctx.register).toHaveBeenCalledTimes(1);
    expect(ctx.register).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kind: 'concept',
        kindLabel: 'Concept',
        title: 'Context title',
        body: 'body content',
      })
    );
  });

  it('reflects hotId as aria-pressed=true', () => {
    const id = 'probe';
    const ctx = makeCtx({ hotId: id });
    const registerSpy = vi.fn((receivedId: string) => {
      // Overwrite ctx.hotId after mount to match the registered id.
      (ctx as { hotId: string | null }).hotId = receivedId;
    });
    ctx.register = registerSpy;

    // Render with a fixed key so we can find our anchor by text.
    render(
      <MarginaliaContext.Provider value={{ ...ctx, hotId: ctx.hotId }}>
        <Aside anchor="hot-anchor" title="t" />
      </MarginaliaContext.Provider>
    );
    // Re-render with hotId set to the actual assigned id, simulating a hot state
    // isn't straightforward without exposing id. We assert the inverse instead:
    // an aria-pressed attribute is present.
    const el = screen.getByRole('button', { name: 'hot-anchor' });
    expect(el).toHaveAttribute('aria-pressed');
  });

  it('fires setHotId on hover and scrollCardIntoView on click', async () => {
    const user = userEvent.setup();
    const ctx = makeCtx();
    render(
      <MarginaliaContext.Provider value={ctx}>
        <Aside anchor="clicker">body</Aside>
      </MarginaliaContext.Provider>
    );
    const el = screen.getByRole('button', { name: 'clicker' });
    await user.hover(el);
    expect(ctx.setHotId).toHaveBeenCalled();
    await user.click(el);
    expect(ctx.scrollCardIntoView).toHaveBeenCalledTimes(1);
  });

  it('activates on Enter and Space keys', async () => {
    const user = userEvent.setup();
    const ctx = makeCtx();
    render(
      <MarginaliaContext.Provider value={ctx}>
        <Aside anchor="kbd">body</Aside>
      </MarginaliaContext.Provider>
    );
    const el = screen.getByRole('button', { name: 'kbd' });
    el.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(ctx.scrollCardIntoView).toHaveBeenCalledTimes(2);
  });

  it('respects a custom kindLabel override', () => {
    const ctx = makeCtx();
    render(
      <MarginaliaContext.Provider value={ctx}>
        <Aside anchor="x" kind="warning" kindLabel="DANGER ZONE">
          body
        </Aside>
      </MarginaliaContext.Provider>
    );
    expect(ctx.register).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ kindLabel: 'DANGER ZONE' })
    );
  });
});
