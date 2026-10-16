import { ApiError } from '@sentimently/api';
import { Alert, Button, Container, ErrorState, TextField } from '@sentimently/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import { useAuth } from '../lib/auth';

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const login = useMutation({
    mutationFn: () => adminApi.login({ email: email.trim(), password }),
    onSuccess: (s) => {
      auth.signIn(s);
      // Only a path inside this app.
      navigate(from && from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (email.trim() && password) login.mutate();
  };

  if (auth.status === 'staff') return <Navigate to="/" replace />;
  const e = login.error instanceof ApiError ? login.error : null;
  return (
    <Container className="page page--narrow">
      <title>Sign in | Sentimently studio</title>
      <svg className="login-mark" viewBox="0 0 32 32" width="52" height="52" aria-hidden="true">
        <defs><linearGradient id="lm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e0577f" /><stop offset="1" stopColor="#9d2c52" /></linearGradient></defs>
        <rect width="32" height="32" rx="10" fill="url(#lm)" />
        <path d="M16 24.5c-5.6-4-8-7-8-10.3a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 3.3-2.4 6.3-8 10.3z" fill="#fff" />
      </svg>
      <h1>Studio sign in</h1>
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(ev) => setEmail(ev.target.value)} error={submitted && !email.trim() ? 'Enter your email.' : ''} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} error={submitted && !password ? 'Enter your password.' : ''} />
        {login.error && (!e || e.isTemporary
          ? <ErrorState title="Cannot sign in right now" message="The server could not be reached. Please try again." onRetry={() => login.mutate()} />
          : <Alert tone="error">{e.details[0] ?? e.message}</Alert>)}
        <Button type="submit" block loading={login.isPending}>Sign in</Button>
      </form>
    </Container>
  );
}
