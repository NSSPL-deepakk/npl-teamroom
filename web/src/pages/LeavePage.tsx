import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useEmployees } from '../data/employees';
import { leaveDayCount, useLeaveRequests, type LeaveRequest, type LeaveType } from '../data/leave';
import { Drawer } from '../components/Drawer';
import { StatCard, StatusTag } from '../components/Ledger';
import type { Role } from '../data/roles';
import { useAuth } from '../contexts/AuthContext';

type Ctx = { role: Role };

const LEAVE_TYPES: LeaveType[] = ['Casual', 'Sick', 'Annual', 'Other'];
const ANNUAL_BALANCE = 18;

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function statusOf(status: LeaveRequest['status']): 'present' | 'pending' | 'absent' {
  if (status === 'APPROVED') return 'present';
  if (status === 'REJECTED') return 'absent';
  return 'pending';
}

function RequestRow({
  req,
  employeeName,
  showApprove,
  canDecideAnyStatus,
  canEdit,
  onApprove,
  onReject,
  onEdit,
}: {
  req: LeaveRequest;
  employeeName?: string;
  showApprove?: boolean;
  canDecideAnyStatus?: boolean;
  canEdit?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (request: LeaveRequest) => void;
}) {
  const days = leaveDayCount(req);
  return (
    <div className="flex items-center gap-4 border-b px-5 py-3 last:border-b-0" style={{ borderColor: 'var(--line-soft)' }}>
      <span
        className="h-8 w-[3px] shrink-0"
        style={{
          background:
            req.status === 'APPROVED'
              ? 'var(--status-present)'
              : req.status === 'REJECTED'
                ? 'var(--status-absent)'
                : 'var(--status-pending)',
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {employeeName ? `${employeeName} — ` : ''}
          {req.type} · {days} day{days > 1 ? 's' : ''}
        </p>
        <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
          {req.start_date} → {req.end_date} · {req.reason}
        </p>
      </div>
      <StatusTag status={statusOf(req.status)} label={req.status.charAt(0) + req.status.slice(1).toLowerCase()} />
      {canEdit && (
        <button
          onClick={() => onEdit?.(req)}
          className="font-mono text-[11px] uppercase tracking-wide hover:underline"
          style={{ color: 'var(--accent-structure)' }}
        >
          Edit
        </button>
      )}
      {showApprove && (canDecideAnyStatus || req.status === 'PENDING') && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onApprove?.(req.id)}
            className="font-mono text-[11px] uppercase tracking-wide hover:underline"
            style={{ color: 'var(--status-present)' }}
          >
            Approve
          </button>
          <button
            onClick={() => onReject?.(req.id)}
            className="font-mono text-[11px] uppercase tracking-wide hover:underline"
            style={{ color: 'var(--status-absent)' }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function LeavePage() {
  const { role } = useOutletContext<Ctx>();
  const { profile } = useAuth();
  const { employees } = useEmployees();
  const { requests, requestLeave, updateRequest, approve, reject } = useLeaveRequests();
  const employee = profile?.employee_id ? employees.find((item) => item.id === profile.employee_id) ?? null : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [type, setType] = useState<LeaveType>('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [requestEmployeeId, setRequestEmployeeId] = useState('');
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');

  const mine = useMemo(
    () => (employee ? requests.filter((r) => r.employee_id === employee.id) : []),
    [requests, employee],
  );
  const usedDays = mine
    .filter((r) => r.status === 'APPROVED')
    .reduce((sum, r) => sum + leaveDayCount(r), 0);
  const balance = ANNUAL_BALANCE - usedDays;

  const canApproveTeam = role === 'MANAGER' && !!employee;
  const canApproveOrg = role === 'HR' || role === 'SUPER_ADMIN';
  const canSubmitForOthers = canApproveTeam || canApproveOrg;
  const directReports = useMemo(
    () => (employee ? employees.filter((item) => item.manager_id === employee.id) : []),
    [employee, employees],
  );
  const requestableEmployees = canApproveOrg
    ? employees
    : employee
      ? [employee, ...directReports]
      : [];

  const teamRequests = useMemo(() => {
    if (!canApproveTeam || !employee) return [];
    const teamIds = new Set(employees.filter((e) => e.manager_id === employee.id).map((e) => e.id));
    return requests.filter((r) => teamIds.has(r.employee_id));
  }, [canApproveTeam, employee, employees, requests]);

  const orgRequests = canApproveOrg ? requests : [];

  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetEmployeeId = canApproveOrg ? requestEmployeeId : requestEmployeeId || employee?.id;
    if (!targetEmployeeId || !startDate || !endDate || !reason.trim()) return;
    const payload = { employee_id: targetEmployeeId, type, start_date: startDate, end_date: endDate, reason: reason.trim() };
    const error = editingRequestId
      ? await updateRequest(editingRequestId, payload)
      : await requestLeave(targetEmployeeId, { type, start_date: startDate, end_date: endDate, reason: reason.trim() });
    if (error) {
      setFormError(error);
      return;
    }
    setType('Casual');
    setStartDate('');
    setEndDate('');
    setReason('');
    setRequestEmployeeId(employee?.id ?? '');
    setEditingRequestId(null);
    setFormError('');
    setDrawerOpen(false);
  }

  function openCreateDrawer() {
    setEditingRequestId(null);
    setType('Casual');
    setStartDate('');
    setEndDate('');
    setReason('');
    setRequestEmployeeId(canApproveOrg ? '' : employee?.id ?? '');
    setFormError('');
    setDrawerOpen(true);
  }

  function openEditDrawer(request: LeaveRequest) {
    setEditingRequestId(request.id);
    setType(request.type);
    setStartDate(request.start_date);
    setEndDate(request.end_date);
    setReason(request.reason);
    setRequestEmployeeId(request.employee_id);
    setFormError('');
    setDrawerOpen(true);
  }

  async function handleDecision(decide: (id: string) => Promise<string | null>, id: string) {
    const error = await decide(id);
    setActionError(error ?? '');
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-pending)' }}>
            Leave
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
            {employee ? 'My leave' : 'Leave requests'}
          </h1>
        </div>
        {(employee || canApproveOrg) && (
          <button
            onClick={openCreateDrawer}
            className="px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
          >
            + Add leave request
          </button>
        )}
      </div>

      {employee && (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Annual balance" value={`${balance} days`} status="present" />
          <StatCard label="Used this year" value={`${usedDays} days`} status="structure" />
          <StatCard label="My pending" value={mine.filter((r) => r.status === 'PENDING').length} status="pending" />
          {canApproveTeam && (
            <StatCard label="Team pending" value={teamRequests.filter((r) => r.status === 'PENDING').length} status="pending" />
          )}
          {canApproveOrg && (
            <StatCard label="Org pending" value={orgRequests.filter((r) => r.status === 'PENDING').length} status="pending" />
          )}
        </div>
      )}

      {employee && (
        <div className="mt-6 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              My requests
            </h3>
          </div>
          {mine.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              You haven't requested any leave yet.
            </p>
          ) : (
            mine.map((r) => <RequestRow key={r.id} req={r} />)
          )}
        </div>
      )}

      {canApproveTeam && (
        <div className="mt-6 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Team approvals
            </h3>
          </div>
          {teamRequests.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No requests from your team.
            </p>
          ) : (
            teamRequests.map((r) => (
              <RequestRow key={r.id} req={r} employeeName={nameFor(r.employee_id)} showApprove onApprove={(id) => void handleDecision(approve, id)} onReject={(id) => void handleDecision(reject, id)} />
            ))
          )}
        </div>
      )}

      {canApproveOrg && (
        <div className="mt-6 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              All organization requests
            </h3>
          </div>
          {orgRequests.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No leave requests yet.
            </p>
          ) : (
            orgRequests.map((r) => (
              <RequestRow key={r.id} req={r} employeeName={nameFor(r.employee_id)} showApprove canDecideAnyStatus={canApproveOrg} canEdit={canApproveOrg} onApprove={(id) => void handleDecision(approve, id)} onReject={(id) => void handleDecision(reject, id)} onEdit={openEditDrawer} />
            ))
          )}
        </div>
      )}

      {!employee && !canApproveOrg && (
        <div
          className="mt-6 flex min-h-[30vh] flex-col items-center justify-center border border-dashed text-center"
          style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-md)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing to show for this role yet.
          </p>
        </div>
      )}

      {actionError && <p className="mt-4 text-sm" style={{ color: 'var(--status-absent)' }}>{actionError}</p>}

      <Drawer open={drawerOpen} title={editingRequestId ? 'Edit leave request' : 'Add leave request'} onClose={() => { setDrawerOpen(false); setEditingRequestId(null); }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {canSubmitForOthers && (
            <Field label="Employee">
              <select
                required
                value={canApproveOrg ? requestEmployeeId : requestEmployeeId || employee?.id || ''}
                onChange={(e) => setRequestEmployeeId(e.target.value)}
                className="w-full border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="" disabled>Select employee</option>
                {requestableEmployees.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </Field>
          )}
          {formError && <p className="text-sm" style={{ color: 'var(--status-absent)' }}>{formError}</p>}
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="End date">
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
            </Field>
          </div>
          <Field label="Reason">
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full resize-none border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </Field>
          <button
            type="submit"
            className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
          >
            {editingRequestId ? 'Save changes' : 'Submit request'}
          </button>
        </form>
      </Drawer>
    </div>
  );
}
