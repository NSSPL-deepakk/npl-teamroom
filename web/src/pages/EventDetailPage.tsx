import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useEmployees } from '../data/employees';
import { formatHolidayDateTime, getComputedEmployeeEvents, resolveEventImage, useHolidays, type HolidayCategory } from '../data/holidays';

type EventDetailData = {
    id: string;
    name: string;
    date: string;
    event_time?: string | null;
    category: HolidayCategory | 'Announcement' | 'Birthday' | 'Anniversary';
    description?: string | null;
    image?: string | null;
    kind?: 'Holiday' | 'Announcement' | 'Birthday' | 'Anniversary';
};

function eventStyle(category: EventDetailData['category']) {
    switch (category) {
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
        default:
            return { background: 'var(--accent-holiday-bg)', color: 'var(--accent-holiday)' };
    }
}

export default function EventDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { state } = useLocation() as { state?: { event?: EventDetailData } };
    const { employees } = useEmployees();
    const { holidays } = useHolidays();

    const event = useMemo<EventDetailData | null>(() => {
        if (state?.event) return state.event;

        const manual = holidays.find((item) => item.id === id);
        if (manual) {
            return {
                id: manual.id,
                name: manual.name,
                date: manual.date,
                event_time: manual.event_time ?? null,
                category: manual.category,
                description: manual.description ?? null,
                image: manual.image ?? null,
                kind: manual.category === 'Announcement' ? 'Announcement' : 'Holiday',
            };
        }

        for (const employee of employees) {
            const computed = getComputedEmployeeEvents(employee).find((item) => item.id === id);
            if (computed) return computed;
        }

        return null;
    }, [employees, holidays, id, state]);

    if (!event) {
        return (
            <div className="mx-auto max-w-2xl rounded-xl border bg-white p-8" style={{ borderColor: 'var(--line-soft)' }}>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Event not found</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    The selected event could not be loaded.
                </p>
                <button
                    onClick={() => navigate('/holidays')}
                    className="mt-5 px-4 py-2 text-sm font-medium"
                    style={{ background: 'var(--accent-holiday)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                >
                    Back to calendar
                </button>
            </div>
        );
    }

    const imageSrc = resolveEventImage(event.image ?? null, event.name, event.category);
    const style = eventStyle(event.category);

    return (
        <div className="mx-auto max-w-4xl">
            <button
                onClick={() => navigate('/holidays')}
                className="mb-5 font-mono text-[11px] uppercase tracking-wide hover:underline"
                style={{ color: 'var(--accent-holiday)' }}
            >
                ← Back to calendar
            </button>

            <div className="overflow-hidden border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="grid gap-0 md:grid-cols-[260px_1fr]">
                    <div className="border-b bg-[var(--paper)] p-5 md:border-b-0 md:border-r" style={{ borderColor: 'var(--line-soft)' }}>
                        <img
                            src={imageSrc}
                            alt={event.name}
                            className="h-52 w-full rounded-lg object-cover"
                            style={{ border: '1px solid var(--line-soft)' }}
                        />
                    </div>

                    <div className="p-6 md:p-8">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono px-2 py-1 text-[10px] uppercase" style={{ ...style, borderRadius: 'var(--radius-sm)' }}>
                                {event.category}
                            </span>
                        </div>

                        <h1 className="mt-4 text-3xl font-semibold" style={{ color: 'var(--ink)' }}>
                            {event.name}
                        </h1>

                        <div className="mt-4 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <p>
                                <span className="font-medium" style={{ color: 'var(--ink)' }}>Date:</span> {formatHolidayDateTime(event.date, event.event_time)}
                            </p>
                            <p>
                                <span className="font-medium" style={{ color: 'var(--ink)' }}>Type:</span> {event.kind ?? 'Event'}
                            </p>
                        </div>

                        <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)' }}>
                            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                                Event details
                            </p>
                            {event.description ? (
                                <div className="mt-2 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                                    <ReactMarkdown
                                        components={{
                                            h1: ({ children }) => <h1 className="mb-3 text-xl font-semibold" style={{ color: 'var(--ink)' }}>{children}</h1>,
                                            h2: ({ children }) => <h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{children}</h2>,
                                            h3: ({ children }) => <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--accent-holiday)' }}>{children}</h3>,
                                            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                            strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--ink)' }}>{children}</strong>,
                                            em: ({ children }) => <em className="italic">{children}</em>,
                                            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                                            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                                            a: ({ children, href }) => <a href={href} className="underline" style={{ color: 'var(--accent-holiday)' }} target="_blank" rel="noreferrer">{children}</a>,
                                            code: ({ children }) => <code className="rounded px-1 py-0.5 font-mono text-xs" style={{ background: 'var(--line-soft)', color: 'var(--accent-holiday)' }}>{children}</code>,
                                        }}
                                    >
                                        {event.description}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink)' }}>
                                    No additional notes were added for this event.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
