import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useEmployees } from '../data/employees';
import { formatHolidayDateTime, getComputedEmployeeEvents, getTodayIso, resolveEventImage, stripMarkdown, useHolidays, type HolidayCategory } from '../data/holidays';
import type { Role } from '../data/roles';
import { ConfirmDialog } from '../components/ConfirmDialog';

type Ctx = { role: Role };
type FilterKey = 'ALL' | 'Holiday' | 'Announcement' | 'Birthday' | 'Anniversary';

type CalendarRow = {
  id: string;
  date: string;
  event_time?: string | null;
  name: string;
  kind: 'Holiday' | 'Announcement' | 'Birthday' | 'Anniversary';
  group: HolidayCategory | 'Birthday' | 'Anniversary';
  description?: string | null;
  image?: string | null;
  readOnly: boolean;
  source: 'manual' | 'computed';
  employeeId?: string;
};

const FILTERS: FilterKey[] = ['ALL', 'Holiday', 'Announcement', 'Birthday', 'Anniversary'];
const CATEGORY_OPTIONS: HolidayCategory[] = ['National Holiday', 'Optional Holiday', 'Company Holiday', 'Announcement'];

function rowStyle(group: CalendarRow['group']) {
  switch (group) {
    case 'National Holiday':
    case 'Optional Holiday':
    case 'Company Holiday':
      return { background: 'var(--accent-holiday-bg)', color: 'var(--accent-holiday)' };
    case 'Announcement':
      return { background: '#E0F2FE', color: '#0F766E' };
    case 'Birthday':
      return { background: '#F3F4F6', color: '#475467' };
    case 'Anniversary':
      return { background: '#F5F3FF', color: '#6D28D9' };
  }
}

export default function HolidaysPage() {
  const navigate = useNavigate();
  const { role } = useOutletContext<Ctx>();
  const canManage = role === 'SUPER_ADMIN' || role === 'HR';
  const { holidays, addHoliday, updateHoliday, removeHoliday } = useHolidays();
  const { employees, updateEmployee } = useEmployees();

  const [date, setDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<HolidayCategory>('Company Holiday');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageError, setMessageError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [removeId, setRemoveId] = useState<string | null>(null);

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  const generatedRows = useMemo<CalendarRow[]>(() => {
    return employees.flatMap((employee) => getComputedEmployeeEvents(employee)).map((event) => ({
      id: event.id,
      date: event.date,
      event_time: null,
      name: event.name,
      kind: event.kind,
      group: event.category,
      description: event.description,
      image: event.image,
      readOnly: true,
      source: 'computed',
      employeeId: event.employeeId,
    }));
  }, [employees]);

  const combined = useMemo<CalendarRow[]>(() => {
    const manual: CalendarRow[] = holidays.map((h) => ({
      id: h.id,
      date: h.date,
      event_time: h.event_time ?? null,
      name: h.name,
      kind: h.category === 'Announcement' ? 'Announcement' : 'Holiday',
      group: h.category,
      description: h.description ?? null,
      image: h.image ?? null,
      readOnly: false,
      source: 'manual',
    }));

    return [...manual, ...generatedRows].filter((row) => row.date >= getTodayIso()).sort((a, b) => a.date.localeCompare(b.date));
  }, [generatedRows, holidays]);

  const filtered = combined.filter((row) => {
    if (filter === 'ALL') return true;
    if (filter === 'Holiday') return row.kind === 'Holiday';
    return row.kind === filter;
  });

  function resetForm() {
    setDate('');
    setEventTime('');
    setName('');
    setDescription('');
    setCategory('Company Holiday');
    setImagePreview(null);
    setEditingId(null);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !eventTime || !name.trim()) return;

    const payload = {
      date,
      event_time: eventTime,
      name: name.trim(),
      category,
      description: description.trim() || null,
      image: imagePreview ?? null,
    };

    if (editingId) {
      updateHoliday(editingId, payload);
    } else {
      addHoliday(payload);
    }

    resetForm();
  }

  function handleEdit(row: CalendarRow) {
    setEditingId(row.id);
    setDate(row.date);
    setEventTime(row.event_time?.slice(0, 5) ?? '');
    setName(row.name);
    setDescription(row.description ?? '');
    setCategory(row.group as HolidayCategory);
    setImagePreview(row.image ?? null);
  }

  function startMessageEdit(row: CalendarRow) {
    setEditingMessageId(row.id);
    setMessageDraft(row.description ?? '');
    setMessageError('');
  }

  async function saveMessage(row: CalendarRow) {
    if (!row.employeeId) return;
    const field = row.kind === 'Birthday' ? 'birthday_message' : 'anniversary_message';
    const error = await updateEmployee(row.employeeId, { [field]: messageDraft.trim() || null });
    if (error) {
      setMessageError(error);
      return;
    }
    setEditingMessageId(null);
    setMessageDraft('');
    setMessageError('');
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-holiday)' }}>
        Calendar
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Holidays & Events
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {canManage
          ? 'Manage public holidays, announcements, birthday, and anniversary reminders.'
          : 'The organization calendar and key employee milestones.'}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors"
            style={{
              background: filter === tab ? 'var(--ink)' : 'white',
              color: filter === tab ? 'var(--text-on-ink)' : 'var(--text-secondary)',
              borderColor: 'var(--line)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={`mt-6 grid gap-6 ${canManage ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {filtered.length} item{filtered.length !== 1 ? 's' : ''} in view
            </h3>
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No items in this category yet.
            </p>
          ) : (
            <ul>
              {filtered.map((row) => {
                const tag = rowStyle(row.group);
                return (
                  <li
                    key={row.id}
                    onClick={() => navigate(`/events/${row.id}`, { state: { event: row } })}
                    className="flex cursor-pointer items-center gap-4 border-b px-5 py-3.5 last:border-b-0"
                    style={{ borderColor: 'var(--line-soft)' }}
                  >
                    <img
                      src={resolveEventImage(row.image ?? null, row.name, row.group)}
                      alt={row.name}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                      style={{ border: '1px solid var(--line-soft)' }}
                    />
                    <span
                      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center leading-none"
                      style={{
                        background: 'var(--accent-holiday-bg)',
                        color: 'var(--accent-holiday)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <span className="font-mono text-sm font-semibold">{row.date.slice(8, 10)}</span>
                      <span className="font-mono text-[9px] uppercase">
                        {new Date(row.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {row.name}
                      </p>
                      {row.description && (
                        <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {stripMarkdown(row.description)}
                        </p>
                      )}
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {formatHolidayDateTime(row.date, row.event_time)}
                      </p>
                    </div>
                    <span className="font-mono px-2 py-0.5 text-[10px] uppercase" style={{ ...tag, borderRadius: 'var(--radius-sm)' }}>
                      {row.group}
                    </span>
                    {canManage && row.source === 'manual' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(row);
                          }}
                          className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                          style={{ color: 'var(--accent-holiday)' }}
                          aria-label={`Edit ${row.name}`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setRemoveId(row.id);
                          }}
                          className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                          style={{ color: 'var(--status-absent)' }}
                          aria-label={`Remove ${row.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {canManage && row.source === 'computed' && (
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        {editingMessageId === row.id ? (
                          <div className="flex items-center gap-2">
                            <textarea
                              value={messageDraft}
                              onChange={(event) => setMessageDraft(event.target.value)}
                              rows={2}
                              className="w-48 border px-2 py-1 text-xs outline-none"
                              style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                            />
                            {messageError && <span className="text-[11px]" style={{ color: 'var(--status-absent)' }}>{messageError}</span>}
                            <button
                              onClick={() => saveMessage(row)}
                              className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                              style={{ color: 'var(--accent-holiday)' }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startMessageEdit(row)}
                            className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                            style={{ color: 'var(--accent-holiday)' }}
                          >
                            Edit message
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canManage && (
          <div
            className="h-fit border bg-white p-5"
            style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {editingId ? 'Edit item' : 'Add an item'}
            </h3>
            <form onSubmit={handleAdd} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Event Date
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Event Time
                  </span>
                  <input
                    type="time"
                    required
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Name
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Town hall"
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as HolidayCategory)}
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Description / message
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a short note, birthday message, or event summary"
                  rows={3}
                  className="mt-1.5 w-full resize-none border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                />
              </label>

              <div className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Image (optional)
                </span>
                <div className="mt-1.5 flex items-center gap-3">
                  <label
                    className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden border border-dashed bg-white"
                    style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Event preview" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl" aria-hidden="true">
                        {category.includes('Birthday') || name.toLowerCase().includes('birthday') ? '🎂' : '🎉'}
                      </span>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <label className="cursor-pointer font-medium underline" style={{ color: 'var(--accent-holiday)' }}>
                      Add Image
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={() => setImagePreview(null)}
                        className="text-left font-medium underline"
                        style={{ color: 'var(--status-absent)' }}
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full py-2 text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: 'var(--text-secondary)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent-holiday)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
              >
                {editingId ? 'Save changes' : 'Add item'}
              </button>
            </form>
          </div>
        )}
      </div>
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) removeHoliday(removeId); setRemoveId(null); }} />
    </div>
  );
}
