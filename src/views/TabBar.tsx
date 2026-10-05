export interface TabInfo {
  key: string
  name: string
  /** Le plan n'est pas enregistré ou l'enregistrement a échoué. */
  warn: boolean
}

interface Props {
  tabs: TabInfo[]
  /** Onglets affichés dans les volets (un ou deux). */
  panes: string[]
  /** Onglet du volet qui a le focus. */
  activeKey: string | undefined
  /** L'écran affiché est l'éditeur (sinon « Mes étagères » est l'entrée active). */
  inEditor: boolean
  split: boolean
  onLibrary: () => void
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onNew: () => void
  onToggleSplit: () => void
}

/** Barre d'onglets : « Mes étagères » puis un onglet par plan ouvert, et le bouton d'écran partagé. */
export function TabBar({ tabs, panes, activeKey, inEditor, split, onLibrary, onSelect, onClose, onNew, onToggleSplit }: Props) {
  return (
    <div className="tab-bar">
      <div className="tab-list" role="tablist" aria-label="Plans ouverts">
        <button type="button" role="tab" aria-selected={!inEditor} className={`tab tab-library${!inEditor ? ' active' : ''}`} onClick={onLibrary}>
          Mes étagères
        </button>
        {tabs.map((tab) => {
          const focused = inEditor && tab.key === activeKey
          const visible = inEditor && panes.includes(tab.key)
          return (
            <div key={tab.key} className={`tab${focused ? ' active' : visible ? ' visible' : ''}`}>
              <button
                type="button"
                role="tab"
                aria-selected={focused}
                className="tab-name"
                onClick={() => onSelect(tab.key)}
                title={tab.warn ? `${tab.name} (non enregistrée)` : tab.name}
              >
                {tab.warn && <span className="tab-warn" aria-hidden="true" />}
                {tab.name}
              </button>
              <button type="button" className="tab-close" onClick={() => onClose(tab.key)} aria-label={`Fermer « ${tab.name} »`} title="Fermer l’onglet">
                ×
              </button>
            </div>
          )
        })}
        <button type="button" className="tab tab-new" onClick={onNew} aria-label="Nouvelle étagère" title="Nouvelle étagère">
          +
        </button>
      </div>
      <button
        type="button"
        className={`header-button split-button${split ? ' active' : ''}`}
        onClick={onToggleSplit}
        disabled={!split && tabs.length < 2}
        aria-pressed={split}
        title={tabs.length < 2 && !split ? 'Ouvrez un deuxième plan pour comparer' : 'Afficher deux plans côte à côte'}
      >
        Écran partagé
      </button>
    </div>
  )
}
