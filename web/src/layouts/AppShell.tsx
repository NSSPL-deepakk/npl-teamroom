import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { ROLE_LABEL, type Role } from '../data/roles';
import { useDepartments } from '../data/departments';
import { useDesignations } from '../data/designations';
import { useEmployees, type Gender } from '../data/employees';
import { LOGGED_IN_ELSEWHERE_MESSAGE, useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Drawer } from '../components/Drawer';
import { NotificationBell } from '../components/NotificationBell';
import { useEffect, useMemo, useRef, useState } from 'react';

const PROFILE_OVERRIDES_KEY = 'roster.profile-overrides';
const GENDERS: Gender[] = ['Male', 'Female', 'Other', 'Prefer not to say'];

type ProfileOverride = { name?: string; date_of_birth?: string; gender?: Gender };
type ProfileOverrides = Partial<Record<Role, ProfileOverride>>;

export default function AppShell() {
  const navigate = useNavigate();
  const { activeSessionId, profile, session, signIn, signOut: authSignOut } = useAuth();
  const role: Role = profile?.role ?? 'EMPLOYEE';
  const { employees, updateEmployee } = useEmployees();
  const employee = useMemo(
    () => (profile?.employee_id ? employees.find((e) => e.id === profile.employee_id) ?? null : null),
    [employees, profile],
  );
  const { departments } = useDepartments();
  const { designations } = useDesignations();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileOverrides, setProfileOverrides] = useState<ProfileOverrides>(() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_OVERRIDES_KEY) ?? '{}') as ProfileOverrides;
    } catch {
      return {};
    }
  });
  const [profileName, setProfileName] = useState('');
  const [profileDob, setProfileDob] = useState('');
  const [profileGender, setProfileGender] = useState<Gender | ''>('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const replacementRedirecting = useRef(false);
  const [today, setToday] = useState(() => new Date());

  const override = profileOverrides[role] ?? {};

  const profileEmployee = employee;
  const profileNameDisplay = override.name ?? profileEmployee?.name ?? profile?.name ?? ROLE_LABEL[role];
  const profileEmail = profileEmployee?.email ?? profile?.email ?? '—';
  const profileUsername = profileEmployee?.employee_code ?? profile?.email ?? '—';
  const profileInitials = profileNameDisplay.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(() => setToday(new Date()), nextMidnight.getTime() - Date.now());
    return () => window.clearTimeout(timer);
  }, [today]);

  const todayLabel = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function openProfile() {
    setProfileName(profileNameDisplay);
    setProfileDob(override.date_of_birth ?? profileEmployee?.date_of_birth ?? '');
    setProfileGender(override.gender ?? profileEmployee?.gender ?? '');
    setProfileError('');
    setProfileSuccess(false);
    setProfileOpen(true);
  }

  function closeProfile() {
    setProfileOpen(false);
    setProfileError('');
  }

  function openPasswordChange() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
    setPasswordOpen(true);
  }

  function closePasswordChange() {
    setPasswordOpen(false);
    setPasswordError('');
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords must match.');
      return;
    }
    if (!profile?.email) {
      setPasswordError('Could not determine your account email.');
      return;
    }
    const { error: reauthError } = await signIn(profile.email, currentPassword);
    if (reauthError) {
      setPasswordError('Current password is incorrect.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setPasswordError('');
    setPasswordSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    window.setTimeout(() => setPasswordSuccess(false), 3000);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    if (!profileName.trim()) {
      setProfileError('Name is required.');
      return;
    }
    if (profileDob && profileDob > today) {
      setProfileError('Date of birth cannot be in the future.');
      return;
    }

    const nextOverride = { name: profileName.trim(), date_of_birth: profileDob, ...(profileGender ? { gender: profileGender } : {}) };
    if (profileEmployee) {
      const updateError = await updateEmployee(profileEmployee.id, { name: nextOverride.name, date_of_birth: profileDob || undefined, gender: profileGender || undefined });
      if (updateError) {
        setProfileError(`Could not update profile: ${updateError}`);
        setProfileSuccess(false);
        return;
      }
    }
    const nextOverrides = { ...profileOverrides, [role]: nextOverride };
    setProfileOverrides(nextOverrides);
    localStorage.setItem(PROFILE_OVERRIDES_KEY, JSON.stringify(nextOverrides));
    setProfileSuccess(true);
    setProfileError('');
    window.setTimeout(() => setProfileSuccess(false), 3000);
  }

  // ProtectedRoute already guarantees a session exists before this mounts;
  // the active-session watcher handles replacement from another login.
  useEffect(() => {
    const userId = session?.user.id;
    const mySessionId = activeSessionId;
    if (!userId || !mySessionId) return;

    const channel = supabase
      .channel(`session-watch-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_sessions',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newSessionId = String(payload.new.session_id);
          const currentSessionId = sessionStorage.getItem('active_session_id');
          if (newSessionId === currentSessionId || replacementRedirecting.current) return;

          replacementRedirecting.current = true;
          sessionStorage.removeItem('active_session_id');
          await authSignOut('logged_in_elsewhere');
          navigate('/login', {
            replace: true,
            state: { reason: 'logged_in_elsewhere', message: LOGGED_IN_ELSEWHERE_MESSAGE },
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSessionId, authSignOut, navigate, session?.user.id]);

  async function signOut() {
    await authSignOut('manual');
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--paper)' }}>
      <Sidebar role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center justify-between border-b bg-white px-6 py-3.5"
          style={{ borderColor: 'var(--line-soft)' }}
        >
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {todayLabel}
            </p>
          </div>
          <div className="flex w-1/3 flex-col items-center justify-center">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[13px] font-bold uppercase tracking-[0.16em]"
                style={{ color: 'var(--text-on-ink-muted)' }}
              >
                ROSTER
              </span>
              <span
                className="font-mono text-[13px] font-bold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-on-ink-muted)' }}
              >
                HR SYSTEM
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell userId={session?.user.id} />
            <button
              onClick={openProfile}
              aria-label="Open my profile"
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: 'var(--accent-structure)', color: '#fff' }}
            >
              {profileInitials}
            </button>
            <span
              className="font-mono text-[10px] uppercase tracking-wide"
              style={{ color: 'var(--text-secondary)' }}
            >
              {ROLE_LABEL[role]}
            </span>
            <button
              onClick={signOut}
              className="border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--paper)]"
              style={{ borderColor: 'var(--line)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet context={{ role }} />
        </main>
      </div>

      <Drawer open={profileOpen} title="My Profile" onClose={closeProfile}>
        <form onSubmit={saveProfile} className="flex min-h-full flex-col">
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b pb-5" style={{ borderColor: 'var(--line-soft)' }}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold" style={{ background: 'var(--accent-structure)', color: '#fff' }}>{profileInitials}</div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{profileNameDisplay}</p>
                <p className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{profileUsername}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Email</p><p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{profileEmail}</p></div>
              <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Role</p><span className="mt-1 inline-flex rounded-sm px-2 py-1 font-mono text-[10px] uppercase" style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)' }}>{ROLE_LABEL[role]}</span></div>
              <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Department</p><p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{profileEmployee ? departments.find((item) => item.id === profileEmployee.department_id)?.name ?? '—' : '—'}</p></div>
              <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Designation</p><p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{profileEmployee ? designations.find((item) => item.id === profileEmployee.designation_id)?.name ?? '—' : '—'}</p></div>
            </div>

            <div className="border-t pt-5" style={{ borderColor: 'var(--line-soft)' }}>
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Edit profile</p>
              <div className="mt-4 space-y-4">
                <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Name</span><input required value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /></label>
                <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Date of Birth</span><input type="date" value={profileDob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setProfileDob(e.target.value)} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /></label>
                <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Gender</span><select value={profileGender} onChange={(e) => setProfileGender(e.target.value as Gender | '')} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}><option value="">Select gender</option>{GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></label>
                <button type="button" onClick={openPasswordChange} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-structure)' }}>Change password</button>
              </div>
            </div>
            {profileError && <p className="text-sm" style={{ color: 'var(--status-absent)' }}>{profileError}</p>}
            {profileSuccess && <p className="text-sm" style={{ color: 'var(--status-present)' }}>Profile updated successfully</p>}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-white pt-5" style={{ borderColor: 'var(--line-soft)' }}><button type="button" onClick={closeProfile} className="flex-1 border px-3 py-2.5 text-sm font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>Cancel</button><button type="submit" className="flex-1 px-3 py-2.5 text-sm font-medium" style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}>Save changes</button></div>
        </form>
      </Drawer>

      {passwordOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border bg-white p-6 shadow-xl" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Change password</h2>
              <button type="button" onClick={closePasswordChange} className="font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Close ✕</button>
            </div>
            <form onSubmit={savePassword} className="mt-5 space-y-4">
              <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Current password</span><input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /></label>
              <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>New password</span><input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /></label>
              <label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Confirm new password</span><input type="password" required minLength={8} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-1.5 w-full border px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /></label>
              {passwordError && <p className="text-sm" style={{ color: 'var(--status-absent)' }}>{passwordError}</p>}
              {passwordSuccess && <p className="text-sm" style={{ color: 'var(--status-present)' }}>Password updated</p>}
              <div className="flex gap-3 border-t pt-4" style={{ borderColor: 'var(--line-soft)' }}><button type="button" onClick={closePasswordChange} className="flex-1 border py-2.5 text-sm font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>Cancel</button><button type="submit" className="flex-1 py-2.5 text-sm font-medium" style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}>Update password</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}