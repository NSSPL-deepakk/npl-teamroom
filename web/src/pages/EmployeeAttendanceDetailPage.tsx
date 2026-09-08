import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
    daySessionsForMonth,
    hoursBetween,
    requiredHoursForEmployeeMonth,
    STANDARD_SHIFT_END,
    STANDARD_HOURS_PER_DAY,
    totalHoursForMonth,
    useAttendance,
    type AttendanceRecord,
} from '../data/attendance';
import { useEmployees, type WorkMode } from '../data/employees';
import { classifyDay, useHolidays } from '../data/holidays';
import { useLeaveRequests } from '../data/leave';
import type { Role } from '../data/roles';
import { ConfirmDialog } from '../components/ConfirmDialog';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORK_MODES: WorkMode[] = ['OFFICE', 'WFH', 'HYBRID'];

type Context = { role: Role };
type ApprovalAction = { id: string; action: 'approve' | 'reject' } | null;

function formatDuration(minutes: number): string {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function sessionMinutes(session: AttendanceRecord): number {
    return Math.round((hoursBetween(session.check_in, session.check_out) ?? 0) * 60);
}

function formatTime(time: string | null): string {
    if (!time) return '—';
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export default function EmployeeAttendanceDetailPage() {
    const navigate = useNavigate();
    const { role } = useOutletContext<Context>();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const { employees } = useEmployees();
    const { records, addManualEntry, updateAttendanceRecord, approveRecord, rejectRecord, audit, today, loading, error } = useAttendance();
    const { holidays } = useHolidays();
    const { requests: leaveRequests } = useLeaveRequests();

    const employee = employees.find((item) => item.id === params.employeeId) ?? null;
    const month = Number(searchParams.get('month') ?? new Date().getMonth() + 1);
    const year = Number(searchParams.get('year') ?? new Date().getFullYear());

    const [manualMode, setManualMode] = useState(false);
    const [manualForm, setManualForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        check_in: '09:00',
        check_out: '18:00',
        work_mode: 'OFFICE' as WorkMode,
        manual_entry_reason: '',
        early_checkout_reason: '',
        overtime_reason: '',
    });
    const [selectedDate, setSelectedDate] = useState(today);
    const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ check_in: '09:00', check_out: '18:00', work_mode: 'OFFICE' as WorkMode, reason: '', early_checkout_reason: '', overtime_reason: '' });
    const [historyVisible, setHistoryVisible] = useState(false);
    const [workDoneToday, setWorkDoneToday] = useState('');
    const [approvalAction, setApprovalAction] = useState<ApprovalAction>(null);

    const sessionsByDay = useMemo(() => {
        if (!employee) return [] as Array<{ date: string; sessions: AttendanceRecord[]; total: number }>;
        return daySessionsForMonth(records, employee.id, year, month);
    }, [employee, records, year, month]);

    const required = employee ? requiredHoursForEmployeeMonth(records, employee.id, year, month, holidays, STANDARD_HOURS_PER_DAY) : 0;
    const logged = employee ? totalHoursForMonth(records, employee.id, year, month) : 0;
    const variance = Math.round((logged - required) * 10) / 10;

    const superAdminDays = useMemo(() => {
        if (!employee) return [] as Array<{ date: string; sessions: AttendanceRecord[]; total: number; status: string; overtime: number; hasManualEntry: boolean; hasEarlyCheckout: boolean; manualReason: string | null; earlyCheckoutReason: string | null; overtimeReason: string | null }>;
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        const lastDay = new Date(year, month, 0).getDate();
        return Array.from({ length: lastDay }, (_, index) => {
            const date = `${prefix}-${String(index + 1).padStart(2, '0')}`;
            const sessions = records.filter((record) => record.employee_id === employee.id && record.date === date).sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
            const total = sessions.reduce((sum, session) => sum + sessionMinutes(session), 0);
            const isFuture = date > today;
            const classification = classifyDay(date, holidays);
            const isLeave = leaveRequests.some((request) => request.employee_id === employee.id && request.status === 'APPROVED' && date >= request.start_date && date <= request.end_date);
            const hasPunch = sessions.some((session) => session.check_in || session.check_out);
            const manualSessions = sessions.filter((session) => session.is_manual_entry);
            const earlySessions = sessions.filter((session) => session.is_early_checkout);
            const overtimeSession = sessions.find((session) => session.overtime_minutes > 0);
            const status = isFuture ? 'UPCOMING' : classification === 'HOLIDAY' ? (hasPunch ? 'HOLIDAY WORKED' : 'HOLIDAY') : classification === 'WEEKLY_OFF' ? (hasPunch ? 'WEEKLY OFF WORKED' : 'WEEKLY OFF') : isLeave ? 'LEAVE' : hasPunch ? 'PRESENT' : 'ABSENT';
            return { date, sessions, total, status, overtime: Math.max(0, total - 9 * 60), hasManualEntry: manualSessions.length > 0, hasEarlyCheckout: earlySessions.length > 0, manualReason: manualSessions.find((session) => session.manual_entry_reason)?.manual_entry_reason ?? null, earlyCheckoutReason: earlySessions.find((session) => session.early_checkout_reason)?.early_checkout_reason ?? null, overtimeReason: overtimeSession?.overtime_reason ?? null };
        }).sort((a, b) => a.date.localeCompare(b.date));
    }, [employee, records, year, month, holidays, leaveRequests, today]);

    const superAdminSummary = useMemo(() => {
        const completed = superAdminDays.filter((day) => day.date <= today);
        const requiredMinutes = required * 60;
        const workedMinutes = completed.reduce((sum, day) => sum + day.total, 0);
        const presentDays = completed.filter((day) => day.status === 'PRESENT' || day.status.endsWith('WORKED')).length;
        const absentDays = completed.filter((day) => day.status === 'ABSENT').length;
        const leaveDays = completed.filter((day) => day.status === 'LEAVE').length;
        const wfhDays = completed.filter((day) => day.sessions.some((session) => session.work_mode === 'WFH')).length;
        return { requiredMinutes, workedMinutes, overtime: Math.max(0, workedMinutes - requiredMinutes), shortfall: Math.max(0, requiredMinutes - workedMinutes), attendance: requiredMinutes ? Math.min(100, (presentDays / (requiredMinutes / (9 * 60))) * 100) : 0, presentDays, absentDays, leaveDays, wfhDays };
    }, [superAdminDays, today, required]);

    const selectedSuperDay = superAdminDays.find((day) => day.date === selectedDate) ?? superAdminDays[0];
    const superAdminRows = superAdminDays.flatMap<{ day: (typeof superAdminDays)[number]; session: AttendanceRecord | null }>((day) => day.sessions.length > 0 ? day.sessions.map((session) => ({ day, session })) : [{ day, session: null }]);
    const selectedAudit = audit.filter((entry) => selectedSuperDay?.sessions.some((session) => session.id === entry.record_id));
    const todayRowRef = useRef<HTMLTableRowElement | null>(null);

    useEffect(() => {
        if (month === new Date().getMonth() + 1 && year === new Date().getFullYear()) {
            todayRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [month, year]);

    function handleManualSave(event: React.FormEvent) {
        event.preventDefault();
        if (!employee) return;
        if (!manualForm.manual_entry_reason.trim()) return;
        if (manualForm.check_out < STANDARD_SHIFT_END && !manualForm.early_checkout_reason.trim()) return;
        const overtimeMinutes = Math.max(0, Math.round((hoursBetween(manualForm.check_in, manualForm.check_out) ?? 0) * 60) - STANDARD_HOURS_PER_DAY * 60);
        if (overtimeMinutes > 0 && !manualForm.overtime_reason.trim()) return;
        const saved = addManualEntry(employee.id, {
            date: manualForm.date,
            check_in: manualForm.check_in,
            check_out: manualForm.check_out,
            work_mode: manualForm.work_mode,
            manual_entry_reason: manualForm.manual_entry_reason,
            early_checkout_reason: manualForm.early_checkout_reason,
            overtime_reason: manualForm.overtime_reason,
            is_overtime: holidays.some((holiday) => holiday.date === manualForm.date),
            work_done_today: workDoneToday,
        });
        if (saved) {
            setManualMode(false);
            setWorkDoneToday('');
        }
    }

    if (!employee) {
        return (
            <div className="mx-auto max-w-xl rounded-xl border bg-white p-8" style={{ borderColor: 'var(--line-soft)' }}>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Employee not found</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    The selected employee attendance record could not be loaded.
                </p>
                <button
                    onClick={() => navigate('/attendance')}
                    className="mt-5 px-4 py-2 text-sm font-medium"
                    style={{ background: 'var(--accent-holiday)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                >
                    Back to attendance
                </button>
            </div>
        );
    }

    if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading attendance…</div>;

    function openEdit(record: AttendanceRecord) {
        setEditingRecordId(record.id);
        setEditForm({ check_in: record.check_in ?? '09:00', check_out: record.check_out ?? '18:00', work_mode: record.work_mode, reason: '', early_checkout_reason: record.early_checkout_reason ?? '', overtime_reason: record.overtime_reason ?? '' });
    }

    function saveEdit(event: React.FormEvent) {
        event.preventDefault();
        if (!editingRecordId || !editForm.reason.trim()) return;
        const overtimeMinutes = Math.max(0, Math.round((hoursBetween(editForm.check_in || null, editForm.check_out || null) ?? 0) * 60) - STANDARD_HOURS_PER_DAY * 60);
        const earlyCheckout = Boolean(editForm.check_out && editForm.check_out < STANDARD_SHIFT_END);
        if (earlyCheckout && !editForm.early_checkout_reason.trim()) return;
        if (overtimeMinutes > 0 && !editForm.overtime_reason.trim()) return;
        const saved = updateAttendanceRecord(editingRecordId, { check_in: editForm.check_in || null, check_out: editForm.check_out || null, work_mode: editForm.work_mode, early_checkout_reason: editForm.early_checkout_reason, overtime_reason: editForm.overtime_reason }, editForm.reason);
        if (saved) setEditingRecordId(null);
        setEditForm((prev) => ({ ...prev, reason: '' }));
    }

    if (role === 'SUPER_ADMIN' || role === 'HR') {
        const canManage = role === 'SUPER_ADMIN' || role === 'HR';
        const selectedStatus = selectedSuperDay?.status ?? 'UPCOMING';
        const statusColor = selectedStatus === 'PRESENT' ? 'var(--status-present)' : selectedStatus === 'LEAVE' ? '#F59E0B' : selectedStatus === 'HOLIDAY' ? '#8B5CF6' : selectedStatus === 'ABSENT' ? 'var(--status-absent)' : 'var(--text-muted)';
        return (
            <div className="mx-auto max-w-6xl space-y-6">
                <ConfirmDialog open={approvalAction !== null} message={approvalAction?.action === 'approve' ? 'Are you sure you want to approve this record?' : 'Are you sure you want to reject this record?'} onCancel={() => setApprovalAction(null)} onConfirm={() => { if (approvalAction?.action === 'approve') approveRecord(approvalAction.id); if (approvalAction?.action === 'reject') rejectRecord(approvalAction.id); setApprovalAction(null); }} />
                {error && <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => navigate(`/attendance?month=${month}&year=${year}`)} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-holiday)' }}>← Back to Employee Attendance</button>
                    {canManage && <button onClick={() => { setManualForm((prev) => ({ ...prev, date: selectedSuperDay?.date ?? today })); setManualMode((prev) => !prev); }} className="border px-3 py-2 text-xs font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>{manualMode ? 'Close form' : 'Add attendance'}</button>}
                </div>

                <div className="border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold" style={{ color: 'var(--ink)' }}>{employee.name} <span style={{ color: 'var(--text-secondary)' }}>· Attendance</span></h1><p className="mt-2 font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{employee.employee_code} · {MONTH_NAMES[month - 1]} {year}</p></div><span className="font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Super Admin view</span></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {[['Required Hours', formatDuration(superAdminSummary.requiredMinutes)], ['Worked Hours', formatDuration(superAdminSummary.workedMinutes)], ['Overtime', formatDuration(superAdminSummary.overtime)], ['Shortfall', formatDuration(superAdminSummary.shortfall)], ['Attendance %', `${superAdminSummary.attendance.toFixed(1)}%`], ['Present Days', String(superAdminSummary.presentDays)], ['Absent Days', String(superAdminSummary.absentDays)], ['Leave Days', String(superAdminSummary.leaveDays)], ['WFH Days', String(superAdminSummary.wfhDays)]].map(([label, value]) => <div key={label} className="border p-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)', background: 'var(--paper)' }}><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="mt-1 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{value}</p></div>)}
                    </div>
                </div>

                {canManage && manualMode && <form onSubmit={(event) => { event.preventDefault(); if (!manualForm.date || !manualForm.check_in || !manualForm.check_out || !manualForm.manual_entry_reason.trim()) return; const saved = addManualEntry(employee.id, manualForm); if (saved) { setManualMode(false); setSelectedDate(manualForm.date); } }} className="grid gap-3 border bg-white p-4 md:grid-cols-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}><input type="date" value={manualForm.date} onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><input type="time" value={manualForm.check_in} onChange={(e) => setManualForm((prev) => ({ ...prev, check_in: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><input type="time" value={manualForm.check_out} onChange={(e) => setManualForm((prev) => ({ ...prev, check_out: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><select value={manualForm.work_mode} onChange={(e) => setManualForm((prev) => ({ ...prev, work_mode: e.target.value as WorkMode }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>{WORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select><input required value={manualForm.manual_entry_reason} onChange={(e) => setManualForm((prev) => ({ ...prev, manual_entry_reason: e.target.value }))} placeholder="Reason for manual entry" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><input value={manualForm.early_checkout_reason} onChange={(e) => setManualForm((prev) => ({ ...prev, early_checkout_reason: e.target.value }))} placeholder={`Early checkout reason (before ${STANDARD_SHIFT_END})`} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><input value={manualForm.overtime_reason} onChange={(e) => setManualForm((prev) => ({ ...prev, overtime_reason: e.target.value }))} placeholder="Overtime reason (if applicable)" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><button type="submit" className="px-3 py-2 text-sm font-medium" style={{ background: 'var(--accent-holiday)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Add attendance</button></form>}

                {(role === 'HR' || role === 'SUPER_ADMIN') && selectedSuperDay?.sessions.some((session) => session.manual_approval_status === 'pending' || session.overtime_approval_status === 'pending') && <div className="border border-amber-300 bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-900">Attendance requests</p><div className="mt-2 space-y-2">{selectedSuperDay.sessions.filter((session) => session.manual_approval_status === 'pending' || session.overtime_approval_status === 'pending').map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-amber-900">{formatTime(session.original_check_in)} → {formatTime(session.original_check_out)} → {formatTime(session.check_in)} → {formatTime(session.check_out)} · {session.manual_entry_reason ?? session.overtime_reason ?? 'Approval required'} · {session.manual_approval_status} · {session.created_at ? new Date(session.created_at).toLocaleString() : 'Created date unavailable'}</span><span className="flex gap-2"><button type="button" onClick={() => setApprovalAction({ id: session.id, action: 'approve' })} className="px-2 py-1 text-xs" style={{ background: 'var(--status-present)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Approve</button><button type="button" onClick={() => setApprovalAction({ id: session.id, action: 'reject' })} className="border px-2 py-1 text-xs" style={{ borderColor: '#FCA5A5', color: '#B91C1C', borderRadius: 'var(--radius-sm)' }}>Reject</button></span></div>)}</div></div>}
                <div className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
                    <div className="overflow-hidden border bg-white shadow-sm" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Monthly attendance</h2></div>
                        <div className="max-h-[620px] overflow-y-auto">
                            <table className="w-full min-w-[1180px] table-fixed text-left" style={{ borderCollapse: 'collapse' }}>
                                <colgroup><col className="w-[17%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[15%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[22%]" /></colgroup>
                                <thead className="sticky top-0 z-10" style={{ background: 'var(--paper)' }}>
                                    <tr>
                                        {['Date', 'Check In', 'Check Out', 'Hours', 'Overtime', 'Approval Status', 'Manual Entry Reason'].map((heading) => <th key={heading} className={`px-5 py-3 font-mono text-[10px] uppercase tracking-wide ${heading === 'Hours' ? 'text-right' : ''} ${heading === 'Overtime' || heading === 'Approval Status' || heading === 'Manual Entry Reason' ? 'pl-5' : ''}`} style={{ color: 'var(--text-secondary)' }}>{heading}</th>)}
                                    </tr>
                                </thead>
                                <tbody>{superAdminRows.map(({ day, session }, index) => {
                                    const isToday = day.date === today;
                                    const isWorkingDay = day.status === 'PRESENT' || day.status === 'LEAVE';
                                    const isManual = session?.is_manual_entry ?? false;
                                    const isApprovedManual = isManual && session?.manual_approval_status === 'approved';
                                    return <tr key={`${day.date}-${session?.id ?? 'empty'}`} ref={isToday && !session ? todayRowRef : undefined} onClick={() => setSelectedDate(day.date)} className="cursor-pointer border-t transition-colors hover:bg-[var(--paper)]" style={{ borderColor: 'var(--line-soft)', background: isApprovedManual ? '#DCFCE7' : isManual ? '#DC2626' : selectedSuperDay?.date === day.date ? 'rgba(100, 116, 139, 0.08)' : index % 2 === 0 ? '#fff' : 'var(--paper)', color: isManual ? (isApprovedManual ? '#166534' : '#fff') : 'inherit', borderLeft: isToday ? '3px solid #60A5FA' : '3px solid transparent' }}>
                                        <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)' }}>{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}{isToday && <span className="ml-2 inline-flex border px-1.5 py-0.5 align-middle font-mono text-[9px] font-semibold tracking-wide" style={{ borderColor: '#60A5FA', color: '#2563EB', borderRadius: 'var(--radius-sm)' }}>TODAY</span>}</td>
                                        <td className="px-5 py-3.5 font-mono text-xs" style={{ color: session?.check_in ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>{session?.check_in ?? '—'}</td>
                                        <td className="px-5 py-3.5 font-mono text-xs" style={{ color: session?.check_out ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>{session?.check_out ?? '—'}</td>
                                        <td className="px-5 py-3.5 text-right font-mono text-xs font-medium tabular-nums" style={{ color: session ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)') : 'var(--text-muted)' }}>{session ? `${formatDuration(sessionMinutes(session))} (day ${formatDuration(day.total)})` : isWorkingDay && day.total > 0 ? formatDuration(Math.round(day.total)) : '—'}</td>
                                        <td className="pl-5 pr-5 py-3.5 font-mono text-xs" style={{ color: session ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>{session ? `${(session.overtime_minutes / 60).toFixed(1)}h` : '—'}</td>
                                        <td className="pl-5 pr-5 py-3.5 text-xs font-semibold" style={{ color: isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-muted)' }}>{isManual ? `${session?.manual_approval_status?.charAt(0).toUpperCase()}${session?.manual_approval_status?.slice(1)}` : '—'}</td>
                                        <td className="max-w-0 truncate pl-5 pr-5 py-3.5 text-xs" style={{ color: session?.manual_entry_reason ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)') : 'var(--text-muted)' }} title={session?.manual_entry_reason ?? undefined}>{session?.manual_entry_reason ?? '—'}</td>
                                    </tr>;
                                })}</tbody>
                            </table>
                        </div>
                    </div>

                    <aside className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}><div className="border-b px-4 py-3" style={{ borderColor: 'var(--line-soft)' }}><p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>Day details</p><h3 className="mt-1 text-base font-semibold" style={{ color: 'var(--ink)' }}>{selectedSuperDay ? formatDateLabel(selectedSuperDay.date) : 'No date selected'}</h3></div><div className="space-y-4 p-4"><div className="grid grid-cols-2 gap-3"><div><p className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Status</p><p className="mt-1 text-sm font-semibold" style={{ color: statusColor }}>{selectedStatus}</p></div><div><p className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Total</p><p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{formatDuration(selectedSuperDay?.total ?? 0)}</p></div><div><p className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Work mode</p><p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{selectedSuperDay?.sessions[0]?.work_mode ?? '—'}</p></div><div><p className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-secondary)' }}>Sessions</p><p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{selectedSuperDay?.sessions.length ?? 0}</p></div></div><div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Sessions</p>{selectedSuperDay?.sessions.length ? <div className="mt-2 space-y-2">{selectedSuperDay.sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-2 border p-2.5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}><span className="font-mono text-xs">{formatTime(session.check_in)} → {formatTime(session.check_out)}</span><button onClick={() => openEdit(session)} className="border px-2 py-1 text-[10px] uppercase" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>Edit</button></div>)}</div> : <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>No sessions logged for this day.</p>}</div><button onClick={() => { setManualForm((prev) => ({ ...prev, date: selectedSuperDay?.date ?? today })); setManualMode(true); }} className="w-full border px-3 py-2 text-xs font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>Add missing punch</button><button onClick={() => setHistoryVisible((prev) => !prev)} className="w-full border px-3 py-2 text-xs font-medium" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>{historyVisible ? 'Hide attendance history' : 'View attendance history'}</button>{historyVisible && <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--line-soft)' }}>{selectedAudit.length ? selectedAudit.map((entry) => <div key={entry.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}><p className="font-semibold" style={{ color: 'var(--ink)' }}>Changed By: {entry.changed_by}</p><p>Changed On: {entry.changed_on}</p><p className="mt-1">Previous: {formatTime(entry.previous_check_in)} → {formatTime(entry.previous_check_out)}</p><p>Updated: {formatTime(entry.updated_check_in)} → {formatTime(entry.updated_check_out)}</p><p>Reason: {entry.reason}</p></div>) : <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No changes recorded.</p>}</div>}</div></aside>
                </div>

                {editingRecordId && <form onSubmit={saveEdit} className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}><div className="flex items-center justify-between"><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Edit Attendance</h2><button type="button" onClick={() => setEditingRecordId(null)} className="text-xs" style={{ color: 'var(--text-secondary)' }}>Cancel</button></div><div className="mt-3 grid gap-3 md:grid-cols-2"><input type="time" value={editForm.check_in} onChange={(e) => setEditForm((prev) => ({ ...prev, check_in: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><input type="time" value={editForm.check_out} onChange={(e) => setEditForm((prev) => ({ ...prev, check_out: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} /><select value={editForm.work_mode} onChange={(e) => setEditForm((prev) => ({ ...prev, work_mode: e.target.value as WorkMode }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>{WORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select><input required value={editForm.reason} onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Reason for correction" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />{editForm.check_out < STANDARD_SHIFT_END && <input required value={editForm.early_checkout_reason} onChange={(e) => setEditForm((prev) => ({ ...prev, early_checkout_reason: e.target.value }))} placeholder="Early checkout reason" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />}{(Math.max(0, Math.round((hoursBetween(editForm.check_in, editForm.check_out) ?? 0) * 60) - STANDARD_HOURS_PER_DAY * 60) > 0) && <input required value={editForm.overtime_reason} onChange={(e) => setEditForm((prev) => ({ ...prev, overtime_reason: e.target.value }))} placeholder="Overtime reason" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />}</div><button type="submit" className="mt-3 px-3 py-2 text-xs font-medium" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Save Changes</button></form>}
            </div>
        );
    }

    const visibleDateLabel = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const monthSummary = useMemo(() => {
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        const monthDays = sessionsByDay.filter((day) => day.date.startsWith(monthPrefix));
        const holidaysInMonth = holidays.filter((holiday) => holiday.date.startsWith(monthPrefix));
        const holidayDates = new Set(holidaysInMonth.map((holiday) => holiday.date));
        const weeklyOffDays = monthDays.filter((day) => classifyDay(day.date, holidays) === 'WEEKLY_OFF').length;
        const presentDays = monthDays.filter((day) => day.sessions.length > 0 && !holidayDates.has(day.date) && classifyDay(day.date, holidays) !== 'WEEKLY_OFF').length;
        const absentDays = monthDays.filter((day) => day.sessions.length === 0 && classifyDay(day.date, holidays) === 'WORKING_DAY').length;
        const holidayWorkedDays = monthDays.filter((day) => day.sessions.length > 0 && classifyDay(day.date, holidays) === 'HOLIDAY').length;
        const weeklyOffWorkedDays = monthDays.filter((day) => day.sessions.length > 0 && classifyDay(day.date, holidays) === 'WEEKLY_OFF').length;
        return { presentDays, absentDays, holidays: holidaysInMonth.length, weeklyOffDays, holidayWorkedDays, weeklyOffWorkedDays, totalHours: logged };
    }, [year, month, sessionsByDay, holidays, logged]);

    function changeMonth(delta: number) {
        const nextDate = new Date(year, month - 1 + delta, 1);
        navigate(`/attendance/${employee!.id}?month=${nextDate.getMonth() + 1}&year=${nextDate.getFullYear()}`);
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    onClick={() => navigate('/attendance')}
                    className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                    style={{ color: 'var(--accent-holiday)' }}
                >
                    ← Back to attendance
                </button>
                <div className="flex items-center gap-2">
                    <button onClick={() => changeMonth(-1)} aria-label="Previous month" className="border p-2" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>←</button>
                    <span className="min-w-32 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--ink)' }}>{MONTH_NAMES[month - 1]} {year}</span>
                    <button onClick={() => changeMonth(1)} aria-label="Next month" className="border p-2" style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>→</button>
                    <button
                        onClick={() => setManualMode((prev) => !prev)}
                        className="border px-3 py-2 text-xs font-medium"
                        style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}
                    >
                        {manualMode ? 'Close manual entry' : 'Add manual entry'}
                    </button>
                </div>
            </div>

            <div className="border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold" style={{ color: 'var(--ink)' }}>
                            My Attendance
                        </h1>
                        <p className="mt-2 font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                            {employee.employee_code} · {visibleDateLabel}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/attendance')}
                            className="border px-3 py-2 text-xs font-medium"
                            style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}
                        >
                            View all employee attendance
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="border p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)', background: 'var(--paper)' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Required hours</p>
                        <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{required.toFixed(1)}h</p>
                    </div>
                    <div className="border p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)', background: 'var(--paper)' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Logged hours</p>
                        <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{logged.toFixed(1)}h</p>
                    </div>
                    <div className="border p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)', background: variance < 0 ? '#FEF2F2' : '#F0FDF4' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Variance</p>
                        <p className="mt-2 text-2xl font-semibold" style={{ color: variance < 0 ? '#B91C1C' : '#166534' }}>
                            {variance >= 0 ? '+' : ''}{variance.toFixed(1)}h
                        </p>
                    </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="border px-4 py-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Holiday worked</p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--accent-holiday)' }}>{monthSummary.holidayWorkedDays} days</p>
                    </div>
                    <div className="border px-4 py-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Weekly off worked</p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--accent-structure)' }}>{monthSummary.weeklyOffWorkedDays} days</p>
                    </div>
                    <div className="border px-4 py-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                        <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Weekly offs</p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{monthSummary.weeklyOffDays} days</p>
                    </div>
                </div>
            </div>

            {manualMode && (
                <form onSubmit={handleManualSave} className="grid gap-3 border bg-white p-4 md:grid-cols-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                    <input type="date" value={manualForm.date} onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
                    <input type="time" value={manualForm.check_in} onChange={(e) => setManualForm((prev) => ({ ...prev, check_in: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
                    <input type="time" value={manualForm.check_out} onChange={(e) => setManualForm((prev) => ({ ...prev, check_out: e.target.value }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
                    <select value={manualForm.work_mode} onChange={(e) => setManualForm((prev) => ({ ...prev, work_mode: e.target.value as WorkMode }))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>
                        {WORK_MODES.map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                        ))}
                    </select>
                    <input value={workDoneToday} onChange={(e) => setWorkDoneToday(e.target.value)} placeholder="What did you work on today?" className="border px-3 py-2 text-sm md:col-span-2" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
                    <button type="submit" className="px-3 py-2 text-sm font-medium" style={{ background: 'var(--accent-holiday)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>
                        Save entry
                    </button>
                </form>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ['Present Days', monthSummary.presentDays, 'var(--status-present)'],
                    ['Absent Days', monthSummary.absentDays, 'var(--status-absent)'],
                    ['Holidays', monthSummary.holidays, '#7C3AED'],
                    ['Total Hours Logged', `${monthSummary.totalHours.toFixed(1)}h`, 'var(--accent-structure)'],
                ].map(([label, value, color]) => <div key={label} className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: color as string }}>{value}</p></div>)}
            </div>

            <div className="overflow-hidden border bg-white shadow-sm" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Attendance history</h2></div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-fixed text-left" style={{ borderCollapse: 'collapse' }}>
                        <colgroup><col className="w-[23%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[17%]" /><col className="w-[20%]" /></colgroup>
                        <thead style={{ background: 'var(--paper)' }}><tr>{['Date', 'Check In', 'Check Out', 'Hours', 'Status', 'Manual Entry Reason'].map((heading) => <th key={heading} className={`px-5 py-3 font-mono text-[10px] uppercase tracking-wide ${heading === 'Hours' ? 'text-right' : ''}`} style={{ color: 'var(--text-secondary)' }}>{heading}</th>)}</tr></thead>
                        <tbody>{sessionsByDay.map((day, index) => {
                            const isHoliday = holidays.some((holiday) => holiday.date === day.date);
                            const status = isHoliday ? 'HOLIDAY' : day.sessions.length ? 'PRESENT' : 'ABSENT';
                            const statusColor = status === 'PRESENT' ? 'var(--status-present)' : status === 'HOLIDAY' ? '#7C3AED' : 'var(--status-absent)';
                            const statusBackground = status === 'PRESENT' ? '#ECFDF5' : status === 'HOLIDAY' ? '#F5F3FF' : '#FEF2F2';
                            const firstSession = day.sessions[0];
                            const lastSession = day.sessions[day.sessions.length - 1];
                            const manualReason = day.sessions.find((session) => session.is_manual_entry && session.manual_entry_reason)?.manual_entry_reason ?? null;
                            return <tr key={day.date} className="border-t transition-colors hover:bg-[var(--paper)]" style={{ borderColor: 'var(--line-soft)', background: index % 2 === 0 ? '#fff' : 'var(--paper)' }}><td className="px-5 py-3.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{formatDateLabel(day.date)}</td><td className="px-5 py-3.5 font-mono text-xs" style={{ color: firstSession?.check_in ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{firstSession?.check_in ?? '—'}</td><td className="px-5 py-3.5 font-mono text-xs" style={{ color: lastSession?.check_out ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{lastSession?.check_out ?? '—'}</td><td className="px-5 py-3.5 text-right font-mono text-xs font-medium tabular-nums" style={{ color: day.total > 0 ? 'var(--ink)' : 'var(--text-muted)' }}>{day.total > 0 ? `${day.total.toFixed(1)}h` : '—'}</td><td className="px-5 py-3.5"><span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: statusColor, background: statusBackground }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />{status}</span></td><td className="max-w-0 truncate px-5 py-3.5 text-xs" style={{ color: manualReason ? 'var(--ink)' : 'var(--text-muted)' }} title={manualReason ?? undefined}>{manualReason ?? '—'}</td></tr>;
                        })}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
