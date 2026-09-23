import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useClients } from '../data/clients';
import { useCurrentEmployee } from '../data/currentUser';
import { useAppData } from '../contexts/AppDataContext';
import { useProjects } from '../data/projects';
import { useTasks, type TaskPriority } from '../data/tasks';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

export default function NewTaskPage() {
    const navigate = useNavigate();
    const { role } = useOutletContext<Ctx>();
    const { employees } = useAppData();
    const employee = useCurrentEmployee(role, employees);
    const { clients, loading: clientsLoading, error: clientsError } = useClients();
    const { projects, loading: projectsLoading, error: projectsError } = useProjects();
    const { addTask, loading: tasksLoading, error: tasksError } = useTasks();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
    const [estimatedHours, setEstimatedHours] = useState('');
    const [dueDate, setDueDate] = useState('');

    const canAssign = role === 'MANAGER' || role === 'HR' || role === 'SUPER_ADMIN';
    const actor = employee ?? employees[0] ?? null;

    const assignableEmployees = useMemo(() => {
        if (role === 'HR' || role === 'SUPER_ADMIN') return employees;
        if (role === 'MANAGER' && actor) return employees.filter((e) => e.manager_id === actor.id);
        return [];
    }, [role, actor, employees]);

    const availableProjects = useMemo(
        () => projects.filter((project) => !selectedClientId || project.client_id === selectedClientId),
        [projects, selectedClientId],
    );

    if (clientsLoading || projectsLoading || tasksLoading) {
        return <p className="py-12 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Loading task form...</p>;
    }

    if (clientsError || projectsError || tasksError) {
        return <p className="py-12 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{clientsError ?? projectsError ?? tasksError}</p>;
    }

    if (!canAssign) {
        return (
            <div className="mx-auto max-w-xl border bg-white p-8" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Access denied</h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Only managers, HR, and Super Admin roles can create tasks.</p>
                <button onClick={() => navigate('/tasks')} className="mt-5 px-4 py-2 text-sm font-medium" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--radius-sm)' }}>Back to tasks</button>
            </div>
        );
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!actor) return;
        if (!title.trim() || !assignedTo || !selectedClientId || !selectedProjectId || !dueDate) return;

        await addTask({
            title: title.trim(),
            description: description.trim(),
            assigned_to: assignedTo,
            assigned_by: actor.id,
            client_id: selectedClientId,
            project_id: selectedProjectId,
            priority,
            estimated_hours: Number(estimatedHours) || 0,
            due_date: dueDate,
        });

        navigate('/tasks');
    }

    return (
        <div className="mx-auto max-w-4xl">
            <button onClick={() => navigate('/tasks')} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--accent-holiday)' }}>← Back to tasks</button>

            <div className="mt-5 border bg-white p-6" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="mb-6">
                    <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--status-pending)' }}>Create task</p>
                    <h1 className="font-display mt-1 text-3xl font-semibold" style={{ color: 'var(--ink)' }}>New task</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                        <label className="block md:col-span-2">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Task title</span>
                            <input
                                type="text"
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Prepare launch checklist"
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            />
                        </label>

                        <label className="block md:col-span-2">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Description</span>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                placeholder="Add context, expected outcomes, and any notes for the assignee."
                                className="mt-1.5 w-full resize-none border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Client</span>
                            <select
                                required
                                value={selectedClientId}
                                onChange={(e) => {
                                    setSelectedClientId(e.target.value);
                                    setSelectedProjectId('');
                                }}
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            >
                                <option value="" disabled>Select client</option>
                                {clients.filter((client) => client.status === 'ACTIVE').map((client) => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Project</span>
                            <select
                                required
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                disabled={!selectedClientId}
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                style={inputStyle}
                            >
                                <option value="" disabled>{selectedClientId ? 'Select project' : 'Choose a client first'}</option>
                                {availableProjects.map((project) => (
                                    <option key={project.id} value={project.id}>{project.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Assign to</span>
                            <select
                                required
                                value={assignedTo}
                                onChange={(e) => setAssignedTo(e.target.value)}
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            >
                                <option value="" disabled>Select assignee</option>
                                {assignableEmployees.map((e) => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Priority</span>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Estimated hours</span>
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={estimatedHours}
                                onChange={(e) => setEstimatedHours(e.target.value)}
                                placeholder="8"
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Due date</span>
                            <input
                                type="date"
                                required
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="mt-1.5 w-full border px-3 py-2.5 text-sm outline-none"
                                style={inputStyle}
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-3 pt-2">
                        <button type="button" onClick={() => navigate('/tasks')} className="px-4 py-2.5 text-sm font-medium" style={{ border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)' }}>
                            Cancel
                        </button>
                        <button type="submit" className="px-5 py-2.5 text-sm font-medium" style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}>
                            Create task
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
