import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { StatusTag } from '../components/Ledger';
import { useRecruitment } from '../data/recruitment';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

export default function JobOpeningDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { role } = useOutletContext<Ctx>();
    const { openings, loading, error } = useRecruitment();

    if (role !== 'HR' && role !== 'SUPER_ADMIN') {
        return <div className="border bg-white p-8 text-center" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>Recruitment is available to HR only.</div>;
    }

    if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading job opening...</div>;
    if (error) return <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;

    const opening = openings.find((item) => item.id === id);
    if (!opening) {
        return <div className="space-y-4"><button type="button" onClick={() => navigate('/recruitment')} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-holiday)' }}>Back to recruitment</button><div className="border bg-white px-5 py-10 text-center text-sm" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>Job opening not found.</div></div>;
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <button type="button" onClick={() => navigate('/recruitment')} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-holiday)' }}>Back to recruitment</button>
            <section className="border bg-white p-6 md:p-8" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6" style={{ borderColor: 'var(--line-soft)' }}>
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-present)' }}>Job opening</p>
                        <h1 className="font-display mt-1 text-3xl font-semibold" style={{ color: 'var(--ink)' }}>{opening.title}</h1>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{opening.department} / {opening.hiring_manager} / {opening.employment_type} / {opening.location || 'Location not specified'} / {opening.experience || 'Experience not specified'}</p>
                    </div>
                    <StatusTag label={opening.status} status={opening.status === 'OPEN' ? 'present' : opening.status === 'PAUSED' ? 'pending' : 'absent'} />
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Job Description</h2>
                        <div className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}><ReactMarkdown>{opening.description || 'No job description provided.'}</ReactMarkdown></div>
                    </div>
                    <div className="border bg-[var(--paper)] p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Job Information</h2>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Department</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.department}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Hiring Manager</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.hiring_manager}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Number of Positions</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.positions}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Employment Type</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.employment_type}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Experience Required</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.experience || 'Not specified'}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Location</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.location || 'Not specified'}</dd></div>
                            <div><dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</dt><dd className="mt-1" style={{ color: 'var(--ink)' }}>{opening.status}</dd></div>
                        </dl>
                    </div>
                </div>
            </section>
        </div>
    );
}
