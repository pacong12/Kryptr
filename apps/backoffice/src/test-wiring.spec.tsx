import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@kryptr/shared-ui/react/button';

/**
 * Wiring proof for the backoffice test stack: vitest + jsdom +
 * @testing-library/react + shared-ui source resolution. Wave-4 specs
 * (DeckUI) build on this target.
 */
describe('backoffice test wiring', () => {
  it('renders a shared-ui Button', () => {
    render(<Button>Kill switch</Button>);
    expect(
      screen.getByRole('button', { name: 'Kill switch' }),
    ).toBeInTheDocument();
  });
});
