import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Marginalia from '../../../src/theme/Marginalia/Marginalia';
import Aside from '../../../src/theme/Marginalia/Aside';

afterEach(() => {
  // The body class is ref-counted but tests that throw mid-render can leak it.
  document.body.classList.remove('marginalia-active');
});

describe('Marginalia', () => {
  it('mounts with no children and does not crash', () => {
    render(<Marginalia />);
    // aria-label is 'Marginalia' on the <aside> container
    expect(screen.getByLabelText('Marginalia')).toBeInTheDocument();
  });

  it('adds the marginalia-active body class on mount and removes on unmount', () => {
    const { unmount } = render(<Marginalia>content</Marginalia>);
    expect(document.body.classList.contains('marginalia-active')).toBe(true);
    unmount();
    expect(document.body.classList.contains('marginalia-active')).toBe(false);
  });

  it('keeps the body class while any instance remains mounted (ref-counted)', () => {
    const a = render(<Marginalia>one</Marginalia>);
    const b = render(<Marginalia>two</Marginalia>);
    expect(document.body.classList.contains('marginalia-active')).toBe(true);
    a.unmount();
    expect(document.body.classList.contains('marginalia-active')).toBe(true);
    b.unmount();
    expect(document.body.classList.contains('marginalia-active')).toBe(false);
  });

  it('wires aria-describedby from anchor to a card with matching id', () => {
    render(
      <Marginalia>
        <Aside anchor="term" title="Definition">
          explanation here
        </Aside>
      </Marginalia>
    );
    const button = screen.getByRole('button', { name: 'term' });
    const cardId = button.getAttribute('aria-describedby');
    expect(cardId).toBeTruthy();
    const card = document.getElementById(cardId!);
    expect(card).not.toBeNull();
    expect(card?.getAttribute('role')).toBe('note');
    // Card body content should be rendered
    expect(card?.textContent).toContain('explanation here');
  });

  it('does not render the TOC when showToc=false', () => {
    render(
      <Marginalia showToc={false}>
        <h2 id="heading">A heading</h2>
      </Marginalia>
    );
    expect(screen.queryByLabelText('Table of contents')).not.toBeInTheDocument();
  });

  it('unregisters cards when their Aside unmounts', () => {
    const { rerender } = render(
      <Marginalia>
        <Aside anchor="one">body one</Aside>
        <Aside anchor="two">body two</Aside>
      </Marginalia>
    );
    expect(screen.getAllByRole('note')).toHaveLength(2);
    rerender(
      <Marginalia>
        <Aside anchor="one">body one</Aside>
      </Marginalia>
    );
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });
});
