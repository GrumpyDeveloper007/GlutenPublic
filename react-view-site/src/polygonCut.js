function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0]
}

function signedArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

function containsPoint(point, polygon) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    if (
      (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) &&
      point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
        / (previousPoint[1] - currentPoint[1]) + currentPoint[0]
    ) {
      inside = !inside
    }
  }
  return inside
}

export function splitPolygonByLine(polygon, start, end) {
  const points = polygon.points
  if (points.length < 3) return null

  const minX = Math.min(...points.map(([x]) => x))
  const maxX = Math.max(...points.map(([x]) => x))
  const minZ = Math.min(...points.map(([, z]) => z))
  const maxZ = Math.max(...points.map(([, z]) => z))
  const scale = Math.max(maxX - minX, maxZ - minZ)
  const epsilon = Math.max(scale * 1e-9, 1e-10)
  const direction = [end[0] - start[0], end[1] - start[1]]
  const directionLength = Math.hypot(...direction)
  if (directionLength <= epsilon) return null

  const nodes = []
  const nodeForPoint = (point) => {
    const existing = nodes.findIndex((node) => Math.hypot(node[0] - point[0], node[1] - point[1]) <= epsilon)
    if (existing !== -1) return existing
    nodes.push(point)
    return nodes.length - 1
  }
  const intersections = new Map()
  const edgeHits = points.map((point) => [{ position: 0, node: nodeForPoint(point) }])

  for (let index = 0; index < points.length; index += 1) {
    const edgeStart = points[index]
    const edgeEnd = points[(index + 1) % points.length]
    const edge = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]]
    const denominator = cross(direction, edge)
    if (Math.abs(denominator) <= epsilon * directionLength) continue

    const offset = [edgeStart[0] - start[0], edgeStart[1] - start[1]]
    const linePosition = cross(offset, edge) / denominator
    const edgePosition = cross(offset, direction) / denominator
    const edgeTolerance = epsilon / Math.max(Math.hypot(...edge), epsilon)
    if (edgePosition < -edgeTolerance || edgePosition > 1 + edgeTolerance) continue

    const clampedPosition = Math.min(1, Math.max(0, edgePosition))
    const point = [
      edgeStart[0] + edge[0] * clampedPosition,
      edgeStart[1] + edge[1] * clampedPosition,
    ]
    const node = nodeForPoint(point)
    edgeHits[index].push({ position: clampedPosition, node })
    if (!intersections.has(node)) intersections.set(node, linePosition)
  }

  const orderedIntersections = [...intersections.entries()]
    .map(([node, position]) => ({ node, position }))
    .sort((a, b) => a.position - b.position)
  if (orderedIntersections.length < 2) return null

  const neighbors = new Map(nodes.map((_, index) => [index, new Set()]))
  const addEdge = (first, second) => {
    if (first === second) return
    neighbors.get(first).add(second)
    neighbors.get(second).add(first)
  }

  for (let index = 0; index < points.length; index += 1) {
    const hits = [...edgeHits[index], {
      position: 1,
      node: edgeHits[(index + 1) % points.length][0].node,
    }].sort((a, b) => a.position - b.position)
    for (let hit = 0; hit < hits.length - 1; hit += 1) {
      addEdge(hits[hit].node, hits[hit + 1].node)
    }
  }

  for (let index = 0; index < orderedIntersections.length - 1; index += 1) {
    const first = orderedIntersections[index]
    const second = orderedIntersections[index + 1]
    const midpoint = [
      (nodes[first.node][0] + nodes[second.node][0]) / 2,
      (nodes[first.node][1] + nodes[second.node][1]) / 2,
    ]
    if (containsPoint(midpoint, points)) addEdge(first.node, second.node)
  }

  const sortedNeighbors = new Map([...neighbors].map(([node, adjacent]) => [
    node,
    [...adjacent].sort((a, b) => {
      const angleA = Math.atan2(nodes[a][1] - nodes[node][1], nodes[a][0] - nodes[node][0])
      const angleB = Math.atan2(nodes[b][1] - nodes[node][1], nodes[b][0] - nodes[node][0])
      return angleA - angleB
    }),
  ]))
  const visited = new Set()
  const faces = []
  const directedKey = (from, to) => `${from}:${to}`

  for (const [from, adjacent] of neighbors) {
    for (const to of adjacent) {
      if (visited.has(directedKey(from, to))) continue
      const face = []
      let previous = from
      let current = to
      let closed = false

      for (let step = 0; step <= neighbors.size * 2; step += 1) {
        const key = directedKey(previous, current)
        if (visited.has(key)) {
          closed = previous === from && current === to
          break
        }
        visited.add(key)
        face.push(nodes[previous])
        const aroundCurrent = sortedNeighbors.get(current)
        const reverseIndex = aroundCurrent.indexOf(previous)
        if (reverseIndex === -1 || aroundCurrent.length === 0) break
        const next = aroundCurrent[(reverseIndex - 1 + aroundCurrent.length) % aroundCurrent.length]
        previous = current
        current = next
        if (previous === from && current === to) {
          closed = true
          break
        }
      }

      if (closed && face.length >= 3 && signedArea(face) > epsilon * epsilon) {
        faces.push(face)
      }
    }
  }

  const originalArea = Math.abs(signedArea(points))
  const splitArea = faces.reduce((total, face) => total + signedArea(face), 0)
  if (
    faces.length < 2 ||
    Math.abs(splitArea - originalArea) > Math.max(originalArea * 1e-7, epsilon * epsilon * 10)
  ) {
    return null
  }

  return faces.map((face) => face.map(([x, z]) => [x, z]))
}
