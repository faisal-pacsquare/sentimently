import { ApiError } from '@sentimently/api';
import { Alert, Button, Container, ErrorState, TextField } from '@sentimently/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ACCOUNT, useAuth } from '../lib/auth';
import { useQueryClient } from '@tanstack/react-query';

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Where to go after signing in. Only a path on this site, never another address. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/account';
}

/** A failed request, in words. A refusal (400/401/409) is shown as the server's message; a broken connection or server gets a retry. */
function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  if (!e || e.isTemporary) {
    return <ErrorState title={e?.isNetwork ? "We can't reach the shop" : 'Something went wrong'} message={e?.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'Please check your connection and try again.'} onRetry={retry} requestId={e?.requestId} />;
  }
  return <Alert tone="error">{e.details[0] ?? e.message}</Alert>;
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container className="page page--narrow">
      <title>{`${title} | Sentimently`}</title>
      <h1>{title}</h1>
      {children}
    </Container>
  );
}

export function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const login = useMutation({
    mutationFn: () => api.login({ email: email.trim(), password }),
    onSuccess: (s) => { auth.signIn(s); navigate(next, { replace: true }); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (emailOk(email) && password) login.mutate();
  };

  if (auth.status === 'in') {
    return <Page title="You are signed in"><p><Button as={Link} to={next}>Continue</Button></p></Page>;
  }
  return (
    <Page title="Sign in">
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={submitted && !emailOk(email) ? 'Enter your email address.' : ''} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={submitted && !password ? 'Enter your password.' : ''} />
        <Failure error={login.error} retry={() => login.mutate()} />
        <Button type="submit" block loading={login.isPending}>Sign in</Button>
      </form>
      <p><Link to="/forgot-password">Forgot your password?</Link></p>
      <p>New here? <Link to={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
    </Page>
  );
}

export function Register() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const register = useMutation({
    mutationFn: () => api.register({ email: email.trim(), password, ...(name.trim() ? { name: name.trim() } : {}) }),
    onSuccess: (s) => { auth.signIn(s); navigate(next, { replace: true }); },
  });
  const errors = {
    email: emailOk(email) ? '' : 'Enter your email address.',
    password: password.length >= 8 ? '' : 'Use at least 8 characters.',
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!errors.email && !errors.password) register.mutate();
  };

  if (auth.status === 'in') {
    return <Page title="You are signed in"><p><Button as={Link} to={next}>Continue</Button></p></Page>;
  }
  return (
    <Page title="Create an account">
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField label="Your name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="We send a link to confirm it is yours." error={submitted ? errors.email : ''} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." error={submitted ? errors.password : ''} />
        <Failure error={register.error} retry={() => register.mutate()} />
        <Button type="submit" block loading={register.isPending}>Create account</Button>
      </form>
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </Page>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const send = useMutation({ mutationFn: () => api.forgotPassword(email.trim()) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (emailOk(email)) send.mutate();
  };
  return (
    <Page title="Reset your password">
      {send.isSuccess ? (
        <Alert tone="info">{send.data.message}</Alert>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="We will email you a link to choose a new password." error={submitted && !emailOk(email) ? 'Enter your email address.' : ''} />
          <Failure error={send.error} retry={() => send.mutate()} />
          <Button type="submit" block loading={send.isPending}>Send reset link</Button>
        </form>
      )}
      <p><Link to="/login">Back to sign in</Link></p>
    </Page>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const reset = useMutation({ mutationFn: () => api.resetPassword(token, password) });
  const errors = {
    password: password.length >= 8 ? '' : 'Use at least 8 characters.',
    again: again === password ? '' : 'The two passwords are not the same.',
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!errors.password && !errors.again) reset.mutate();
  };

  if (!token) {
    return <Page title="Choose a new password"><Alert tone="error">This link is incomplete. Please use the link from your email, or ask for a new one.</Alert><p><Link to="/forgot-password">Send a new link</Link></p></Page>;
  }
  return (
    <Page title="Choose a new password">
      {reset.isSuccess ? (
        <>
          <Alert tone="info">{reset.data.message}</Alert>
          <p><Button as={Link} to="/login">Sign in</Button></p>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." error={submitted ? errors.password : ''} />
          <TextField label="New password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={submitted ? errors.again : ''} />
          <Failure error={reset.error} retry={() => reset.mutate()} />
          {reset.error instanceof ApiError && !reset.error.isTemporary && <p><Link to="/forgot-password">Send a new link</Link></p>}
          <Button type="submit" block loading={reset.isPending}>Change password</Button>
        </form>
      )}
    </Page>
  );
}

/** The link in the confirmation email. The token is used once, so it is sent exactly once even in development double-renders. */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const sent = useRef(false);
  const verify = useMutation({
    mutationFn: () => api.verifyEmail(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACCOUNT] }),
  });
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Page title="Confirming your email">
      {!token ? (
        <Alert tone="error">This link is incomplete. Please use the link from your email.</Alert>
      ) : verify.isSuccess ? (
        <>
          <Alert tone="info">{verify.data.message}</Alert>
          <p><Button as={Link} to="/account">Go to my account</Button></p>
        </>
      ) : verify.error ? (
        <>
          <Failure error={verify.error} />
          <p>The link may have expired or already been used. Sign in and ask for a new one from your account.</p>
          <p><Button as={Link} to="/login?next=/account">Sign in</Button></p>
        </>
      ) : (
        <p aria-busy="true">One moment…</p>
      )}
    </Page>
  );
}
