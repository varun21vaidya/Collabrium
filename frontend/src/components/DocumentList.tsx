import React, { useEffect, useState } from 'react';

interface DocumentRecord {
  _id: string;
  title: string;
  lastEditedAt: string;
  ownerId: string;
}

interface DocumentListProps {
  token: string;
  onSelect: (documentId: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({ token, onSelect }) => {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTitle || undefined }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const data = await res.json();
      setDocuments((prev) => [data.document, ...prev]);
      setNewTitle('');
      onSelect(data.document._id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRename = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/documents/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitle }),
      });
      if (!res.ok) throw new Error('Failed to rename');
      const data = await res.json();
      setDocuments((prev) => prev.map((d) => (d._id === id ? data.document : d)));
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setDocuments((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading documents...</div>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New document title..."
          className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
          aria-label="New document title"
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          aria-label="Create new document"
        >
          Create
        </button>
      </form>

      {error && (
        <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
      )}

      {documents.length === 0 && !error && (
        <div className="text-center py-8 text-gray-400">
          No documents yet. Create one above.
        </div>
      )}

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc._id}
            className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
          >
            {editingId === doc._id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleRename(doc._id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(doc._id)}
                className="flex-1 px-2 py-1 border rounded"
                autoFocus
                aria-label="Edit document title"
              />
            ) : (
              <button
                onClick={() => onSelect(doc._id)}
                onDoubleClick={() => { setEditingId(doc._id); setEditTitle(doc.title); }}
                className="flex-1 text-left"
                aria-label={`Open ${doc.title}`}
              >
                <div className="font-medium text-gray-800">{doc.title}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Last edited {new Date(doc.lastEditedAt).toLocaleString()}
                </div>
              </button>
            )}
            {editingId !== doc._id && (
              <button
                onClick={() => handleDelete(doc._id)}
                className="ml-4 text-gray-400 hover:text-red-500 transition-colors"
                aria-label={`Delete ${doc.title}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentList;
