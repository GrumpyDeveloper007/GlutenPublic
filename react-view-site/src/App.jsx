import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Line as DreiLine, OrbitControls } from '@react-three/drei'
import { Box3, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, DoubleSide, EllipseCurve, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, MOUSE, Raycaster, Shape, ShapeGeometry, SRGBColorSpace, Vector3 } from 'three'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import DxfParser from 'dxf-parser'
import { parse00t } from './parse00t.js'
import { splitPolygonByLine } from './polygonCut.js'
import './App.css'

const supportedExtensions = ['glb', 'obj', 'stl', 'dxf', '00t']
const workspaceDatabaseName = 'forma-workspace'
const workspaceStoreName = 'assets'
const legacyStorageKey = 'forma-workspace-assets'
let workspaceDatabasePromise

async function restoreFile(savedFile) {
  if (!savedFile || typeof savedFile.name !== 'string' || !(savedFile.blob instanceof Blob)) {
    throw new Error('Saved workspace data is invalid.')
  }
  return new File([savedFile.blob], savedFile.name, { type: savedFile.type ?? '' })
}

function openWorkspaceDatabase() {
  if (!workspaceDatabasePromise) {
    workspaceDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(workspaceDatabaseName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(workspaceStoreName, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
      request.onblocked = () => reject(new Error('Browser storage upgrade is blocked by another tab.'))
    }).catch((error) => {
      workspaceDatabasePromise = null
      throw error
    })
  }
  return workspaceDatabasePromise
}

async function readStoredFile(id) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readonly')
    const request = transaction.objectStore(workspaceStoreName).get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error('Could not read browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read browser storage.'))
  })
}

async function saveStoredFile(id, file, clearTextureOnModel = true) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    const store = transaction.objectStore(workspaceStoreName)
    store.put({ id, name: file.name, type: file.type, blob: file })
    if (id === 'model' && clearTextureOnModel) {
      store.delete('texture')
      const keysRequest = store.getAllKeys()
      keysRequest.onsuccess = () => {
        keysRequest.result
          .filter((key) => typeof key === 'string' && key.startsWith('texture-tile:'))
          .forEach((key) => store.delete(key))
      }
    }
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
  })
}

async function saveStoredTextureTiles(file, width, height, tileSize, tiles) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    const store = transaction.objectStore(workspaceStoreName)
    const keysRequest = store.getAllKeys()
    keysRequest.onsuccess = () => {
      keysRequest.result
        .filter((key) => typeof key === 'string' && key.startsWith('texture-tile:'))
        .forEach((key) => store.delete(key))
      store.put({
        id: 'texture',
        name: file.name,
        type: file.type,
        tiled: true,
        width,
        height,
        tileSize,
        tileCount: tiles.length,
      })
      tiles.forEach((tile, index) => {
        store.put({ ...tile, id: `texture-tile:${index}` })
      })
    }
    keysRequest.onerror = () => transaction.abort()
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
  })
}

async function readStoredTextureTile(index) {
  return readStoredFile(`texture-tile:${index}`)
}

async function removeStoredFile(id) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    const store = transaction.objectStore(workspaceStoreName)
    store.delete(id)
    if (id === 'texture') {
      const keysRequest = store.getAllKeys()
      keysRequest.onsuccess = () => {
        keysRequest.result
          .filter((key) => typeof key === 'string' && key.startsWith('texture-tile:'))
          .forEach((key) => store.delete(key))
      }
      keysRequest.onerror = () => transaction.abort()
    }
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not update browser storage.'))
  })
}

async function saveStoredPolygons(polygons) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    transaction.objectStore(workspaceStoreName).put({ id: 'polygons', value: polygons })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
  })
}

async function saveStoredCamera(camera) {
  const database = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    transaction.objectStore(workspaceStoreName).put({ id: 'camera', ...camera })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save browser storage.'))
  })
}

function validateStoredCamera(camera) {
  const isVector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
  if (!camera || !isVector(camera.position) || !isVector(camera.target) || !isVector(camera.up)) {
    throw new Error('Saved camera data is invalid.')
  }
  return camera
}

function validateStoredPolygons(value) {
  if (!Array.isArray(value)) throw new Error('Saved polygon data is invalid.')
  return value.map((polygon) => {
    if (
      !polygon ||
      !Number.isSafeInteger(polygon.id) ||
      !Number.isFinite(polygon.height) ||
      !Array.isArray(polygon.points) ||
      polygon.points.length < 3 ||
      polygon.points.some((point) => (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(Number.isFinite)
      ))
    ) {
      throw new Error('Saved polygon data is invalid.')
    }
    return polygon
  })
}

async function restoreWorkspaceFiles() {
  const [model, texture, savedPolygons, camera] = await Promise.all([
    readStoredFile('model'),
    readStoredFile('texture'),
    readStoredFile('polygons'),
    readStoredFile('camera'),
  ])
  const polygons = savedPolygons ? validateStoredPolygons(savedPolygons.value) : []
  const savedCamera = camera ? validateStoredCamera(camera) : null
  const storedLegacy = localStorage.getItem(legacyStorageKey)
  if (!storedLegacy) return { model, texture, polygons, camera: savedCamera }

  const legacy = JSON.parse(storedLegacy)
  const migrate = async (id, savedFile, existingFile) => {
    if (existingFile || !savedFile) return existingFile
    if (typeof savedFile.name !== 'string' || typeof savedFile.dataUrl !== 'string') {
      throw new Error('Saved workspace data is invalid.')
    }
    const response = await fetch(savedFile.dataUrl)
    if (!response.ok) throw new Error(`Could not migrate ${savedFile.name}.`)
    const file = new File([await response.blob()], savedFile.name, { type: savedFile.type ?? '' })
    await saveStoredFile(id, file, false)
    return { id, name: file.name, type: file.type, blob: file }
  }
  const migratedModel = await migrate('model', legacy.model, model)
  const migratedTexture = await migrate('texture', legacy.texture, texture)
  localStorage.removeItem(legacyStorageKey)
  return { model: migratedModel, texture: migratedTexture, polygons, camera: savedCamera }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode a texture tile.'))
    }, 'image/png')
  })
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve))
}

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

function getDrawingHeight(model) {
  if (!model) return 0.02
  const size = model.bounds.getSize(new Vector3())
  return model.bounds.max.y + Math.max(size.length() * 0.005, 0.02)
}

function addPlanarUvs(geometry) {
  if (geometry.getAttribute('uv')) return

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  const dimensions = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ]
  const axes = [0, 1, 2].sort((a, b) => dimensions[b] - dimensions[a]).slice(0, 2)
  const min = [bounds.min.x, bounds.min.y, bounds.min.z]
  const ranges = axes.map((axis) => dimensions[axis] || 1)
  const positions = geometry.getAttribute('position')
  const uvs = new Float32Array(positions.count * 2)
  for (let i = 0; i < positions.count; i += 1) {
    uvs[i * 2] = (positions.getComponent(i, axes[0]) - min[axes[0]]) / ranges[0]
    uvs[i * 2 + 1] = (positions.getComponent(i, axes[1]) - min[axes[1]]) / ranges[1]
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
}

function clearModelTexture(model) {
  if (!model?.texture) return

  model.textureOriginalMaterials.forEach(({ map, color }, material) => {
    material.map = map
    if (color && material.color) material.color.copy(color)
    material.needsUpdate = true
  })
  model.textureOriginalMaterials.clear()
  model.texture.image.close?.()
  model.texture.dispose()
  model.texture = null
}

function applyTextureToModel(model, texture) {
  clearModelTexture(model)
  const originalMaterials = new Map()
  let texturedMeshes = 0

  model.object.traverse((child) => {
    if (!child.isMesh) return
    addPlanarUvs(child.geometry)
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      if (!material.map && !material.color) return
      if (!originalMaterials.has(material)) {
        originalMaterials.set(material, {
          map: material.map,
          color: material.color?.clone(),
        })
      }
      material.map = texture
      material.color?.set('#ffffff')
      material.needsUpdate = true
      texturedMeshes += 1
    })
  })

  if (texturedMeshes === 0) {
    texture.image.close?.()
    texture.dispose()
    throw new Error('This model has no mesh surfaces to texture.')
  }

  model.textureOriginalMaterials = originalMaterials
  model.texture = texture
  return texturedMeshes
}

function disposeModel(model) {
  if (!model) return
  clearModelTexture(model)
  model.object.traverse((child) => {
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
    polygon: <><path d="m5 5 12-1 3 10-8 6-9-5 2-10Z" /><circle cx="5" cy="5" r="1" /><circle cx="17" cy="4" r="1" /><circle cx="20" cy="14" r="1" /><circle cx="12" cy="20" r="1" /><circle cx="3" cy="15" r="1" /></>,
    cut: <><path d="m4 20 16-16" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="m8 16 3 3m2-7 3 3" /></>,
    swap: <><path d="M4 8h15l-3-3" /><path d="m19 8-3 3M20 16H5l3 3" /><path d="m5 16 3-3" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function createPolygonGeometry(polygon, model) {
  const shape = new Shape()
  polygon.points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z)
    else shape.lineTo(x, z)
  })
  shape.closePath()

  const baseGeometry = new ShapeGeometry(shape)
  const tessellatedGeometry = new TessellateModifier(0.3, 4).modify(baseGeometry)
  baseGeometry.dispose()

  const positions = tessellatedGeometry.getAttribute('position')
  if (model) {
    const bounds = model.bounds
    const raycaster = new Raycaster()
    const direction = new Vector3(0, -1, 0)
    const origin = new Vector3()
    const offset = 0.008

    for (let index = 0; index < positions.count; index += 1) {
      const z = positions.getY(index)
      origin.set(positions.getX(index), bounds.max.y + 1, z)
      raycaster.set(origin, direction)
      const terrainHit = raycaster.intersectObject(model.object, true).find((hit) => hit.object.isMesh)
      positions.setY(index, terrainHit ? terrainHit.point.y + offset : polygon.height)
      positions.setZ(index, z)
    }
  } else {
    for (let index = 0; index < positions.count; index += 1) {
      const z = positions.getY(index)
      positions.setY(index, polygon.height)
      positions.setZ(index, z)
    }
  }

  positions.needsUpdate = true
  tessellatedGeometry.computeVertexNormals()
  tessellatedGeometry.computeBoundingSphere()
  return tessellatedGeometry
}

function getPolygonSurfacePoints(polygon, model) {
  if (!model) {
    return polygon.points.map(([x, z]) => new Vector3(x, polygon.height + 0.02, z))
  }

  const bounds = model.bounds
  const raycaster = new Raycaster()
  const origin = new Vector3()
  const direction = new Vector3(0, -1, 0)

  return polygon.points.map(([x, z]) => {
    origin.set(x, bounds.max.y + 1, z)
    raycaster.set(origin, direction)
    const terrainHit = raycaster.intersectObject(model.object, true).find((hit) => hit.object.isMesh)
    return new Vector3(x, (terrainHit?.point.y ?? polygon.height) + 0.02, z)
  })
}

function PolygonArea({ polygon, model, selected, drawMode, onSelectPolygon }) {
  const geometry = useMemo(() => createPolygonGeometry(polygon, model), [polygon, model])
  const surfacePoints = useMemo(() => getPolygonSurfacePoints(polygon, model), [polygon, model])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <>
      <mesh
        geometry={geometry}
        onClick={(event) => {
          if (drawMode) return
          event.stopPropagation()
          onSelectPolygon(polygon.id)
        }}
      >
        <meshBasicMaterial
          color={selected ? '#79aaff' : '#4d8dff'}
          side={DoubleSide}
          transparent
          opacity={selected ? 0.68 : 0.48}
          depthWrite={false}
        />
      </mesh>
      {!drawMode && (
        <DreiLine
          points={[...surfacePoints, surfacePoints[0]]}
          color={selected ? '#a9caff' : '#4d8dff'}
          lineWidth={selected ? 4 : 1.5}
          raycast={() => null}
        />
      )}
      {selected && !drawMode && surfacePoints.map((point, index) => (
        <mesh key={index} position={point} raycast={() => null}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color="#e7f1ff" />
        </mesh>
      ))}
    </>
  )
}

const MemoizedPolygonArea = memo(PolygonArea)

function Scene({
  model,
  setSelected,
  setSelectedPolygonId,
  showGrid,
  swapMouseButtons,
  controlsRef,
  drawMode,
  polygons,
  selectedPolygonId,
  draftPoints,
  draftCursor,
  cutMode,
  onCameraChange,
  fitModel,
  onDrawPointerDown,
  onDrawPointerMove,
  onSelectPolygon,
}) {
  const drawingHeight = useMemo(() => getDrawingHeight(model), [model])
  const draftLine = [...draftPoints, ...(draftCursor ? [draftCursor] : [])]
    .map((point) => new Vector3(point.x, point.y + 0.01, point.z))

  return (
    <>
      <color attach="background" args={['#10110f']} />
      <fog attach="fog" args={['#10110f', 8, 18]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color="#f1ffe1" />
      <pointLight position={[-3, 1, -2]} intensity={18} color="#9683ff" />
      <pointLight position={[3, -1, 2]} intensity={10} color="#d0ff71" />
      {model && (
        <Bounds key={model.object.uuid} fit={fitModel} clip margin={1.2}>
          <primitive
            object={model.object}
            onClick={(event) => {
              event.stopPropagation()
              setSelected(true)
              setSelectedPolygonId(null)
            }}
          />
        </Bounds>
      )}
      {polygons.map((polygon) => (
        <MemoizedPolygonArea
          key={polygon.id}
          polygon={polygon}
          model={model}
          selected={polygon.id === selectedPolygonId}
          drawMode={drawMode}
          onSelectPolygon={onSelectPolygon}
        />
      ))}
      {drawMode && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, drawingHeight, 0]}
            onPointerDown={onDrawPointerDown}
            onPointerMove={onDrawPointerMove}
          >
            <planeGeometry args={[200, 200]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>
          {draftLine.length > 1 && <DreiLine points={draftLine} color={cutMode ? '#d0ff71' : '#4d8dff'} lineWidth={2} />}
          {draftPoints.map((point, index) => (
            <mesh key={index} position={[point.x, point.y + 0.01, point.z]}>
              <sphereGeometry args={[0.025, 10, 10]} />
              <meshBasicMaterial color={cutMode ? '#d0ff71' : '#4d8dff'} />
            </mesh>
          ))}
        </>
      )}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.42, 0]}
        onClick={() => {
          setSelected(false)
          setSelectedPolygonId(null)
        }}
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
        mouseButtons={{
          LEFT: swapMouseButtons ? MOUSE.PAN : MOUSE.ROTATE,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: swapMouseButtons ? MOUSE.ROTATE : MOUSE.PAN,
        }}
        enabled={!drawMode}
        onChange={onCameraChange}
      />
    </>
  )
}

function App() {
  const [model, setModel] = useState(null)
  const [textureInfo, setTextureInfo] = useState(null)
  const [selected, setSelected] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [swapMouseButtons, setSwapMouseButtons] = useState(false)
  const [toolMode, setToolMode] = useState(null)
  const drawMode = toolMode !== null
  const cutMode = toolMode === 'cut'
  const [fitModel, setFitModel] = useState(true)
  const [leftDragging, setLeftDragging] = useState(false)
  const [polygons, setPolygons] = useState([])
  const [undoPolygons, setUndoPolygons] = useState([])
  const [redoPolygons, setRedoPolygons] = useState([])
  const [selectedPolygonId, setSelectedPolygonId] = useState(null)
  const [draftPoints, setDraftPoints] = useState([])
  const [redoPoints, setRedoPoints] = useState([])
  const [draftCursor, setDraftCursor] = useState(null)
  const [fileStatus, setFileStatus] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const controlsRef = useRef()
  const fileInputRef = useRef()
  const textureInputRef = useRef()
  const drawingRaycasterRef = useRef(new Raycaster())
  const loadFileRef = useRef()
  const loadTextureRef = useRef()
  const loadTextureTilesRef = useRef()
  const workspaceReadyRef = useRef(false)
  const cameraSaveTimeoutRef = useRef()

  useEffect(() => () => {
    disposeModel(model)
  }, [model])

  useEffect(() => () => {
    window.clearTimeout(cameraSaveTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (!workspaceReadyRef.current) return
    saveStoredPolygons(polygons).catch((error) => {
      setFileStatus(`Could not save polygons to IndexedDB: ${error.message}`)
    })
  }, [polygons])

  useEffect(() => {
    if (!leftDragging) return undefined
    const stopDragging = () => setLeftDragging(false)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [leftDragging])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return

      if (drawMode && event.key === 'Escape') {
        event.preventDefault()
        setDraftPoints([])
        setRedoPoints([])
        setDraftCursor(null)
        setFileStatus(`Cancelled the current ${cutMode ? 'cut' : 'area'}.`)
        return
      }

      if (
        event.key === 'Delete' &&
        selectedPolygonId !== null &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const polygon = polygons.find((item) => item.id === selectedPolygonId)
        if (!polygon) return
        event.preventDefault()
        setUndoPolygons((history) => [...history, polygons])
        setRedoPolygons([])
        setPolygons(polygons.filter((item) => item.id !== selectedPolygonId))
        setSelectedPolygonId(null)
        setFileStatus('Deleted the selected area.')
        return
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase()
        const isUndo = key === 'z' && !event.shiftKey
        const isRedo = key === 'y' || (key === 'z' && event.shiftKey)
        if (drawMode && isUndo && draftPoints.length > 0) {
          event.preventDefault()
          const undonePoint = draftPoints[draftPoints.length - 1]
          setDraftPoints(draftPoints.slice(0, -1))
          setRedoPoints((points) => [...points, undonePoint])
          setDraftCursor(null)
          return
        }
        if (drawMode && isRedo && redoPoints.length > 0) {
          event.preventDefault()
          const restoredPoint = redoPoints[redoPoints.length - 1]
          setRedoPoints(redoPoints.slice(0, -1))
          setDraftPoints([...draftPoints, restoredPoint])
          setDraftCursor(null)
          return
        }
        if (isUndo && undoPolygons.length > 0) {
          event.preventDefault()
          setPolygons(undoPolygons[undoPolygons.length - 1])
          setUndoPolygons(undoPolygons.slice(0, -1))
          setRedoPolygons((history) => [...history, polygons])
          setSelectedPolygonId(null)
          setFileStatus('Undid the last polygon operation.')
          return
        }
        if (isRedo && redoPolygons.length > 0) {
          event.preventDefault()
          setPolygons(redoPolygons[redoPolygons.length - 1])
          setRedoPolygons(redoPolygons.slice(0, -1))
          setUndoPolygons((history) => [...history, polygons])
          setSelectedPolygonId(null)
          setFileStatus('Redid the polygon operation.')
          return
        }
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return

      const controls = controlsRef.current
      if (!controls) return

      if (event.key === 'Home') {
        event.preventDefault()
        controls.reset()
        return
      }

      const movement = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowDown: [2, 1],
        ArrowUp: [2, -1],
        PageDown: [1, -1],
        PageUp: [1, 1],
      }[event.key]
      if (!movement) return

      event.preventDefault()
      const distance = controls.object.position.distanceTo(controls.target)
      const step = Math.max(distance * 0.025, 0.01)
      const offset = new Vector3().setComponent(movement[0], step * movement[1])

      controls.object.position.add(offset)
      controls.target.add(offset)
      controls.update()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawMode, cutMode, draftPoints, redoPoints, undoPolygons, redoPolygons, polygons, selectedPolygonId])

  const openFilePicker = () => fileInputRef.current?.click()
  const openTexturePicker = () => textureInputRef.current?.click()

  const persistFile = async (key, file) => {
    try {
      await saveStoredFile(key, file)
      return ''
    } catch (error) {
      return ` · Could not save to IndexedDB: ${error.message}`
    }
  }

  const loadFile = async (file, shouldPersist = true) => {
    if (!file) return null
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!supportedExtensions.includes(extension)) {
      setFileStatus('Choose a GLB, OBJ, STL, DXF, or 00T file.')
      return null
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
      const preparedObject = prepareModel(object)
      preparedObject.updateWorldMatrix(true, false)
      const nextModel = {
        object: preparedObject,
        bounds: new Box3().setFromObject(preparedObject),
        name: file.name,
        extension,
        renderedEntities,
        unsupportedTypes,
        vertexCount,
        faceCount,
      }
      setTextureInfo(null)
      if (shouldPersist) setFitModel(true)
      setModel(nextModel)
      setSelected(true)
      const storageWarning = shouldPersist ? await persistFile('model', file) : ''
      const skippedEntities = unsupportedTypes
        ? [...unsupportedTypes.entries()].map(([type, count]) => `${type}: ${count}`).join(', ')
        : ''
      setFileStatus(vertexCount
        ? `Loaded ${file.name} · ${vertexCount.toLocaleString()} vertices · ${faceCount.toLocaleString()} faces${storageWarning}`
        : renderedEntities
          ? `Loaded ${file.name} · ${renderedEntities} entities${skippedEntities ? ` · skipped ${skippedEntities}` : ''}${storageWarning}`
          : `Loaded ${file.name}${storageWarning}`)
      return nextModel
    } catch (error) {
      setFileStatus(`Could not load ${file.name}: ${error.message}`)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileChange = (event) => {
    loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  const loadTexture = async (file, targetModel = model, shouldPersist = true) => {
    if (!file || !targetModel) return false
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setFileStatus('Choose a PNG image for the texture.')
      return false
    }

    setIsLoading(true)
    setFileStatus(`Preparing texture ${file.name}…`)
    let bitmap
    try {
      const header = new DataView(await file.slice(0, 24).arrayBuffer())
      if (
        header.byteLength < 24 ||
        header.getUint32(0, false) !== 0x89504e47 ||
        header.getUint32(4, false) !== 0x0d0a1a0a
      ) {
        throw new Error('The selected file is not a valid PNG image.')
      }
      const imageWidth = header.getUint32(16, false)
      const imageHeight = header.getUint32(20, false)
      if (!imageWidth || !imageHeight) throw new Error('The PNG has invalid dimensions.')
      const scale = Math.min(1, 4096 / imageWidth, 4096 / imageHeight)
      const width = Math.max(1, Math.round(imageWidth * scale))
      const height = Math.max(1, Math.round(imageHeight * scale))
      const tileSize = 1024

      bitmap = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
        imageOrientation: 'flipY',
      })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create a canvas for the texture.')
      const texture = new CanvasTexture(canvas)
      texture.flipY = false
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 4
      const meshCount = applyTextureToModel(targetModel, texture)
      const tiles = []
      const tileCount = Math.ceil(width / tileSize) * Math.ceil(height / tileSize)
      let tileIndex = 0
      for (let y = 0; y < height; y += tileSize) {
        for (let x = 0; x < width; x += tileSize) {
          const tileWidth = Math.min(tileSize, width - x)
          const tileHeight = Math.min(tileSize, height - y)
          const tileCanvas = document.createElement('canvas')
          tileCanvas.width = tileWidth
          tileCanvas.height = tileHeight
          const tileContext = tileCanvas.getContext('2d')
          if (!tileContext) throw new Error('Could not create a canvas for a texture tile.')
          tileContext.drawImage(bitmap, x, y, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight)
          context.drawImage(tileCanvas, x, y)
          texture.needsUpdate = true
          tileIndex += 1
          setFileStatus(`Loading texture tile ${tileIndex} of ${tileCount} · ${file.name}`)
          await nextAnimationFrame()
          if (shouldPersist) {
            tiles.push({
              x,
              y,
              width: tileWidth,
              height: tileHeight,
              blob: await canvasToBlob(tileCanvas),
            })
          }
        }
      }
      setTextureInfo({ name: file.name, width, height })
      const storageWarning = shouldPersist
        ? await persistTextureTiles(file, width, height, tileSize, tiles)
        : ''
      setFileStatus(`Applied ${file.name} to ${meshCount} model ${meshCount === 1 ? 'mesh' : 'meshes'} · loaded ${tileCount} tiles${scale < 1 ? ' · resized for browser performance' : ''}${storageWarning}`)
      return true
    } catch (error) {
      setFileStatus(`Could not apply texture ${file.name}: ${error.message}`)
      return false
    } finally {
      bitmap?.close()
      setIsLoading(false)
    }
  }

  const persistTextureTiles = async (file, width, height, tileSize, tiles) => {
    try {
      await saveStoredTextureTiles(file, width, height, tileSize, tiles)
      return ''
    } catch (error) {
      return ` · Could not save texture tiles to IndexedDB: ${error.message}`
    }
  }

  const loadTextureTiles = async (savedTexture, targetModel) => {
    if (
      !savedTexture ||
      !Number.isSafeInteger(savedTexture.tileCount) ||
      savedTexture.tileCount < 1 ||
      savedTexture.tileCount > 16 ||
      !Number.isSafeInteger(savedTexture.width) ||
      !Number.isSafeInteger(savedTexture.height) ||
      savedTexture.width > 4096 ||
      savedTexture.height > 4096 ||
      typeof savedTexture.name !== 'string'
    ) {
      throw new Error('Saved texture tile data is invalid.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = savedTexture.width
    canvas.height = savedTexture.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create a canvas for the texture.')
    const texture = new CanvasTexture(canvas)
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    const meshCount = applyTextureToModel(targetModel, texture)

    for (let index = 0; index < savedTexture.tileCount; index += 1) {
      const tile = await readStoredTextureTile(index)
      if (!tile || !(tile.blob instanceof Blob) || ![tile.x, tile.y, tile.width, tile.height].every(Number.isFinite)) {
        throw new Error(`Saved texture tile ${index + 1} is invalid.`)
      }
      const bitmap = await createImageBitmap(tile.blob)
      try {
        if (
          tile.x < 0 ||
          tile.y < 0 ||
          tile.width <= 0 ||
          tile.height <= 0 ||
          tile.x + tile.width > savedTexture.width ||
          tile.y + tile.height > savedTexture.height
        ) {
          throw new Error(`Saved texture tile ${index + 1} is outside the image bounds.`)
        }
        context.drawImage(bitmap, tile.x, tile.y, tile.width, tile.height)
      } finally {
        bitmap.close()
      }
      texture.needsUpdate = true
      setTextureInfo({ name: savedTexture.name, width: savedTexture.width, height: savedTexture.height })
      setFileStatus(`Restoring texture tile ${index + 1} of ${savedTexture.tileCount} · ${savedTexture.name}`)
      await nextAnimationFrame()
    }
    return `Restored ${savedTexture.tileCount} texture tiles to ${meshCount} model ${meshCount === 1 ? 'mesh' : 'meshes'}.`
  }

  const clearTexture = async () => {
    clearModelTexture(model)
    setTextureInfo(null)
    try {
      await removeStoredFile('texture')
      setFileStatus('Texture removed from model.')
    } catch (error) {
      setFileStatus(`Texture removed, but IndexedDB could not be updated: ${error.message}`)
    }
  }

  const handleTextureChange = (event) => {
    loadTexture(event.target.files?.[0])
    event.target.value = ''
  }

  const handleCameraChange = () => {
    if (!workspaceReadyRef.current) return
    window.clearTimeout(cameraSaveTimeoutRef.current)
    cameraSaveTimeoutRef.current = window.setTimeout(() => {
      const controls = controlsRef.current
      if (!controls) return
      saveStoredCamera({
        position: controls.object.position.toArray(),
        target: controls.target.toArray(),
        up: controls.object.up.toArray(),
      }).catch((error) => {
        setFileStatus(`Could not save camera to IndexedDB: ${error.message}`)
      })
    }, 500)
  }

  const restoreCamera = async (camera) => {
    if (!camera) return
    let controls = controlsRef.current
    for (let frame = 0; !controls && frame < 120; frame += 1) {
      await nextAnimationFrame()
      controls = controlsRef.current
    }
    if (!controls) throw new Error('The camera controls are not ready to restore the saved view.')
    controls.object.position.fromArray(camera.position)
    controls.object.up.fromArray(camera.up)
    controls.target.fromArray(camera.target)
    controls.update()
  }

  const toggleDrawMode = () => {
    setToolMode((mode) => mode === 'area' ? null : 'area')
    setSelectedPolygonId(null)
    setSelected(false)
    setDraftPoints([])
    setRedoPoints([])
    setDraftCursor(null)
  }

  const toggleCutMode = () => {
    setToolMode((mode) => mode === 'cut' ? null : 'cut')
    setSelectedPolygonId(null)
    setSelected(false)
    setDraftPoints([])
    setRedoPoints([])
    setDraftCursor(null)
  }

  const handleDrawPointerDown = (event) => {
    event.stopPropagation()
    if (event.button === 2) {
      if (cutMode) {
        if (draftPoints.length < 2) {
          setFileStatus('Add two points to define a cut line.')
          return
        }

        let nextId = polygons.reduce((maximum, polygon) => Math.max(maximum, polygon.id), 0) + 1
        let addedPieceCount = 0
        let nextPolygons = polygons

        for (let index = 0; index < draftPoints.length - 1; index += 1) {
          const start = [draftPoints[index].x, draftPoints[index].z]
          const end = [draftPoints[index + 1].x, draftPoints[index + 1].z]
          nextPolygons = nextPolygons.flatMap((polygon) => {
            const pieces = splitPolygonByLine(polygon, start, end)
            if (!pieces) return [polygon]
            addedPieceCount += pieces.length - 1
            return pieces.map((points) => ({
              id: nextId++,
              height: polygon.height,
              points,
            }))
          })
        }

        if (addedPieceCount === 0) {
          setFileStatus('The cut line did not divide any areas.')
        } else {
          setUndoPolygons((history) => [...history, polygons])
          setRedoPolygons([])
          setPolygons(nextPolygons)
          setSelected(false)
          setFileStatus(`Applied ${draftPoints.length - 1} cut segments, creating ${addedPieceCount} additional polygon pieces.`)
        }
        setSelectedPolygonId(null)
        setDraftPoints([])
        setRedoPoints([])
        setDraftCursor(null)
        setToolMode(null)
        return
      }

      if (draftPoints.length < 3) {
        setFileStatus('Add at least 3 points before completing an area.')
        return
      }

      const height = getDrawingHeight(model)
      setPolygons((areas) => [...areas, {
        id: areas.reduce((maximum, area) => Math.max(maximum, area.id), 0) + 1,
        height,
        points: draftPoints.map(({ x, z }) => [x, z]),
      }])
      setSelectedPolygonId(null)
      setDraftPoints([])
      setRedoPoints([])
      setDraftCursor(null)
      setToolMode(null)
      setFileStatus(`Added area ${polygons.length + 1} with ${draftPoints.length} points.`)
      return
    }

    if (event.button !== 0) return
    const point = getDrawPoint(event)
    setDraftPoints((points) => [...points, point])
    setRedoPoints([])
    setDraftCursor(point)
  }

  const handleDrawPointerMove = (event) => {
    if (draftPoints.length === 0) return
    setDraftCursor(getDrawPoint(event))
  }

  const getDrawPoint = (event) => {
    if (!model) return event.point.clone()
    const raycaster = drawingRaycasterRef.current
    raycaster.set(event.ray.origin, event.ray.direction)
    const terrainHit = raycaster.intersectObject(model.object, true).find((hit) => hit.object.isMesh)
    return terrainHit?.point.clone() ?? event.point.clone()
  }

  const selectedPolygonIndex = polygons.findIndex((polygon) => polygon.id === selectedPolygonId)
  const selectedPolygon = polygons[selectedPolygonIndex]
  const selectPolygon = useCallback((polygonId) => {
    setSelected(false)
    setSelectedPolygonId(polygonId)
  }, [])

  useEffect(() => {
    loadFileRef.current = loadFile
    loadTextureRef.current = loadTexture
    loadTextureTilesRef.current = loadTextureTiles
  })

  useEffect(() => {
    let cancelled = false

    const restoreWorkspace = async () => {
      try {
        const workspace = await restoreWorkspaceFiles()
        setPolygons(workspace.polygons)
        setFitModel(!workspace.camera)
        await restoreCamera(workspace.camera)
        if (cancelled) return
        if (workspace.model) {
          const file = await restoreFile(workspace.model)
          if (cancelled) return
          const restoredModel = await loadFileRef.current(file, false)
          if (!restoredModel || cancelled) return
          if (workspace.texture) {
            if (workspace.texture.tiled) {
              const message = await loadTextureTilesRef.current(workspace.texture, restoredModel)
              if (!cancelled) setFileStatus(message)
            } else {
              const textureFile = await restoreFile(workspace.texture)
              if (cancelled) return
              await loadTextureRef.current(textureFile, restoredModel)
            }
          }
        }
        if (cancelled) return
        workspaceReadyRef.current = true
      } catch (error) {
        if (!cancelled) setFileStatus(`Could not restore saved workspace: ${error.message}`)
      }
    }

    const timeoutId = window.setTimeout(restoreWorkspace, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

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
          <button className="share-button" type="button" onClick={openFilePicker} data-tooltip="Load a 3D model or CAD file">
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
      <input
        ref={textureInputRef}
        className="file-input"
        type="file"
        accept="image/png,.png"
        onChange={handleTextureChange}
        aria-label="Select a texture image"
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
              <button type="button" aria-label="Load model file" onClick={openFilePicker} data-tooltip="Load a model"><Icon name="plus" /></button>
            </div>
            {model ? (
              <button
                className={`scene-row ${selected ? 'is-selected' : ''}`}
                type="button"
                data-tooltip={`Select ${model.name}`}
                onClick={() => {
                  setSelected(true)
                  setSelectedPolygonId(null)
                }}
              >
                <span className="object-icon sphere-icon" />
                <span className="model-row-name">{model.name}</span>
                <span className="row-dot" />
              </button>
            ) : (
              <p className="empty-scene-message">
                {polygons.length ? 'Area shapes are stored below.' : 'No objects in this scene yet.'}
              </p>
            )}
            {polygons.map((polygon, index) => (
              <button
                className={`scene-row polygon-row ${selectedPolygonId === polygon.id ? 'is-selected' : ''}`}
                key={polygon.id}
                type="button"
                aria-pressed={selectedPolygonId === polygon.id}
                data-tooltip={`Select Area ${index + 1}`}
                onClick={() => {
                  setSelected(false)
                  setSelectedPolygonId(polygon.id)
                }}
              >
                <span className="object-icon polygon-icon" />
                <span>Area {index + 1}</span>
                <small>{polygon.points.length} pts</small>
                {selectedPolygonId === polygon.id && <span className="selection-indicator" />}
              </button>
            ))}
            <div className="scene-row floor-row">
              <span className="object-icon floor-icon" />
              <span>Ground plane</span>
              <span className="visibility-icon">◉</span>
            </div>
          </div>

          <div className="panel-section object-details">
            <div className="section-heading"><span>SELECTION</span><Icon name="layers" /></div>
            {selectedPolygonId !== null ? (
              selectedPolygon ? (
                <>
                  <div className="selected-object">
                    <span className="color-swatch polygon-swatch" />
                    <div><strong>Area {selectedPolygonIndex + 1}</strong><span>Polygon area · {selectedPolygon.points.length} points</span></div>
                    <span className="selection-indicator" />
                  </div>
                  <ol className="polygon-point-list" aria-label={`Area ${selectedPolygonIndex + 1} vertices`}>
                    {selectedPolygon.points.map(([x, z], index) => (
                      <li key={index}>
                        <span>Point {index + 1}</span>
                        <code>X {x.toFixed(3)} · Z {z.toFixed(3)}</code>
                      </li>
                    ))}
                  </ol>
                </>
              ) : <p className="empty-selection">Select an object in the scene.</p>
            ) : model && selected ? (
              <>
                <div className="selected-object">
                  <span className="color-swatch model-swatch" />
                  <div><strong>{model.name}</strong><span>{model.extension.toUpperCase()} model</span></div>
                  <span className="selection-indicator" />
                </div>
                <div className="texture-actions">
                  <button
                    className="texture-button"
                    type="button"
                    onClick={openTexturePicker}
                    disabled={isLoading}
                    data-tooltip={textureInfo ? 'Replace the model texture' : 'Apply a PNG texture to the model'}
                  >
                    {textureInfo ? 'Replace texture' : 'Load PNG texture'}
                  </button>
                  {textureInfo && (
                    <button
                      className="texture-clear-button"
                      type="button"
                      onClick={clearTexture}
                      aria-label="Remove texture"
                      data-tooltip="Remove the model texture"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {textureInfo && (
                  <p className="texture-info">
                    {textureInfo.name} · {textureInfo.width} × {textureInfo.height}
                  </p>
                )}
              </>
            ) : (
              <p className="empty-selection">
                {model ? 'Select the model in the scene to see its details.' : 'Load a model to see its details here.'}
              </p>
            )}
          </div>

          {fileStatus && (
            <p
              className={`file-status ${fileStatus.startsWith('Could not') || fileStatus.startsWith('Choose') || fileStatus.includes('Could not save') || fileStatus.includes('storage could not') || fileStatus.includes('IndexedDB could not') ? 'file-status-error' : ''}`}
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
            className={`canvas-wrap ${drawMode ? 'draw-mode-active' : ''} ${leftDragging ? 'left-dragging' : ''}`}
            onPointerDownCapture={(event) => {
              if (!drawMode && event.button === 0 && event.target instanceof HTMLCanvasElement) {
                setLeftDragging(true)
              }
            }}
            onContextMenu={(event) => {
              if (drawMode) event.preventDefault()
            }}
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
              onPointerMissed={() => {
                setSelected(false)
                setSelectedPolygonId(null)
              }}
            >
              <Scene
                model={model}
                setSelected={setSelected}
                setSelectedPolygonId={setSelectedPolygonId}
                showGrid={showGrid}
                swapMouseButtons={swapMouseButtons}
                controlsRef={controlsRef}
                drawMode={drawMode}
                polygons={polygons}
                selectedPolygonId={selectedPolygonId}
                draftPoints={draftPoints}
                draftCursor={draftCursor}
                cutMode={cutMode}
                onCameraChange={handleCameraChange}
                fitModel={fitModel}
                onDrawPointerDown={handleDrawPointerDown}
                onDrawPointerMove={handleDrawPointerMove}
                onSelectPolygon={selectPolygon}
              />
            </Canvas>
            <div className="viewport-overlay">
              <div className="scene-caption">
                <span className="caption-kicker">{model ? `MODEL / ${model.extension.toUpperCase()}` : 'SCENE / EMPTY'}</span>
                <strong>{model?.name ?? 'Nothing loaded yet'}</strong>
              </div>
              {!model && !drawMode && (
                <div className="empty-state">
                  <span className="empty-state-icon"><Icon name="file" /></span>
                  <h2>{isLoading ? 'Loading your file…' : 'A blank canvas'}</h2>
                  <p>Choose a 3D model or CAD drawing to explore it in the viewer.</p>
                  <button className="load-file-button" type="button" onClick={openFilePicker} disabled={isLoading} data-tooltip="Browse for a 3D model or CAD file">
                    <Icon name="file" /> Choose a file
                  </button>
                  <span className="supported-formats">GLB · OBJ · STL · DXF · 00T</span>
                </div>
              )}
              <div className="axis-gizmo" aria-label="Scene orientation">
                <span className="axis-line axis-z">Z</span>
                <span className="axis-line axis-x">X</span>
                <span className="axis-line axis-y">Y</span>
                <span className="axis-center" />
              </div>
              <div className="viewport-controls">
                <button
                  className={`draw-mode-button ${toolMode === 'area' ? 'control-active' : ''}`}
                  type="button"
                  aria-pressed={toolMode === 'area'}
                  onClick={toggleDrawMode}
                  data-tooltip={toolMode === 'area' ? 'Exit polygon mode' : 'Draw a polygon area'}
                  data-tooltip-position="top"
                >
                  <Icon name="polygon" />
                  <span>{toolMode === 'area' ? 'Polygon on' : 'Draw area'}</span>
                </button>
                <span className="control-divider" />
                <button
                  className={`draw-mode-button ${toolMode === 'cut' ? 'control-active' : ''}`}
                  type="button"
                  aria-pressed={toolMode === 'cut'}
                  onClick={toggleCutMode}
                  data-tooltip={toolMode === 'cut' ? 'Exit cut mode' : 'Draw a planar cut through areas'}
                  data-tooltip-position="top"
                >
                  <Icon name="cut" />
                  <span>{toolMode === 'cut' ? 'Cut on' : 'Cut area'}</span>
                </button>
                <span className="control-divider" />
                <button
                  className={`swap-mouse-button ${swapMouseButtons ? 'control-active' : ''}`}
                  type="button"
                  aria-label="Swap left and right mouse actions"
                  aria-pressed={swapMouseButtons}
                  onClick={() => setSwapMouseButtons((swapped) => !swapped)}
                  data-tooltip={swapMouseButtons ? 'Restore left-orbit and right-pan controls' : 'Swap left and right mouse actions'}
                  data-tooltip-position="top"
                >
                  <Icon name="swap" />
                </button>
                <span className="control-divider" />
                <button type="button" aria-label="Reset camera" onClick={() => controlsRef.current?.reset()} data-tooltip="Reset the camera view" data-tooltip-position="top">
                  <Icon name="reset" />
                </button>
                <span className="control-divider" />
                <button
                  className={showGrid ? 'control-active' : ''}
                  type="button"
                  aria-label={showGrid ? 'Hide grid' : 'Show grid'}
                  onClick={() => setShowGrid((visible) => !visible)}
                  data-tooltip={showGrid ? 'Hide the scene grid' : 'Show the scene grid'}
                  data-tooltip-position="top"
                ><Icon name="grid" /></button>
              </div>
              <div className="interaction-hint">
                <Icon name={drawMode ? (cutMode ? 'cut' : 'polygon') : 'orbit'} />
                {drawMode
                  ? cutMode
                    ? <>LEFT CLICK: ADD CUT POINTS <span>·</span> RIGHT CLICK: APPLY CUT PATH <span>·</span> ESC: CANCEL <span>·</span> CTRL Z/Y: UNDO/REDO</>
                    : <>LEFT CLICK: ADD POINT <span>·</span> RIGHT CLICK: COMPLETE & EXIT <span>·</span> ESC: CANCEL <span>·</span> CTRL Z/Y: UNDO/REDO</>
                  : <>{swapMouseButtons ? 'RIGHT DRAG TO ORBIT' : 'LEFT DRAG TO ORBIT'} <span>·</span> {swapMouseButtons ? 'LEFT DRAG TO PAN' : 'RIGHT DRAG TO PAN'} <span>·</span> SCROLL TO ZOOM <span>·</span> ARROWS: X/Y <span>·</span> PGUP/PGDN: Z <span>·</span> HOME: RESET</>}
              </div>
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
