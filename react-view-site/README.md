# Forma 3D workspace

A browser-based 3D viewer built with React Three Fiber. The scene starts empty;
use **Load model** or drag a file into the viewer to open a local file.

Supported formats:

- **GLB** (binary glTF)
- **OBJ**
- **STL**
- **DXF** (lines, polylines, circles, arcs, ellipses, splines, 3D faces, and
  inserted blocks)
- **00T** (Maptek Vulcan triangulation surfaces)

Orbit the camera by dragging, zoom with the scroll wheel, and use the viewer
controls to reset the camera or toggle the grid. DXF entities outside the
supported set are skipped and reported after loading. Inserted blocks are
expanded into the geometry they reference.

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run lint
npm run build
```
