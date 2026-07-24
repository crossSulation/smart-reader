import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Polyfill Promise.withResolvers for older WebViews (needed by pdfjs-dist)
if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function () {
    let resolve: any, reject: any;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill URL.parse for older WebViews
if (typeof (URL as any).parse !== "function") {
  (URL as any).parse = function (url: string, base?: string) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

// Tauri (desktop + mobile) doesn't have Vite's API proxy.
// Prepend the backend URL for all relative /api/* requests.
const isTauri = !!(window as any).__TAURI__ || window.location.hostname === 'tauri.localhost';
if (isTauri) {
  // In dev mode, route /api → Vite dev server (which proxies to backend).
  // In production, route /api → localhost:8000 (backend on device).
  const devHost: string =
    // @ts-ignore __DEV_HOST__ is injected by Vite's define
    typeof __DEV_HOST__ !== 'undefined' ? __DEV_HOST__ : '';
  const isDev = import.meta.env.DEV;
  const backendHost = isDev && devHost
    ? `${devHost}:1420`
    : 'localhost:8000';

  const _fetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;
    if (url.startsWith('/')) {
      url = `http://${backendHost}${url}`;
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