import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'syncing';

export interface AwarenessUser {
  name: string;
  color: string;
}

export function useYjsDocument(
  documentId: string,
  token: string,
  userName: string,
  userColor: string
) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:3002'}/collab?doc=${documentId}&token=${encodeURIComponent(token)}`;

  const provider = useMemo(
    () =>
      new WebsocketProvider(wsUrl, documentId, ydoc, {
        connect: true,
        resyncInterval: 30000,
        maxBackoffTime: 2500,
      }),
    [documentId, token, ydoc, wsUrl]
  );

  const localProvider = useMemo(
    () => new IndexeddbPersistence(documentId, ydoc),
    [documentId, ydoc]
  );

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });

    const handleStatus = (event: { status: string }) => {
      if (!mountedRef.current) return;
      if (event.status === 'connected') {
        setStatus('connected');
      } else if (event.status === 'connecting') {
        setStatus('connecting');
      } else if (event.status === 'disconnected') {
        setStatus('disconnected');
      }
    };

    const handleSynced = (event: { synced: boolean }) => {
      if (!mountedRef.current) return;
      if (event.synced) {
        setStatus(provider.wsconnected ? 'connected' : 'syncing');
      }
    };

    const handleOffline = () => {
      if (mountedRef.current) setStatus('disconnected');
    };

    const handleOnline = () => {
      if (mountedRef.current) setStatus('connecting');
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSynced);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      provider.off('status', handleStatus);
      provider.off('sync', handleSynced);
      provider.awareness.setLocalStateField('user', null);
      provider.destroy();
      localProvider.destroy();
    };
  }, [provider, localProvider, userName, userColor]);

  return { ydoc, provider, localProvider, status };
}
