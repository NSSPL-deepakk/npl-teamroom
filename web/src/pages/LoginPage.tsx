import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RosterStrip } from '../components/RosterStrip';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const consumedLocationKey = useRef<string | null>(null);
  const reason = (location.state as { reason?: string } | null)?.reason;
  const [sessionMessage, setSessionMessage] = useState('');
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (reason) {
      setSessionMessage(
        reason === 'session_expired'
          ? 'Your session expired. Please sign in again.'
          : reason === 'logged_in_elsewhere'
            ? 'You were signed out because this account was signed in on another device or browser.'
            : '',
      );
      consumedLocationKey.current = location.key;
      navigate(location.pathname, { replace: true, state: null });
    } else if (consumedLocationKey.current && consumedLocationKey.current !== location.key) {
      setSessionMessage('');
      consumedLocationKey.current = null;
    }
  }, [location.key, location.pathname, navigate, reason]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate('/dashboard');
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2" style={{ background: 'var(--paper)' }}>
      {/* Left — form */}
      <div className="flex flex-col justify-between px-8 py-10 sm:px-16 lg:px-20">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[72px] w-[140px] shrink-0 items-center justify-center overflow-visible bg-[var(--ink)]">
            <img src="/logo_nlp.png" alt="Roster HR" className="h-full w-full object-contain" />
          </span>
          <span className="font-mono text-xs tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
            ROSTER HR
          </span>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--status-present)' }}>
            Sign in
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold" style={{ color: 'var(--ink)' }}>
            Welcome back.
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Enter your workspace credentials to continue.
          </p>

          {sessionMessage && (
            <p className="mt-5 border px-3.5 py-3 text-sm" role="status" style={{ borderColor: 'var(--status-absent)', color: 'var(--status-absent)', borderRadius: 'var(--radius-sm)' }}>
              {sessionMessage}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Work email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1.5 w-full border bg-white px-3.5 py-2.5 text-sm outline-none transition-colors"
                style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full border bg-white px-3.5 py-2.5 text-sm outline-none transition-colors"
                style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
              />
            </label>

            {error && (
              <p className="text-sm" style={{ color: 'var(--status-absent)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          © 2026 Roster HR — internal POC
        </p>
      </div>

      {/* Right — signature roster strip panel */}
      <div className="relative hidden overflow-hidden lg:block" style={{ background: 'var(--ink)' }}>
        <div className="absolute inset-0 flex flex-col justify-between p-14">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-on-ink-muted)' }}>
              Today — {todayLabel}
            </p>
            <h2 className="font-display mt-3 max-w-xs text-3xl font-medium leading-snug" style={{ color: 'var(--text-on-ink)' }}>
              Every check-in, request, and approval — one register.
            </h2>
          </div>

          <div>
            <RosterStrip
              events={[
                { time: '09:02', label: 'A. Mehta checked in — Office', status: 'present' },
                { time: '09:14', label: 'R. Kapoor checked in — WFH', status: 'present' },
                { time: '10:30', label: 'Leave request — S. Rao', status: 'pending' },
                { time: '13:05', label: 'N. Iyer — Sick leave, unmarked', status: 'absent' },
                { time: '17:45', label: 'Task closed — Onboarding checklist', status: 'neutral' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}