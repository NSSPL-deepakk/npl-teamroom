import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Drawer } from '../components/Drawer';
import { StatusTag } from '../components/Ledger';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useClients, type Client } from '../data/clients';
import { useProjects } from '../data/projects';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;
type ClientToggle = { id: string; action: 'activate' | 'deactivate' } | null;

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

export default function ClientsPage() {
    const { role } = useOutletContext<Ctx>();
    const canManage = role === 'SUPER_ADMIN' || role === 'HR' || role === 'MANAGER';
    const { clients, addClient, updateClient, toggleStatus, loading: clientsLoading, error: clientsError } = useClients();
    const { projects, loading: projectsLoading, error: projectsError } = useProjects();

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [source, setSource] = useState<Client['source']>('');
    const [type, setType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
    const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
    const [clientToggle, setClientToggle] = useState<ClientToggle>(null);

    const selectedClient = useMemo(
        () => clients.find((client) => client.id === selectedClientId) ?? clients[0] ?? null,
        [clients, selectedClientId],
    );

    const clientProjects = useMemo(
        () => projects.filter((project) => project.client_id === selectedClient?.id),
        [projects, selectedClient],
    );

    if (clientsLoading || projectsLoading) {
        return <p className="py-12 text-center font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Loading clients...</p>;
    }
    if (clientsError || projectsError) {
        return <p className="py-12 text-center text-sm" style={{ color: 'var(--status-absent)' }}>{clientsError ?? projectsError}</p>;
    }

    function resetForm() {
        setEditingId(null);
        setName('');
        setContactPerson('');
        setEmail('');
        setPhone('');
        setNotes('');
        setSource('');
        setType('INTERNAL');
        setStatus('ACTIVE');
    }

    function openCreate() {
        resetForm();
        setDrawerOpen(true);
    }

    function openEdit(client: Client) {
        setEditingId(client.id);
        setName(client.name);
        setContactPerson(client.contact_person);
        setEmail(client.email);
        setPhone(client.phone);
        setNotes(client.notes);
        setSource(client.source ?? '');
        setType(client.type);
        setStatus(client.status);
        setDrawerOpen(true);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !contactPerson.trim()) return;

        const payload = {
            name: name.trim(),
            contact_person: contactPerson.trim(),
            email: email.trim(),
            phone: phone.trim(),
            notes: notes.trim(),
            source,
            type,
            status,
        };

        if (editingId) {
            updateClient(editingId, payload);
        } else {
            addClient(payload);
        }

        setDrawerOpen(false);
        resetForm();
    }

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-structure)' }}>
                        Clients
                    </p>
                    <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                        Client portfolio
                    </h1>
                </div>
                {canManage && (
                    <button
                        onClick={openCreate}
                        className="px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                        style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}
                    >
                        + Add client
                    </button>
                )}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                    <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                            All clients
                        </h3>
                        <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                            {clients.length}
                        </span>
                    </div>

                    {clients.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            No clients yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
                                <thead style={{ background: 'var(--paper)' }}>
                                    <tr>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Name</th>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Contact person</th>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Type</th>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Status</th>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Projects</th>
                                        <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((client) => (
                                        <tr key={client.id} onClick={() => setSelectedClientId(client.id)} style={{ borderTop: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                                            <td className="px-4 py-3 align-top text-sm" style={{ color: 'var(--ink)' }}>{client.name}</td>
                                            <td className="px-4 py-3 align-top text-sm" style={{ color: 'var(--text-secondary)' }}>{client.contact_person}</td>
                                            <td className="px-4 py-3 align-top">
                                                <span className="font-mono px-2 py-0.5 text-[10px] uppercase" style={{ background: 'var(--accent-structure-bg)', color: 'var(--accent-structure)', borderRadius: 'var(--radius-sm)' }}>
                                                    {client.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <StatusTag status={client.status === 'ACTIVE' ? 'present' : 'neutral'} label={client.status === 'ACTIVE' ? 'Active' : 'Inactive'} />
                                            </td>
                                            <td className="px-4 py-3 align-top font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {projects.filter((project) => project.client_id === client.id).length}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    {canManage && (
                                                        <>
                                                            <button onClick={() => openEdit(client)} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--text-secondary)' }}>
                                                                Edit
                                                            </button>
                                                            <button onClick={() => setClientToggle({ id: client.id, action: client.status === 'ACTIVE' ? 'deactivate' : 'activate' })} className="font-mono text-[11px] uppercase tracking-wide hover:underline" style={{ color: 'var(--status-pending)' }}>
                                                                {client.status === 'ACTIVE' ? 'Inactive' : 'Active'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
                    <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--line-soft)' }}>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                            {selectedClient ? `${selectedClient.name} projects` : 'Selected client'}
                        </h3>
                    </div>
                    {selectedClient ? (
                        <div className="p-5">
                            <p className="text-sm" style={{ color: 'var(--ink)' }}>{selectedClient.contact_person}</p>
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedClient.email}</p>
                            <div className="mt-4 space-y-3">
                                {clientProjects.length === 0 ? (
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No projects for this client yet.</p>
                                ) : (
                                    clientProjects.map((project) => (
                                        <div key={project.id} className="border p-3" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-sm)' }}>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{project.name}</span>
                                                <StatusTag status={project.status === 'ACTIVE' ? 'present' : project.status === 'COMPLETED' ? 'pending' : 'neutral'} label={project.status} />
                                            </div>
                                            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{project.deadline}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                            Select a client to view its projects.
                        </p>
                    )}
                </div>
            </div>

            <Drawer open={drawerOpen} title={editingId ? 'Edit client' : 'Add client'} onClose={() => { setDrawerOpen(false); resetForm(); }}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Field label="Name">
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    </Field>
                    <Field label="Contact person">
                        <input type="text" required value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Email">
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                        </Field>
                        <Field label="Phone">
                            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle} />
                        </Field>
                    </div>
                    <Field label="Notes">
                        <textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} className="w-full resize-none border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    </Field>
                    <Field label="Source">
                        <select value={source} onChange={(e) => setSource(e.target.value as Client['source'])} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                            <option value="">Select Source</option>
                            <option value="Upwork">Upwork</option>
                            <option value="Fiverr">Fiverr</option>
                            <option value="LinkedIn">LinkedIn</option>
                            <option value="Referral">Referral</option>
                            <option value="Website">Website</option>
                            <option value="Direct">Direct</option>
                            <option value="Other">Other</option>
                        </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Type">
                            <select value={type} onChange={(e) => setType(e.target.value as 'INTERNAL' | 'EXTERNAL')} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                                <option value="INTERNAL">Internal</option>
                                <option value="EXTERNAL">External</option>
                            </select>
                        </Field>
                        <Field label="Status">
                            <select value={status} onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')} className="w-full border px-3 py-2 text-sm outline-none" style={inputStyle}>
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>
                        </Field>
                    </div>
                    <button type="submit" className="w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90" style={{ background: 'var(--ink)', color: 'var(--text-on-ink)', borderRadius: 'var(--radius-sm)' }}>
                        {editingId ? 'Save client' : 'Add client'}
                    </button>
                </form>
            </Drawer>
            <ConfirmDialog
                open={clientToggle !== null}
                message={`Are you sure you want to ${clientToggle?.action ?? 'activate'} this client?`}
                onCancel={() => setClientToggle(null)}
                onConfirm={() => {
                    if (clientToggle) toggleStatus(clientToggle.id);
                    setClientToggle(null);
                }}
            />
        </div>
    );
}
