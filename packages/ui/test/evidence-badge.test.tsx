// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { EvidenceLevel } from '@eqv/core';
import { EvidenceBadge } from '../src/index.js';

afterEach(cleanup);

it.each<[EvidenceLevel, string]>([
  ['observed', '관측'],
  ['derived', '파생'],
  ['illustrative', '예시'],
  ['unknown', '알 수 없음'],
])('%s badge exposes its level and always shows the given text', (level, text) => {
  render(<EvidenceBadge level={level}>{text}</EvidenceBadge>);
  const badge = screen.getByText(text).closest('[data-evidence]');
  expect(badge?.getAttribute('data-evidence')).toBe(level);
});
