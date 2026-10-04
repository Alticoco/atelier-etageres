/** Distance (px écran) entre le dessin et ses lignes de cotes. */
export const DIM_OFFSET_PX = 40
const FONT_PX = 13

interface DimensionProps {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  /** Mm du dessin par pixel écran : garde les textes et repères à taille constante à l'écran. */
  s: number
  /** Côté du texte par rapport à la ligne : 1 = dessous / droite, -1 = dessus / gauche. */
  side: 1 | -1
}

/** Ligne de cote avec repères aux extrémités et texte (horizontale ou verticale). */
export function Dimension({ x1, y1, x2, y2, label, s, side }: DimensionProps) {
  const vertical = x1 === x2
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const tick = 5 * s
  const gap = 12 * s * side
  const tx = vertical ? mx + gap : mx
  const ty = vertical ? my : my + gap
  return (
    <g className="dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} vectorEffect="non-scaling-stroke" />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} vectorEffect="non-scaling-stroke" />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} vectorEffect="non-scaling-stroke" />
        </>
      )}
      <text
        x={tx}
        y={ty}
        fontSize={FONT_PX * s}
        textAnchor="middle"
        dominantBaseline="central"
        transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}
      >
        {label}
      </text>
    </g>
  )
}
