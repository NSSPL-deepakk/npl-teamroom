import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  hasOpenSession,
  hoursBetween,
  requiredHoursForEmployeeMonth,
  STANDARD_SHIFT_END,
  useAttendance,
  type AttendanceRecord,
} from '../data/attendance';
import { useCurrentEmployee } from '../data/currentUser';
import { useDepartments } from '../data/departments';
import { useDesignations } from '../data/designations';
import { useEmployees, type WorkMode } from '../data/employees';
import { classifyDay, useHolidays } from '../data/holidays';
import { useLeaveRequests } from '../data/leave';
import type { Role } from '../data/roles';
import { ChevronRight } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Drawer } from '../components/Drawer';

type Ctx = { role: Role };

type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'done'; coords: { latitude: number; longitude: number } | null };

type ApprovalAction = { id: string; action: 'approve' | 'reject' } | null;
type AttendanceMetric = 'present' | 'absent' | 'leave' | 'wfh' | 'late';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WORK_MODES: WorkMode[] = ['OFFICE', 'WFH', 'HYBRID'];

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function minutesBetween(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const [inHours, inMinutes] = checkIn.split(':').map(Number);
  const [outHours, outMinutes] = checkOut.split(':').map(Number);
  return Math.max(0, outHours * 60 + outMinutes - (inHours * 60 + inMinutes));
}

export default function AttendancePage() {
  const navigate = useNavigate();
  const { role } = useOutletContext<Ctx>();
  const employee = useCurrentEmployee(role);
  const { employees } = useEmployees();
  const { departments } = useDepartments();
  const { designations } = useDesignations();
  const { holidays } = useHolidays();
  const { requests: leaveRequests } = useLeaveRequests();
  const { records, checkIn, checkOut, addManualEntry, approveRecord, rejectRecord, today, loading, error } = useAttendance();

  const isHRAdmin = role === 'HR' || role === 'SUPER_ADMIN';
  const [viewMode, setViewMode] = useState<'my' | 'employee'>('my');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [workMode, setWorkMode] = useState<WorkMode>(employee?.work_mode ?? 'OFFICE');
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [workDoneToday, setWorkDoneToday] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: today,
    check_in: '09:00',
    check_out: '18:00',
    work_mode: 'OFFICE' as WorkMode,
    manual_entry_reason: '',
    early_checkout_reason: '',
    overtime_reason: '',
  });
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [managerFilter, setManagerFilter] = useState('ALL');
  const [organizationWorkMode, setOrganizationWorkMode] = useState<'ALL' | WorkMode>('ALL');
  const [superAdminSection, setSuperAdminSection] = useState<'overview' | 'employees'>('overview');
  const [approvalAction, setApprovalAction] = useState<ApprovalAction>(null);
  const [selectedMetric, setSelectedMetric] = useState<AttendanceMetric | null>(null);

  const currentEmployee = employee ?? employees[0] ?? null;
  const visibleEmployee = selectedEmployeeId
    ? employees.find((item) => item.id === selectedEmployeeId) ?? currentEmployee
    : currentEmployee;
  const showEmployeeList = isHRAdmin && viewMode === 'employee' && !selectedEmployeeId;
  const targetEmployee = visibleEmployee ?? currentEmployee;

  const targetSessions = useMemo(() => {
    if (!targetEmployee) return [] as AttendanceRecord[];
    return records.filter((record) => record.employee_id === targetEmployee.id).sort((a, b) => a.date.localeCompare(b.date));
  }, [records, targetEmployee]);

  const todaySessions = useMemo(() => {
    if (!targetEmployee) return [] as AttendanceRecord[];
    return records.filter((record) => record.employee_id === targetEmployee.id && record.date === today);
  }, [records, targetEmployee, today]);

  const currentDayOpen = targetEmployee ? hasOpenSession(records, targetEmployee.id, today) : null;

  const monthlyAttendance = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();

    return Array.from({ length: lastDay }, (_, index) => {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      const sessions = targetSessions.filter((record) => record.date === iso);
      const total = sessions.reduce((sum, session) => sum + (hoursBetween(session.check_in, session.check_out) ?? 0), 0);
      const isApprovedLeave = leaveRequests.some(
        (request) => request.employee_id === targetEmployee?.id && request.status === 'APPROVED' && iso >= request.start_date && iso <= request.end_date,
      );
      const classification = classifyDay(iso, holidays);
      const status = classification === 'HOLIDAY' ? 'holiday' : classification === 'WEEKLY_OFF' ? 'weekly-off' : isApprovedLeave ? 'leave' : sessions.length > 0 ? 'present' : 'absent';

      return { iso, sessions, total: Number(total.toFixed(1)), status };
    }).sort((a, b) => a.iso.localeCompare(b.iso));
  }, [year, month, targetEmployee, targetSessions, holidays, leaveRequests]);

  const monthlyAttendanceRows = useMemo<Array<{ day: (typeof monthlyAttendance)[number]; session: AttendanceRecord | null }>>(
    () => monthlyAttendance.flatMap<{ day: (typeof monthlyAttendance)[number]; session: AttendanceRecord | null }>((day) => day.sessions.length > 0
      ? day.sessions.map((session) => ({ day, session }))
      : [{ day, session: null }]),
    [monthlyAttendance],
  );

  const selectedDaySessions = useMemo(() => {
    if (!targetEmployee) return [] as AttendanceRecord[];
    return records
      .filter((record) => record.employee_id === targetEmployee.id && record.date === selectedDate)
      .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
  }, [records, targetEmployee, selectedDate]);

  const selectedDayTotal = useMemo(
    () => selectedDaySessions.reduce((sum, session) => sum + (hoursBetween(session.check_in, session.check_out) ?? 0), 0),
    [selectedDaySessions],
  );

  const runningHoursToday = useMemo(() => {
    if (!targetEmployee) return 0;
    return todaySessions.reduce((sum, session) => {
      const endTime = session.check_out ?? new Date().toTimeString().slice(0, 5);
      return sum + (hoursBetween(session.check_in, endTime) ?? 0);
    }, 0);
  }, [targetEmployee, todaySessions]);

  const lastCheckout = useMemo(() => {
    const sessions = [...todaySessions].filter((session) => session.check_out).sort((a, b) => (a.check_out ?? '').localeCompare(b.check_out ?? ''));
    return sessions.length > 0 ? sessions[sessions.length - 1].check_out : '—';
  }, [todaySessions]);

  const filteredEmployees = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return employees.filter((emp) => {
      const deptOk = departmentFilter === 'ALL' || emp.department_id === departmentFilter;
      const employeeOk = employeeFilter === 'ALL' || emp.id === employeeFilter;
      const searchOk = !search || emp.name.toLowerCase().includes(search);
      return deptOk && employeeOk && searchOk;
    });
  }, [employees, departmentFilter, employeeFilter, searchTerm]);

  const adminRows = useMemo(
    () =>
      filteredEmployees.map((emp) => {
        const logged = records.filter((r) => r.employee_id === emp.id && r.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)).reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) ?? 0), 0);
        const requiredHours = requiredHoursForEmployeeMonth(records, emp.id, year, month, holidays);
        const variance = Number((logged - requiredHours).toFixed(1));
        const hasToday = records.some((r) => r.employee_id === emp.id && r.date === today);
        return { employee: emp, logged: Number(logged.toFixed(1)), required: requiredHours, variance, hasToday };
      }),
    [filteredEmployees, records, year, month, today, holidays],
  );

  function handleCheckIn() {
    if (!targetEmployee) return;
    if (!('geolocation' in navigator)) {
      checkIn(targetEmployee.id, workMode, null, holidays.some((holiday) => holiday.date === today));
      return;
    }

    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation({ status: 'done', coords });
        checkIn(targetEmployee.id, workMode, coords, holidays.some((holiday) => holiday.date === today));
      },
      () => {
        setLocation({ status: 'done', coords: null });
        checkIn(targetEmployee.id, workMode, null, holidays.some((holiday) => holiday.date === today));
      },
      { timeout: 8000 },
    );
  }

  function handleManualSave(event: React.FormEvent) {
    event.preventDefault();
    if (!targetEmployee) return;
    if (!manualForm.date || !manualForm.check_in || !manualForm.check_out || !manualForm.manual_entry_reason.trim()) return;
    const overtimeMinutes = Math.max(0, Math.round((hoursBetween(manualForm.check_in, manualForm.check_out) ?? 0) * 60) - 9 * 60);
    if (manualForm.check_out < STANDARD_SHIFT_END && !manualForm.early_checkout_reason.trim()) return;
    if ((overtimeMinutes > 0 || holidays.some((holiday) => holiday.date === manualForm.date)) && !manualForm.overtime_reason.trim()) return;
    const saved = addManualEntry(targetEmployee.id, {
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
      setSelectedDate(manualForm.date);
    }
  }

  function handleExport() {
    const headers = ['Employee', 'Department', 'Required hours', 'Logged hours', 'Variance', 'Status'];
    const rows = adminRows.map((row) => [
      row.employee.name,
      departments.find((d) => d.id === row.employee.department_id)?.name ?? 'Unknown',
      row.required.toFixed(1),
      row.logged.toFixed(1),
      row.variance.toFixed(1),
      row.variance < 0 ? 'Below target' : row.variance > 0 ? 'On track' : 'Check needed',
    ]);

    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${year}-${String(month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Current month stats (till today)
  const currentMonthLogged = useMemo(() => {
    if (!targetEmployee) return 0;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    return records
      .filter((r) => r.employee_id === targetEmployee.id && r.date.startsWith(monthStr) && r.date <= today)
      .reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) ?? 0), 0);
  }, [targetEmployee, records, year, month, today]);

  const currentMonthRequired = useMemo(() => {
    return targetEmployee ? requiredHoursForEmployeeMonth(records, targetEmployee.id, year, month, holidays) : 0;
  }, [targetEmployee, records, year, month, holidays]);

  const currentMonthVariance = currentMonthLogged - currentMonthRequired;

  // Previous month stats (full month)
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonthLogged = useMemo(() => {
    if (!targetEmployee) return 0;
    const monthStr = `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
    return records
      .filter((r) => r.employee_id === targetEmployee.id && r.date.startsWith(monthStr))
      .reduce((sum, r) => sum + (hoursBetween(r.check_in, r.check_out) ?? 0), 0);
  }, [targetEmployee, records, previousMonth, previousYear]);

  const adminCards = [
    { label: 'Total employees', value: String(adminRows.length) },
    { label: 'On track', value: String(adminRows.filter((r) => r.variance >= 0).length) },
    { label: 'Below target', value: String(adminRows.filter((r) => r.variance < 0).length) },
    { label: 'Not logged today', value: String(adminRows.filter((r) => !r.hasToday).length) },
  ];

  const isSuperAdmin = role === 'SUPER_ADMIN';
  const organizationAllRows = useMemo(() => {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthEnd = `${monthPrefix}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const lastCompletedDate = monthPrefix === today.slice(0, 7) ? today : monthEnd < today ? monthEnd : `${monthPrefix}-00`;
    return employees
      .map((emp) => {
        const employeeRecords = records.filter((record) => record.employee_id === emp.id && record.date.startsWith(monthPrefix) && record.date <= lastCompletedDate);
        const workedMinutes = employeeRecords.reduce((sum, record) => sum + minutesBetween(record.check_in, record.check_out), 0);
        const requiredMinutes = requiredHoursForEmployeeMonth(records, emp.id, year, month, holidays) * 60;
        const overtime = Math.max(0, workedMinutes - requiredMinutes);
        const shortfall = Math.max(0, requiredMinutes - workedMinutes);
        const todayRecords = records.filter((record) => record.employee_id === emp.id && record.date === today);
        const onLeave = leaveRequests.some((request) => request.employee_id === emp.id && request.status === 'APPROVED' && today >= request.start_date && today <= request.end_date);
        const todayClassification = classifyDay(today, holidays);
        const todayStatus = todayRecords.length > 0 ? 'PRESENT' : onLeave ? 'LEAVE' : todayClassification === 'HOLIDAY' ? 'HOLIDAY' : todayClassification === 'WEEKLY_OFF' ? 'WEEKLY OFF' : today > lastCompletedDate && monthPrefix !== today.slice(0, 7) ? 'UPCOMING' : 'ABSENT';
        const late = todayRecords.some((record) => record.check_in && record.check_in > '09:15');
        return { employee: emp, requiredMinutes, workedMinutes, overtime, shortfall, attendance: requiredMinutes ? Math.min(100, (workedMinutes / requiredMinutes) * 100) : 0, todayStatus, late };
      });
  }, [employees, records, year, month, today, holidays, leaveRequests]);

  const todayDetailRows = useMemo(() => employees.map((employee) => {
    const sessions = records
      .filter((record) => record.employee_id === employee.id && record.date === today)
      .sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? ''));
    const sessionsWithCheckIn = sessions.filter((session) => session.check_in);
    const firstSession = sessionsWithCheckIn[0] ?? sessions[0] ?? null;
    const lastSession = [...sessionsWithCheckIn].reverse()[0] ?? null;
    const approvedLeave = leaveRequests.some((request) => request.employee_id === employee.id && request.status === 'APPROVED' && today >= request.start_date && today <= request.end_date);
    const present = sessionsWithCheckIn.length > 0;
    const late = sessionsWithCheckIn.some((session) => session.check_in! > '09:15');
    const workedMinutes = sessions.reduce((sum, session) => sum + minutesBetween(session.check_in, session.check_out ?? session.check_in), 0);
    const department = departments.find((item) => item.id === employee.department_id)?.name ?? 'Unknown';
    const designation = designations.find((item) => item.id === employee.designation_id)?.name ?? 'Designation unavailable';
    return {
      employee,
      department,
      designation,
      sessions,
      firstSession,
      lastSession,
      approvedLeave,
      present,
      late,
      wfh: present && sessionsWithCheckIn.some((session) => session.work_mode === 'WFH'),
      workedMinutes,
      status: approvedLeave ? 'On leave' : present ? (late ? 'Late' : 'Present') : 'Absent',
    };
  }), [employees, records, today, leaveRequests, departments]);

  const organizationRows = useMemo(() => organizationAllRows.filter((row) => {
    const search = searchTerm.trim().toLowerCase();
    const managerOk = managerFilter === 'ALL' || row.employee.manager_id === managerFilter;
    const departmentOk = departmentFilter === 'ALL' || row.employee.department_id === departmentFilter;
    const employeeOk = employeeFilter === 'ALL' || row.employee.id === employeeFilter;
    const workModeOk = organizationWorkMode === 'ALL' || row.employee.work_mode === organizationWorkMode;
    const statusOk = statusFilter === 'ALL' || row.todayStatus === statusFilter;
    return managerOk && departmentOk && employeeOk && workModeOk && statusOk && (!search || row.employee.name.toLowerCase().includes(search));
  }), [organizationAllRows, departmentFilter, employeeFilter, searchTerm, statusFilter, managerFilter, organizationWorkMode]);

  const organizationMetrics = useMemo(() => {
    const activeEmployees = employees;
    const present = todayDetailRows.filter((row) => row.present);
    const leave = todayDetailRows.filter((row) => row.approvedLeave);
    const rows = organizationAllRows;
    const requiredMinutes = rows.reduce((sum, row) => sum + row.requiredMinutes, 0);
    const workedMinutes = rows.reduce((sum, row) => sum + row.workedMinutes, 0);
    const overtime = rows.reduce((sum, row) => sum + row.overtime, 0);
    const shortfall = rows.reduce((sum, row) => sum + row.shortfall, 0);
    return {
      totalEmployees: activeEmployees.length,
      presentToday: present.length,
      absentToday: Math.max(0, activeEmployees.length - present.length - leave.length),
      onLeave: leave.length,
      wfh: todayDetailRows.filter((row) => row.wfh).length,
      late: todayDetailRows.filter((row) => row.late).length,
      requiredMinutes,
      workedMinutes,
      overtime,
      shortfall,
      attendance: requiredMinutes ? Math.min(100, (workedMinutes / requiredMinutes) * 100) : 0,
    };
  }, [employees, todayDetailRows, organizationAllRows]);

  const titleEmployee = targetEmployee ?? currentEmployee;
  const approvalMessage = approvalAction?.action === 'approve' ? 'Are you sure you want to approve this record?' : 'Are you sure you want to reject this record?';

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading attendance…</div>;
  if (error) return <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;

  if (isSuperAdmin) {
    const metricCards = [
      ['Total Employees', organizationMetrics.totalEmployees, 'var(--ink)', null],
      ['Present Today', organizationMetrics.presentToday, 'var(--status-present)', 'present'],
      ['Absent Today', organizationMetrics.absentToday, 'var(--status-absent)', 'absent'],
      ['On Leave', organizationMetrics.onLeave, '#F59E0B', 'leave'],
      ['WFH', organizationMetrics.wfh, 'var(--accent-structure)', 'wfh'],
      ['Late Today', organizationMetrics.late, '#B45309', 'late'],
    ] as const;
    const selectedEmployees = selectedMetric
      ? todayDetailRows.filter((row) => selectedMetric === 'present' ? row.present : selectedMetric === 'absent' ? !row.present && !row.approvedLeave : selectedMetric === 'leave' ? row.approvedLeave : selectedMetric === 'wfh' ? row.wfh : row.late)
      : [];
    const selectedLabel = selectedMetric === 'present' ? 'Present Today' : selectedMetric === 'absent' ? 'Absent Today' : selectedMetric === 'leave' ? 'On Leave' : selectedMetric === 'wfh' ? 'WFH' : 'Late Today';

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-present)' }}>Attendance</p>
            <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Attendance Management</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Monitor and manage attendance across all employees</p>
          </div>
          <div className="inline-flex items-center rounded-md border p-1" style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)' }}>
            {['Overview', 'Employee Attendance', 'Attendance Requests'].map((label) => {
              const section = label === 'Overview' ? 'overview' : 'employees';
              return <button key={label} onClick={() => { if (label !== 'Attendance Requests') setSuperAdminSection(section); }} className="px-3 py-1.5 text-xs font-medium" style={{ background: (superAdminSection === section && label !== 'Attendance Requests') ? 'var(--ink)' : 'transparent', color: (superAdminSection === section && label !== 'Attendance Requests') ? '#fff' : 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>
                {label}
              </button>;
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <p className="font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{monthLabel}</p>
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border px-2.5 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>{MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border px-2.5 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>{Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map(([label, value, color, metric]) => <button key={label} type="button" onClick={() => metric && setSelectedMetric(metric)} className={`relative overflow-hidden border bg-white p-4 text-left ${metric ? 'cursor-pointer transition-shadow hover:shadow-sm' : ''}`} style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}><span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} /><p className="pl-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="mt-2 pl-2 text-2xl font-semibold tabular" style={{ color }}>{value}</p></button>)}
        </div>

        <Drawer open={selectedMetric !== null} title={selectedLabel} onClose={() => setSelectedMetric(null)}>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedEmployees.length} employee{selectedEmployees.length === 1 ? '' : 's'} · {today}</p>
          {selectedEmployees.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No matching employees today.</p> : <div className="space-y-4">{selectedEmployees.map((row) => <div key={row.employee.id} className="border-b pb-4 last:border-b-0" style={{ borderColor: 'var(--line-soft)' }}><p className="font-medium" style={{ color: 'var(--ink)' }}>{row.employee.name}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{row.designation} · {row.department} · {row.status}</p>{selectedMetric === 'present' ? <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><span>Check-in<br /><strong>{row.firstSession?.check_in ?? '—'}</strong></span><span>Check-out<br /><strong>{row.lastSession?.check_out ?? '—'}</strong></span><span>Work time<br /><strong>{formatMinutes(row.workedMinutes)}</strong></span><span>Work mode<br /><strong>{row.firstSession?.work_mode ?? '—'}</strong></span><span>Entry type<br /><strong>{row.firstSession?.is_manual_entry ? 'Manual' : 'Automatic'}</strong></span><span>Manual reason<br /><strong>{row.firstSession?.manual_entry_reason ?? '—'}</strong></span></div> : <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedMetric === 'leave' ? 'Approved leave today' : selectedMetric === 'wfh' ? `Work mode: ${row.firstSession?.work_mode ?? 'WFH'}` : selectedMetric === 'late' ? `Check-in: ${row.firstSession?.check_in ?? '—'}` : 'No check-in recorded today'}</p>}</div>)}</div>}
        </Drawer>

        <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <div className="border-b p-4" style={{ borderColor: 'var(--line-soft)' }}><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search employee" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}><option value="ALL">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}><option value="ALL">All teams / managers</option>{employees.filter((emp) => !emp.manager_id).map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}><option value="ALL">All attendance statuses</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LEAVE">On leave</option><option value="UPCOMING">Upcoming</option></select>
            <select value={organizationWorkMode} onChange={(e) => setOrganizationWorkMode(e.target.value as 'ALL' | WorkMode)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}><option value="ALL">All work modes</option><option value="OFFICE">Office</option><option value="WFH">WFH</option><option value="HYBRID">Hybrid</option></select>
          </div></div>
          {superAdminSection === 'employees' || superAdminSection === 'overview' ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr style={{ background: 'var(--paper)' }}>{['Employee', 'Department', 'Required', 'Worked', 'Overtime', 'Shortfall', 'Attendance', ''].map((heading) => <th key={heading} className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{heading}</th>)}</tr></thead><tbody>{organizationRows.map((row) => <tr key={row.employee.id} onClick={() => navigate(`/attendance/${row.employee.id}?month=${month}&year=${year}`)} className="cursor-pointer border-t transition-colors hover:bg-[var(--paper)]" style={{ borderColor: 'var(--line-soft)' }}><td className="px-5 py-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>{row.employee.name}</td><td className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{departments.find((department) => department.id === row.employee.department_id)?.name ?? 'Unknown'}</td><td className="px-5 py-3 font-mono text-xs">{formatMinutes(row.requiredMinutes)}</td><td className="px-5 py-3 font-mono text-xs">{formatMinutes(row.workedMinutes)}</td><td className="px-5 py-3 font-mono text-xs" style={{ color: row.overtime > 0 ? 'var(--status-present)' : 'var(--text-muted)' }}>{formatMinutes(row.overtime)}</td><td className="px-5 py-3 font-mono text-xs" style={{ color: row.shortfall > 0 ? 'var(--status-absent)' : 'var(--text-muted)' }}>{formatMinutes(row.shortfall)}</td><td className="px-5 py-3"><span className="font-mono text-xs font-semibold" style={{ color: row.attendance >= 90 ? 'var(--status-present)' : 'var(--status-absent)' }}>{row.attendance.toFixed(1)}%</span><span className="ml-2 text-[10px] uppercase" style={{ color: row.todayStatus === 'LEAVE' ? '#F59E0B' : row.todayStatus === 'UPCOMING' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{row.todayStatus}</span></td><td className="px-5 py-3 text-right"><ChevronRight size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} /></td></tr>)}</tbody></table></div> : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-present)' }}>
            Attendance
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
            {titleEmployee ? `${titleEmployee.name} · Attendance` : 'Organization attendance'}
          </h1>
          {titleEmployee && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {titleEmployee.employee_code} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          )}
        </div>

        {isHRAdmin && (
          <div className="inline-flex items-center rounded-md border p-1" style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)' }}>
            <button
              onClick={() => {
                setSelectedEmployeeId(null);
                setViewMode('my');
              }}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                background: viewMode === 'my' ? 'var(--ink)' : 'transparent',
                color: viewMode === 'my' ? '#fff' : 'var(--ink)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              My Attendance
            </button>
            <button
              onClick={() => {
                setSelectedEmployeeId(null);
                setViewMode('employee');
              }}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                background: viewMode === 'employee' ? 'var(--ink)' : 'transparent',
                color: viewMode === 'employee' ? '#fff' : 'var(--ink)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Employee Attendance
            </button>
          </div>
        )}
      </div>
      {error && <div className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {showEmployeeList ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {adminCards.map((card) => (
              <div key={card.label} className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Employee attendance</h3>
              <button onClick={handleExport} className="border px-3 py-2 text-xs font-medium" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }}>
                Export CSV
              </button>
            </div>

            <div className="grid gap-3 border-b p-4 md:grid-cols-5" style={{ borderColor: 'var(--line-soft)' }}>
              <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>
                <option value="ALL">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>
                <option value="ALL">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{MONTH_NAMES[value - 1]}</option>
                ))}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}>
                {Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name" className="border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr style={{ background: 'var(--paper)' }}>
                    <th className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Employee</th>
                    <th className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Required</th>
                    <th className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Logged</th>
                    <th className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Variance</th>
                    <th className="px-5 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRows.map((row) => {
                    const varianceColorStyle = row.variance < 0 ? { background: '#FEE2E2', color: '#B91C1C' } : { background: '#DCFCE7', color: '#166534' };
                    const statusLabel = row.variance < 0 ? 'Below target' : row.variance > 0 ? 'On track' : 'Check needed';
                    return (
                      <tr key={row.employee.id} onClick={() => {
                        setSelectedEmployeeId(row.employee.id);
                        setViewMode('employee');
                      }} className="cursor-pointer border-t transition-colors hover:bg-[var(--paper)]" style={{ borderColor: 'var(--line-soft)' }}>
                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--ink)' }}>{row.employee.name}</td>
                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--ink)' }}>{row.required.toFixed(1)}h</td>
                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--ink)' }}>{row.logged.toFixed(1)}h</td>
                        <td className="px-5 py-3 text-sm" style={{ color: row.variance < 0 ? 'var(--status-absent)' : 'var(--status-present)' }}>
                          {row.variance >= 0 ? '+' : ''}{row.variance.toFixed(1)}h
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono px-2 py-1 text-[10px] uppercase" style={{ ...varianceColorStyle, borderRadius: 'var(--radius-sm)' }}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Monthly Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Current month (till today)</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{currentMonthLogged.toFixed(1)}h</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>of {currentMonthRequired.toFixed(1)}h required</p>
            </div>
            <div className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Variance</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: currentMonthVariance >= 0 ? 'var(--status-present)' : 'var(--status-absent)' }}>
                {currentMonthVariance >= 0 ? '+' : ''}{currentMonthVariance.toFixed(1)}h
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {currentMonthVariance >= 0 ? 'ahead of target' : 'behind target'}
              </p>
            </div>
            <div className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Previous month</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{previousMonthLogged.toFixed(1)}h</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{MONTH_NAMES[previousMonth - 1]} {previousYear}</p>
            </div>
            <div className="border bg-white p-4" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Today's status</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: currentDayOpen ? 'var(--status-present)' : 'var(--ink)' }}>
                {currentDayOpen ? 'Working' : 'Off'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{runningHoursToday.toFixed(1)}h logged</p>
            </div>
          </div>

          {/* Main Attendance Grid */}
          <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_0.95fr]">
            <div className="space-y-5">
              <div
                className="border p-5"
                style={{
                  borderColor: 'var(--line-soft)',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, rgba(13, 41, 65, 0.96), rgba(18, 60, 80, 0.96))',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Today
                    </p>
                    <p className="mt-2 text-lg font-semibold" style={{ color: '#fff' }}>
                      {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {showEmployeeList ? null : (
                    <div className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: 'rgba(255,255,255,0.22)', color: '#fff', background: 'rgba(255,255,255,0.06)' }}>
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: currentDayOpen ? '#34D399' : '#FBBF24' }} />
                      {currentDayOpen ? 'Currently working' : 'Not checked in'}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.72)' }}>
                      Running total
                    </p>
                    <p className="mt-2 text-4xl font-semibold leading-none" style={{ color: '#fff' }}>
                      {runningHoursToday.toFixed(1)}h
                    </p>
                  </div>

                  <button
                    onClick={currentDayOpen ? () => checkOut(targetEmployee!.id, workDoneToday) : handleCheckIn}
                    className="px-5 py-3 text-sm font-semibold shadow-sm"
                    style={{ background: currentDayOpen ? '#F87171' : '#34D399', color: '#0f172a', borderRadius: 'var(--radius-sm)' }}
                  >
                    {location.status === 'locating' ? 'Locating…' : currentDayOpen ? 'Check out' : 'Check in'}
                  </button>
                </div>

                <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
                  {currentDayOpen && <input value={workDoneToday} onChange={(event) => setWorkDoneToday(event.target.value)} placeholder="What did you work on today?" className="mb-3 w-full border px-3 py-2 text-sm" style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: 'var(--radius-sm)' }} />}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.7)' }}>Check-in</p>
                      <p className="mt-1 text-sm font-medium" style={{ color: '#fff' }}>{todaySessions[0]?.check_in ?? '—'}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.7)' }}>Sessions</p>
                      <p className="mt-1 text-sm font-medium" style={{ color: '#fff' }}>{todaySessions.length}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.7)' }}>Last out</p>
                      <p className="mt-1 text-sm font-medium" style={{ color: '#fff' }}>{lastCheckout}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    <span className="font-mono uppercase tracking-[0.15em]">Sessions today</span>
                    <span className="font-semibold text-white">{todaySessions.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={workMode}
                      onChange={(e) => setWorkMode(e.target.value as WorkMode)}
                      className="border px-2 py-1.5 text-xs"
                      style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                    >
                      {WORK_MODES.map((mode) => (
                        <option key={mode} value={mode} style={{ color: '#0f172a' }}>{mode}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setManualForm((prev) => ({ ...prev, date: today }));
                        setManualMode(true);
                      }}
                      className="border px-3 py-2 text-xs font-medium"
                      style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                    >
                      Add session
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden border bg-white shadow-sm" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line-soft)' }}>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>{monthLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      className="border px-2 py-1.5 text-sm"
                      style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                        <option key={value} value={value}>{MONTH_NAMES[value - 1]}</option>
                      ))}
                    </select>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="border px-2 py-1.5 text-sm"
                      style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    >
                      {Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#22C55E' }} /> Present</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#F59E0B' }} /> Leave</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#8B5CF6' }} /> Holiday</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[1180px]">
                    <div className="grid grid-cols-[18%_12%_12%_16%_11%_13%_18%] border-b px-4 py-3 sm:px-5" style={{ background: 'var(--paper)', borderColor: 'var(--line-soft)' }}>
                      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Date</span>
                      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Check In</span>
                      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Check Out</span>
                      <span className="text-right font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Hours</span>
                      <span className="pl-5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Overtime</span>
                      <span className="pl-5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Approval Status</span>
                      <span className="pl-5 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Manual Entry Reason</span>
                    </div>
                    {monthlyAttendanceRows.map(({ day, session }) => {
                      const isSelected = selectedDate === day.iso;
                      const isToday = day.iso === today;
                      const statusColor = day.status === 'holiday' ? '#8B5CF6' : day.status === 'leave' ? '#F59E0B' : day.status === 'present' ? '#22C55E' : 'var(--status-absent)';
                      const isManual = session?.is_manual_entry ?? false;
                      const isApprovedManual = isManual && session?.manual_approval_status === 'approved';
                      const rowBackground = isApprovedManual ? '#DCFCE7' : isManual ? '#DC2626' : day.status === 'present' ? '#F0FDF4' : day.status === 'absent' ? '#FFF1F2' : day.status === 'holiday' ? '#F5F3FF' : '#FFFBEB';
                      const rowAccent = day.status === 'present' ? '#22C55E' : day.status === 'absent' ? '#EF4444' : statusColor;
                      const manualReason = session?.manual_entry_reason ?? null;

                      return (
                        <button
                          key={`${day.iso}-${session?.id ?? 'empty'}`}
                          onClick={() => setSelectedDate(day.iso)}
                          className="grid w-full grid-cols-[18%_12%_12%_16%_11%_13%_18%] items-center border-t px-4 py-3.5 text-left transition-colors hover:bg-[var(--paper)] sm:px-5"
                          style={{ borderColor: 'var(--line-soft)', background: rowBackground, borderLeft: isSelected || isToday ? `3px solid ${rowAccent}` : '3px solid transparent' }}
                        >
                          <span className="text-sm font-semibold" style={{ color: isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)' }}>
                            {new Date(`${day.iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}{isToday && <span className="ml-2 inline-flex border px-1.5 py-0.5 align-middle font-mono text-[9px] font-semibold tracking-wide" style={{ borderColor: '#60A5FA', color: '#2563EB', borderRadius: 'var(--radius-sm)' }}>TODAY</span>}
                          </span>
                          <span className="font-mono text-xs" style={{ color: session?.check_in ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>
                            {session?.check_in ?? '—'}
                          </span>
                          <span className="font-mono text-xs" style={{ color: session?.check_out ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>
                            {session?.check_out ?? '—'}
                          </span>
                          <span className="text-right font-mono text-xs font-medium tabular-nums" style={{ color: session ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)') : 'var(--text-muted)' }}>
                            {session ? `${(hoursBetween(session.check_in, session.check_out) ?? 0).toFixed(1)}h (day ${day.total.toFixed(1)}h)` : '—'}
                          </span>
                          <span className="pl-5 font-mono text-xs" style={{ color: session ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-secondary)') : 'var(--text-muted)' }}>
                            {session ? `${(session.overtime_minutes / 60).toFixed(1)}h` : '—'}
                          </span>
                          <span className="pl-5 text-xs font-semibold" style={{ color: isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--text-muted)' }}>
                            {isManual ? `${session?.manual_approval_status?.charAt(0).toUpperCase()}${session?.manual_approval_status?.slice(1)}` : '—'}
                          </span>
                          <span className="max-w-0 truncate pl-5 text-xs" style={{ color: manualReason ? (isManual ? (isApprovedManual ? '#166534' : '#fff') : 'var(--ink)') : 'var(--text-muted)' }} title={manualReason ?? undefined}>
                            {manualReason ?? '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <aside className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
              <div className="border-b px-4 py-3" style={{ borderColor: 'var(--line-soft)' }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>Day details</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </h3>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedDayTotal.toFixed(1)}h</span>
                </div>
              </div>

              <div className="space-y-3 p-4">
                {selectedDaySessions.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm" style={{ borderColor: 'var(--line)', color: 'var(--text-secondary)' }}>
                    No sessions logged for this day.
                  </div>
                ) : (
                  selectedDaySessions.map((session, index) => {
                    const isManual = session.is_manual_entry;
                    const isPending = isManual && session.manual_approval_status === 'pending';
                    const approvalLabel = session.manual_approval_status.charAt(0).toUpperCase() + session.manual_approval_status.slice(1);
                    return <div key={session.id} className="rounded-md border p-3" style={{ borderColor: isManual ? '#DC2626' : 'var(--line-soft)', background: isManual ? '#DC2626' : 'var(--paper)', color: isManual ? '#fff' : 'var(--ink)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: isManual ? 'rgba(255,255,255,0.2)' : 'var(--accent-structure-bg)', color: isManual ? '#fff' : 'var(--accent-structure)' }}>
                            {index + 1}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--text-secondary)' }}>
                            {session.work_mode}
                          </span>
                        </div>
                        <span className="font-mono text-[10px]" style={{ color: isManual ? '#fff' : 'var(--text-secondary)' }}>
                          {hoursBetween(session.check_in, session.check_out)?.toFixed(1) ?? '0.0'}h
                        </span>
                      </div>
                      <div className="mt-3 font-mono text-sm" style={{ color: isManual ? '#fff' : 'var(--ink)' }}>
                        {session.check_in ?? '—'} → {session.check_out ?? '—'}
                      </div>
                      {isManual && <div className="mt-2 border-t pt-2 text-xs" style={{ borderColor: 'rgba(255,255,255,0.35)' }}><strong>Manual reason:</strong> {session.manual_entry_reason ?? 'Reason unavailable'}</div>}
                      {isManual && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span><strong>Approval:</strong> {approvalLabel}{session.approved_by ? ` by ${session.approved_by}` : session.rejected_by ? ` by ${session.rejected_by}` : ''}{session.approved_at ? ` · ${new Date(session.approved_at).toLocaleString()}` : session.rejected_at ? ` · ${new Date(session.rejected_at).toLocaleString()}` : ''}</span>{isHRAdmin && isPending && <span className="flex gap-2"><button type="button" onClick={() => setApprovalAction({ id: session.id, action: 'approve' })} className="border px-2 py-1 font-medium" style={{ borderColor: 'rgba(255,255,255,0.7)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Approve</button><button type="button" onClick={() => setApprovalAction({ id: session.id, action: 'reject' })} className="border px-2 py-1 font-medium" style={{ borderColor: '#FCA5A5', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Reject</button></span>}</div>}
                    </div>;
                  })
                )}
              </div>

              <div className="border-t p-4" style={{ borderColor: 'var(--line-soft)' }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>Add a check-in for this day</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (selectedDate === today) {
                        handleCheckIn();
                        return;
                      }
                      setManualForm((prev) => ({ ...prev, date: selectedDate }));
                      setManualMode(true);
                    }}
                    className="px-3 py-2 text-sm font-medium"
                    style={{ background: 'var(--status-present)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                  >
                    Check in
                  </button>
                  <button
                    onClick={() => {
                      setManualForm((prev) => ({ ...prev, date: selectedDate }));
                      setManualMode(true);
                    }}
                    className="border px-3 py-2 text-sm font-medium"
                    style={{ borderColor: 'var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}
                  >
                    Manual entry
                  </button>
                </div>

                {manualMode && (
                  <form onSubmit={handleManualSave} className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--line-soft)' }}>
                    <input
                      type="date"
                      value={manualForm.date}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={manualForm.check_in}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, check_in: e.target.value }))}
                        className="border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                      />
                      <input
                        type="time"
                        value={manualForm.check_out}
                        onChange={(e) => setManualForm((prev) => ({ ...prev, check_out: e.target.value }))}
                        className="border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                      />
                    </div>
                    <select
                      value={manualForm.work_mode}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, work_mode: e.target.value as WorkMode }))}
                      className="w-full border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    >
                      {WORK_MODES.map((mode) => (
                        <option key={mode} value={mode}>{mode}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={manualForm.manual_entry_reason}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, manual_entry_reason: e.target.value }))}
                      placeholder="Reason for manual entry"
                      className="w-full border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }}
                    />
                    <input value={workDoneToday} onChange={(e) => setWorkDoneToday(e.target.value)} placeholder="What did you work on today?" className="w-full border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />
                    {manualForm.check_out < STANDARD_SHIFT_END && <input required value={manualForm.early_checkout_reason} onChange={(e) => setManualForm((prev) => ({ ...prev, early_checkout_reason: e.target.value }))} placeholder="Early checkout reason" className="w-full border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />}
                    {(Math.max(0, Math.round((hoursBetween(manualForm.check_in, manualForm.check_out) ?? 0) * 60) - 9 * 60) > 0 || holidays.some((holiday) => holiday.date === manualForm.date)) && <input required value={manualForm.overtime_reason} onChange={(e) => setManualForm((prev) => ({ ...prev, overtime_reason: e.target.value }))} placeholder="Overtime reason" className="w-full border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' }} />}
                    <button type="submit" className="w-full px-3 py-2 text-sm font-medium" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>
                      Save entry
                    </button>
                  </form>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
      <ConfirmDialog open={approvalAction !== null} message={approvalMessage} onCancel={() => setApprovalAction(null)} onConfirm={() => { if (approvalAction?.action === 'approve') approveRecord(approvalAction.id); if (approvalAction?.action === 'reject') rejectRecord(approvalAction.id); setApprovalAction(null); }} />
    </div>
  );
}
