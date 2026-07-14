import React, { useEffect, useState, memo } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type { AwarenessUser } from '../hooks/useYjsDocument';

interface PresenceBarProps {
  provider: WebsocketProvider;
}

const PresenceBar: React.FC<PresenceBarProps> = memo(({ provider }) => {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  useEffect(() => {
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values()) as Array<Record<string, unknown>>;
      const validUsers = states
        .map((s) => s.user as AwarenessUser | undefined)
        .filter((u): u is AwarenessUser => Boolean(u && u.name));
      setUsers(validUsers);
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      provider.awareness.off('change', updateUsers);
      setUsers([]);
    };
  }, [provider]);

  const visibleUsers = users.slice(0, 6);
  const overflowCount = Math.max(0, users.length - 6);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2 overflow-hidden">
        {visibleUsers.map((user) => (
          <div
            key={user.name}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-slate-900 shadow-sm"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {overflowCount > 0 && (
          <div className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-950 flex items-center justify-center text-slate-300 text-[10px] font-bold shadow-sm">
            +{overflowCount}
          </div>
        )}
      </div>
      <span className="text-xs text-slate-400 font-medium ml-1">
        {users.length} {users.length === 1 ? 'user' : 'users'} active
      </span>
    </div>
  );
});

PresenceBar.displayName = 'PresenceBar';

export default PresenceBar;
