import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

export default function DesignationsPage() {
  const { role } = useOutletContext<Ctx>();
  const canManage = role === 'SUPER_ADMIN';
  const { designations, addDesignation, removeDesignation, departments, employees } = useAppData();
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  const countFor = (id: string) => employees.filter((e) => e.designation_id === id).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !departmentId) return;
    await addDesignation(name.trim(), departmentId);
    setName('');
    setDepartmentId('');
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
        Organization
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Designations
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {designations.length} designation{designations.length !== 1 ? 's' : ''}
      </p>

      <div className={`mt-6 grid gap-6 ${canManage ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          {designations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No designations yet.
            </p>
          ) : (
            designations.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <span className="h-8 w-[3px] shrink-0" style={{ background: 'var(--accent-structure)' }} />
                <p className="flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {d.name}
                </p>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {departments.find((department) => department.id === d.department_id)?.name ?? '—'}
                </span>
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
              Add a designation
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
                  placeholder="e.g. Product Manager"
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Department
                </span>
                <select
                  required
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-structure)', color: 'white', borderRadius: 'var(--radius-sm)' }}
              >
                Add designation
              </button>
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) removeDesignation(removeId); setRemoveId(null); }} />
    </div>
  );
}
