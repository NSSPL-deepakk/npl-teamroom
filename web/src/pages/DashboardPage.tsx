import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ROLE_LABEL, type Role } from '../data/roles';
import { StatCard, LedgerPanel, LedgerRow } from '../components/Ledger';
import { RosterStrip } from '../components/RosterStrip';
import { AttendanceDonut } from '../components/AttendanceDonut';
import { UpcomingHolidays } from '../components/UpcomingHolidays';
import { QuickLinks } from '../components/QuickLinks';
import { countHolidaysThisYear, useHolidays, type Holiday } from '../data/holidays';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../data/currentUser';
import { useTasks } from '../data/tasks';
import { useAttendance } from '../data/attendance';
import { leaveDayCount, useLeaveRequests } from '../data/leave';
import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/AppDataContext';

type Ctx = { role: Role };

function useProfileCounts() {
  const [counts, setCounts] = useState({ users: 0, activeUsers: 0 });

  useEffect(() => {
    async function loadCounts() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [usersResult, activeUsersResult] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active_at', since),
      ]);
      if (usersResult.error) console.error('[Dashboard] Could not count users:', usersResult.error);
      if (activeUsersResult.error) console.error('[Dashboard] Could not count active users:', activeUsersResult.error);
      setCounts({ users: usersResult.count ?? 0, activeUsers: activeUsersResult.count ?? 0 });
    }
    void loadCounts();
  }, []);

  return counts;
}

function SuperAdminDashboard({ holidays }: { holidays: Holiday[] }) {
  const { employees, departments } = useAppData();
  const { users, activeUsers } = useProfileCounts();
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Users" value={users} status="structure" />
        <StatCard label="Employees" value={employees.length} status="present" />
        <StatCard label="Departments" value={departments.length} status="structure" />
        <StatCard label="Active users (24h)" value={activeUsers} status="present" />
        <StatCard label="Holidays this year" value={countHolidaysThisYear(holidays)} status="pending" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <LedgerPanel title="Organization attendance — today">
          <div className="px-5 py-5">
            <AttendanceDonut
              centerLabel="Employees"
              segments={[
                { label: 'Present', value: 98, color: 'var(--status-present)' },
                { label: 'On leave', value: 14, color: 'var(--status-pending)' },
                { label: 'Absent', value: 6, color: 'var(--status-absent)' },
              ]}
            />
          </div>
        </LedgerPanel>
        <UpcomingHolidays holidays={holidays} canManage employees={employees} />
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

function HRDashboard({ holidays, holidaysLoading, holidaysError }: { holidays: Holiday[]; holidaysLoading: boolean; holidaysError: string | null }) {
  const navigate = useNavigate();
  const { employees, employeesLoading, employeesError } = useAppData();
  const today = new Date().toLocaleDateString('en-CA');
  const { records, loading: attendanceLoading, error: attendanceError } = useAttendance({ startDate: today, endDate: today });
  const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests();
  const recruitment = useHrRecruitmentData();
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const activeEmployees = employees.filter((employee) => employee.employment_status === 'ACTIVE');
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
  const pendingLeaves = requests.filter((request) => request.status === 'PENDING');
  const isLoading = employeesLoading || holidaysLoading || attendanceLoading || leaveLoading || recruitment.loading;
  const error = employeesError || holidaysError || attendanceError || leaveError || recruitment.error;

  if (isLoading) return <div className="space-y-4"><div className="h-24 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /><div className="h-64 animate-pulse border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }} /></div>;
  if (error) return <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load the HR dashboard: {error}</div>;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Employees" value={activeEmployees.length} status="present" />
        <StatCard label="Open jobs" value={recruitment.openJobs} status="structure" />
        <StatCard label="Candidates" value={recruitment.candidates} status="pending" />
        <StatCard label="New joiners (mtd)" value={newJoiners} status="present" />
        <StatCard label="Holidays this year" value={holidays.filter((holiday) => holiday.date.startsWith(String(year))).length} status="pending" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
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
        <UpcomingHolidays holidays={holidays} canManage />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Onboarding in progress">
          {recruitment.onboarding.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No onboarding records found.</p> : recruitment.onboarding.map((item) => <LedgerRow key={item.id} primary={item.candidate_name ?? 'Candidate unavailable'} secondary={`${item.department ?? 'Department unavailable'}${item.current_step ? ` — ${item.current_step}` : ''}`} status={item.status?.toLowerCase() === 'completed' ? 'present' : 'pending'} />)}
        </LedgerPanel>
        <LedgerPanel title="Leave requests">
          {pendingLeaves.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No leave requests found.</p> : pendingLeaves.slice(0, 5).map((request) => <LedgerRow key={request.id} primary={employees.find((employee) => employee.id === request.employee_id)?.name ?? 'Employee unavailable'} secondary={`${request.type} · ${leaveDayCount(request)} ${leaveDayCount(request) === 1 ? 'day' : 'days'}`} meta="Pending" status="pending" onClick={() => navigate('/leave')} />)}
        </LedgerPanel>
      </div>
    </>
  );
}

function ManagerDashboard({ holidays }: { holidays: Holiday[] }) {
  const { employees, departments, departmentsLoading, departmentsError } = useAppData();
  const today = new Date().toLocaleDateString('en-CA');
  const { records, loading: attendanceLoading, error: attendanceError } = useAttendance({ startDate: today, endDate: today });
  const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests();
  const { tasks, loading: tasksLoading, error: tasksError } = useTasks();
  const { profile, loading: authLoading } = useAuth();
  const managerId = profile?.employee_id ?? null;
  const teamMembers = employees.filter((employee) => employee.employment_status === 'ACTIVE' && employee.manager_id === managerId);
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
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
        <UpcomingHolidays holidays={holidays} employees={employees} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LedgerPanel title="Team — today">
          {teamRows.length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No team members found.</p> : teamRows.map((row) => (
            <LedgerRow key={row.employee.id} primary={row.employee.name} secondary={row.leave ? `${row.leave.type} leave` : row.firstRecord ? `${row.department} · ${row.firstRecord.work_mode}` : `${row.department} · No check-in`} meta={row.firstRecord?.check_in ?? undefined} status={row.status} />
          ))}
        </LedgerPanel>
        <LedgerPanel title="Leave approvals">
          {requests.filter((request) => request.status === 'PENDING' && teamMemberIds.has(request.employee_id)).length === 0 ? <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No pending leave approvals.</p> : requests.filter((request) => request.status === 'PENDING' && teamMemberIds.has(request.employee_id)).map((request) => {
            const employee = teamMembers.find((item) => item.id === request.employee_id);
            return <LedgerRow key={request.id} primary={employee?.name ?? 'Employee unavailable'} secondary={`${request.type} · ${leaveDayCount(request)} ${leaveDayCount(request) === 1 ? 'day' : 'days'}`} meta="Awaiting" status="pending" />;
          })}
        </LedgerPanel>
      </div>

      <div className="mt-6">
        <QuickLinks
          links={[
            { label: 'Approve leave', path: '/leave' },
            { label: 'Team attendance', path: '/attendance' },
            { label: 'Org chart', path: '/org-chart' },
          ]}
        />
      </div>
    </>
  );
}

function EmployeeDashboard({ role, holidays }: { role: Role; holidays: Holiday[] }) {
  const { employees } = useAppData();
  const employee = useCurrentEmployee(role, employees);
  const { tasks } = useTasks();
  const myTasks = employee ? tasks.filter((t) => t.assigned_to === employee.id).slice(0, 4) : [];
  const openCount = myTasks.filter((t) => t.status !== 'COMPLETED').length;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Today" value="Checked in" status="present" />
        <StatCard label="Work mode" value="WFH" status="structure" />
        <StatCard label="Leave balance" value="14 days" status="present" />
        <StatCard label="Open tasks" value={openCount} status="pending" />
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
            <RosterStrip
              events={[
                { time: '09:12', label: 'Checked in — WFH', status: 'present' },
                { time: '13:00', label: 'Break', status: 'neutral' },
                { time: '13:32', label: 'Resumed', status: 'present' },
              ]}
            />
          </div>
        </div>
        <UpcomingHolidays holidays={holidays} employees={employees} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <QuickLinks
          links={[
            { label: 'Apply leave', path: '/leave' },
            { label: 'Regularize attendance', path: '/attendance' },
            { label: 'Log task time', path: '/tasks' },
          ]}
        />
        <div />
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { role } = useOutletContext<Ctx>();
  const { holidays, loading: holidaysLoading, error: holidaysError } = useHolidays();

  const view = {
    SUPER_ADMIN: <SuperAdminDashboard holidays={holidays} />,
    HR: <HRDashboard holidays={holidays} holidaysLoading={holidaysLoading} holidaysError={holidaysError} />,
    MANAGER: <ManagerDashboard holidays={holidays} />,
    EMPLOYEE: <EmployeeDashboard role={role} holidays={holidays} />,
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
