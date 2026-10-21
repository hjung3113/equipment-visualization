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
  // jsdom cannot populate a file input's value from selected files; pin the nonempty pre-pick value the reset must clear.
  Object.defineProperty(input, 'value', { value: 'C:\\fakepath\\layout.svg', writable: true, configurable: true });
  fireEvent.change(input, { target: { files: [new File(['x'], 'layout.svg')] } });
  expect(screen.getByRole('status').textContent).toBe('layout.svg');
  expect(input.value).toBe('');
});

it('disabled disables the button and the input', () => {
  render(<Harness disabled />);
  expect((screen.getByRole('button', { name: 'Open file' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Open file') as HTMLInputElement).disabled).toBe(true);
});

it('describes the visible button rather than the hidden file input', () => {
  render(<>
    <p id="file-hint">Choose a JSON file</p>
    <FileButton label="Open file" aria-describedby="file-hint" onFile={() => {}} />
  </>);
  const button = screen.getByRole('button', { name: 'Open file' });
  expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Choose a JSON file');
  expect(screen.getByLabelText('Open file').getAttribute('aria-describedby')).toBeNull();
});
