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

Orbit the camera by dragging, use the cursor keys to move along X and Y, and use
**Page Up**/**Page Down** to move along Z. Press **Home** to reset to the home
position. Zoom with the scroll wheel, and use the viewer controls to reset the
camera or toggle the grid. Select **Draw area** to enter polygon mode, left-click
to add vertices, and right-click to complete an area. Completed blue areas appear
slightly above the loaded terrain surface and in the scene list; right-click also
exits polygon mode. Toggle polygon mode off or press **Escape** to cancel an
unfinished area. Use **Ctrl+Z** to undo
the last vertex and **Ctrl+Y** or **Ctrl+Shift+Z** to redo it. DXF entities outside the
supported set are skipped and reported after loading. Inserted blocks are
expanded into the geometry they reference.
Select a completed area in the scene list or directly in the viewport to show its
vertex coordinates and highlight its outline.
In move mode, use the mouse-swap control to switch left-drag orbit and right-drag
pan to right-drag orbit and left-drag pan.
Hover over or keyboard-focus a button to see its tooltip.

Once a model is loaded and selected, choose **Load PNG texture** in the
Selection panel to apply a local PNG image. Large PNGs are downscaled to a
maximum 4096-pixel edge before rendering, and the image is flipped vertically
to match the model's coordinate orientation. Vulcan triangulations use their
plan-view coordinates for the image mapping; other models use existing UVs or
a generated planar mapping.
The current model, PNG texture, and completed polygon areas are saved in browser
IndexedDB and restored when the workspace is reopened. The browser manages
storage limits and may evict saved data; the workspace reports when saving
fails. Previously saved local-storage assets are migrated to IndexedDB when the
workspace is opened.

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
