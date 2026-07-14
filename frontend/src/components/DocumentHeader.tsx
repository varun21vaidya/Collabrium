import React, { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { API_URL } from '../lib/config';

interface Props {
  ydoc: Y.Doc;
  documentId: string;
  token: string;
  initialTitle: string;
  initialDescription?: string;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onShare: () => void;
  onHistory: () => void;
}


export const DocumentHeader: React.FC<Props> = ({
  ydoc, documentId, token, initialTitle, initialDescription = '', addToast, onShare, onHistory
}) => {
  const metadata = ydoc.getMap('metadata');
  const [title, setTitle] = useState(metadata.get('title') as string || initialTitle);
  const [description, setDescription] = useState(metadata.get('description') as string || initialDescription);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
      const t = metadata.get('title') as string;
      const d = metadata.get('description') as string;
      if (t !== undefined) setTitle(t);
      if (d !== undefined) setDescription(d);
    };
    metadata.observe(update);
    return () => metadata.unobserve(update);
  }, [metadata]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.select();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) descRef.current?.select();
  }, [editingDesc]);

  const saveTitle = async (value: string) => {
    const trimmed = value.trim() || 'Untitled document';
    setTitle(trimmed);
    setEditingTitle(false);
    metadata.set('title', trimmed);
    try {
      await fetch(`${API_URL}/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch {
      addToast('Failed to save title', 'error');
    }
  };

  const saveDescription = async (value: string) => {
    setDescription(value);
    setEditingDesc(false);
    metadata.set('description', value);
    try {
      await fetch(`${API_URL}/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: value }),
      });
    } catch {
      addToast('Failed to save description', 'error');
    }
  };

  return (
    <div className="border-b border-white/10 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              defaultValue={title}
              onBlur={(e) => saveTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="w-full bg-transparent text-2xl font-bold text-slate-100 focus:outline-none border-b-2 border-violet-500 pb-0.5"
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              className="text-2xl font-bold text-slate-100 cursor-text hover:text-violet-300 transition-colors truncate"
              title="Click to edit title"
            >
              {title || 'Untitled document'}
            </h1>
          )}

          {editingDesc ? (
            <input
              ref={descRef}
              defaultValue={description}
              onBlur={(e) => saveDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDescription((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setEditingDesc(false);
              }}
              placeholder="Add a description..."
              className="mt-1 w-full bg-transparent text-sm text-slate-400 focus:outline-none border-b border-slate-600 pb-0.5 placeholder-slate-600"
            />
          ) : (
            <p
              onClick={() => setEditingDesc(true)}
              className="mt-1 text-sm text-slate-500 cursor-text hover:text-slate-400 transition-colors"
              title="Click to edit description"
            >
              {description || <em className="text-slate-600">Add a description...</em>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onHistory}
            type="button"
            title="Version History"
            className="p-2 rounded-lg glass hover:bg-white/10 text-slate-400 hover:text-violet-300 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={onShare}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>
      </div>
    </div>
  );
};
