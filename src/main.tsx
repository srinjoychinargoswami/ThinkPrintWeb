import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Generate a stable anonymous ID per browser
function getVisitorId() {
  let id = localStorage.getItem('tp_visitor_id');
  if (!id) {
    id = 'anon-' + crypto.randomUUID();
    localStorage.setItem('tp_visitor_id', id);
  }
  return id;
}


pendo.initialize({
  visitor: {
    id: getVisitorId()
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
