import React from 'react';
import type { ConnectionStatus as ConnectionStatusType } from '../hooks/useYjsDocument';

interface StatusConfig {
  label: string;
  color: string;
  pulse: boolean;
}

const CONFIG: Record<ConnectionStatusType, StatusConfig> = {
  connected: { label: 'Synced', color: 'bg-emerald-500', pulse: false },
  connecting: { label: 'Connecting...', color: 'bg-amber-500', pulse: true },
  disconnected: { label: 'Offline — changes saved locally', color: 'bg-gray-400', pulse: false },
  syncing: { label: 'Syncing...', color: 'bg-blue-500', pulse: true },
};

interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const { label, color, pulse } = CONFIG[status];

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`}></span>
      </span>
      {label}
    </div>
  );
};

export default ConnectionStatus;
