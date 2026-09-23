import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useClients } from '../data/clients';
import { useCurrentEmployee } from '../data/currentUser';
import { useAppData } from '../contexts/AppDataContext';
import { useProjects } from '../data/projects';
import { useTasks, type Task, type TaskPriority, type TaskStatus } from '../data/tasks';
import { StatCard } from '../components/Ledger';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: 'var(--status-neutral)',
  MEDIUM: 'var(--status-pending)',
  HIGH: 'var(--status-absent)',
};

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

function TaskRow({
  task,
  assigneeName,
  clientName,
  projectName,
  onStatusChange,
  onLogHours,
}: {
  task: Task;
  assigneeName?: string;
  clientName?: string;
  projectName?: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onLogHours: (id: string, hours: number) => void;
}) {
  const navigate = useNavigate();
  const [hoursInput, setHoursInput] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date < today && task.status !== 'COMPLETED';

  return (
    <div onClick={() => navigate(`/tasks/${task.id}`)} className="flex cursor-pointer flex-wrap items-center gap-3 border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: 'var(--line-soft)' }}>
      <span className="h-8 w-[3px] shrink-0" style={{ background: PRIORITY_COLOR[task.priority] }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {task.title}
          {assigneeName && (
            <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>
              — {assigneeName}
            </span>
          )}
        </p>
        <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
          {clientName && projectName ? `${clientName} / ${projectName}` : task.description}
        </p>
        <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {task.description}
        </p>
      </div>

      <span
        className="font-mono px-2 py-0.5 text-[11px] uppercase"
        style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}
      >
        {task.priority}
      </span>

      <span className="font-mono text-xs" style={{ color: overdue ? 'var(--status-absent)' : 'var(--text-secondary)' }}>
        Due {task.due_date}
      </span>

      <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        {task.worked_hours}/{task.estimated_hours}h
      </span>

      <select
        onClick={(e) => e.stopPropagation()}
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
        className="border px-2 py-1.5 font-mono text-xs outline-none"
        style={inputStyle}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <input
          onClick={(e) => e.stopPropagation()}
          type="number"
          min="0"
          step="0.5"
          value={hoursInput}
          onChange={(e) => setHoursInput(e.target.value)}
          placeholder="hrs"
          className="w-16 border px-2 py-1.5 text-xs outline-none"
          style={inputStyle}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            const h = parseFloat(hoursInput);
            if (!isNaN(h) && h > 0) {
              onLogHours(task.id, h);
              setHoursInput('');
            }
          }}
          className="px-2 py-1.5 font-mono text-[11px] uppercase"
          style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
        >
          Log
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const { role } = useOutletContext<Ctx>();
  const { employees } = useAppData();
  const employee = useCurrentEmployee(role, employees);
  const { clients, loading: clientsLoading, error: clientsError } = useClients();
  const { projects, loading: projectsLoading, error: projectsError } = useProjects();
  const { tasks, setStatus, logHours, loading: tasksLoading, error: tasksError } = useTasks();

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [clientFilter, setClientFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const showCreateTaskButton = role !== 'EMPLOYEE';

  const filterProjects = useMemo(
    () => projects.filter((project) => clientFilter === 'ALL' || project.client_id === clientFilter),
    [projects, clientFilter],
  );

  const visibleTasks = useMemo(() => {
    if (role === 'HR' || role === 'SUPER_ADMIN') return tasks;
    if (role === 'MANAGER' && employee) {
      const teamIds = new Set(employees.filter((e) => e.manager_id === employee.id).map((e) => e.id));
      return tasks.filter((t) => teamIds.has(t.assigned_to) || t.assigned_to === employee.id);
    }
    if (employee) return tasks.filter((t) => t.assigned_to === employee.id);
    return [];
  }, [role, employee, employees, tasks]);

  const filteredTasks = useMemo(
    () => visibleTasks.filter((task) =>
      (statusFilter === 'ALL' || task.status === statusFilter)
      && (clientFilter === 'ALL' || task.client_id === clientFilter)
      && (projectFilter === 'ALL' || task.project_id === projectFilter),
    ),
    [visibleTasks, statusFilter, clientFilter, projectFilter],
  );

  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';
  const clientNameFor = (id: string) => clients.find((client) => client.id === id)?.name ?? 'Unknown';
  const projectNameFor = (id: string) => projects.find((project) => project.id === id)?.name ?? 'Unknown';
  const today = new Date().toISOString().slice(0, 10);
  const openCount = filteredTasks.filter((t) => t.status !== 'COMPLETED').length;
  const overdueCount = filteredTasks.filter((t) => t.status !== 'COMPLETED' && t.due_date < today).length;
  const completedCount = filteredTasks.filter((t) => t.status === 'COMPLETED').length;

  if (clientsLoading || projectsLoading || tasksLoading) {
    return <p className="py-12 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Loading tasks...</p>;
  }
  if (clientsError || projectsError || tasksError) {
    return <p className="py-12 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{clientsError ?? projectsError ?? tasksError}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-pending)' }}>
            Tasks
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
            {role === 'HR' || role === 'SUPER_ADMIN' ? 'All tasks' : role === 'MANAGER' ? 'Team tasks' : 'My tasks'}
          </h1>
        </div>

        {showCreateTaskButton && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tasks/new')}
              className="px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
            >
              + New task
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Open" value={openCount} status="pending" />
        <StatCard label="Overdue" value={overdueCount} status="absent" />
        <StatCard label="Completed" value={completedCount} status="present" />
      </div>



      {role !== 'EMPLOYEE' && (
        <div className="mt-6 flex flex-wrap gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'ALL')} className="border px-3 py-2 text-sm outline-none" style={inputStyle} aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
          </select>
          <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setProjectFilter('ALL'); }} className="border px-3 py-2 text-sm outline-none" style={inputStyle} aria-label="Filter by client">
            <option value="ALL">All clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="border px-3 py-2 text-sm outline-none" style={inputStyle} aria-label="Filter by project">
            <option value="ALL">All projects</option>
            {filterProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
      )}

      <div className="mt-6 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
        {filteredTasks.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No tasks to show.
          </p>
        ) : (
          filteredTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              assigneeName={role !== 'EMPLOYEE' ? nameFor(t.assigned_to) : undefined}
              clientName={clientNameFor(t.client_id)}
              projectName={projectNameFor(t.project_id)}
              onStatusChange={setStatus}
              onLogHours={logHours}
            />
          ))
        )}
      </div>

    </div>
  );
}
