export const API_URL: string = import.meta.env.VITE_API_URL || '';

export const WS_URL: string = import.meta.env.VITE_WS_URL || (() => {
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:3002';
})();
