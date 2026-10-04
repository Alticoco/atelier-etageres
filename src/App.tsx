import { useState } from 'react'
import type { Plan } from './model/types'
import { CreationWizard } from './views/CreationWizard'
import { FrontView } from './views/FrontView'

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(true)

  const startNew = () => {
    if (!plan || window.confirm('Créer une nouvelle étagère ? Le plan actuel sera remplacé (rien n’est encore sauvegardé).')) {
      setCreating(true)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atelier Étagères</h1>
        {plan && <span className="app-plan-name">{plan.name}</span>}
        {plan && !creating && (
          <button type="button" className="header-button" onClick={startNew}>
            Nouvelle étagère
          </button>
        )}
      </header>
      <main className="app-main">
        {creating || !plan ? (
          <CreationWizard
            onCreate={(created) => {
              setPlan(created)
              setCreating(false)
            }}
            onCancel={plan ? () => setCreating(false) : undefined}
          />
        ) : (
          <FrontView plan={plan} />
        )}
      </main>
    </div>
  )
}
