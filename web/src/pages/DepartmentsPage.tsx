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
  const { departments, addDepartment, updateDepartment, removeDepartment, departmentsError, activeEmployees } = useAppData();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const countFor = (id: string) => activeEmployees.filter((e) => e.department_id === id).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    if (editingId) {
      if (await updateDepartment(editingId, cleanName)) {
        setEditingId(null);
        setName('');
      }
      return;
    }
    if (await addDepartment(cleanName)) setName('');
  }

  function startEditing(id: string, departmentName: string) {
    setEditingId(id);
    setName(departmentName);
  }

  function cancelEditing() {
    setEditingId(null);
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEditing(d.id, d.name)}
                      className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                      style={{ color: 'var(--accent-structure)' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveId(d.id)}
                      className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                      style={{ color: 'var(--status-absent)' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {canManage && (
          <div className="h-fit border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {editingId ? 'Edit department' : 'Add a department'}
            </h3>
            {departmentsError && <p className="mt-2 text-sm text-red-700">{departmentsError}</p>}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
                {editingId ? 'Save changes' : 'Add department'}
              </button>
              {editingId && <button type="button" onClick={cancelEditing} className="w-full border py-2.5 text-sm font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>Cancel</button>}
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) removeDepartment(removeId); setRemoveId(null); }} />
    </div>
  );
}
