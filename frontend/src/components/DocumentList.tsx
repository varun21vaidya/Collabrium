import React, { useEffect, useState } from 'react';
import { API_URL } from '../lib/config';

interface DocumentRecord {
  _id: string;
  title: string;
  description?: string;
  lastEditedAt: string;
  ownerId: string;
  createdAt: string;
}

interface DocumentListProps {
  token: string;
  onSelect: (documentId: string, title: string, description?: string) => void;
  userId: string;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}


const SORT_OPTIONS = [
  { value: 'updatedAt', label: 'Last edited' },
  { value: 'title', label: 'Title' },
  { value: 'createdAt', label: 'Created' },
];

function getInitials(title: string) {
  return title.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'D';
}

const DOC_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626'];
function docColor(id: string) {
  return DOC_COLORS[id.charCodeAt(id.length - 1) % DOC_COLORS.length];
}

const DocumentList: React.FC<DocumentListProps> = ({ token, onSelect, userId, addToast }) => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocuments = async (q = search, s = sortBy) => {
    try {
      const params = new URLSearchParams({ sortBy: s });
      if (q) params.set('search', q);
      const res = await fetch(`${API_URL}/api/documents?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments('', 'updatedAt');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchDocuments(search, sortBy), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortBy]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle || undefined }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const data = await res.json();
      setDocuments((prev) => [data.document, ...prev]);
      setNewTitle('');
      addToast('Document created!', 'success');
      onSelect(data.document._id, data.document.title, data.document.description);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setDocuments((prev) => prev.filter((d) => d._id !== id));
      addToast('Document deleted', 'info');
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeInUp">
      {/* Create form */}
      <form onSubmit={handleCreate} className="glass-strong rounded-2xl p-4 flex gap-3 gradient-border">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New document title..."
          className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none text-sm"
          aria-label="New document title"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {creating ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          Create
        </button>
      </form>

      {/* Search + Sort */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 glass rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none border border-white/10 focus:border-violet-500 transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="glass border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-colors"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
          ))}
        </select>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <div className="text-5xl mb-4">📄</div>
          <p className="text-slate-300 font-medium">No documents yet</p>
          <p className="text-slate-500 text-sm mt-1">Create your first document above to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <div
              key={doc._id}
              onClick={() => onSelect(doc._id, doc.title, doc.description)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(doc._id, doc.title, doc.description); } }}
              role="button"
              tabIndex={0}
              className="w-full text-left glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all group animate-fadeInUp border border-white/5 hover:border-violet-500/30 cursor-pointer"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: docColor(doc._id) + '40', border: `1px solid ${docColor(doc._id)}40`, color: docColor(doc._id) }}
              >
                {getInitials(doc.title)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-200 truncate group-hover:text-violet-300 transition-colors">
                  {doc.title}
                </div>
                {doc.description && (
                  <div className="text-xs text-slate-500 truncate mt-0.5">{doc.description}</div>
                )}
                <div className="text-xs text-slate-600 mt-1">
                  {doc.ownerId === userId ? 'Owner' : 'Collaborator'} · Edited {new Date(doc.lastEditedAt).toLocaleDateString()}
                </div>
              </div>
              {doc.ownerId === userId && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, doc._id)}
                  disabled={deletingId === doc._id}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
                  aria-label={`Delete ${doc.title}`}
                >
                  {deletingId === doc._id ? (
                    <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentList;
