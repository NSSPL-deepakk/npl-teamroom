import { Fragment, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { Drawer } from '../components/Drawer';
import { StatusTag } from '../components/Ledger';
import { useClients } from '../data/clients';
import { useAppData } from '../contexts/AppDataContext';
import { useProjects, type Project } from '../data/projects';
import { useTasks } from '../data/tasks';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

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

export default function ProjectsPage() {
    const { role } = useOutletContext<Ctx>();
    const canManage = role === 'SUPER_ADMIN' || role === 'HR' || role === 'MANAGER';
    const { clients, loading: clientsLoading, error: clientsError } = useClients();
    const { employees } = useAppData();
    const { projects, addProject, updateProject, loading: projectsLoading, error: projectsError } = useProjects();
    const { tasks, loading: tasksLoading, error: tasksError } = useTasks();

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [clientId, setClientId] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [deadline, setDeadline] = useState('');
    const [status, setStatus] = useState<'ACTIVE' | 'ON_HOLD' | 'COMPLETED'>('ACTIVE');
    const [teamMembers, setTeamMembers] = useState<string[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    if (clientsLoading || projectsLoading || tasksLoading) {
        return <p className="py-12 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Loading projects...</p>;
    }
    if (clientsError || projectsError || tasksError) {
        return <p className="py-12 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{clientsError ?? projectsError ?? tasksError}</p>;
    }

    const nameForClient = (id: string) => clients.find((client) => client.id === id)?.name ?? 'Unknown';
    const employeeById = (id: string) => employees.find((employee) => employee.id === id);

    function resetForm() {
        setEditingId(null);
        setName('');
        setClientId(clients[0]?.id ?? '');
        setDescription('');
        setStartDate('');
        setDeadline('');
        setStatus('ACTIVE');
        setTeamMembers([]);
    }

    function openCreate() {
        resetForm();
        setDrawerOpen(true);
    }

    function openEdit(project: Project) {
        setEditingId(project.id);
        setName(project.name);
        setClientId(project.client_id);
        setDescription(project.description);
        setStartDate(project.start_date);
        setDeadline(project.deadline);
        setStatus(project.status);
        setTeamMembers(project.team_member_ids);
        setDrawerOpen(true);
    }

    function toggleExpand(projectId: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !clientId.trim()) return;

        const payload = {
            name: name.trim(),
            client_id: clientId,
            description: description.trim(),
            start_date: startDate,
            deadline,
            status,
            team_member_ids: teamMembers,
        };

        if (editingId) {
            updateProject(editingId, payload);
        } else {
            addProject(payload);
        }

        setDrawerOpen(false);
        resetForm();
    }

    const totalTaskCount = (projectId: string) => tasks.filter((task) => task.project_id === projectId).length;
    const completedTaskCount = (projectId: string) => tasks.filter((task) => task.project_id === projectId && task.status === 'COMPLETED').length;
    const projectProgress = (projectId: string) => {
        const total = totalTaskCount(projectId);
        if (!total) return 0;
        return Math.round((completedTaskCount(projectId) / total) * 100);
    };
    const hoursVariance = (projectId: string) => {
        const projectTasks = tasks.filter((task) => task.project_id === projectId);
        const estimated = projectTasks.reduce((sum, task) => sum + task.estimated_hours, 0);
        const logged = projectTasks.reduce((sum, task) => sum + task.worked_hours, 0);
        return { logged, variance: Math.round((logged - estimated) * 10) / 10 };
    };

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
                        Projects
                    </p>
                    <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                        Delivery portfolio
                    </h1>
                </div>
                {canManage && (
                    <button
                        onClick={openCreate}
                        className="px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                        style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
                    >
                        + Add project
                    </button>
                )}
            </div>

            <div className="mt-6 border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        All projects
                    </h3>
                    <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {projects.length}
                    </span>
                </div>

                {projects.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No projects yet.
                    </p>
                ) : (
                    <div className="p-4 space-y-3">
                        {/* Column header row, mimics the old table head */}
                        <div
                            className="hidden md:grid px-3 pb-2 font-mono text-[10px] uppercase tracking-wide"
                            style={{
                                gridTemplateColumns: '2.2fr 1.1fr 1fr 0.9fr 1fr 40px',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <span>Project</span>
                            <span>Client</span>
                            <span>Status</span>
                            <span>Progress</span>
                            <span>Deadline</span>
                            <span />
                        </div>

                        {projects.map((project) => {
                            const isExpanded = expandedIds.has(project.id);
                            return (
                                <div
                                    key={project.id}
                                    className="border"
                                    style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}
                                >
                                    {/* Main row */}
                                    <div
                                        onClick={() => toggleExpand(project.id)}
                                        className="grid cursor-pointer items-start gap-2 px-3 py-3.5 transition-colors hover:bg-[var(--paper)] md:grid-cols-[2.2fr_1.1fr_1fr_0.9fr_1fr_40px]"
                                        style={{ borderRadius: 'var(--radius-md)' }}
                                    >
                                        <div className="flex items-start gap-2">
                                            {isExpanded ? (
                                                <ChevronDown size={14} strokeWidth={1.75} className="mt-1 shrink-0" style={{ color: 'var(--text-muted)' }} />
                                            ) : (
                                                <ChevronRight size={14} strokeWidth={1.75} className="mt-1 shrink-0" style={{ color: 'var(--text-muted)' }} />
                                            )}
                                            <div>
                                                <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{project.name}</div>
                                                <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{project.description}</div>
                                            </div>
                                        </div>

                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{nameForClient(project.client_id)}</div>

                                        <div>
                                            <StatusTag status={project.status === 'ACTIVE' ? 'present' : project.status === 'COMPLETED' ? 'pending' : 'neutral'} label={project.status} />
                                        </div>

                                        <div className="font-mono text-xs" style={{ color: 'var(--ink)' }}>
                                            <div>{projectProgress(project.id)}%</div>
                                            <div className="mt-1" style={{ color: hoursVariance(project.id).variance > 0 ? 'var(--status-absent)' : 'var(--status-present)' }}>
                                                {hoursVariance(project.id).variance >= 0 ? '+' : ''}{hoursVariance(project.id).variance}h
                                            </div>
                                        </div>

                                        <div className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            {project.deadline}
                                        </div>

                                        <div className="text-right">
                                            {canManage && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEdit(project);
                                                    }}
                                                    aria-label="Edit project"
                                                    className="inline-flex items-center justify-center p-1 transition-colors hover:opacity-70"
                                                >
                                                    <Pencil size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Team section — inside the SAME bordered container as the row above */}
                                    {isExpanded && (
                                        <div
                                            className="border-t px-3 py-3.5 pl-9"
                                            style={{ borderColor: 'var(--line-soft)' }}
                                        >
                                            <p
                                                className="font-display text-sm font-semibold"
                                                style={{ color: 'var(--ink)' }}
                                            >
                                                Team
                                            </p>

                                            {project.team_member_ids.length === 0 ? (
                                                <p
                                                    className="mt-2 text-sm"
                                                    style={{ color: 'var(--text-muted)' }}
                                                >
                                                    No team members assigned.
                                                </p>
                                            ) : (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {project.team_member_ids.map((id) => {
                                                        const employee = employeeById(id);

                                                        return (
                                                            <div
                                                                key={id}
                                                                className="rounded-md border px-3 py-1.5 text-sm"
                                                                style={{
                                                                    background: 'white',
                                                                    borderColor: 'var(--line)',
                                                                    color: 'var(--ink)',
                                                                }}
                                                            >
                                                                {employee?.name ?? 'Unknown'}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Drawer open={drawerOpen} title={editingId ? 'Edit project' : 'Add project'} onClose={() => { setDrawerOpen(false); resetForm(); }}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Field label="Name">
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    </Field>
                    <Field label="Client">
                        <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                            <option value="" disabled>
                                Select client…
                            </option>
                            {clients.filter((client) => client.status === 'ACTIVE').map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Description">
                        <textarea value={description} rows={3} onChange={(e) => setDescription(e.target.value)} className="w-full resize-none border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Start date">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                        </Field>
                        <Field label="Deadline">
                            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Status">
                            <select value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'ON_HOLD' | 'COMPLETED')} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                                <option value="ACTIVE">Active</option>
                                <option value="ON_HOLD">On Hold</option>
                                <option value="COMPLETED">Completed</option>
                            </select>
                        </Field>
                        <Field label="Team members">
                            <select multiple value={teamMembers} onChange={(e) => setTeamMembers(Array.from(e.target.selectedOptions, (option) => option.value))} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                                {employees.map((employee) => (
                                    <option key={employee.id} value={employee.id}>
                                        {employee.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <button type="submit" className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90" style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}>
                        {editingId ? 'Save project' : 'Add project'}
                    </button>
                </form>
            </Drawer>
        </div>
    );
}