// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DataTable, EvidenceBadge } from '@eqv/ui';

afterEach(cleanup);

it('Studio compiles and renders @eqv/ui (and the @fops/ui source it builds on)', () => {
  render(
    <>
      <DataTable label="스모크" columns={['열']}>
        <DataTable.Row><DataTable.Cell>값</DataTable.Cell></DataTable.Row>
      </DataTable>
      <EvidenceBadge level="derived">파생</EvidenceBadge>
    </>,
  );
  expect(screen.getByRole('table', { name: '스모크' })).toBeTruthy();
  expect(screen.getByText('파생').closest('[data-evidence]')?.getAttribute('data-evidence')).toBe('derived');
});
