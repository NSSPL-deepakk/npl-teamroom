import { useMemo } from 'react';
import { useEmployees } from '../data/employees';
import { useDepartments } from '../data/departments';
import { useAttendance, requiredHoursForEmployeeMonth, totalHoursForMonth } from '../data/attendance';
import { useLeaveRequests, leaveDayCount } from '../data/leave';
import { classifyDay, useHolidays } from '../data/holidays';
import { StatCard, LedgerPanel } from '../components/Ledger';

export default function ReportsPage() {
  const { employees } = useEmployees();
  const { departments } = useDepartments();
  const { records } = useAttendance();
  const { holidays } = useHolidays();
  const { requests } = useLeaveRequests();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

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

  const leaveByStatus = useMemo(() => {
    return {
      pending: requests.filter((r) => r.status === 'PENDING').length,
      approved: requests.filter((r) => r.status === 'APPROVED').length,
      rejected: requests.filter((r) => r.status === 'REJECTED').length,
    };
  }, [requests]);

  const leaveDaysByType = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of requests) {
      if (r.status !== 'APPROVED') continue;
      totals[r.type] = (totals[r.type] ?? 0) + leaveDayCount(r);
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [requests]);

  const offDayWork = useMemo(() => {
    let holidayHours = 0;
    let weeklyOffHours = 0;
    for (const record of records) {
      if (!record.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)) continue;
      const hours = totalHoursForMonth([record], record.employee_id, year, month);
      const classification = classifyDay(record.date, holidays);
      if (classification === 'HOLIDAY') holidayHours += hours;
      if (classification === 'WEEKLY_OFF') weeklyOffHours += hours;
    }
    return { holidayHours, weeklyOffHours };
  }, [records, holidays, year, month]);

  // Attendance summary: employees who actually have attendance history this month.
  const attendanceRows = useMemo(() => {
    const withHistory = employees.filter((e) => records.some((r) => r.employee_id === e.id));
    return withHistory
      .map((e) => {
        const total = totalHoursForMonth(records, e.id, year, month);
        const required = requiredHoursForEmployeeMonth(records, e.id, year, month, holidays);
        return { employee: e, total, required, variance: Math.round((total - required) * 10) / 10 };
      })
      .sort((a, b) => a.variance - b.variance);
  }, [employees, records, year, month, holidays]);

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
        <StatCard label="Headcount (active)" value={activeCount} status="present" />
        <StatCard label="Inactive" value={inactiveCount} status="neutral" />
        <StatCard label="Attrition rate" value={`${attritionRate}%`} status={attritionRate > 10 ? 'absent' : 'structure'} />
        <StatCard label="Departments" value={departments.length} status="structure" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Headcount by department">
          {deptBreakdown.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
              style={{ borderColor: 'var(--line-soft)' }}
            >
              <span className="h-8 w-[3px] shrink-0" style={{ background: 'var(--accent-structure)' }} />
              <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>
                {d.name}
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                {d.count} people
              </span>
            </div>
          ))}
        </LedgerPanel>

        <LedgerPanel title="Leave — this year">
          <div className="grid grid-cols-3 gap-3 px-5 py-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--status-pending)' }}>
                Pending
              </p>
              <p className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                {leaveByStatus.pending}
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--status-present)' }}>
                Approved
              </p>
              <p className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                {leaveByStatus.approved}
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--status-absent)' }}>
                Rejected
              </p>
              <p className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                {leaveByStatus.rejected}
              </p>
            </div>
          </div>
          <div className="border-t px-5 py-3" style={{ borderColor: 'var(--line-soft)' }}>
            <p className="font-mono mb-2 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Approved days by type
            </p>
            {leaveDaysByType.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No approved leave yet.
              </p>
            ) : (
              leaveDaysByType.map(([type, days]) => (
                <div key={type} className="flex items-center justify-between py-1 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{type}</span>
                  <span className="font-mono" style={{ color: 'var(--ink)' }}>
                    {days} days
                  </span>
                </div>
              ))
            )}
          </div>
        </LedgerPanel>
      </div>

      <div className="mt-6">
        <LedgerPanel title="Attendance summary — hours vs. required this month">
          {attendanceRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No attendance history recorded yet.
            </p>
          ) : (
            attendanceRows.map(({ employee, total, required, variance }) => (
              <div
                key={employee.id}
                className="flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <span
                  className="h-8 w-[3px] shrink-0"
                  style={{ background: variance >= 0 ? 'var(--status-present)' : 'var(--status-absent)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {employee.name}
                  </p>
                  <p className="font-mono truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {employee.employee_code}
                  </p>
                </div>
                <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {total}h logged
                </span>
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {required}h required
                </span>
                <span
                  className="font-mono w-16 text-right text-xs"
                  style={{ color: variance >= 0 ? 'var(--status-present)' : 'var(--status-absent)' }}
                >
                  {variance >= 0 ? '+' : ''}
                  {variance}h
                </span>
              </div>
            ))
          )}
        </LedgerPanel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Work performed on holidays">
          <p className="px-5 py-5 text-2xl font-semibold" style={{ color: 'var(--accent-holiday)' }}>{offDayWork.holidayHours.toFixed(1)}h</p>
        </LedgerPanel>
        <LedgerPanel title="Work performed on weekly offs">
          <p className="px-5 py-5 text-2xl font-semibold" style={{ color: 'var(--accent-structure)' }}>{offDayWork.weeklyOffHours.toFixed(1)}h</p>
        </LedgerPanel>
      </div>
    </div>
  );
}
