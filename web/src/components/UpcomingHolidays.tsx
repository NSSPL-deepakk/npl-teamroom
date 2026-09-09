import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { formatHolidayDateTime, getTodayIso, resolveEventImage, stripMarkdown, useHolidays, type HolidayCategory } from '../data/holidays';
import { useUpcomingEvents } from '../data/events';
import type { Employee } from '../data/employees';

type UpcomingItem = {
  id: string;
  date: string;
  event_time?: string | null;
  name: string;
  category: HolidayCategory | 'Announcement' | 'Birthday' | 'Work Anniversary';
  description?: string | null;
  image?: string | null;
  readOnly: boolean;
};

const TAG_STYLES: Record<string, { background: string; color: string }> = {
  'National Holiday': { background: 'var(--accent-holiday-bg)', color: 'var(--accent-holiday)' },
  'Optional Holiday': { background: 'var(--primary-bg)', color: 'var(--primary)' },
  'Company Holiday': { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral)' },
  Announcement: { background: '#E0F2FE', color: '#0F766E' },
  Birthday: { background: '#F3F4F6', color: '#475467' },
  'Work Anniversary': { background: '#F5F3FF', color: '#6D28D9' },
};

export function UpcomingHolidays({ canManage = false, employees = [] }: { canManage?: boolean; employees?: Employee[] }) {
  const navigate = useNavigate();
  const { holidays } = useHolidays();
  const upcomingEvents = useUpcomingEvents(employees, 5);

  const items = useMemo<UpcomingItem[]>(() => {
    const todayIso = getTodayIso();
    const seen = new Set<string>();

    const mixed: UpcomingItem[] = [];

    for (const h of holidays) {
      if (h.date < todayIso) continue;
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      mixed.push({
        id: h.id,
        date: h.date,
        event_time: h.event_time ?? null,
        name: h.name,
        category: h.category,
        description: h.description ?? null,
        image: h.image ?? null,
        readOnly: false,
      });
    }

    for (const e of upcomingEvents) {
      if (e.date < todayIso) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      mixed.push({
        id: e.id,
        date: e.date,
        name: e.title,
        category: e.kind === 'announcement' ? 'Announcement' : e.kind === 'birthday' ? 'Birthday' : 'Work Anniversary',
        description: e.description ?? null,
        image: e.image ?? null,
        readOnly: true,
      });
    }

    return mixed.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [holidays, upcomingEvents]);

  return (
    <div className="min-w-0 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
      <div
        className="flex items-center justify-between border-b px-5 py-3.5"
        style={{ borderColor: 'var(--line-soft)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Upcoming
        </h3>
        <Link
          to="/holidays"
          className="font-mono text-[11px] uppercase tracking-wide hover:underline"
          style={{ color: 'var(--accent-holiday)' }}
        >
          {canManage ? 'Manage' : 'View all'}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Nothing coming up on the calendar.
        </p>
      ) : (
        <ul>
          {items.map((item) => {
            const tagStyle = TAG_STYLES[item.category] ?? TAG_STYLES['Company Holiday'];
            return (
              <li
                key={item.id}
                onClick={() => navigate(`/events/${item.id}`, { state: { event: item } })}
                className="min-w-0 flex cursor-pointer items-center gap-4 border-b px-5 py-3 last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <img
                  src={resolveEventImage(item.image ?? null, item.name, item.category)}
                  alt={item.name}
                  className="h-11 w-11 shrink-0 rounded-md object-cover"
                  style={{ border: '1px solid var(--line-soft)' }}
                />
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center font-mono text-[10px] font-medium uppercase"
                  style={{
                    background: 'var(--accent-holiday-bg)',
                    color: 'var(--accent-holiday)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {item.date.slice(8, 10)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {stripMarkdown(item.description)}
                    </p>
                  )}
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {formatHolidayDateTime(item.date, item.event_time)}
                  </p>
                </div>
                <span
                  className="font-mono px-2 py-0.5 text-[10px] uppercase"
                  style={{ ...tagStyle, borderRadius: 'var(--radius-sm)' }}
                >
                  {item.category}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
