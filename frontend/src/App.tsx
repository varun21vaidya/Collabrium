import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import Editor from './components/Editor';
import DocumentList from './components/DocumentList';
import AuthPage from './components/AuthPage';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import { API_URL } from './lib/config';

interface AuthState {
  userId: string;
  name: string;
  token: string;
}

interface EditSession {
  userId: string;
  name: string;
  token: string;
  documentId: string;
  title: string;
  description?: string;
}


// ── Docs Page ─────────────────────────────────────────────────────────────────
const DocsPage: React.FC<{ auth: AuthState; onLogout: () => void; onSelect: (session: EditSession) => void }> = ({ auth, onLogout, onSelect }) => {
  const { addToast, toasts, removeToast } = useToast();

  return (
    <div className="min-h-screen" style={{ background: 'rgb(9,9,18)' }}>
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between glass sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <span className="font-bold text-slate-100 gradient-text">Collabrium</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{auth.name}</span>
          <button type="button" onClick={onLogout} className="text-xs text-slate-500 hover:text-slate-300 transition-colors glass px-3 py-1.5 rounded-lg">
            Switch User
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Your Documents</h2>
        <DocumentList
          token={auth.token}
          userId={auth.userId}
          addToast={addToast}
          onSelect={(id, title, description) => onSelect({ ...auth, documentId: id, title, description })}
        />
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

// ── Editor Page ───────────────────────────────────────────────────────────────
const EditorPage: React.FC<{ session: EditSession; onLeave: () => void }> = ({ session, onLeave }) => {
  const { addToast, toasts, removeToast } = useToast();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'rgb(9,9,18)' }}>
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between glass sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onLeave} className="text-slate-400 hover:text-slate-200 transition-colors" title="Back to documents">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-px h-5 bg-white/10" />
          <span className="text-sm font-semibold gradient-text">Collabrium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">{session.name}</span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Editor
          documentId={session.documentId}
          token={session.token}
          userName={session.name}
          userId={session.userId}
          addToast={addToast}
          initialTitle={session.title}
          initialDescription={session.description}
        />
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

// ── Join Page (invite link) ───────────────────────────────────────────────────
const JoinPage: React.FC = () => {
  const { token: inviteToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { addToast, toasts, removeToast } = useToast();
  const [info, setInfo] = useState<{ documentId: string; documentTitle: string; permissions: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const storedAuth = (() => {
    try { return JSON.parse(localStorage.getItem('collabrium_auth') || 'null'); } catch { return null; }
  })() as { token: string; userId: string; name: string } | null;

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`${API_URL}/api/invite/${inviteToken}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) addToast(d.error, 'error');
        else setInfo(d);
      })
      .catch(() => addToast('Failed to load invite', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  const handleAccept = async () => {
    if (!info || !inviteToken) return;
    setAccepting(true);
    try {
      const userId = storedAuth?.userId || 'guest-' + Date.now();
      const name = storedAuth?.name || displayName || 'Guest';
      const res = await fetch(`${API_URL}/api/invite/${inviteToken}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem('collabrium_auth', JSON.stringify({ token: data.token, userId: data.userId, name: data.name }));
      sessionStorage.setItem('collabrium_doc', JSON.stringify({ documentId: data.documentId, title: info.documentTitle }));
      navigate('/', { state: { fromInvite: true, ...data, documentId: data.documentId, title: info.documentTitle } });
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.12) 0%, transparent 60%), rgb(9,9,18)' }}>
      <div className="w-full max-w-md animate-fadeInUp">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !info ? (
          <div className="glass-strong rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Invalid Invite Link</h2>
            <p className="text-slate-400 text-sm">This invite may have expired or been revoked.</p>
            <button type="button" onClick={() => navigate('/')} className="mt-6 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors">Go Home</button>
          </div>
        ) : (
          <div className="glass-strong rounded-2xl p-6 space-y-6 gradient-border">
            <div className="text-center">
              <div className="text-4xl mb-3">📄</div>
              <h2 className="text-xl font-bold text-slate-100">You're invited!</h2>
              <p className="text-slate-400 text-sm mt-1">
                <span className="text-violet-300 font-semibold">{info.documentTitle}</span>
              </p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-semibold rounded-full ${info.permissions === 'edit' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {info.permissions === 'edit' ? '✏️ Can Edit' : '👁️ View Only'}
              </span>
            </div>

            {storedAuth ? (
              <div className="text-center">
                <p className="text-sm text-slate-300">Joining as <span className="text-violet-300 font-semibold">{storedAuth.name}</span></p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-3">Your name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting || (!storedAuth && !displayName)}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-sm"
            >
              {accepting ? 'Joining...' : `Join →`}
            </button>
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

// ── Root App ──────────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [session, setSession] = useState<EditSession | null>(null);

  // Restore persistent auth from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('collabrium_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAuth(parsed);
      } catch {
        localStorage.removeItem('collabrium_auth');
      }
    }
  }, []);

  // Handle invite redirects stored in sessionStorage
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('collabrium_auth');
    const storedDoc = sessionStorage.getItem('collabrium_doc');
    if (storedAuth && storedDoc) {
      sessionStorage.removeItem('collabrium_auth');
      sessionStorage.removeItem('collabrium_doc');
      const authData = JSON.parse(storedAuth);
      const docData = JSON.parse(storedDoc);
      setAuth(authData);
      setSession({ ...authData, ...docData });
    }
  }, []);

  const handleAuth = (auth: AuthState) => {
    setAuth(auth);
    localStorage.setItem('collabrium_auth', JSON.stringify(auth));
  };

  const handleLogout = () => {
    localStorage.removeItem('collabrium_auth');
    setAuth(null);
  };

  if (session) {
    return <EditorPage session={session} onLeave={() => setSession(null)} />;
  }

  if (auth) {
    return <DocsPage auth={auth} onLogout={handleLogout} onSelect={(s) => setSession(s)} />;
  }

  return <AuthPage onAuth={handleAuth} />;
};

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="*" element={<AppInner />} />
    </Routes>
  </BrowserRouter>
);

export default Sentry.withProfiler(App);
