import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-ext-400.css';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/theme.css';
import './styles/app.css';
import './styles/projects.css';
import './styles/lexicon.css';
import './styles/phonology.css';
import './styles/writing.css';
import './styles/glyph.css';
import './styles/fonts.css';
import './styles/automation.css';
import './styles/notebook.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
