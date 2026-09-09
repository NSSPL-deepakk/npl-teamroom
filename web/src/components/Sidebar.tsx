import { NavLink } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { ROLE_NAV, ROLE_LABEL, type Role } from '../data/roles';

export function Sidebar({ role }: { role: Role }) {
  const groups = ROLE_NAV[role];

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col justify-between md:flex"
      style={{ background: 'var(--ink)', color: 'var(--text-on-ink)' }}
    >
      <div>
        <div className="flex items-center gap-3 px-6 py-6">
          <span className="flex h-12 w-24 shrink-0 items-center justify-center overflow-visible">
            <img
              src="/logo1.png"
              alt="Roster HR"
              className="h-full w-full object-contain"
            />
          </span>

          <div className="flex flex-col">
            <span
              className="font-mono text-xs font-semibold tracking-[0.16em]"
              style={{ color: 'var(--text-on-ink)' }}
            >
              ROSTER
            </span>
            <span
              className="font-mono text-[10px] tracking-[0.14em]"
              style={{ color: 'var(--text-on-ink-muted)' }}
            >
              HR SYSTEM
            </span>
          </div>
        </div>

        <nav className="mt-2 px-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-6">
              <p
                className="px-3 pb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: 'var(--text-on-ink-muted)' }}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 border-l-[3px] px-3 py-2 text-sm transition-colors ${isActive ? '' : 'border-transparent'
                        }`
                      }
                      style={({ isActive }) => ({
                        borderColor: isActive ? 'var(--primary)' : 'transparent',
                        background: isActive ? 'var(--ink-soft)' : 'transparent',
                        color: isActive ? 'var(--text-on-ink)' : 'var(--text-on-ink-muted)',
                      })}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {item.iconName === 'onboarding' ? <ClipboardCheck size={15} strokeWidth={1.8} /> : item.icon}
                      </span>
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-on-ink-muted)' }}>
          Signed in as
        </p>
        <p className="mt-1 text-sm">{ROLE_LABEL[role]}</p>
      </div>
    </aside>
  );
}
