import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, OrbitControls } from '@react-three/drei'
import { Box3, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, EllipseCurve, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import DxfParser from 'dxf-parser'
import { parse00t } from './parse00t.js'
import './App.css'

const supportedExtensions = ['glb', 'obj', 'stl', 'dxf', '00t']

function dxfPoint(point, elevation = 0) {
  return new Vector3(point.x, point.z ?? elevation, point.y)
}

function createDxfModel(fileText) {
  const document = new DxfParser().parseSync(fileText.replace(/^\uFEFF/, ''))
  if (!document) throw new Error('The DXF file could not be parsed.')

  const group = new Group()
  let renderedEntities = 0
  const unsupportedTypes = new Map()
  const blocks = Object.values(document.blocks ?? {})
  const blockByName = new Map(
    blocks.filter((block) => block.name).map((block) => [block.name.toUpperCase(), block]),
  )

  const addUnsupported = (type) => {
    unsupportedTypes.set(type, (unsupportedTypes.get(type) ?? 0) + 1)
  }

  const pointFromBase = (point, basePoint, elevation = 0) => dxfPoint({
    x: point.x - (basePoint.x ?? 0),
    y: point.y - (basePoint.y ?? 0),
    z: (point.z ?? elevation) - (basePoint.z ?? 0),
  })

  const renderEntities = (entities, parent, basePoint = {}, blockStack = new Set()) => {
    entities.forEach((entity) => {
      if (entity.visible === false) {
        addUnsupported(`${entity.type} (hidden)`)
        return
      }
      const color = entity.color && entity.color !== 0 ? new Color(entity.color) : new Color('#d0ff71')
      const addPath = (points, closed = false) => {
        if (points.length < 2) return
        const geometry = new BufferGeometry()
        geometry.setFromPoints(closed ? [...points, points[0]] : points)
        parent.add(new Line(geometry, new LineBasicMaterial({ color })))
        renderedEntities += 1
      }

      switch (entity.type) {
        case 'INSERT': {
          const block = blockByName.get(entity.name?.toUpperCase())
          if (!block || blockStack.has(block.name.toUpperCase())) {
            addUnsupported(entity.type)
            break
          }

          const nextStack = new Set(blockStack)
          nextStack.add(block.name.toUpperCase())
          const position = pointFromBase(entity.position ?? { x: 0, y: 0, z: 0 }, basePoint)
          const rows = Math.max(1, entity.rowCount ?? 1)
          const columns = Math.max(1, entity.columnCount ?? 1)
          const insertGroup = new Group()
          insertGroup.position.copy(position)
          insertGroup.rotation.y = -((entity.rotation ?? 0) * Math.PI) / 180
          insertGroup.scale.set(entity.xScale ?? 1, entity.zScale ?? 1, entity.yScale ?? 1)
          parent.add(insertGroup)

          for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
              const contents = new Group()
              contents.position.copy(dxfPoint({
                x: column * (entity.columnSpacing ?? 0) - (block.position.x ?? 0),
                y: row * (entity.rowSpacing ?? 0) - (block.position.y ?? 0),
                z: -(block.position.z ?? 0),
              }))
              insertGroup.add(contents)
              renderEntities(block.entities, contents, block.position ?? {}, nextStack)
            }
          }
          break
        }
        case 'LINE':
          if (entity.vertices?.length >= 2) {
            addPath(entity.vertices.map((point) => pointFromBase(point, basePoint)))
          } else addUnsupported(entity.type)
          break
        case 'LWPOLYLINE':
        case 'POLYLINE':
          if (entity.vertices?.length >= 2) {
            const elevation = entity.elevation ?? 0
            addPath(
              entity.vertices.map((point) => pointFromBase(point, basePoint, elevation)),
              Boolean(entity.shape),
            )
          } else addUnsupported(entity.type)
          break
        case 'CIRCLE':
        case 'ARC': {
          const start = entity.type === 'CIRCLE' ? 0 : entity.startAngle
          const end = entity.type === 'CIRCLE' ? Math.PI * 2 : entity.endAngle
          const curve = new EllipseCurve(
            entity.center.x - (basePoint.x ?? 0),
            entity.center.y - (basePoint.y ?? 0),
            entity.radius,
            entity.radius,
            start,
            end,
            false,
          )
          addPath(curve.getPoints(96).map((point) => new Vector3(
            point.x,
            (entity.center.z ?? 0) - (basePoint.z ?? 0),
            point.y,
          )))
          break
        }
        case 'ELLIPSE': {
          const majorX = entity.majorAxisEndPoint.x
          const majorY = entity.majorAxisEndPoint.y
          const majorRadius = Math.hypot(majorX, majorY)
          const curve = new EllipseCurve(
            entity.center.x - (basePoint.x ?? 0),
            entity.center.y - (basePoint.y ?? 0),
            majorRadius,
            majorRadius * entity.axisRatio,
            entity.startAngle,
            entity.endAngle,
            false,
            Math.atan2(majorY, majorX),
          )
          addPath(curve.getPoints(96).map((point) => new Vector3(
            point.x,
            (entity.center.z ?? 0) - (basePoint.z ?? 0),
            point.y,
          )))
          break
        }
        case 'SPLINE': {
          const points = entity.fitPoints?.length ? entity.fitPoints : entity.controlPoints
          if (points?.length >= 2) {
            const curve = new CatmullRomCurve3(points.map((point) => pointFromBase(point, basePoint)))
            addPath(curve.getPoints(Math.max(32, points.length * 12)), Boolean(entity.closed))
          } else addUnsupported(entity.type)
          break
        }
        case '3DFACE': {
          if (entity.vertices?.length >= 3) {
            const points = entity.vertices
              .map((point) => pointFromBase(point, basePoint))
              .filter((point, index, vertices) => index === 0 || point.distanceToSquared(vertices[index - 1]) > 1e-12)
            if (points.length > 1 && points[0].distanceToSquared(points[points.length - 1]) <= 1e-12) {
              points.pop()
            }
            if (points.length >= 3) {
              const geometry = new BufferGeometry()
              geometry.setFromPoints(points)
              const indices = []
              for (let index = 1; index < points.length - 1; index += 1) {
                indices.push(0, index, index + 1)
              }
              geometry.setIndex(indices)
              geometry.computeVertexNormals()
              parent.add(new Mesh(
                geometry,
                new MeshStandardMaterial({ color, side: DoubleSide, roughness: 0.8 }),
              ))
              renderedEntities += 1
            } else addPath(points, true)
          } else addUnsupported(entity.type)
          break
        }
        case 'SOLID':
          if (entity.points?.length >= 3) {
            addPath(entity.points.map((point) => pointFromBase(point, basePoint)), true)
          } else addUnsupported(entity.type)
          break
        default:
          addUnsupported(entity.type)
          break
      }
    })
  }

  renderEntities(document.entities ?? [], group)

  if (!renderedEntities) {
    const foundTypes = [...unsupportedTypes.entries()]
      .map(([type, count]) => `${type} (${count})`)
      .join(', ')
    throw new Error(
      foundTypes
        ? `No renderable geometry found. DXF entity types: ${foundTypes}.`
        : 'The DXF contains no model-space entities. It may use unsupported or external references.',
    )
  }

  return { object: group, renderedEntities, unsupportedTypes }
}

function prepareModel(object) {
  const bounds = new Box3().setFromObject(object)
  if (bounds.isEmpty()) throw new Error('This file does not contain any visible geometry.')

  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const largestDimension = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
    throw new Error('This file does not contain geometry that can be displayed.')
  }

  const normalized = new Group()
  normalized.add(object)
  const scale = 3 / largestDimension
  normalized.scale.setScalar(scale)
  normalized.position.copy(center).multiplyScalar(-scale)
  return normalized
}

function disposeModel(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) value.dispose()
        })
        material.dispose()
      })
    }
  })
}

function Icon({ name }) {
  const paths = {
    orbit: <><path d="M12 3v2" /><path d="M12 19v2" /><path d="M3 12h2" /><path d="M19 12h2" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.5" /></>,
    grid: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6m-3 3 3-3 3 3" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function Scene({ model, setSelected, showGrid, controlsRef }) {
  return (
    <>
      <color attach="background" args={['#10110f']} />
      <fog attach="fog" args={['#10110f', 8, 18]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color="#f1ffe1" />
      <pointLight position={[-3, 1, -2]} intensity={18} color="#9683ff" />
      <pointLight position={[3, -1, 2]} intensity={10} color="#d0ff71" />
      {model && (
        <Bounds key={model.object.uuid} fit clip margin={1.2}>
          <primitive
            object={model.object}
            onClick={(event) => {
              event.stopPropagation()
              setSelected(true)
            }}
          />
        </Bounds>
      )}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.42, 0]}
        onClick={() => setSelected(false)}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#10110f" />
      </mesh>
      {showGrid && <gridHelper args={[24, 48, '#32352e', '#20221e']} position={[0, -1.405, 0]} />}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={0.5}
        maxDistance={10000}
        maxPolarAngle={Math.PI / 1.8}
        target={[0, 0.15, 0]}
      />
    </>
  )
}

function App() {
  const [model, setModel] = useState(null)
  const [selected, setSelected] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [fileStatus, setFileStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const controlsRef = useRef()
  const fileInputRef = useRef()

  useEffect(() => () => {
    if (model) disposeModel(model.object)
  }, [model])

  const openFilePicker = () => fileInputRef.current?.click()

  const loadFile = async (file) => {
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!supportedExtensions.includes(extension)) {
      setFileStatus('Choose a GLB, OBJ, STL, DXF, or 00T file.')
      return
    }

    setIsLoading(true)
    setFileStatus(`Loading ${file.name}…`)
    try {
      let object
      let renderedEntities
      let unsupportedTypes
      let vertexCount
      let faceCount
      if (extension === '00t') {
        const result = parse00t(await file.arrayBuffer())
        object = result.object
        vertexCount = result.vertexCount
        faceCount = result.faceCount
      } else if (extension === 'glb') {
        const result = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')
        object = result.scene
      } else if (extension === 'obj') {
        object = new OBJLoader().parse(await file.text())
      } else if (extension === 'stl') {
        const geometry = new STLLoader().parse(await file.arrayBuffer())
        geometry.computeVertexNormals()
        object = new Mesh(
          geometry,
          new MeshStandardMaterial({ color: '#d0ff71', metalness: 0.18, roughness: 0.32 }),
        )
      } else {
        const result = createDxfModel(await file.text())
        object = result.object
        renderedEntities = result.renderedEntities
        unsupportedTypes = result.unsupportedTypes
      }

      const nextModel = {
        object: prepareModel(object),
        name: file.name,
        extension,
        renderedEntities,
        unsupportedTypes,
        vertexCount,
        faceCount,
      }
      setModel(nextModel)
      setSelected(true)
      const skippedEntities = unsupportedTypes
        ? [...unsupportedTypes.entries()].map(([type, count]) => `${type}: ${count}`).join(', ')
        : ''
      setFileStatus(vertexCount
        ? `Loaded ${file.name} · ${vertexCount.toLocaleString()} vertices · ${faceCount.toLocaleString()} faces`
        : renderedEntities
          ? `Loaded ${file.name} · ${renderedEntities} entities${skippedEntities ? ` · skipped ${skippedEntities}` : ''}`
          : `Loaded ${file.name}`)
    } catch (error) {
      setFileStatus(`Could not load ${file.name}: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileChange = (event) => {
    loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  return (
    <main className="studio">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Forma home">
          <span className="brand-mark"><span /><span /><span /></span>
          <span>forma</span>
          <span className="brand-divider" />
          <span className="workspace-name">3D workspace</span>
        </a>
        <div className="topbar-right">
          <span className="save-status"><span /> {model ? 'Model loaded' : 'No model loaded'}</span>
          <button className="share-button" type="button" onClick={openFilePicker}>
            <Icon name="file" /> Load model
          </button>
          <span className="avatar" aria-label="Your profile">JD</span>
        </div>
      </header>

      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept=".glb,.obj,.stl,.dxf,.00t"
        onChange={handleFileChange}
        aria-label="Select a 3D model or DXF file"
      />

      <div className="workspace">
        <aside className="sidebar">
          <div className="project-heading">
            <div className="eyebrow">PROJECT / 01</div>
            <h1>{model?.name ?? 'Empty scene'}</h1>
            <p>{model ? `Loaded ${model.extension.toUpperCase()} model.` : 'Start with a model of your own.'}</p>
          </div>

          <div className="panel-section scene-tree">
            <div className="section-heading">
              <span>SCENE</span>
              <button type="button" aria-label="Load model file" onClick={openFilePicker}><Icon name="plus" /></button>
            </div>
            {model ? (
              <button
                className={`scene-row ${selected ? 'is-selected' : ''}`}
                type="button"
                onClick={() => setSelected(true)}
              >
                <span className="object-icon sphere-icon" />
                <span className="model-row-name">{model.name}</span>
                <span className="row-dot" />
              </button>
            ) : (
              <p className="empty-scene-message">No objects in this scene yet.</p>
            )}
            <div className="scene-row floor-row">
              <span className="object-icon floor-icon" />
              <span>Ground plane</span>
              <span className="visibility-icon">◉</span>
            </div>
          </div>

          <div className="panel-section object-details">
            <div className="section-heading"><span>SELECTION</span><Icon name="layers" /></div>
            {model && selected ? (
              <div className="selected-object">
                <span className="color-swatch model-swatch" />
                <div><strong>{model.name}</strong><span>{model.extension.toUpperCase()} model</span></div>
                <span className="selection-indicator" />
              </div>
            ) : (
              <p className="empty-selection">
                {model ? 'Select the model in the scene to see its details.' : 'Load a model to see its details here.'}
              </p>
            )}
          </div>

          {fileStatus && (
            <p
              className={`file-status ${fileStatus.startsWith('Could not load') || fileStatus.startsWith('Choose') ? 'file-status-error' : ''}`}
              role="status"
            >
              {fileStatus}
            </p>
          )}

          <div className="sidebar-footer">
            <span className="keyboard-hint"><kbd>?</kbd> Shortcuts</span>
            <span>v1.0.4</span>
          </div>
        </aside>

        <section className="viewport" aria-label="Interactive 3D scene viewer">
          <div className="viewport-topline">
            <div className="breadcrumb"><span>SCENES</span><b>/</b><strong>{model?.name ?? 'Empty scene'}</strong></div>
            <span className="live-indicator"><span /> LIVE PREVIEW</span>
          </div>
          <div
            className="canvas-wrap"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              loadFile(event.dataTransfer.files[0])
            }}
          >
            <Canvas
              camera={{ position: [4.2, 2.9, 5.6], fov: 40 }}
              dpr={[1, 1.75]}
              gl={{ antialias: true, alpha: false }}
              onPointerMissed={() => setSelected(false)}
            >
              <Scene
                model={model}
                setSelected={setSelected}
                showGrid={showGrid}
                controlsRef={controlsRef}
              />
            </Canvas>
            <div className="viewport-overlay">
              <div className="scene-caption">
                <span className="caption-kicker">{model ? `MODEL / ${model.extension.toUpperCase()}` : 'SCENE / EMPTY'}</span>
                <strong>{model?.name ?? 'Nothing loaded yet'}</strong>
              </div>
              {!model && (
                <div className="empty-state">
                  <span className="empty-state-icon"><Icon name="file" /></span>
                  <h2>{isLoading ? 'Loading your file…' : 'A blank canvas'}</h2>
                  <p>Choose a 3D model or CAD drawing to explore it in the viewer.</p>
                  <button className="load-file-button" type="button" onClick={openFilePicker} disabled={isLoading}>
                    <Icon name="file" /> Choose a file
                  </button>
                  <span className="supported-formats">GLB · OBJ · STL · DXF · 00T</span>
                </div>
              )}
              <div className="axis-gizmo" aria-label="Scene orientation">
                <span className="axis-line axis-y">Y</span>
                <span className="axis-line axis-x">X</span>
                <span className="axis-line axis-z">Z</span>
                <span className="axis-center" />
              </div>
              <div className="viewport-controls">
                <button type="button" aria-label="Reset camera" title="Reset camera" onClick={() => controlsRef.current?.reset()}>
                  <Icon name="reset" />
                </button>
                <span className="control-divider" />
                <button
                  className={showGrid ? 'control-active' : ''}
                  type="button"
                  aria-label={showGrid ? 'Hide grid' : 'Show grid'}
                  title={showGrid ? 'Hide grid' : 'Show grid'}
                  onClick={() => setShowGrid((visible) => !visible)}
                ><Icon name="grid" /></button>
              </div>
              <div className="interaction-hint"><Icon name="orbit" /> DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM</div>
            </div>
          </div>
          <footer className="viewport-footer">
            <span>{model ? '1 model' : '0 models'} <i /> 4 lights</span>
            <span><span className="render-dot" /> WebGL renderer</span>
            <span>Perspective <b>⌄</b></span>
          </footer>
        </section>
      </div>
    </main>
  )
}

export default App
