import type { ReactNode } from 'react'

interface PanelSectionProps {
  title: string
  /** Ouverte au départ (par défaut). Une section se replie en cliquant son titre. */
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

/** Groupe de réglages repliable du panneau de droite : un titre cliquable, puis le contenu. */
export function PanelSection({ title, defaultOpen = true, className = '', children }: PanelSectionProps) {
  return (
    <details className={`panel-section ${className}`.trim()} open={defaultOpen}>
      <summary>{title}</summary>
      <div className="panel-section-body">{children}</div>
    </details>
  )
}
