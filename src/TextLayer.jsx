import { useId } from 'react'
import TEXTS from './texts.json'

export { TEXTS }

// Real text, drawn as SVG over the artwork in design coordinates (1440x1024).
// Positions, sizes and fills come from the PDF (tools/build_texts.py): each
// letter sits at the x where Canva placed it, on Canva's baseline.
const FONT_CLASS = { dm: 't-dm', fraunces: 't-fraunces', garet: 't-garet' }

export function TextLayer({ items }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className="text-layer" width="1440" height="1024" viewBox="0 0 1440 1024">
      <defs>
        {items.map((it, i) =>
          typeof it.fill === 'object' ? (
            <linearGradient key={i} id={`${uid}g${i}`} gradientUnits="userSpaceOnUse" x1={it.fill.x1} y1="0" x2={it.fill.x2} y2="0">
              <stop offset="0" stopColor={it.fill.from} />
              <stop offset="1" stopColor={it.fill.to} />
            </linearGradient>
          ) : null,
        )}
      </defs>
      {items.map((it, i) => {
        const fill = typeof it.fill === 'object' ? `url(#${uid}g${i})` : it.fill
        if (it.rect) {
          const [x, y, w, h] = it.rect
          return <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
        }
        return (
          <text
            key={i}
            className={FONT_CLASS[it.font]}
            // Canva's letter positions; a hand-edited text without them uses tracking.
            x={it.xs && it.xs.length === [...it.text].length ? it.xs.join(' ') : it.xs?.[0] ?? it.x}
            y={it.y}
            fontSize={it.size}
            fontWeight={it.weight}
            fill={fill}
            style={it.xs && it.xs.length === [...it.text].length ? undefined : { letterSpacing: `${it.tracking ?? 0}em` }}
          >
            {it.text}
          </text>
        )
      })}
    </svg>
  )
}
