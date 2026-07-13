import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry, Sentry } from './sentry';
import './index.css';

initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div className="p-8 text-center text-red-600">Application error occurred</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
