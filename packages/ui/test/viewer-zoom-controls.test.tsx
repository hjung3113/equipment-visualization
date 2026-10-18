// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ViewerZoomControls } from '../src/index.js';

afterEach(cleanup);

const LABELS = { zoomIn: 'In', zoomOut: 'Out', fit: 'Fit' };

/** A viewer stand-in: zoom 1..2, fit returns to 1. */
function Harness() {
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <output data-testid="zoom">{zoom}</output>
      <ViewerZoomControls
        labels={LABELS}
        controls={{
          zoomIn: () => setZoom(2), zoomOut: () => setZoom(1), fit: () => setZoom(1),
          canZoomIn: zoom < 2, canZoomOut: zoom > 1, canFit: zoom !== 1,
        }}
      />
    </>
  );
}

it('names three buttons from the labels and disables what the state cannot do', () => {
  render(<Harness />);
  const group = screen.getByRole('group');
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['In', 'Out', 'Fit']);
  expect(screen.getByRole('button', { name: 'In' })).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: 'Out' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Fit' })).toHaveProperty('disabled', true);
});

it('each button runs its action', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'In' }));
  expect(screen.getByTestId('zoom').textContent).toBe('2');
  expect(screen.getByRole('button', { name: 'In' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Fit' }));
  expect(screen.getByTestId('zoom').textContent).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'In' }));
  fireEvent.click(screen.getByRole('button', { name: 'Out' }));
  expect(screen.getByTestId('zoom').textContent).toBe('1');
});
