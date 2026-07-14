import React, { useState } from 'react';
import { API_URL } from '../lib/config';

interface Props {
  documentId: string;
  token: string;
  onClose: () => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}


export const ShareModal: React.FC<Props> = ({ documentId, token, onClose, addToast }) => {
  const [permissions, setPermissions] = useState<'view' | 'edit'>('edit');
  const [expiresIn, setExpiresIn] = useState<string>('');
  const [link, setLink] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/documents/${documentId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          permissions,
          ...(expiresIn ? { expiresIn: Number(expiresIn) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLink(data.invite.link);
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    addToast('Link copied to clipboard!', 'success');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-strong rounded-2xl p-6 w-full max-w-md animate-fadeInUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-100">Share Document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Permission</label>
            <div className="flex gap-2">
              {(['edit', 'view'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPermissions(p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    permissions === p
                      ? 'bg-violet-600 text-white'
                      : 'glass text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p === 'edit' ? '✏️ Can Edit' : '👁️ Can View'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Expires in</label>
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="">Never</option>
              <option value="1">1 hour</option>
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
            </select>
          </div>

          <button
            type="button"
            onClick={generateLink}
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Link'}
          </button>

          {link && (
            <div className="mt-4 animate-fadeInUp">
              <label className="block text-sm font-medium text-slate-300 mb-2">Share Link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-violet-300 font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
