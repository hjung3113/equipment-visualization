// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Input } from '@ap/ui';
import { FormField, type FormFieldProps } from '../src/index.js';

afterEach(cleanup);

const field = (props: Partial<FormFieldProps> = {}) => render(
  <FormField label="설비 ID" {...props}>{(control) => <Input {...control} />}</FormField>,
);

it('names the control by its label', () => {
  field();
  expect(screen.getByRole('textbox', { name: '설비 ID' })).toBeTruthy();
});

it('describes the control by the hint and is valid without an error', () => {
  field({ hint: '파일 이름에 쓰입니다.' });
  const input = screen.getByRole('textbox', { name: '설비 ID', description: '파일 이름에 쓰입니다.' });
  expect(input.getAttribute('aria-invalid')).toBeNull();
});

it('marks the control invalid and describes it by the error, then the hint', () => {
  field({ hint: '파일 이름에 쓰입니다.', error: '값을 입력하세요.' });
  const input = screen.getByRole('textbox', { name: '설비 ID', description: '값을 입력하세요. 파일 이름에 쓰입니다.' });
  expect(input.getAttribute('aria-invalid')).toBe('true');
});

it('marks a required control and hides the asterisk from assistive technology', () => {
  const { container } = field({ required: true });
  expect(screen.getByRole('textbox', { name: '설비 ID' }).getAttribute('aria-required')).toBe('true');
  expect(container.querySelector('label span[aria-hidden="true"]')?.textContent).toBe('*');
});
