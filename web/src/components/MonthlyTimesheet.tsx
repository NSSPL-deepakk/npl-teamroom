import { useState } from 'react';
import { hoursBetween, recordsForMonth, requiredHoursForEmployeeMonth, totalHoursForMonth, type AttendanceRecord } from '../data/attendance';
import { useHolidays } from '../data/holidays';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit' });
}

export function MonthlyTimesheet({ employeeId, records }: { employeeId: string; records: AttendanceRecord[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const { holidays } = useHolidays();

  const monthRecords = recordsForMonth(records, employeeId, year, month);
  const total = totalHoursForMonth(records, employeeId, year, month);
  const required = requiredHoursForEmployeeMonth(records, employeeId, year, month, holidays);
  const variance = Math.round((total - required) * 10) / 10;

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setMonth(m);
    setYear(y);
  }

  return (
    <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
      <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Monthly timesheet
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="px-2 py-1 font-mono text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            ←
          </button>
          <span className="font-mono w-32 text-center text-xs uppercase tracking-wide" style={{ color: 'var(--ink)' }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="px-2 py-1 font-mono text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            →
          </button>
        </div>
      </div>

      {monthRecords.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No attendance recorded for this month.
        </p>
      ) : (
        <>
          {monthRecords.map((r) => {
            const hrs = hoursBetween(r.check_in, r.check_out);
            return (
              <div
                key={r.id}
                className="flex items-center gap-4 border-b px-5 py-2.5 last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <span className="w-16 shrink-0 text-sm" style={{ color: 'var(--ink)' }}>
                  {formatDay(r.date)}
                </span>
                <span className="font-mono w-32 shrink-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {r.check_in ?? '—'} → {r.check_out ?? '—'}
                </span>
                <span
                  className="font-mono w-fit px-2 py-0.5 text-[11px] uppercase"
                  style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}
                >
                  {r.work_mode}
                </span>
                <span className="font-mono ml-auto text-xs" style={{ color: hrs ? 'var(--ink)' : 'var(--text-muted)' }}>
                  {hrs != null ? `${hrs} hrs` : '—'}
                </span>
              </div>
            );
          })}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ background: 'var(--paper)' }}
          >
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Total this month
              </span>
              <span className="font-mono ml-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                required {required}h
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-xs"
                style={{ color: variance >= 0 ? 'var(--status-present)' : 'var(--status-absent)' }}
              >
                {variance >= 0 ? '+' : ''}
                {variance}h
              </span>
              <span className="font-display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                {total} hrs
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
