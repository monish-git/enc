import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/vt323/latin-400.css';
import './styles/retro.css';
import './styles/terminal.css';
import App from './App.jsx';
import { applyPrefs, readPrefs } from './context/UIContext.jsx';

// Apply the last-used theme before the first paint so there is no flash.
applyPrefs(readPrefs());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
