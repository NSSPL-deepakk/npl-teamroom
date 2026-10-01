import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '../data/roles';
import { StatCard, LedgerPanel, LedgerRow } from '../components/Ledger';
import { RosterStrip } from '../components/RosterStrip';
import { AttendanceDonut } from '../components/AttendanceDonut';
import { UpcomingHolidays } from '../components/UpcomingHolidays';
import { useDashboardHolidays, type DashboardEvent } from '../data/holidays';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../data/currentUser';
import { useTasks } from '../data/tasks';
import { useAttendance } from '../data/attendance';
import { useLeaveRequests } from '../data/leave';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';

type Ctx = { role: Role };

function useProfileCounts() {
  const [counts, setCounts] = useState({ activeUsers: 0 });

  useEffect(() => {
    async function loadCounts() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const activeUsersResult = await supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', since);
      if (activeUsersResult.error) console.error('[Dashboard] Could not count active users:', activeUsersResult.error);
      setCounts({ activeUsers: activeUsersResult.count ?? 0 });
    }
    void loadCounts();
  }, []);

  return counts;
}

type DashboardHolidayData = { holidays: DashboardEvent[]; holidayCount: number; loading: boolean; error: string | null };

function SuperAdminDashboard({ holidayData }: { holidayData: DashboardHolidayData }) {
  const { employees, activeEmployees, departments } = useAppData();
  const { activeUsers } = useProfileCounts();
  const inactiveEmployees = employees.length - activeEmployees.length;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total employees" value={employees.length} status="structure" />
        <StatCard label="Active employees" value={activeEmployees.length} status="present" />
        <StatCard label="Departments" value={departments.length} status="structure" />
        <StatCard label="Active users (24h)" value={activeUsers} status="present" />
        <StatCard label="Holidays this year" value={holidayData.holidayCount} status="pending" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <LedgerPanel title="Employee status">
          <div className="px-5 py-5">
            <AttendanceDonut
              centerLabel="Total employees"
              segments={[
                { label: 'Active', value: activeEmployees.length, color: 'var(--status-present)' },
                { label: 'Inactive', value: inactiveEmployees, color: 'var(--status-absent)' },
              ]}
            />
          </div>
        </LedgerPanel>
        <UpcomingHolidays holidays={holidayData.holidays} canManage loading={holidayData.loading} error={holidayData.error} />
      </div>
    </>
  );
}

type HrOnboardingRow = { id: string; candidate_id: string | null; candidate_name: string | null; department: string | null; current_step: string | null; status: string | null };

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.message?.toLowerCase().includes('does not exist') || false;
}

function useHrRecruitmentData() {
  const [data, setData] = useState({ openJobs: 0, candidates: 0, onboarding: [] as HrOnboardingRow[] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [jobsResult, candidatesResult, onboardingResult] = await Promise.all([
        supabase.from('job_openings').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('candidates').select('id', { count: 'exact', head: true }),
        supabase.from('onboarding_records').select('id, candidate_id, candidate_name, department, current_step, status').in('status', ['pending', 'in_progress', 'PENDING', 'IN_PROGRESS']),
      ]);
      const errors = [jobsResult.error, candidatesResult.error, onboardingResult.error];
      const unexpected = errors.find((item) => item && !isMissingTableError(item));
      if (unexpected) setError(unexpected.message);
      setData({
        openJobs: isMissingTableError(jobsResult.error) ? 0 : jobsResult.count ?? 0,
        candidates: isMissingTableError(candidatesResult.error) ? 0 : candidatesResult.count ?? 0,
        onboarding: isMissingTableError(onboardingResult.error) ? [] : (onboardingResult.data ?? []) as HrOnboardingRow[],
      });
      setLoading(false);
    }
    void load();
  }, []);

  return { ...data, loading, error };
}

function HRDashboard({ holidayData }: { holidayData: DashboardHolidayData }) {
  const { activeEmployees, employeesLoading, employeesError } = useAppData();
  const today = new Date().toLocaleDateString('en-CA');
  const { records, loading: attendanceLoading, error: attendanceError } = useAttendance({ startDate: today, endDate: today });
  const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests();
  const recruitment = useHrRecruitmentData();
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const todayRecords = records.filter((record) => record.date === today && record.check_in && activeEmployeeIds.has(record.employee_id));
  const leaveToday = requests.filter((request) => request.status === 'APPROVED' && request.start_date <= today && request.end_date >= today && activeEmployeeIds.has(request.employee_id));
  const presentIds = new Set(todayRecords.map((record) => record.employee_id));
  const leaveIds = new Set(leaveToday.map((request) => request.employee_id));
  const presentCount = presentIds.size;
  const onLeaveCount = [...leaveIds].filter((id) => !presentIds.has(id)).length;
  const absentCount = Math.max(0, activeEmployees.length - presentCount - onLeaveCount);
  const newJoiners = activeEmployees.filter((employee) => {
    const joined = new Date(`${employee.joining_date}T00:00:00`);
    return joined.getFullYear() === year && joined.getMonth() === month;
  }).length;
  const isLoading = employeesLoading || attendanceLoading || leaveLoading || recruitment.loading;
  const error = employeesError || attendanceError || leaveError || recruitment.error;

  if (isLoading) return <div className="space-y-4"><div className="h-24 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /><div className="h-64 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /></div>;
  if (error) return <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load the HR dashboard: {error}</div>;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Employees" value={activeEmployees.length} status="present" />
        <StatCard label="Open jobs" value={recruitment.openJobs} status="structure" />
        <StatCard label="Candidates" value={recruitment.candidates} status="pending" />
        <StatCard label="New joiners (mtd)" value={newJoiners} status="present" />
        <StatCard label="Holidays this year" value={holidayData.holidayCount} status="pending" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <LedgerPanel title="Attendance — today">
          <div className="px-5 py-5">
            <AttendanceDonut
              centerLabel="Employees"
              segments={[
                { label: 'Present', value: presentCount, color: 'var(--status-present)' },
                { label: 'On leave', value: onLeaveCount, color: 'var(--status-pending)' },
                { label: 'Absent', value: absentCount, color: 'var(--status-absent)' },
              ]}
            />
          </div>
        </LedgerPanel>
        <UpcomingHolidays holidays={holidayData.holidays} canManage loading={holidayData.loading} error={holidayData.error} />
      </div>

      {/* <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Onboarding in progress">
          {recruitment.onboarding.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No onboarding records found.</p> : recruitment.onboarding.map((item) => <LedgerRow key={item.id} primary={item.candidate_name ?? 'Candidate unavailable'} secondary={`${item.department ?? 'Department unavailable'}${item.current_step ? ` — ${item.current_step}` : ''}`} status={item.status?.toLowerCase() === 'completed' ? 'present' : 'pending'} />)}
        </LedgerPanel>
        <LedgerPanel title="Leave requests">
          {pendingLeaves.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No leave requests found.</p> : pendingLeaves.slice(0, 5).map((request) => <LedgerRow key={request.id} primary={employees.find((employee) => employee.id === request.employee_id)?.name ?? 'Employee unavailable'} secondary={`${request.type} · ${leaveDayCount(request)} ${leaveDayCount(request) === 1 ? 'day' : 'days'}`} meta="Pending" status="pending" onClick={() => navigate('/leave')} />)}
        </LedgerPanel>
      </div>
     */}
    </>
  );
}

function ManagerDashboard({ holidayData }: { holidayData: DashboardHolidayData }) {
  const { activeEmployees, departments, departmentsLoading, departmentsError } = useAppData();
  const today = new Date().toLocaleDateString('en-CA');
  const { records, loading: attendanceLoading, error: attendanceError } = useAttendance({ startDate: today, endDate: today });
  const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests();
  const { tasks, loading: tasksLoading, error: tasksError } = useTasks();
  const { profile, loading: authLoading } = useAuth();
  const managerId = profile?.employee_id ?? null;
  const teamMembers = activeEmployees.filter((employee) => employee.manager_id === managerId);
  const teamMemberIds = new Set(teamMembers.map((employee) => employee.id));
  const todayRecords = records.filter((record) => record.date === today && teamMemberIds.has(record.employee_id));
  const approvedLeave = requests.filter((request) => request.status === 'APPROVED' && request.start_date <= today && request.end_date >= today && teamMemberIds.has(request.employee_id));
  const presentIds = new Set(todayRecords.filter((record) => record.check_in).map((record) => record.employee_id));
  const leaveIds = new Set(approvedLeave.map((request) => request.employee_id));
  const presentCount = presentIds.size;
  const onLeaveCount = [...leaveIds].filter((id) => !presentIds.has(id)).length;
  const absentCount = Math.max(0, teamMembers.length - presentCount - onLeaveCount);
  const openTaskCount = tasks.filter((task) => teamMemberIds.has(task.assigned_to) && task.status !== 'COMPLETED').length;
  const isLoading = authLoading || departmentsLoading || attendanceLoading || leaveLoading || tasksLoading;
  const error = departmentsError || attendanceError || leaveError || tasksError;

  if (isLoading) {
    return <div className="space-y-4"><div className="h-24 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /><div className="grid gap-6 lg:grid-cols-2"><div className="h-64 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /><div className="h-64 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /></div></div>;
  }

  if (error) {
    return <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load the manager dashboard: {error}</div>;
  }

  const teamRows = teamMembers.map((employee) => {
    const employeeRecords = todayRecords.filter((record) => record.employee_id === employee.id).sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
    const leave = approvedLeave.find((request) => request.employee_id === employee.id);
    const firstRecord = employeeRecords.find((record) => record.check_in);
    const status: 'present' | 'pending' | 'absent' = firstRecord ? 'present' : leave ? 'pending' : 'absent';
    const department = departments.find((item) => item.id === employee.department_id)?.name ?? 'Department unavailable';
    return { employee, leave, firstRecord, status, department };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Team members" value={teamMembers.length} status="structure" />
        <StatCard label="Present" value={presentCount} status="present" />
        <StatCard label="Absent" value={absentCount} status="absent" />
        <StatCard label="On leave" value={onLeaveCount} status="pending" />
        <StatCard label="Open tasks" value={openTaskCount} status="structure" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <LedgerPanel title="Team attendance — today">
          <div className="px-5 py-5">
            <AttendanceDonut
              centerLabel="Team"
              segments={[
                { label: 'Present', value: presentCount, color: 'var(--status-present)' },
                { label: 'On leave', value: onLeaveCount, color: 'var(--status-pending)' },
                { label: 'Absent', value: absentCount, color: 'var(--status-absent)' },
              ]}
            />
          </div>
        </LedgerPanel>
        <UpcomingHolidays holidays={holidayData.holidays} loading={holidayData.loading} error={holidayData.error} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Team — today">
          {teamRows.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No team members found.</p> : teamRows.map((row) => (
            <LedgerRow key={row.employee.id} primary={row.employee.name} secondary={row.leave ? `${row.leave.type} leave` : row.firstRecord ? `${row.department} · ${row.firstRecord.work_mode}` : `${row.department} · No check-in`} meta={row.firstRecord?.check_in ?? undefined} status={row.status} />
          ))}
        </LedgerPanel>
        {/* <LedgerPanel title="Leave approvals">
          {requests.filter((request) => request.status === 'PENDING' && teamMemberIds.has(request.employee_id)).length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No pending leave approvals.</p> : requests.filter((request) => request.status === 'PENDING' && teamMemberIds.has(request.employee_id)).map((request) => {
            const employee = teamMembers.find((item) => item.id === request.employee_id);
            return <LedgerRow key={request.id} primary={employee?.name ?? 'Employee unavailable'} secondary={`${request.type} · ${leaveDayCount(request)} ${leaveDayCount(request) === 1 ? 'day' : 'days'}`} meta="Awaiting" status="pending" />;
          })}
        </LedgerPanel> */}
      </div>

      {/* <div className="mt-6">
        <QuickLinks
          links={[
            { label: 'Approve leave', path: '/leave' },
            { label: 'Team attendance', path: '/attendance' },
            { label: 'Org chart', path: '/org-chart' },
          ]}
        />
      </div> */}
    </>
  );
}

function EmployeeDashboard({ role, holidayData }: { role: Role; holidayData: DashboardHolidayData }) {
  const { employees } = useAppData();
  const employee = useCurrentEmployee(role, employees);
  const today = new Date().toLocaleDateString('en-CA');
  const { records: attendanceRecords, loading: attendanceLoading } = useAttendance({
    employeeId: employee?.id,
    startDate: today,
    endDate: today,
  });
  const { tasks, loading: tasksLoading } = useTasks();
  const employeeTasks = employee ? tasks.filter((task) => task.assigned_to === employee.id) : [];
  const myTasks = employeeTasks.slice(0, 4);
  const openCount = employeeTasks.filter((task) => task.status !== 'COMPLETED').length;
  const latestAttendance = [...attendanceRecords]
    .filter((record) => record.employee_id === employee?.id)
    .sort((a, b) => (b.check_in ?? '').localeCompare(a.check_in ?? ''))[0];
  const todayStatus = latestAttendance?.check_in
    ? latestAttendance.check_out ? 'Checked out' : 'Checked in'
    : 'Not checked in';
  const attendanceEvents = attendanceRecords
    .filter((record) => record.employee_id === employee?.id)
    .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''))
    .flatMap((record) => [
      ...(record.check_in ? [{ time: record.check_in.slice(0, 5), label: `Checked in — ${record.work_mode}`, status: 'present' as const }] : []),
      ...(record.check_out ? [{ time: record.check_out.slice(0, 5), label: 'Checked out', status: 'neutral' as const }] : []),
    ]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={attendanceLoading ? 'Loading…' : todayStatus} status={latestAttendance?.check_in ? 'present' : 'neutral'} />
        <StatCard label="Work mode" value={attendanceLoading ? 'Loading…' : latestAttendance?.work_mode ?? '—'} status="structure" />
        <StatCard label="Open tasks" value={tasksLoading ? 'Loading…' : openCount} status="pending" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
        <LedgerPanel title="My tasks">
          {myTasks.length === 0 ? (
            <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
              No tasks assigned right now.
            </p>
          ) : (
            myTasks.map((t) => (
              <LedgerRow
                key={t.id}
                primary={t.title}
                secondary={t.status === 'COMPLETED' ? 'Completed' : `Due ${t.due_date}`}
                status={t.status === 'COMPLETED' ? 'present' : t.status === 'IN_PROGRESS' ? 'pending' : 'neutral'}
              />
            ))
          )}
        </LedgerPanel>
        <div
          className="border p-5"
          style={{ background: 'var(--ink)', borderColor: 'var(--ink)', borderRadius: 'var(--radius-md)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-on-ink)' }}>
            Today's register
          </h3>
          <div className="mt-4">
            {attendanceLoading ? (
              <p className="text-sm" style={{ color: 'var(--text-on-ink-muted)' }}>Loading today&apos;s attendance…</p>
            ) : attendanceEvents.length > 0 ? (
              <RosterStrip events={attendanceEvents} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-on-ink-muted)' }}>No attendance activity yet.</p>
            )}
          </div>
        </div>
        <UpcomingHolidays holidays={holidayData.holidays} loading={holidayData.loading} error={holidayData.error} />
      </div>

    </>
  );
}

export default function DashboardPage() {
  const { role } = useOutletContext<Ctx>();
  const { employees, employeesLoading } = useAppData();
  const holidayData = useDashboardHolidays(employees, 5, !employeesLoading);

  const view = {
    SUPER_ADMIN: <SuperAdminDashboard holidayData={holidayData} />,
    HR: <HRDashboard holidayData={holidayData} />,
    MANAGER: <ManagerDashboard holidayData={holidayData} />,
    EMPLOYEE: <EmployeeDashboard role={role} holidayData={holidayData} />,
  }[role];

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-present)' }}>
        {ROLE_LABEL[role]} dashboard
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Good morning.
      </h1>
      <div className="mt-6">{view}</div>
    </div>
  );
}
