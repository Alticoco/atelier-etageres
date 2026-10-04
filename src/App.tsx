import { useState } from 'react'
import { createPlan } from './model/plan'
import type { Plan } from './model/types'
import { FrontView } from './views/FrontView'

/** Plan d'exemple en attendant l'assistant de création (étape 3). */
function createDemoPlan(): Plan {
  const plan = createPlan({
    name: 'Exemple',
    width: 800,
    height: 1000,
    depth: 250,
    stages: 3,
    uprightThickness: 18,
    shelfThickness: 18,
  })
  plan.wedges.push(
    { id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250 },
    { id: 'wedge-2', shelfBelowId: 'shelf-2', x: 520, thickness: 18, depth: 250 },
  )
  return plan
}

export default function App() {
  const [plan] = useState(createDemoPlan)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atelier Étagères</h1>
        <span className="app-plan-name">{plan.name}</span>
      </header>
      <main className="app-main">
        <FrontView plan={plan} />
      </main>
    </div>
  )
}
