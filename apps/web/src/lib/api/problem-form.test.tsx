// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { problemTypeUri } from '@investfund/shared';

import { setupMswServer } from '../../../test/support/msw';

import { apiFetch, ApiError } from './client';
import { applyProblemToForm, fieldNameFromProblemPath } from './problem-form';

const server = setupMswServer();

afterEach(() => {
  cleanup();
});

interface SignUpValues {
  name: string;
  email: string;
}

function validationProblem(errors: { path: string; code: string; message: string }[]) {
  return HttpResponse.json(
    {
      type: problemTypeUri('validation-error'),
      title: 'Validation failed',
      status: 400,
      requestId: 'req-form',
      errors,
    },
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

function SignUpForm() {
  const form = useForm<SignUpValues>({ defaultValues: { name: '', email: '' } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await apiFetch('/auth/register', { method: 'POST', body: values });
    } catch (error) {
      applyProblemToForm(error, form);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)}>
      <label htmlFor="name">Name</label>
      <input id="name" {...form.register('name')} />
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        aria-invalid={errors.email ? true : undefined}
        aria-describedby="email-error"
        {...form.register('email')}
      />
      {errors.email && (
        <p id="email-error" role="alert">
          {errors.email.message}
        </p>
      )}
      <button type="submit">Create account</button>
    </form>
  );
}

describe('applyProblemToForm with React Hook Form', () => {
  it('shows the API message on the email field and focuses it', async () => {
    server.use(
      http.post('http://api.test/api/v1/auth/register', () =>
        validationProblem([
          { path: 'email', code: 'invalid_format', message: 'Enter a valid email address' },
        ]),
      ),
    );
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Enter a valid email address',
    );
    const email = screen.getByLabelText('Email');
    await waitFor(() => {
      expect(document.activeElement).toBe(email);
    });
    expect(email.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('applyProblemToForm mapping', () => {
  function problemError(errors: { path: string; code: string; message: string }[]) {
    return new ApiError({
      kind: 'problem',
      method: 'POST',
      endpoint: '/things',
      status: 400,
      message: 'Validation failed',
      problem: {
        type: problemTypeUri('validation-error'),
        title: 'Validation failed',
        status: 400,
        requestId: 'req',
        errors,
      },
    });
  }

  it('maps body paths, focuses only the first field and keeps one message per field', () => {
    const setError = vi.fn();
    const result = applyProblemToForm<{ email: string; items: { name: string }[] }>(
      problemError([
        { path: 'body.items.0.name', code: 'too_small', message: 'Required' },
        { path: 'body.email', code: 'invalid_format', message: 'Invalid email' },
        { path: 'body.email', code: 'too_long', message: 'Too long' },
        { path: 'query.limit', code: 'too_big', message: 'Too big' },
      ]),
      { setError },
    );

    expect(result.applied).toEqual(['items.0.name', 'email']);
    expect(result.unmatched.map((error) => error.path)).toEqual(['query.limit']);
    expect(setError).toHaveBeenNthCalledWith(
      1,
      'items.0.name',
      { type: 'too_small', message: 'Required' },
      { shouldFocus: true },
    );
    expect(setError).toHaveBeenNthCalledWith(
      2,
      'email',
      { type: 'invalid_format', message: 'Invalid email' },
      { shouldFocus: false },
    );
  });

  it('only applies the listed fields when `fields` is given', () => {
    const setError = vi.fn();
    const result = applyProblemToForm<{ email: string }>(
      problemError([
        { path: 'email', code: 'invalid_format', message: 'Invalid email' },
        { path: 'companyNumber', code: 'invalid', message: 'Unknown' },
      ]),
      { setError },
      { fields: ['email'] },
    );
    expect(result.applied).toEqual(['email']);
    expect(result.unmatched.map((error) => error.path)).toEqual(['companyNumber']);
  });

  it('ignores errors that are not API problems', () => {
    const setError = vi.fn();
    expect(applyProblemToForm(new Error('boom'), { setError })).toEqual({
      applied: [],
      unmatched: [],
    });
    expect(setError).not.toHaveBeenCalled();
  });

  it.each([
    ['email', 'email'],
    ['body.email', 'email'],
    ['body.founders.1.email', 'founders.1.email'],
    ['body', undefined],
    ['', undefined],
    ['params.startupId', undefined],
    ['headers.idempotency-key', undefined],
  ])('maps the problem path %j to the field %j', (path, field) => {
    expect(fieldNameFromProblemPath(path)).toBe(field);
  });
});
