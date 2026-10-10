import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildScene3D, type Box3D, type Scene3D } from '../model/scene3d'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'

type WallMode = 'solid' | 'transparent' | 'hidden'

const WALL_MODES: { mode: WallMode; label: string }[] = [
  { mode: 'solid', label: 'Mur plein' },
  { mode: 'transparent', label: 'Transparent' },
  { mode: 'hidden', label: 'Sans mur' },
]

const BACKGROUND = '#fdfbf7'
const ACCENT = '#8a5a2b'

const KIND_COLORS: Record<string, string> = {
  upright: '#dcb985',
  shelf: '#dcb985',
  wedge: '#ecd7b0',
  support: '#c9d6c1',
  wall: '#e4ddd0',
}

const OBJECT_COLORS: Record<string, string> = {
  manga: '#d98c8c',
  pocket: '#e3c46f',
  novel: '#8fbf9a',
  album: '#8d8fcf',
  jar: '#e6a457',
}

interface ThreeViewProps {
  plan: Plan
  unit?: LengthUnit
  selection?: string[]
}

interface Stage3D {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  group: Group
  render: () => void
}

/** Libère la mémoire graphique d'un groupe de formes. */
function disposeGroup(group: Group) {
  group.traverse((obj) => {
    const item = obj as Mesh | LineSegments
    const geometry: BufferGeometry | undefined = item.geometry
    geometry?.dispose()
    const material: Material | Material[] | undefined = item.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  })
  group.clear()
}

function addBox(group: Group, box: Box3D, options: { wallMode: WallMode; selected: boolean }) {
  const isWall = box.kind === 'wall'
  const color = box.kind === 'object' ? (OBJECT_COLORS[box.objectKind ?? ''] ?? '#7fa6c9') : (box.color ?? KIND_COLORS[box.kind])
  const transparentWall = isWall && options.wallMode === 'transparent'

  const geometry: BufferGeometry =
    box.shape === 'cylinder' ? new CylinderGeometry(box.sx / 2, box.sx / 2, box.sy, 24) : new BoxGeometry(box.sx, box.sy, box.sz)
  const material = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.85,
    metalness: 0,
    transparent: transparentWall,
    opacity: transparentWall ? 0.16 : 1,
    depthWrite: !transparentWall,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(box.x + box.sx / 2, box.y + box.sy / 2, box.z + box.sz / 2)
  // Un bocal est un cylindre : si sa profondeur diffère de sa largeur, on l'étire.
  if (box.shape === 'cylinder') mesh.scale.z = box.sz / box.sx
  group.add(mesh)

  const edgeColor = options.selected ? ACCENT : box.bad ? '#c0392b' : isWall ? '#b8ae9a' : '#6b4f2a'
  const edges = new LineSegments(
    new EdgesGeometry(geometry, 30),
    new LineBasicMaterial({ color: edgeColor, transparent: transparentWall, opacity: transparentWall ? 0.35 : 1 }),
  )
  edges.position.copy(mesh.position)
  edges.scale.copy(mesh.scale)
  group.add(edges)
}

function fitCamera(stage: Stage3D, scene: Scene3D) {
  const center = new Vector3(
    (scene.min[0] + scene.max[0]) / 2,
    (scene.min[1] + scene.max[1]) / 2,
    (scene.min[2] + scene.max[2]) / 2,
  )
  const size = Math.max(scene.max[0] - scene.min[0], scene.max[1] - scene.min[1], scene.max[2] - scene.min[2], 100)
  const distance = (size / 2 / Math.tan((stage.camera.fov * Math.PI) / 360)) * 1.5
  stage.camera.position.set(center.x + distance * 0.55, center.y + distance * 0.35, center.z + distance * 0.85)
  stage.controls.target.copy(center)
  stage.camera.near = Math.max(1, distance / 100)
  stage.camera.far = distance * 40
  stage.camera.updateProjectionMatrix()
  stage.controls.update()
}

/**
 * Vue 3D de l'étagère : les pièces en boîtes, le mur (plein, transparent ou masqué), les supports et les objets de
 * simulation en formes simples. Tourner : glisser ; zoomer : molette ; déplacer : clic droit (ou Maj + glisser).
 * Chargée à la demande : Three.js n'est téléchargé que si on ouvre cette vue.
 */
export default function ThreeView({ plan, unit = 'cm', selection = [] }: ThreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const fittedRef = useRef(false)
  const [wallMode, setWallMode] = useState<WallMode>('solid')
  const [showObjects, setShowObjects] = useState(true)
  const [showSupports, setShowSupports] = useState(true)
  // WebGL disponible ? Testé une fois, pour afficher un message clair sinon.
  const [webgl] = useState(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  })

  // Création de la scène, une seule fois.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!webgl) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(new Color(BACKGROUND))
    el.prepend(renderer.domElement)
    renderer.domElement.className = 'three-canvas'

    const scene = new Scene()
    scene.add(new AmbientLight(0xffffff, 1.1))
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.set(-600, 1500, 1200)
    scene.add(sun)
    const fill = new DirectionalLight(0xffffff, 0.5)
    fill.position.set(900, 300, 600)
    scene.add(fill)
    const group = new Group()
    scene.add(group)

    const camera = new PerspectiveCamera(40, 1, 10, 100000)
    const controls = new OrbitControls(camera, renderer.domElement)
    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)

    const resize = () => {
      const w = Math.max(1, el.clientWidth)
      const h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    stageRef.current = { renderer, scene, camera, controls, group, render }
    return () => {
      observer.disconnect()
      controls.dispose()
      disposeGroup(group)
      renderer.dispose()
      renderer.domElement.remove()
      stageRef.current = null
      fittedRef.current = false
    }
  }, [webgl])

  // Le dessin suit le plan et les options ; la caméra n'est cadrée qu'à la première fois (ou sur demande).
  const scene3d = useMemo(() => buildScene3D(plan, { objects: showObjects, supports: showSupports }), [plan, showObjects, showSupports])
  const selected = selection.join('|')
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ids = new Set(selected === '' ? [] : selected.split('|'))
    disposeGroup(stage.group)
    for (const box of scene3d.boxes) addBox(stage.group, box, { wallMode, selected: ids.has(box.id) })
    if (wallMode !== 'hidden') addBox(stage.group, scene3d.wall, { wallMode, selected: false })
    if (!fittedRef.current) {
      fitCamera(stage, scene3d)
      fittedRef.current = true
    }
    stage.render()
  }, [scene3d, wallMode, selected])

  const placeCamera = (direction: [number, number, number]) => {
    const stage = stageRef.current
    if (!stage) return
    const target = stage.controls.target.clone()
    const distance = stage.camera.position.distanceTo(target)
    const v = new Vector3(...direction).normalize().multiplyScalar(distance)
    stage.camera.position.copy(target).add(v)
    stage.controls.update()
    stage.render()
  }

  const width = scene3d.max[0] - scene3d.min[0]
  const height = scene3d.max[1] - scene3d.min[1]
  const depth = scene3d.max[2] - scene3d.min[2]

  return (
    <div className="three-view">
      <div className="three-tools">
        <div className="view-switch" role="radiogroup" aria-label="Mur">
          {WALL_MODES.map(({ mode, label }) => (
            <label key={mode} className={mode === wallMode ? 'active' : undefined}>
              <input type="radio" name="wall-mode" value={mode} checked={mode === wallMode} onChange={() => setWallMode(mode)} />
              {label}
            </label>
          ))}
        </div>
        <label className="marks-toggle">
          <input type="checkbox" checked={showObjects} onChange={(e) => setShowObjects(e.target.checked)} />
          Objets
        </label>
        <label className="marks-toggle">
          <input type="checkbox" checked={showSupports} onChange={(e) => setShowSupports(e.target.checked)} />
          Supports
        </label>
        <div className="three-presets" role="group" aria-label="Angle de la caméra">
          <span className="three-presets-label" aria-hidden="true">Caméra :</span>
          <button type="button" onClick={() => placeCamera([0.55, 0.35, 0.85])}>3/4</button>
          <button type="button" onClick={() => placeCamera([0, 0, 1])}>De face</button>
          <button type="button" onClick={() => placeCamera([1, 0, 0])}>De côté</button>
          <button type="button" onClick={() => placeCamera([0, 1, 0.001])}>Du dessus</button>
          <button type="button" onClick={() => placeCamera([0, -1, 0.001])}>Du dessous</button>
        </div>
      </div>
      <div className="three-stage" ref={containerRef}>
      {!webgl && <p className="three-error">Votre navigateur ne permet pas d’afficher la 3D (WebGL indisponible).</p>}
      <p className="view-hint">
        Glisser : tourner · Molette : zoom · Clic droit ou Maj + glisser : déplacer. Encombrement : {formatLength(width, unit)} de
        large, {formatLength(height, unit)} de haut, {formatLength(depth, unit)} de profondeur.
      </p>
      </div>
    </div>
  )
}
