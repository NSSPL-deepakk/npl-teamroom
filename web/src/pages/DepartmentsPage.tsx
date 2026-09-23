import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

export default function DepartmentsPage() {
  const { role } = useOutletContext<Ctx>();
  const canManage = role === 'SUPER_ADMIN';
  const { departments, addDepartment, removeDepartment, employees } = useAppData();
  const [name, setName] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  const countFor = (id: string) => employees.filter((e) => e.department_id === id).length;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addDepartment(name.trim());
    setName('');
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
        Organization
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Departments
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {departments.length} department{departments.length !== 1 ? 's' : ''}
      </p>

      <div className={`mt-6 grid gap-6 ${canManage ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          {departments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No departments yet.
            </p>
          ) : (
            departments.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <span className="h-8 w-[3px] shrink-0" style={{ background: 'var(--accent-structure)' }} />
                <p className="flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {d.name}
                </p>
                <span
                  className="font-mono px-2 py-0.5 text-[11px] uppercase"
                  style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}
                >
                  {countFor(d.id)} people
                </span>
                {canManage && (
                  <button
                    onClick={() => setRemoveId(d.id)}
                    className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                    style={{ color: 'var(--status-absent)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {canManage && (
          <div className="h-fit border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Add a department
            </h3>
            <form onSubmit={handleAdd} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Name
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer Success"
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </label>
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-structure)', color: 'white', borderRadius: 'var(--radius-sm)' }}
              >
                Add department
              </button>
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) removeDepartment(removeId); setRemoveId(null); }} />
    </div>
  );
}
