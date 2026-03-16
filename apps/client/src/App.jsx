import { useState } from 'react'
import './App.css'
import { DataReviewDemo } from './modules/data-review'
import IngestionWizard from './modules/ingestion/IngestionWizard'

const VIEWS = [
  { id: 'ingestion', label: 'Data Ingestion' },
  { id: 'review', label: 'Data Review' },
]

function App() {
  const [activeView, setActiveView] = useState('ingestion')

  return (
    <div className="app">
      <nav className="app-nav">
        <span className="app-nav-brand">Analytics BI</span>
        <div className="app-nav-links">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`app-nav-btn${activeView === v.id ? ' active' : ''}`}
              onClick={() => setActiveView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="app-main">
        {activeView === 'ingestion' && <IngestionWizard />}
        {activeView === 'review' && <DataReviewDemo />}
      </main>
    </div>
  )
}

export default App
