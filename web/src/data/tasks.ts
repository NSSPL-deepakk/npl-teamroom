import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
    id: string;
    title: string;
    description: string;
    assigned_to: string;
    assigned_by: string;
    assigned_by_name?: string;
    client_id: string;
    client_name?: string;
    project_id: string;
    project_name?: string;
    status: TaskStatus;
    priority: TaskPriority;
    estimated_hours: number;
    worked_hours: number;
    due_date: string;
    created_at: string;
}

export interface TaskTimeEntry {
    id: string;
    task_id: string;
    hours: number;
    logged_at: string;
    logged_by: string;
}

export interface TaskComment {
    id: string;
    task_id: string;
    commenter: string;
    timestamp: string;
    text: string;
}

type Relation<T> = T | T[] | null;
type TaskRow = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    status: 'To Do' | 'In Progress' | 'Completed';
    priority: 'Low' | 'Medium' | 'High';
    assigned_to: string | null;
    assigned_by: string | null;
    estimated_hours: number | null;
    logged_hours: number | null;
    due_date: string | null;
    created_at: string;
    project?: Relation<{ name: string; client_id: string; client?: Relation<{ name: string }> }>;
    assigner?: Relation<{ name: string }>;
    assignee?: Relation<{ name: string }>;
    projects?: Relation<{ name: string; client_id: string; clients?: Relation<{ name: string }> }>;
};

type TimeLogRow = { id: string; task_id: string; logged_by: string | null; hours: number; logged_at: string; employees?: Relation<{ name: string }> };
type CommentRow = { id: string; task_id: string; author_id: string | null; body: string; created_at: string; employees?: Relation<{ name: string }> };

function first<T>(relation: Relation<T> | undefined): T | undefined {
    return Array.isArray(relation) ? relation[0] : relation ?? undefined;
}

function fromTaskRow(row: TaskRow): Task {
    const project = first(row.project ?? row.projects);
    const projectClient = project && 'client' in project ? project.client : undefined;
    const legacyClientName = 'clients' in (project ?? {}) ? first((project as any)?.clients)?.name : undefined;
    return {
        id: row.id,
        title: row.title,
        description: row.description ?? '',
        assigned_to: row.assigned_to ?? '',
        assigned_by: row.assigned_by ?? '',
        assigned_by_name: first(row.assigner)?.name ?? first(row.assigner as any)?.name ?? undefined,
        client_id: project?.client_id ?? '',
        client_name: first(projectClient)?.name ?? legacyClientName,
        project_id: row.project_id,
        project_name: project?.name,
        status: row.status === 'To Do' ? 'TODO' : row.status === 'In Progress' ? 'IN_PROGRESS' : 'COMPLETED',
        priority: row.priority === 'Low' ? 'LOW' : row.priority === 'Medium' ? 'MEDIUM' : 'HIGH',
        estimated_hours: Number(row.estimated_hours ?? 0),
        worked_hours: Number(row.logged_hours ?? 0),
        due_date: row.due_date ?? '',
        created_at: row.created_at,
    };
}

async function currentEmployeeId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('employee_id').eq('id', user.id).single();
    return data?.employee_id ?? null;
}

const TASK_SELECT = 'id, title, description, project_id, status, priority, assigned_to, assigned_by, estimated_hours, logged_hours, due_date, created_at, project:projects(name, client_id, client:clients(name)), assigner:employees!tasks_assigned_by_fkey(name), assignee:employees!tasks_assigned_to_fkey(name)';
const LOG_SELECT = 'id, task_id, logged_by, hours, logged_at, employees(name)';
const COMMENT_SELECT = 'id, task_id, author_id, body, created_at, employees(name)';

export type TaskOptions = {
    taskId?: string | null;
    includeDetails?: boolean;
};

export function useTasks(options: TaskOptions = {}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [timeEntries, setTimeEntries] = useState<TaskTimeEntry[]>([]);
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        const taskResult = await supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false });
        if (taskResult.error) {
            setError(taskResult.error.message);
            setLoading(false);
            return;
        }

        let logRows: TimeLogRow[] = [];
        let commentRows: CommentRow[] = [];
        if (options.includeDetails && options.taskId) {
            const [logResult, commentResult] = await Promise.all([
                supabase.from('task_time_logs').select(LOG_SELECT).eq('task_id', options.taskId).order('logged_at', { ascending: true }),
                supabase.from('task_comments').select(COMMENT_SELECT).eq('task_id', options.taskId).order('created_at', { ascending: true }),
            ]);
            const detailsError = logResult.error ?? commentResult.error;
            if (detailsError) {
                setError(detailsError.message);
                setLoading(false);
                return;
            }
            logRows = (logResult.data ?? []) as TimeLogRow[];
            commentRows = (commentResult.data ?? []) as CommentRow[];
        }

        setError(null);
        setTasks((taskResult.data ?? []).map((row) => fromTaskRow(row as TaskRow)));
        setTimeEntries(logRows.map((row) => {
            const item = row as TimeLogRow;
            return { id: item.id, task_id: item.task_id, logged_at: item.logged_at, hours: Number(item.hours), logged_by: first(item.employees)?.name ?? item.logged_by ?? 'Unknown' };
        }));
        setComments(commentRows.map((row) => {
            const item = row as CommentRow;
            return { id: item.id, task_id: item.task_id, commenter: first(item.employees)?.name ?? item.author_id ?? 'Unknown', timestamp: item.created_at, text: item.body };
        }));
        setLoading(false);
    }, [options.taskId, options.includeDetails]);

    useEffect(() => { void refresh(); }, [refresh]);

    const addTask = useCallback(async (payload: {
        title: string;
        description: string;
        assigned_to: string;
        assigned_by: string;
        client_id: string;
        project_id: string;
        priority: TaskPriority;
        estimated_hours: number;
        due_date: string;
    }) => {
        const { client_id: _clientId, ...taskPayload } = payload;
        const { data, error: insertError } = await supabase.from('tasks').insert({
            ...taskPayload,
            status: 'To Do',
            priority: payload.priority === 'LOW' ? 'Low' : payload.priority === 'MEDIUM' ? 'Medium' : 'High',
        }).select(TASK_SELECT).single();

        if (insertError) {
            setError(insertError.message);
            return;
        }

        if (data) {
            const created = fromTaskRow(data as TaskRow);
            setTasks((prev) => [created, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));
            setError(null);
            return;
        }

        await refresh();
    }, [refresh]);

    const setStatus = useCallback(async (id: string, status: TaskStatus) => {
        const value = status === 'TODO' ? 'To Do' : status === 'IN_PROGRESS' ? 'In Progress' : 'Completed';
        const { error: updateError } = await supabase.from('tasks').update({ status: value }).eq('id', id);
        if (updateError) setError(updateError.message);
        else setTasks((prev) => prev.map((task) => task.id === id ? { ...task, status } : task));
    }, []);

    const logTime = useCallback(async (taskId: string, hours: number): Promise<string | null> => {
        if (!Number.isFinite(hours) || hours <= 0) return 'Enter a number of hours greater than 0.';
        const employeeId = await currentEmployeeId();
        if (!employeeId) {
            const message = 'Could not determine the current employee.';
            setError(message);
            return message;
        }
        const { error: insertError } = await supabase.from('task_time_logs').insert({ task_id: taskId, logged_by: employeeId, hours });
        if (insertError) {
            setError(insertError.message);
            return insertError.message;
        }

        await refresh();
        return null;
    }, [refresh]);

    const logHours = useCallback(async (id: string, hours: number) => {
        await logTime(id, hours);
    }, [logTime]);

    const addComment = useCallback(async (taskId: string, _commenter: string, text: string) => {
        if (!text.trim()) return;
        const employeeId = await currentEmployeeId();
        if (!employeeId) {
            setError('Could not determine the current employee.');
            return;
        }
        const { error: insertError } = await supabase.from('task_comments').insert({ task_id: taskId, author_id: employeeId, body: text.trim() });
        if (insertError) setError(insertError.message);
        else await refresh();
    }, [refresh]);

    return { tasks, addTask, setStatus, logHours, timeEntries, comments, logTime, addComment, loading, error, refresh };
}
