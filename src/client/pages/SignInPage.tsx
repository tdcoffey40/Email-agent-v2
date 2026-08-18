import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { Alert } from '../components/ui/Feedback';
import { ApiRequestError } from '../lib/api';
import { useSession } from '../lib/session';

export function SignInPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register, config } = useSession();
  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (isRegister) await register(email, password, name);
      else await login(email, password);
      // A successful call updates the session, and App swaps in the shell.
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setFields(caught.fields);
        setError(Object.keys(caught.fields).length > 0 ? null : caught.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-ink">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M2.5 5.5h15v9h-15z M2.5 6l7.5 5 7.5-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="text-xl font-semibold text-ink">
            {isRegister ? 'Create your account' : config?.appName ?? 'Email Agents'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? 'Set up agents that answer email on their own addresses.'
              : 'Sign in to manage your agents.'}
          </p>
        </div>

        <Card>
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {error ? <Alert tone="danger">{error}</Alert> : null}

              {isRegister ? (
                <Field label="Name" htmlFor="name">
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                  />
                </Field>
              ) : null}

              <Field label="Email" htmlFor="email" error={fields.email} required>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  invalid={Boolean(fields.email)}
                  placeholder="you@example.com"
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                error={fields.password}
                hint={isRegister ? 'At least 10 characters.' : undefined}
                required
              >
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                  invalid={Boolean(fields.password)}
                />
              </Field>

              <Button type="submit" loading={busy} className="w-full">
                {isRegister ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-sm text-muted">
          {isRegister ? 'Already have an account? ' : 'No account yet? '}
          <Link
            to={isRegister ? '/login' : '/register'}
            className="font-medium text-brand hover:underline"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  );
}
