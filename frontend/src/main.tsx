import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { GlobalRateLimitProvider } from './contexts/GlobalRateLimitContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalRateLimitProvider>
        <App />
      </GlobalRateLimitProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
