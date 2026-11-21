import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // Required for app styles

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)