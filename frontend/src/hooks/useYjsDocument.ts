import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WS_URL } from '../lib/config';

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

  const provider = useMemo(
    () =>
      new WebsocketProvider(WS_URL, documentId, ydoc, {
        connect: false,
        params: { doc: documentId, token },
        resyncInterval: 30000,
        maxBackoffTime: 2500,
      }),
    [documentId, token, ydoc]
  );

  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const localProvider = new IndexeddbPersistence(documentId, ydoc);

    provider.connect();

    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });

    const handleStatus = (event: { status: string }) => {
      if (event.status === 'connected') {
        setStatus('connected');
      } else if (event.status === 'connecting') {
        setStatus('connecting');
      } else if (event.status === 'disconnected') {
        setStatus('disconnected');
      }
    };

    const handleSynced = (isSynced: boolean) => {
      if (isSynced) {
        setStatus(provider.wsconnected ? 'connected' : 'syncing');
      }
    };

    const handleOffline = () => setStatus('disconnected');
    const handleOnline = () => setStatus('connecting');

    provider.on('status', handleStatus);
    provider.on('sync', handleSynced);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      provider.off('status', handleStatus);
      provider.off('sync', handleSynced);
      provider.awareness.setLocalStateField('user', null);
      provider.disconnect();
      localProvider.destroy();
    };
  }, [documentId, token, ydoc, userName, userColor, provider]);

  return { ydoc, provider, status };
}
