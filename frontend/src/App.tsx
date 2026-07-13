import React, { useState } from 'react';
import * as Sentry from '@sentry/react';
import Editor from './components/Editor';
import DocumentList from './components/DocumentList';

const DEMO_USERS = [
  { id: 'user-alice', name: 'Alice Johnson' },
  { id: 'user-bob', name: 'Bob Smith' },
  { id: 'user-carol', name: 'Carol Davis' },
  { id: 'user-dave', name: 'Dave Wilson' },
];

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
}

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [session, setSession] = useState<EditSession | null>(null);
  const [selectedUser, setSelectedUser] = useState(DEMO_USERS[0]);
  const [loading, setLoading] = useState(false);

  const handleAuthenticate = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/auth/demo-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, name: selectedUser.name }),
      });
      if (!response.ok) throw new Error('Failed to get token');
      const { token } = await response.json();
      setAuth({ userId: selectedUser.id, name: selectedUser.name, token });
    } catch (err) {
      console.error('Auth failed:', err);
      alert('Failed to connect. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDocument = (documentId: string) => {
    if (!auth) return;
    setSession({ ...auth, documentId });
  };

  const handleLeave = () => {
    setSession(null);
  };

  const handleBack = () => {
    setAuth(null);
  };

  if (session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-end">
            <button
              onClick={handleLeave}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Leave Document
            </button>
          </div>
        </div>
        <Editor
          documentId={session.documentId}
          token={session.token}
          userName={session.name}
          userId={session.userId}
        />
      </div>
    );
  }

  if (auth) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto py-8 px-4">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-800">Your Documents</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{auth.name}</span>
              <button
                onClick={handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Switch User
              </button>
            </div>
          </div>
          <DocumentList token={auth.token} onSelect={handleSelectDocument} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Real-Time Collaborative Editor
          </h1>
          <p className="mt-2 text-gray-500">
            CRDT-powered document editing with live cursors and presence
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select User Identity
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedUser.id === user.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center mx-auto font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-800">{user.name}</div>
                    <div className="text-xs text-gray-400">{user.id}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAuthenticate}
            disabled={loading}
            className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Connecting...' : 'Continue'}
          </button>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Testing Instructions</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>Open this page in multiple browser tabs</li>
              <li>Select different users in each tab</li>
              <li>Create or select a document</li>
              <li>Start typing to see real-time collaboration</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sentry.withProfiler(App);
