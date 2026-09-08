import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../data/roles';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, signOutReason, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--paper)' }}>
        <p className="font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!session || !profile) {
    const reason = signOutReason === 'logged_in_elsewhere' ? 'logged_in_elsewhere' : signOutReason === 'manual' ? undefined : 'session_expired';
    return <Navigate to="/login" replace state={reason ? { reason } : undefined} />;
  }

  return <>{children}</>;
}

export function RoleProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles: Role[] }) {
  const { profile, loading } = useAuth();

  if (loading) return null;
  if (!profile || !allowedRoles.includes(profile.role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}