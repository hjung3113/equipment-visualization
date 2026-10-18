// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/index.js';

afterEach(cleanup);

function Example() {
  return (
    <Tabs defaultValue="a">
      <TabsList aria-label="Sections">
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Alpha body</TabsContent>
      <TabsContent value="b">Beta body</TabsContent>
    </Tabs>
  );
}

it('exposes tablist and tab roles; the active tab is selected and shows its panel', () => {
  render(<Example />);
  expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('Alpha body');
});

it('clicking another tab switches the panel', () => {
  render(<Example />);
  const beta = screen.getByRole('tab', { name: 'Beta' });
  fireEvent.mouseDown(beta);
  fireEvent.click(beta);
  expect(beta.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('Beta body');
});

it('a string label counts once in the accessible name', () => {
  render(<Example />);
  // Exact-string name match: the invisible bold-width placeholder is aria-hidden, so it adds nothing.
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['AlphaAlpha', 'BetaBeta']);
  expect(screen.getByRole('tab', { name: 'Alpha' })).toBeTruthy();
});
