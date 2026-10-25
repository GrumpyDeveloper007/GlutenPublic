import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
} from 'three'

const MAGIC = [0xea, 0xfb, 0xa7, 0x8a, 0x76, 0x75, 0x6c, 0x5a]
const HEADER_LENGTH = 120
const VERTEX_RECORD_LENGTH = 24
const FACE_RECORD_LENGTH = 24
const MAX_EXPANDED_LENGTH = 512 * 1024 * 1024
const MAX_PAGE_SIZE = 4 * 1024 * 1024

function readGeometry(image) {
  if (image.byteLength < HEADER_LENGTH) {
    throw new Error('The .00t geometry header is incomplete.')
  }

  const view = new DataView(image.buffer, image.byteOffset, image.byteLength)
  const vertexCount = view.getUint32(0x48, false)
  const faceCount = view.getUint32(0x60, false)
  const faceOffset = HEADER_LENGTH + vertexCount * VERTEX_RECORD_LENGTH
  const geometryEnd = faceOffset + faceCount * FACE_RECORD_LENGTH

  if (
    vertexCount < 3 ||
    faceCount < 1 ||
    !Number.isSafeInteger(geometryEnd) ||
    geometryEnd > image.byteLength
  ) {
    throw new Error('The .00t file has invalid vertex or triangle counts.')
  }

  const vertices = new Float64Array(vertexCount * 3)
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const offset = HEADER_LENGTH + i * VERTEX_RECORD_LENGTH
    const x = view.getFloat64(offset, false)
    const y = view.getFloat64(offset + 8, false)
    const z = view.getFloat64(offset + 16, false)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`The .00t file contains an invalid vertex at index ${i}.`)
    }

    vertices[i * 3] = x
    vertices[i * 3 + 1] = y
    vertices[i * 3 + 2] = z
    bounds.min[0] = Math.min(bounds.min[0], x)
    bounds.min[1] = Math.min(bounds.min[1], y)
    bounds.min[2] = Math.min(bounds.min[2], z)
    bounds.max[0] = Math.max(bounds.max[0], x)
    bounds.max[1] = Math.max(bounds.max[1], y)
    bounds.max[2] = Math.max(bounds.max[2], z)
  }

  const center = bounds.min.map((min, axis) => (min + bounds.max[axis]) / 2)
  const positions = new Float32Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = vertices[i * 3] - center[0]
    positions[i * 3 + 1] = vertices[i * 3 + 2] - center[2]
    positions[i * 3 + 2] = vertices[i * 3 + 1] - center[1]
  }

  const faces = new Uint32Array(faceCount * 3)
  let smallestIndex = Infinity
  let largestIndex = -Infinity
  for (let i = 0; i < faces.length; i += 1) {
    const index = view.getUint32(faceOffset + Math.floor(i / 3) * FACE_RECORD_LENGTH + (i % 3) * 4, false)
    faces[i] = index
    smallestIndex = Math.min(smallestIndex, index)
    largestIndex = Math.max(largestIndex, index)
  }

  const zeroBased = smallestIndex === 0 && largestIndex < vertexCount
  if (!zeroBased && (smallestIndex < 1 || largestIndex > vertexCount)) {
    throw new Error('The .00t file contains triangle indices outside its vertex list.')
  }
  if (!zeroBased) {
    for (let i = 0; i < faces.length; i += 1) faces[i] -= 1
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(faces, 1))
  geometry.computeVertexNormals()

  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: '#b7c98d',
      metalness: 0.08,
      roughness: 0.78,
      side: DoubleSide,
    }),
  )
  mesh.name = 'Vulcan triangulation'
  return { object: mesh, vertexCount, faceCount }
}

function decompressFastLz(source, maxOutputLength) {
  if (source.length === 0) throw new Error('A .00t page has an empty compressed stream.')

  const level = (source[0] >> 5) + 1
  if (level !== 1 && level !== 2) {
    throw new Error(`The .00t page uses unsupported FastLZ level ${level}.`)
  }

  const output = new Uint8Array(maxOutputLength)
  let sourceOffset = 1
  let outputOffset = 0
  const firstLength = (source[0] & 0x1f) + 1
  if (sourceOffset + firstLength > source.length || firstLength > output.length) {
    throw new Error('The .00t page has an invalid FastLZ literal run.')
  }
  output.set(source.subarray(sourceOffset, sourceOffset + firstLength), outputOffset)
  sourceOffset += firstLength
  outputOffset += firstLength

  while (sourceOffset < source.length) {
    const control = source[sourceOffset]
    sourceOffset += 1

    if (control < 32) {
      const literalLength = control + 1
      if (
        sourceOffset + literalLength > source.length ||
        outputOffset + literalLength > output.length
      ) {
        throw new Error('The .00t page has an invalid FastLZ literal run.')
      }
      output.set(source.subarray(sourceOffset, sourceOffset + literalLength), outputOffset)
      sourceOffset += literalLength
      outputOffset += literalLength
      continue
    }

    let matchLength = control >> 5
    let referenceOffset = (control & 0x1f) << 8
    if (matchLength === 7) {
      let extension
      do {
        if (sourceOffset >= source.length) {
          throw new Error('The .00t page has a truncated FastLZ match.')
        }
        extension = source[sourceOffset]
        sourceOffset += 1
        matchLength += extension
      } while (level === 2 && extension === 255)
    }

    if (sourceOffset >= source.length) {
      throw new Error('The .00t page has a truncated FastLZ reference.')
    }
    const lowOffset = source[sourceOffset]
    sourceOffset += 1
    referenceOffset += lowOffset

    if (level === 2 && lowOffset === 255 && (control & 0x1f) === 0x1f) {
      if (sourceOffset + 2 > source.length) {
        throw new Error('The .00t page has a truncated far FastLZ reference.')
      }
      referenceOffset = (source[sourceOffset] << 8) + source[sourceOffset + 1] + 8191
      sourceOffset += 2
    }

    matchLength += 2
    let matchSource = outputOffset - referenceOffset - 1
    if (matchSource < 0 || outputOffset + matchLength > output.length) {
      throw new Error('The .00t page contains an invalid FastLZ match.')
    }
    for (let i = 0; i < matchLength; i += 1) {
      output[outputOffset] = output[matchSource]
      outputOffset += 1
      matchSource += 1
    }
  }

  return output.slice(0, outputOffset)
}

function decodeContainer(bytes, view) {
  if (bytes.length < 0x40) throw new Error('The .00t container header is incomplete.')

  const pageSize = view.getUint32(0x14, true)
  const expandedLengthBigInt = view.getBigUint64(0x20, true)
  const rootOffset = view.getUint32(0x3c, true)
  if (
    pageSize < 1024 ||
    pageSize > MAX_PAGE_SIZE ||
    expandedLengthBigInt === 0n ||
    expandedLengthBigInt > BigInt(MAX_EXPANDED_LENGTH)
  ) {
    throw new Error('The .00t container has invalid page or expanded image sizes.')
  }

  const expandedLength = Number(expandedLengthBigInt)
  const pageCount = Math.ceil(expandedLength / pageSize)
  const pages = new Map()
  const pageOffsets = []
  const visited = new Set()
  const pending = [rootOffset]

  while (pending.length > 0) {
    const offset = pending.pop()
    if (visited.has(offset)) continue
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 8 > bytes.length) {
      throw new Error('The .00t container contains an out-of-range page pointer.')
    }
    visited.add(offset)

    const first = view.getUint32(offset, true)
    const second = view.getUint32(offset + 4, true)
    if (second === 0) {
      const blockEnd = Math.min(offset + 0x800, bytes.length - 7)
      for (let entry = offset; entry < blockEnd; entry += 8) {
        const target = view.getUint32(entry, true)
        const entrySecond = view.getUint32(entry + 4, true)
        if (target === 0 || entrySecond !== 0) break
        pending.push(target)
      }
      continue
    }

    const storedLength = first
    const advance = second
    if (
      storedLength === 0 ||
      storedLength > MAX_PAGE_SIZE ||
      advance < storedLength ||
      advance > storedLength + 0x4000 ||
      offset + 8 + storedLength > bytes.length
    ) {
      continue
    }

    const payload = decompressFastLz(
      bytes.subarray(offset + 8, offset + 8 + storedLength),
      pageSize,
    )
    const trailerOffset = offset + 8 + storedLength
    const trailer = trailerOffset + 4 <= bytes.length
      ? view.getUint32(trailerOffset, true)
      : 0
    const pageNumber = trailer === 0xfdfcfbfa ? 0 : trailer
    if (payload.length === pageSize) {
      pageOffsets.push({ offset, pageNumber, payload })
    }
  }

  pageOffsets.forEach(({ pageNumber, payload }) => {
    if (pageNumber > 0 && pageNumber < pageCount) pages.set(pageNumber, payload)
  })
  pageOffsets.forEach(({ pageNumber, payload }) => {
    if (pageNumber === 0) {
      let nextSlot = 0
      while (nextSlot < pageCount && pages.has(nextSlot)) nextSlot += 1
      if (nextSlot < pageCount) pages.set(nextSlot, payload)
    }
  })

  if (pages.size !== pageCount) {
    pageOffsets.forEach(({ offset: startOffset }) => {
      let pageOffset = startOffset + 8 + view.getUint32(startOffset + 4, true)
      const runVisited = new Set()
      for (let scanned = 0; scanned < pageCount && pages.size < pageCount; scanned += 1) {
        if (runVisited.has(pageOffset) || pageOffset + 8 > bytes.length) break
        runVisited.add(pageOffset)
        const storedLength = view.getUint32(pageOffset, true)
        const advance = view.getUint32(pageOffset + 4, true)
        if (
          storedLength === 0 ||
          storedLength > MAX_PAGE_SIZE ||
          advance < storedLength ||
          advance > storedLength + 0x4000 ||
          pageOffset + 8 + storedLength > bytes.length
        ) break

        const payload = decompressFastLz(
          bytes.subarray(pageOffset + 8, pageOffset + 8 + storedLength),
          pageSize,
        )
        if (payload.length !== pageSize) break

        const trailerOffset = pageOffset + 8 + storedLength
        const trailer = trailerOffset + 4 <= bytes.length
          ? view.getUint32(trailerOffset, true)
          : 0
        const pageNumber = trailer === 0xfdfcfbfa ? 0 : trailer
        if (pageNumber > 0 && pageNumber < pageCount && !pages.has(pageNumber)) {
          pages.set(pageNumber, payload)
        } else if (pageNumber === 0) {
          let nextSlot = 0
          while (nextSlot < pageCount && pages.has(nextSlot)) nextSlot += 1
          if (nextSlot < pageCount) pages.set(nextSlot, payload)
        }

        pageOffset += 8 + advance
      }
    })
  }

  if (pages.size !== pageCount) {
    throw new Error(`The .00t container is incomplete (${pages.size} of ${pageCount} pages decoded).`)
  }

  const image = new Uint8Array(expandedLength)
  pages.forEach((payload, pageNumber) => {
    const start = pageNumber * pageSize
    image.set(payload.subarray(0, Math.min(pageSize, expandedLength - start)), start)
  })
  return image
}

export function parse00t(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  if (bytes.length > MAX_EXPANDED_LENGTH) {
    throw new Error('The .00t file exceeds the supported 512 MB size limit.')
  }
  const view = new DataView(arrayBuffer)
  const isContainer = MAGIC.every((byte, index) => bytes[index] === byte)
  const image = isContainer ? decodeContainer(bytes, view) : bytes
  return readGeometry(image)
}
