import React, { useEffect, useState } from 'react';

interface Version {
  _id: string;
  authorId: string;
  message: string;
  createdAt: string;
}

interface Props {
  documentId: string;
  token: string;
  onClose: () => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export const VersionHistory: React.FC<Props> = ({ documentId, token, onClose, addToast }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/documents/${documentId}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setVersions(d.versions || []))
      .catch(() => addToast('Failed to load history', 'error'))
      .finally(() => setLoading(false));
  }, [documentId, token]);

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const res = await fetch(`${apiUrl}/api/documents/${documentId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ versionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast('Document restored! Refresh to see changes.', 'success');
      onClose();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-100">Version History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-slate-400 text-sm">No version history yet.</p>
              <p className="text-slate-500 text-xs mt-1">History is saved automatically as you edit.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div key={v._id} className="glass rounded-xl p-4 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        {i === 0 ? '⭐ Latest snapshot' : `Version ${versions.length - i}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(v.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => handleRestore(v._id)}
                      disabled={restoring === v._id}
                      className="px-3 py-1.5 text-xs font-medium bg-violet-600/30 hover:bg-violet-600 border border-violet-500/30 text-violet-300 hover:text-white rounded-lg transition-all disabled:opacity-50 opacity-0 group-hover:opacity-100"
                    >
                      {restoring === v._id ? 'Restoring...' : 'Restore'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
