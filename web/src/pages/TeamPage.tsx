import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { LedgerPanel, StatCard } from '../components/Ledger';
import { useAppData } from '../contexts/AppDataContext';
import { useAttendance } from '../data/attendance';
import { useCurrentEmployee } from '../data/currentUser';
import { useLeaveRequests } from '../data/leave';
import { useTasks } from '../data/tasks';
import type { Role } from '../data/roles';

type Ctx = { role: Role };
type TeamFilter = 'ALL' | 'WORKING' | 'ON_LEAVE' | 'NO_CHECK_IN';

const TEAM_FILTERS: { value: TeamFilter; label: string }[] = [
    { value: 'ALL', label: 'Everyone' },
    { value: 'WORKING', label: 'Checked in' },
    { value: 'ON_LEAVE', label: 'On leave' },
    { value: 'NO_CHECK_IN', label: 'No check-in' },
];

export default function TeamPage() {
    const { role } = useOutletContext<Ctx>();
    const { employees, activeEmployees, employeesLoading, employeesError, departments, designations } = useAppData();
    const manager = useCurrentEmployee(role, employees);
    const today = new Date().toLocaleDateString('en-CA');
    const { records, loading: attendanceLoading, error: attendanceError } = useAttendance({ startDate: today, endDate: today });
    const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests();
    const { tasks, loading: tasksLoading, error: tasksError } = useTasks();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<TeamFilter>('ALL');

    const teamMembers = useMemo(
        () => manager ? activeEmployees.filter((employee) => employee.manager_id === manager.id) : [],
        [activeEmployees, manager],
    );
    const teamIds = useMemo(() => new Set(teamMembers.map((employee) => employee.id)), [teamMembers]);

    const rows = useMemo(() => teamMembers.map((employee) => {
        const sessions = records
            .filter((record) => record.employee_id === employee.id && record.check_in)
            .sort((first, second) => (first.check_in ?? '').localeCompare(second.check_in ?? ''));
        const firstSession = sessions[0] ?? null;
        const lastSession = sessions.at(-1) ?? null;
        const leave = requests.find((request) => (
            request.employee_id === employee.id
            && request.status === 'APPROVED'
            && request.start_date <= today
            && request.end_date >= today
        ));
        const status = firstSession ? lastSession?.check_out ? 'Checked out' : 'Working' : leave ? 'On leave' : 'No check-in';
        const openTasks = tasks.filter((task) => task.assigned_to === employee.id && task.status !== 'COMPLETED').length;
        return {
            employee,
            firstSession,
            status,
            openTasks,
            department: departments.find((department) => department.id === employee.department_id)?.name ?? 'Department unavailable',
            designation: designations.find((designation) => designation.id === employee.designation_id)?.name ?? 'Designation unavailable',
        };
    }), [teamMembers, records, requests, tasks, today, departments, designations]);

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return rows.filter((row) => {
            const matchesSearch = !query
                || row.employee.name.toLowerCase().includes(query)
                || row.employee.employee_code.toLowerCase().includes(query)
                || row.designation.toLowerCase().includes(query);
            const matchesFilter = filter === 'ALL'
                || (filter === 'WORKING' && (row.status === 'Working' || row.status === 'Checked out'))
                || (filter === 'ON_LEAVE' && row.status === 'On leave')
                || (filter === 'NO_CHECK_IN' && row.status === 'No check-in');
            return matchesSearch && matchesFilter;
        });
    }, [rows, search, filter]);

    const checkedInCount = rows.filter((row) => row.firstSession).length;
    const onLeaveCount = rows.filter((row) => row.status === 'On leave').length;
    const pendingLeaveCount = requests.filter((request) => request.status === 'PENDING' && teamIds.has(request.employee_id)).length;
    const openTaskCount = tasks.filter((task) => teamIds.has(task.assigned_to) && task.status !== 'COMPLETED').length;
    const loading = employeesLoading || attendanceLoading || leaveLoading || tasksLoading;
    const error = employeesError || attendanceError || leaveError || tasksError;

    if (loading) {
        return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading your team…</div>;
    }

    if (error) {
        return <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load your team: {error}</div>;
    }

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>Team</p>
                    <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>My team</h1>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {manager ? `${teamMembers.length} active direct report${teamMembers.length === 1 ? '' : 's'}` : 'No employee profile is linked to your manager account.'}
                    </p>
                </div>
                {pendingLeaveCount > 0 && (
                    <Link to="/leave" className="border px-3 py-2 text-sm font-medium" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }}>
                        Review {pendingLeaveCount} pending leave request{pendingLeaveCount === 1 ? '' : 's'}
                    </Link>
                )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Team members" value={teamMembers.length} status="structure" />
                <StatCard label="Checked in today" value={checkedInCount} status="present" />
                <StatCard label="On leave today" value={onLeaveCount} status="pending" />
                <StatCard label="Open tasks" value={openTaskCount} status="neutral" />
            </div>

            <LedgerPanel title="Team roster" action={<span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{filteredRows.length} shown</span>}>
                <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(220px,1fr)_220px]" style={{ borderColor: 'var(--line-soft)' }}>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search name, employee code, or designation"
                        className="border bg-white px-3 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    />
                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as TeamFilter)}
                        className="border bg-white px-3 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                        aria-label="Filter team members by attendance"
                    >
                        {TEAM_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>

                {filteredRows.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        {teamMembers.length === 0 ? 'No direct reports are assigned to you yet.' : 'No team members match these filters.'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left">
                            <thead>
                                <tr style={{ background: 'var(--paper)' }}>
                                    {['Employee', 'Department · Designation', 'Today', 'Work mode', 'Open tasks', ''].map((heading) => (
                                        <th key={heading} className="px-5 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{heading}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row) => (
                                    <tr key={row.employee.id} className="border-t" style={{ borderColor: 'var(--line-soft)' }}>
                                        <td className="px-5 py-3.5">
                                            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{row.employee.name}</p>
                                            <p className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{row.employee.employee_code}</p>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <p className="text-sm" style={{ color: 'var(--ink)' }}>{row.department}</p>
                                            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.designation}</p>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <p className="text-sm" style={{ color: row.status === 'Working' ? 'var(--status-present)' : row.status === 'On leave' ? 'var(--status-pending)' : 'var(--text-secondary)' }}>{row.status}</p>
                                            {row.firstSession?.check_in && <p className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>In {row.firstSession.check_in.slice(0, 5)}</p>}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{row.firstSession?.work_mode ?? '—'}</td>
                                        <td className="px-5 py-3.5 font-mono text-sm tabular" style={{ color: row.openTasks ? 'var(--accent-structure)' : 'var(--text-muted)' }}>{row.openTasks}</td>
                                        <td className="px-5 py-3.5 text-right">
                                            <Link to={`/attendance/${row.employee.id}?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-structure)' }}>
                                                Attendance
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </LedgerPanel>
        </div>
    );
}