interface GuideLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  /** Mm du dessin par pixel écran : garde le texte à taille constante. */
  s: number
}

/** Repère d'aimantation : trait en pointillés avec son nom, affiché seulement quand une pièce s'y cale. */
export function GuideLine({ x1, y1, x2, y2, label, s }: GuideLineProps) {
  const vertical = x1 === x2
  return (
    <g className="guide-line" pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <text
        x={vertical ? x1 + 6 * s : x1 + 6 * s}
        y={vertical ? y1 - 6 * s : y1 - 6 * s}
        fontSize={12 * s}
        textAnchor="start"
      >
        {label}
      </text>
    </g>
  )
}
