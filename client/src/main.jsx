import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// Safety net — prevent audio player promise rejections from crashing the app
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message?.includes('play') || e.reason?.message?.includes('audio') || e.reason?.message?.includes('media')) {
    e.preventDefault();
    console.warn('[unhandledrejection] audio error:', e.reason?.message);
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
