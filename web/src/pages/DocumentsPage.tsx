import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCompanyDocuments, type CompanyDocCategory } from '../data/companyDocuments';
import { Drawer } from '../components/Drawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Role } from '../data/roles';

type Ctx = { role: Role };

const CATEGORIES: CompanyDocCategory[] = ['Policy', 'Letter Template', 'Form', 'Other'];
const inputStyle = { borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)' } as const;

export default function DocumentsPage() {
  const { role } = useOutletContext<Ctx>();
  const canManage = role === 'SUPER_ADMIN' || role === 'HR';
  const { documents, loading, error, addDocument, removeDocument, openDocument } = useCompanyDocuments();

  const [showModal, setShowModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CompanyDocCategory>('Policy');
  const [description, setDescription] = useState('');
  const [isVisibleToAll, setIsVisibleToAll] = useState(true);
  const [filter, setFilter] = useState<'ALL' | CompanyDocCategory>('ALL');
  const [dragActive, setDragActive] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const filtered = filter === 'ALL' ? documents : documents.filter((d) => d.category === filter);
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null;

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError(null);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      const file = files[0];
      if (allowed.includes(file.type) || ['pdf', 'docx', 'xlsx'].includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
        setFile(file);
      } else {
        setUploadError('Only PDF, DOCX, and XLSX files are allowed.');
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      const chosen = e.target.files[0];
      const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      if (allowed.includes(chosen.type) || ['pdf', 'docx', 'xlsx'].includes(chosen.name.split('.').pop()?.toLowerCase() ?? '')) {
        setFile(chosen);
      } else {
        setUploadError('Only PDF, DOCX, and XLSX files are allowed.');
        setFile(null);
      }
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    if (!name.trim()) {
      setUploadError('Document name is required.');
      return;
    }
    if (!file) {
      setUploadError('Please select a PDF, DOCX, or XLSX file.');
      return;
    }

    try {
      await addDocument({
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        is_visible_to_all: isVisibleToAll,
        file,
      });
      setName('');
      setCategory('Policy');
      setDescription('');
      setIsVisibleToAll(true);
      setFile(null);
      setShowModal(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The document could not be uploaded.');
    }
  }

  async function handleOpen(document: (typeof documents)[number]) {
    try {
      const signedUrl = await openDocument(document);
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The document could not be opened right now.');
    }
  }

  async function handleRemove(documentId: string) {
    const ok = await removeDocument(documentId);
    if (ok) {
      setSelectedDocumentId((current) => (current === documentId ? null : current));
    }
  }

  function handleCancel() {
    setName('');
    setCategory('Policy');
    setDescription('');
    setIsVisibleToAll(true);
    setFile(null);
    setUploadError(null);
    setShowModal(false);
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--accent-holiday)' }}>
        HR
      </p>
      <h1 className="font-display mt-1 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
        Document repository
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Policies, letter templates, and forms — visible to everyone.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(['ALL', ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors"
            style={{
              background: filter === c ? 'var(--ink)' : 'white',
              color: filter === c ? 'var(--text-on-ink)' : 'var(--text-secondary)',
              borderColor: 'var(--line)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {c === 'ALL' ? 'All' : c}
          </button>
        ))}
      </div>

      <div className={`mt-5 grid gap-6 ${canManage ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <div className="border bg-white" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
          {loading ? (
            <div className="space-y-3 px-5 py-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-md" style={{ background: 'rgba(15, 23, 42, 0.06)' }} />
              ))}
            </div>
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--status-absent)' }}>{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No documents in this category.
            </p>
          ) : (
            filtered.map((d) => (
              <div
                key={d.id}
                onClick={() => setSelectedDocumentId(d.id)}
                className="flex cursor-pointer items-start gap-4 border-b px-5 py-3.5 transition-colors hover:bg-[var(--paper)] last:border-b-0"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <span className="mt-1 h-8 w-[3px] shrink-0" style={{ background: 'var(--accent-holiday)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {d.name}
                  </p>
                  {d.description && (
                    <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {d.description}
                    </p>
                  )}
                  {canManage && !d.is_visible_to_all && (
                    <span className="mt-1 inline-flex px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ background: 'var(--status-neutral-bg)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      Restricted / HR Only
                    </span>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <p>{d.uploaded_at}</p>
                    {d.file && <p>•</p>}
                    {d.file && <p>{d.file.name}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="font-mono px-2 py-0.5 text-[11px] uppercase"
                    style={{ background: 'var(--accent-holiday-bg)', color: 'var(--accent-holiday)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {d.category}
                  </span>
                  {canManage && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setRemoveId(d.id);
                      }}
                      className="font-mono text-[11px] uppercase tracking-wide hover:underline"
                      style={{ color: 'var(--status-absent)' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {canManage && (
          <div className="h-fit border bg-white p-5" style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Add a document
            </h3>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 w-full py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent-holiday)', color: 'white', borderRadius: 'var(--radius-sm)' }}
            >
              Add document
            </button>
          </div>
        )}
      </div>

      <Drawer
        open={Boolean(selectedDocument)}
        title="Document details"
        onClose={() => setSelectedDocumentId(null)}
      >
        {selectedDocument && (
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                {selectedDocument.category}
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
                {selectedDocument.name}
              </h2>
            </div>
            <div className="space-y-4 border-y py-5" style={{ borderColor: 'var(--line-soft)' }}>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Description</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{selectedDocument.description || 'No description provided.'}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Uploaded</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{selectedDocument.uploaded_at}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>File</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>{selectedDocument.file?.name || 'No file attached'}</p>
                {selectedDocument.file && <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{selectedDocument.file.type || 'Unknown type'} · {(selectedDocument.file.size / 1024).toFixed(2)} KB</p>}
              </div>
            </div>
            <button
              onClick={() => void handleOpen(selectedDocument)}
              className="w-full py-2.5 text-sm font-medium"
              style={{ background: 'var(--ink)', color: 'white', borderRadius: 'var(--radius-sm)' }}
            >
              Open / Download
            </button>
          </div>
        )}
      </Drawer>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md border bg-white p-6"
            style={{ borderColor: 'var(--line-soft)', borderRadius: 'var(--radius-md)' }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Add Document
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Upload a new HR document
            </p>

            <form onSubmit={(event) => void handleAdd(event)} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Document file
                </span>
                <div
                  className={`mt-2 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${dragActive ? 'bg-blue-50' : 'bg-gray-50'}`}
                  style={{
                    borderColor: dragActive ? 'var(--accent-holiday)' : 'var(--line-soft)',
                    backgroundColor: dragActive ? 'rgba(244, 144, 12, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                  }}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    id="file-input"
                    onChange={handleFileChange}
                    accept=".pdf,.docx,.xlsx"
                    className="hidden"
                  />
                  <label htmlFor="file-input" className="block cursor-pointer">
                    {file ? (
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                          ✓ {file.name}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                          ↑
                        </p>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Drag & drop your file
                        </p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          PDF, DOCX, XLSX
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </label>

              {uploadError && (
                <p className="text-sm" style={{ color: 'var(--status-absent)' }}>{uploadError}</p>
              )}

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Document name
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Employee Handbook 2026"
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CompanyDocCategory)}
                  className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={isVisibleToAll}
                  onChange={(event) => setIsVisibleToAll(event.target.checked)}
                  className="h-4 w-4"
                />
                <span>Visible to all employees</span>
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1.5 w-full resize-none border px-3 py-2 text-sm outline-none"
                  rows={3}
                  style={inputStyle}
                />
              </label>

              <div className="mt-6 flex gap-3 border-t pt-4" style={{ borderColor: 'var(--line-soft)' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 border py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--line)', borderRadius: 'var(--radius-sm)', color: 'var(--ink)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !file}
                  className="flex-1 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: 'var(--accent-holiday)',
                    color: 'white',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog open={removeId !== null} message="Are you sure you want to remove this record?" onCancel={() => setRemoveId(null)} onConfirm={() => { if (removeId) void handleRemove(removeId); setRemoveId(null); }} />
    </div>
  );
}
