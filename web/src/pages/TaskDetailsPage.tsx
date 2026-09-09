import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useClients } from '../data/clients';
import { useCurrentEmployee } from '../data/currentUser';
import { useEmployees } from '../data/employees';
import { useProjects } from '../data/projects';
import { useTasks, type TaskPriority, type TaskStatus } from '../data/tasks';
import { useUsers } from '../data/users';
import { StatusTag } from '../components/Ledger';
import type { Role } from '../data/roles';

type Context = { role: Role };

const STATUS_LABEL: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const PRIORITY_COLOR: Record<TaskPriority, string> = { LOW: 'var(--status-neutral)', MEDIUM: 'var(--status-pending)', HIGH: 'var(--status-absent)' };
const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTimeLogTimestamp(value: string): string {
    const timestamp = new Date(value);
    return `${timestamp.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · ${timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function TaskDetailsPage() {
    const navigate = useNavigate();
    const { role } = useOutletContext<Context>();
    const { id } = useParams();
    const currentEmployee = useCurrentEmployee(role);
    const { employees } = useEmployees();
    const { clients, loading: clientsLoading, error: clientsError } = useClients();
    const { projects, loading: projectsLoading, error: projectsError } = useProjects();
    const { users } = useUsers();
    const { tasks, setStatus, timeEntries, comments, logTime, addComment, loading: tasksLoading, error: tasksError } = useTasks();
    const task = tasks.find((item) => item.id === id) ?? null;
    const canViewTask = role !== 'EMPLOYEE' || (currentEmployee !== null && task?.assigned_to === currentEmployee.id);
    const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task?.status ?? 'TODO');
    const [hoursInput, setHoursInput] = useState('');
    const [commentInput, setCommentInput] = useState('');

    const assigneeName = task ? employees.find((employee) => employee.id === task.assigned_to)?.name ?? task.assigned_by_name ?? 'Unknown' : 'Unknown';
    const assignedByName = task ? employees.find((employee) => employee.id === task.assigned_by)?.name ?? task.assigned_by_name ?? 'Unknown' : 'Unknown';
    const clientName = task ? clients.find((client) => client.id === task.client_id)?.name ?? task.client_name : undefined;
    const projectName = task ? projects.find((project) => project.id === task.project_id)?.name ?? task.project_name : undefined;
    const currentUser = users.find((user) => user.role === role)?.name ?? 'Current user';
    const [timeLogMessage, setTimeLogMessage] = useState<string | null>(null);
    const [timeLogSuccess, setTimeLogSuccess] = useState(false);
    const taskTimeEntries = useMemo(() => timeEntries.filter((entry) => entry.task_id === id).sort((a, b) => b.logged_at.localeCompare(a.logged_at)), [timeEntries, id]);
    const taskComments = useMemo(() => comments.filter((comment) => comment.task_id === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [comments, id]);

    if (clientsLoading || projectsLoading || tasksLoading) {
        return <p className="py-12 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Loading task...</p>;
    }
    if (clientsError || projectsError || tasksError) {
        return <p className="py-12 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{clientsError ?? projectsError ?? tasksError}</p>;
    }

    if (!task || !canViewTask) {
        return (
            <div className="mx-auto max-w-xl border bg-white p-8" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Task not found</h1>
                <button onClick={() => navigate('/tasks')} className="mt-5 px-4 py-2 text-sm font-medium" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Back to tasks</button>
            </div>
        );
    }

    async function handleSaveUpdate() {
        if (!task || !commentInput.trim()) return;
        const hours = Number(hoursInput);
        setTimeLogMessage(null);
        setTimeLogSuccess(false);
        if (Number.isFinite(hours) && hours > 0) {
            const error = await logTime(task.id, hours);
            if (error) {
                setTimeLogMessage(error);
                return;
            }
        }
        await addComment(task.id, currentUser, commentInput.trim());
        setHoursInput('');
        setCommentInput('');
        setTimeLogSuccess(true);
        setTimeLogMessage('Update saved successfully.');
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <button onClick={() => navigate('/tasks')} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-holiday)' }}>← Back to tasks</button>

            <section className="border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-pending)' }}>Task details</p>
                        <h1 className="font-display mt-1 text-3xl font-semibold" style={{ color: 'var(--ink)' }}>{task.title}</h1>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Assigned to {assigneeName} · Assigned by {assignedByName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusTag status={task.status === 'COMPLETED' ? 'present' : task.status === 'IN_PROGRESS' ? 'pending' : 'neutral'} label={STATUS_LABEL[task.status]} />
                        <span className="font-mono px-2 py-1 text-[11px] uppercase" style={{ background: `${PRIORITY_COLOR[task.priority]}20`, color: PRIORITY_COLOR[task.priority], borderRadius: 'var(--radius-sm)' }}>{PRIORITY_LABEL[task.priority]}</span>
                    </div>
                </div>
            </section>

            <section className="border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Details</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{task.description || 'No description provided.'}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Due date</p><p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{task.due_date}</p></div>
                    <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Estimated hours</p><p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{task.estimated_hours}h</p></div>
                    <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Logged hours</p><p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{task.worked_hours}h</p></div>
                    <div><p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Project / Client</p><p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>{projectName && clientName ? `${projectName} / ${clientName}` : 'Not linked'}</p></div>
                </div>
            </section>

            <section className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--line-soft)' }}>
                    <div><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Log time &amp; updates</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Record work and add an update to this task.</p></div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}><span>{taskTimeEntries.length} {taskTimeEntries.length === 1 ? 'entry' : 'entries'}</span><span aria-label="Remaining hours">{Math.max(0, task.estimated_hours - task.worked_hours)}h remaining</span></div>
                </div>
                <div className="border-b p-4" style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)' }}>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <label className="sr-only" htmlFor="task-hours">Hours logged</label>
                            <input id="task-hours" type="number" min="0.1" step="0.1" value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} placeholder="Hours worked (optional)" className="min-w-0 border px-3 py-2 text-sm outline-none sm:w-48" style={inputStyle} />
                            <label className="sr-only" htmlFor="task-update">Update</label>
                            <textarea id="task-update" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} rows={3} placeholder="What did you work on?" className="min-w-0 flex-1 resize-none border px-3 py-2 text-sm" style={inputStyle} />
                        </div>
                        <button onClick={() => void handleSaveUpdate()} disabled={!commentInput.trim()} className="self-start px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Save</button>
                    </div>
                    {timeLogMessage && <p className="mt-2 text-xs" style={{ color: timeLogSuccess ? 'var(--status-present)' : 'var(--status-absent)' }} role="status">{timeLogMessage}</p>}
                </div>
                <div className="border-b" style={{ borderColor: 'var(--line-soft)' }}>
                    <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}><h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Time entries</h3></div>
                    <div className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
                        {taskTimeEntries.length === 0 ? <p className="px-5 py-7 text-sm" style={{ color: 'var(--text-muted)' }}>No time entries yet.</p> : taskTimeEntries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-4"><div className="min-w-[12rem] flex-1"><p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{entry.logged_by}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{formatTimeLogTimestamp(entry.logged_at)}</p></div><span className="font-mono text-sm font-medium" style={{ color: 'var(--accent-holiday)' }}>{entry.hours} {entry.hours === 1 ? 'hour' : 'hours'}</span></div>)}
                    </div>
                </div>
                <div>
                    <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}><h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Comments</h3></div>
                    <div className="space-y-4 p-5">{taskComments.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No comments yet</p> : taskComments.map((comment) => <div key={comment.id} className="border-l-2 pl-3" style={{ borderColor: 'var(--line-soft)' }}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{comment.commenter}</span><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatTimestamp(comment.timestamp)}</span></div><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.text}</p></div>)}</div>
                </div>
            </section>

            <section className="border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Actions</h2>
                <div className="mt-3 flex flex-wrap items-end gap-3"><label className="block"><span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Status</span><select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as TaskStatus)} className="mt-1.5 block border px-3 py-2 text-sm" style={inputStyle}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select></label><button onClick={() => { setStatus(task.id, selectedStatus); }} className="px-3 py-2 text-sm font-medium" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Save changes</button></div>
            </section>
        </div>
    );
}
