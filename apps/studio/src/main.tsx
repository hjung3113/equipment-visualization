import { createRoot } from 'react-dom/client';
import '@eqv/editor/editor.css';
import '@eqv/replay/replay.css';
import { App } from './App.js';
import './studio.css';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');
createRoot(container).render(<App />);
