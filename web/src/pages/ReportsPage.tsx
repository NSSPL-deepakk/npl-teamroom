import { useMemo, useState } from 'react';
import { useEmployees, type Employee } from '../data/employees';
import { useDepartments, type Department } from '../data/departments';
import { StatCard, LedgerPanel } from '../components/Ledger';

type ReportSelection = 'active' | 'inactive' | 'attrition' | 'departments' | `department:${string}`;

export default function ReportsPage() {
  const { employees, loading: employeesLoading, error: employeesError } = useEmployees();
  const { departments, loading: departmentsLoading, error: departmentsError } = useDepartments();
  const [selection, setSelection] = useState<ReportSelection>('active');

  const now = new Date();

  const activeCount = employees.filter((e) => e.employment_status === 'ACTIVE').length;
  const inactiveCount = employees.length - activeCount;

  const attritionRate = employees.length > 0 ? Math.round((inactiveCount / employees.length) * 1000) / 10 : 0;

  const deptBreakdown = useMemo(
    () =>
      departments
        .map((d) => ({ ...d, count: employees.filter((e) => e.department_id === d.id).length }))
        .sort((a, b) => b.count - a.count),
    [departments, employees],
  );

  const selectedDepartmentId = selection.startsWith('department:') ? selection.slice('department:'.length) : null;
  const selectedDepartment = selectedDepartmentId
    ? departments.find((department) => department.id === selectedDepartmentId) ?? null
    : null;
  const selectedEmployees = useMemo(() => {
    if (selection === 'active') return employees.filter((employee) => employee.employment_status === 'ACTIVE');
    if (selection === 'inactive' || selection === 'attrition') return employees.filter((employee) => employee.employment_status === 'INACTIVE');
    if (selectedDepartmentId) return employees.filter((employee) => employee.department_id === selectedDepartmentId);
    return [];
  }, [employees, selectedDepartmentId, selection]);

  const reportTitle = selectedDepartment?.name ?? (
    selection === 'active' ? 'Active employees' :
      selection === 'inactive' ? 'Inactive employees' :
        selection === 'attrition' ? 'Attrition report' :
          selection === 'departments' ? 'Department report' : 'Report details'
  );
  const reportDescription = selectedDepartment
    ? `${selectedEmployees.length} employee${selectedEmployees.length === 1 ? '' : 's'}`
    : selection === 'departments'
      ? `${departments.length} department${departments.length === 1 ? '' : 's'}`
      : 'Live employee records from Supabase';
  const dataLoading = employeesLoading || departmentsLoading;
  const dataError = employeesError ?? departmentsError;

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
        HR
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Reports
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Headcount, attrition, attendance, and leave — {now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Headcount (active)" value={activeCount} status="present" selected={selection === 'active'} onClick={() => setSelection('active')} />
        <StatCard label="Inactive" value={inactiveCount} status="neutral" selected={selection === 'inactive'} onClick={() => setSelection('inactive')} />
        <StatCard label="Attrition rate" value={`${attritionRate}%`} status={attritionRate > 10 ? 'absent' : 'structure'} selected={selection === 'attrition'} onClick={() => setSelection('attrition')} />
        <StatCard label="Departments" value={departments.length} status="structure" selected={selection === 'departments'} onClick={() => setSelection('departments')} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Headcount by department">
          {departmentsLoading ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading departments...</p>
          ) : deptBreakdown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No departments found.</p>
          ) : deptBreakdown.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelection(`department:${d.id}`)}
              aria-pressed={selection === `department:${d.id}`}
              className="flex w-full items-center gap-4 border-b px-5 py-3 text-left last:border-b-0 hover:bg-[var(--paper)]"
              style={{ borderColor: 'var(--line-soft)', background: selection === `department:${d.id}` ? 'var(--accent-structure-bg)' : undefined }}
            >
              <span className="h-8 w-[3px] shrink-0" style={{ background: 'var(--accent-structure)' }} />
              <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>
                {d.name}
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                {d.count} people
              </span>
            </button>
          ))}
        </LedgerPanel>

        {selection !== 'departments' && (
          <LedgerPanel title={reportTitle} action={<span className="font-mono text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>{reportDescription}</span>}>
            {dataLoading ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading report data...</p>
            ) : dataError ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{dataError}</p>
            ) : selectedEmployees.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No employee data found.</p>
            ) : (
              <EmployeeReportTable employees={selectedEmployees} departments={departments} />
            )}
          </LedgerPanel>
        )}

      </div>

    </div>
  );
}

function EmployeeReportTable({ employees, departments }: { employees: Employee[]; departments: Department[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-left">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--line-soft)' }}>
            {['Employee', 'Code', 'Department', 'Status'].map((heading) => <th key={heading} className="px-5 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{heading}</th>)}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--line-soft)' }}>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>{employee.name}</td>
              <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{employee.employee_code}</td>
              <td className="px-5 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{departments.find((department) => department.id === employee.department_id)?.name ?? '—'}</td>
              <td className="px-5 py-3 font-mono text-[11px] uppercase" style={{ color: employee.employment_status === 'ACTIVE' ? 'var(--status-present)' : 'var(--status-neutral)' }}>{employee.employment_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}