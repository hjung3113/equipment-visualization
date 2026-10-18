// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { FileButton } from '../src/index.js';

afterEach(cleanup);

function Harness({ disabled }: { disabled?: boolean }) {
  const [name, setName] = useState('none');
  return (
    <>
      <FileButton label="Open file" disabled={disabled} onFile={(file) => setName(file.name)} />
      <output>{name}</output>
    </>
  );
}

it('names the button and the hidden input by the label', () => {
  render(<Harness />);
  expect(screen.getByRole('button', { name: 'Open file' })).toBeTruthy();
  expect(screen.getByLabelText('Open file').getAttribute('tabindex')).toBe('-1');
});

it('clicking the button clicks the input', () => {
  render(<Harness />);
  let clicked = false;
  screen.getByLabelText('Open file').addEventListener('click', () => { clicked = true; });
  fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
  expect(clicked).toBe(true);
});

it('reports the picked file and resets the input', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Open file') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'layout.svg')] } });
  expect(screen.getByRole('status').textContent).toBe('layout.svg');
  expect(input.value).toBe('');
});

it('disabled disables the button and the input', () => {
  render(<Harness disabled />);
  expect((screen.getByRole('button', { name: 'Open file' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Open file') as HTMLInputElement).disabled).toBe(true);
});
