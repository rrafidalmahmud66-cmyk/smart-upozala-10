// Safeguard against WebKit / iframe IndexedDB connection lost bug (DOMException: Connection to Indexed Database server lost)
try {
  const nullDescriptor = {
    get() { return null; },
    configurable: true
  };
  Object.defineProperty(window, 'indexedDB', nullDescriptor);
  Object.defineProperty(window, 'webkitIndexedDB', nullDescriptor);
  Object.defineProperty(window, 'mozIndexedDB', nullDescriptor);
  Object.defineProperty(window, 'msIndexedDB', nullDescriptor);
} catch (e) {
  try {
    (window as any).indexedDB = null;
  } catch (err) {}
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
