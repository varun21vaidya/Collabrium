import React, { useEffect, useState, memo } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type { AwarenessUser } from '../hooks/useYjsDocument';

interface PresenceBarProps {
  provider: WebsocketProvider;
}

const PresenceBar: React.FC = memo(({ provider }) => {
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
    <div className="flex items-center gap-2">
      {visibleUsers.map((user, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: user.color }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {overflowCount > 0 && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold">
          +{overflowCount}
        </div>
      )}
      <span className="text-sm text-gray-500 ml-1">
        {users.length} {users.length === 1 ? 'user' : 'users'} online
      </span>
    </div>
  );
});

PresenceBar.displayName = 'PresenceBar';

export default PresenceBar;
