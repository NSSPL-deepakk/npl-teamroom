import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppData } from '../contexts/AppDataContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Role } from '../data/roles';
import { normalizeDesignationName } from '../data/designations';

type Ctx = { role: Role };

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

export default function DesignationsPage() {
  const { role } = useOutletContext<Ctx>();
  const canManage = role === 'SUPER_ADMIN';
  const { designations, designationsError, addDesignation, updateDesignation, removeDesignation, departments, employees } = useAppData();
  const [name, setName] = useState('');
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const matchingDesignation = designations.find((designation) => (
    designation.id !== editingId && normalizeDesignationName(designation.name) === normalizeDesignationName(name)
  ));
  const missingDepartmentIds = matchingDesignation
    ? departmentIds.filter((id) => !matchingDesignation.department_ids.includes(id))
    : departmentIds;
  const countFor = (id: string) => employees.filter((e) => e.designation_id === id).length;

  function resetForm() {
    setName('');
    setDepartmentIds([]);
    setEditingId(null);
  }

  function handleEdit(designationId: string) {
    const designation = designations.find((item) => item.id === designationId);
    if (!designation) return;
    setEditingId(designation.id);
    setName(designation.name);
    setDepartmentIds(designation.department_ids);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || departmentIds.length === 0) return;
    const savedId = editingId
      ? await updateDesignation(editingId, name.trim(), departmentIds)
      : await addDesignation(name.trim(), departmentIds);
    if (savedId) resetForm();
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
      {designationsError && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--status-absent)' }}>
          {designationsError}
        </p>
      )}

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
                  {d.department_ids.map((id) => departments.find((department) => department.id === id)?.name ?? '—').join(', ')}
                </span>
                <span
                  className="font-mono px-2 py-0.5 text-[11px] uppercase"
                  style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}
                >
                  {countFor(d.id)} people
                </span>
                {canManage && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleEdit(d.id)}
                      className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                      style={{ color: 'var(--accent-structure)' }}
                    >
                      Edit
                    </button>
                    <button
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
              {editingId ? 'Edit designation' : 'Add a designation'}
            </h3>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
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
              {matchingDesignation && (
                <p className="-mt-2 text-xs" style={{ color: 'var(--accent-structure)' }}>
                  {editingId
                    ? 'Another designation already uses this title. Cancel and edit that record to change its departments.'
                    : 'This title already exists. Selected departments will be added to the existing designation.'}
                </p>
              )}
              <div>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Departments
                </span>
                <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto border p-2" style={inputStyle}>
                  {departments.map((department) => (
                    <label key={department.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={departmentIds.includes(department.id)}
                        onChange={(e) => setDepartmentIds((selected) => (
                          e.target.checked
                            ? [...selected, department.id]
                            : selected.filter((id) => id !== department.id)
                        ))}
                      />
                      <span>{department.name}</span>
                    </label>
                  ))}
                </div>
                {departmentIds.length === 0 && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Select at least one department.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={departmentIds.length === 0 || Boolean(editingId && matchingDesignation) || Boolean(!editingId && matchingDesignation && missingDepartmentIds.length === 0)}
                className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-structure)', color: 'white', borderRadius: 'var(--radius-sm)', opacity: departmentIds.length === 0 || Boolean(editingId && matchingDesignation) || Boolean(!editingId && matchingDesignation && missingDepartmentIds.length === 0) ? 0.55 : 1 }}
              >
                {editingId ? 'Save changes' : matchingDesignation ? missingDepartmentIds.length > 0 ? 'Add departments to existing title' : 'Already linked to selected departments' : 'Add designation'}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="w-full py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Cancel edit
                </button>
              )}
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) removeDesignation(removeId); setRemoveId(null); }} />
    </div>
  );
}
