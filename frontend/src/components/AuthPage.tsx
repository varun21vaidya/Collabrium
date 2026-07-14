import React, { useState } from 'react';
import { API_URL } from '../lib/config';

const DEMO_USERS = [
  { id: 'user-alice', name: 'Alice Johnson', emoji: '👩‍💻' },
  { id: 'user-bob', name: 'Bob Smith', emoji: '👨‍🎨' },
  { id: 'user-carol', name: 'Carol Davis', emoji: '👩‍🔬' },
  { id: 'user-dave', name: 'Dave Wilson', emoji: '👨‍🚀' },
];

interface AuthPageProps {
  onAuth: (auth: { token: string; userId: string; name: string }) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDemo, setSelectedDemo] = useState(DEMO_USERS[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = isLogin ? '/login' : '/register';
      const body: Record<string, string> = { email, password };
      if (!isLogin) {
        body.username = username;
        body.displayName = displayName;
      }
      const res = await fetch(`${API_URL}/api/auth${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      const auth = { token: data.token, userId: data.userId, name: data.name };
      localStorage.setItem('collabrium_auth', JSON.stringify(auth));
      onAuth(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/demo-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedDemo.id, name: selectedDemo.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo mode failed');
      const auth = { token: data.token, userId: data.userId, name: data.name };
      localStorage.setItem('collabrium_auth', JSON.stringify(auth));
      onAuth(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(96,165,250,0.1) 0%, transparent 50%), rgb(9,9,18)' }}>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full" style={{ background: 'rgba(139,92,246,0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full" style={{ background: 'rgba(96,165,250,0.06)', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div className="relative w-full max-w-md animate-fadeInUp">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(96,165,250,0.2))', border: '1px solid rgba(139,92,246,0.4)' }}>
            <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold gradient-text">Collabrium</h1>
          <p className="text-slate-400 mt-2 text-sm">Real-time collaborative editing, powered by CRDTs</p>
        </div>

        <div className="glass-strong rounded-2xl p-6 space-y-6 gradient-border">
          <div className="flex rounded-lg bg-black/20 p-1">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${isLogin ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setIsLogin(true)}
            >
              Login
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${!isLogin ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setIsLogin(false)}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    placeholder="johndoe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                    placeholder="John Doe"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="••••••••"
              />
              {!isLogin && <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>}
            </div>

            {error && <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded-lg">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {isLogin ? 'Logging in...' : 'Registering...'}
                </>
              ) : (
                isLogin ? 'Login' : 'Create Account'
              )}
            </button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="flex items-center gap-2">
                <hr className="flex-1 border-white/10" />
                <span className="text-xs text-slate-500">or</span>
                <hr className="flex-1 border-white/10" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-3">Quick demo login</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_USERS.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedDemo(user)}
                      className={`p-3 rounded-xl border transition-all text-left ${
                        selectedDemo.id === user.id
                          ? 'border-violet-500/60 bg-violet-500/15'
                          : 'border-white/5 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="text-xl mb-1">{user.emoji}</div>
                      <div className="text-xs font-semibold text-slate-200 leading-tight">{user.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{user.id}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemo}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm shadow-lg"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Connecting...</>
                ) : (
                  <>Continue as {selectedDemo.name.split(' ')[0]} →</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
