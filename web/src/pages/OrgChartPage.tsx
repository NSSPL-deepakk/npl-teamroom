import { useOutletContext } from 'react-router-dom';
import type { Employee } from '../data/employees';
import { useAppData } from '../contexts/AppDataContext';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

function OrgNode({
  employee,
  allEmployees,
  designationName,
  depth,
}: {
  employee: Employee;
  allEmployees: Employee[];
  designationName: (id: string) => string;
  depth: number;
}) {
  const reports = allEmployees.filter((e) => e.manager_id === employee.id);

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 24 }}>
      <div
        className="flex items-center gap-3 border-l-2 py-2 pl-4"
        style={{ borderColor: depth === 0 ? 'transparent' : 'var(--line)' }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center font-mono text-xs font-semibold"
          style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}
        >
          {employee.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {employee.name}
          </p>
          <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            {designationName(employee.designation_id)}
          </p>
        </div>
        {reports.length > 0 && (
          <span className="font-mono ml-auto shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {reports.map((r) => (
        <OrgNode key={r.id} employee={r} allEmployees={allEmployees} designationName={designationName} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function OrgChartPage() {
  const { role } = useOutletContext<Ctx>();
  const { employees, designations } = useAppData();

  const designationName = (id: string) => designations.find((d) => d.id === id)?.name ?? '—';
  const roots = employees.filter((e) => !e.manager_id || !employees.some((m) => m.id === e.manager_id));

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
        Organization
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Reporting hierarchy
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {role === 'MANAGER' ? 'Your position and reports within the wider org.' : `${employees.length} people across the organization.`}
      </p>

      <div className="mt-6 border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
        {roots.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No employees to show.
          </p>
        ) : (
          roots.map((r) => (
            <OrgNode key={r.id} employee={r} allEmployees={employees} designationName={designationName} depth={0} />
          ))
        )}
      </div>
    </div>
  );
}
