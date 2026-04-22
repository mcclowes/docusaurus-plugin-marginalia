import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Endpoint from '../../../src/theme/Marginalia/Endpoint';

describe('Endpoint', () => {
  it('renders method and path with uppercase method and data attribute', () => {
    const { container } = render(<Endpoint method="get" path="/users/{id}" />);
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('/users/{id}')).toBeInTheDocument();
    const chip = container.querySelector('[data-method]');
    expect(chip).toHaveAttribute('data-method', 'GET');
  });

  it('defaults method to GET', () => {
    const { container } = render(<Endpoint path="/health" />);
    expect(container.querySelector('[data-method]')).toHaveAttribute('data-method', 'GET');
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('falls back to children when no path prop is provided', () => {
    render(<Endpoint method="POST">/sessions</Endpoint>);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('/sessions')).toBeInTheDocument();
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'passes through %s as the data-method value',
    method => {
      const { container } = render(<Endpoint method={method} path="/thing" />);
      expect(container.querySelector('[data-method]')).toHaveAttribute('data-method', method);
    }
  );

  it('upper-cases an unknown method and renders it verbatim', () => {
    const { container } = render(<Endpoint method="query" path="/graphql" />);
    expect(container.querySelector('[data-method]')).toHaveAttribute('data-method', 'QUERY');
    expect(screen.getByText('QUERY')).toBeInTheDocument();
  });

  it('prefers path over children when both are provided', () => {
    render(
      <Endpoint method="GET" path="/from-prop">
        /from-children
      </Endpoint>
    );
    expect(screen.getByText('/from-prop')).toBeInTheDocument();
    expect(screen.queryByText('/from-children')).not.toBeInTheDocument();
  });

  it('renders an empty path container when neither path nor children are provided', () => {
    const { container } = render(<Endpoint method="GET" />);
    const chip = container.querySelector('[data-method]');
    expect(chip).toHaveAttribute('data-method', 'GET');
    // Method text still renders; path span exists but is empty.
    expect(screen.getByText('GET')).toBeInTheDocument();
  });
});
