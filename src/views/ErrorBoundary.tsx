import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Filet de sécurité : une erreur imprévue affiche un message au lieu d'une page blanche. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Rien n'est envoyé nulle part : l'erreur reste dans la console du navigateur, pour qui veut la lire.
    console.error('Erreur inattendue', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="fatal" role="alert">
        <h1>Oups, quelque chose s’est mal passé</h1>
        <p>
          L’application a rencontré une erreur inattendue. Vos étagères <strong>enregistrées</strong> dans ce navigateur ne sont pas
          perdues : rechargez la page pour les retrouver.
        </p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
    )
  }
}
