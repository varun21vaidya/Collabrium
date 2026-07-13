import { useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type { ConnectionStatus } from './useYjsDocument';

export function useConnectionStatus(provider: WebsocketProvider | null): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setStatus('connecting');

    if (!provider) return;

    const handleStatus = (event: { status: string }) => {
      if (!mountedRef.current) return;
      if (event.status === 'connected') setStatus('connected');
      else if (event.status === 'disconnected') setStatus('disconnected');
      else setStatus('connecting');
    };

    const handleOffline = () => { if (mountedRef.current) setStatus('disconnected'); };
    const handleOnline = () => { if (mountedRef.current) setStatus('connecting'); };

    provider.on('status', handleStatus);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      provider.off('status', handleStatus);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [provider]);

  return status;
}
