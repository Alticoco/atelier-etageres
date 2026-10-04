/** Logo : une étagère vue de face, avec deux tablettes et une cale. Les mêmes formes que `public/favicon.svg`. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="5" y="3" width="22" height="26" rx="2" fill="#fbf3e4" stroke="#a9824f" strokeWidth="2.4" />
      <line x1="5" y1="12" x2="27" y2="12" stroke="#a9824f" strokeWidth="2.4" />
      <line x1="5" y1="21" x2="27" y2="21" stroke="#a9824f" strokeWidth="2.4" />
      <rect x="15" y="21.8" width="2.6" height="6.4" fill="#d9b98a" stroke="#a9824f" strokeWidth="0.8" />
    </svg>
  )
}
