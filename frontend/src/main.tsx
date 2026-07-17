import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Tauri (desktop + mobile) doesn't have Vite's API proxy.
// Prepend the backend URL for all relative /api/* requests.
const isTauri = !!(window as any).__TAURI__;
if (isTauri) {
  // Use the same host as the current page if it's a remote dev URL,
  // otherwise default to localhost.
  const pageHost = window.location.hostname;
  const backendHost = pageHost && pageHost !== 'localhost' && pageHost !== 'tauri.localhost'
    ? pageHost
    : 'localhost';

  const _fetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;
    if (url.startsWith('/')) {
      url = `http://${backendHost}:8000${url}`;
      input = url;
    }
    return _fetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)