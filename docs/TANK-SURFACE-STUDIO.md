# Tank Surface Markup Studio

Run the local studio from the repository root:

```bash
npm run tank:surface-studio
```

The studio is a first-party authoring tool. It excludes roster entries carrying
community attribution and always creates the selected tank with
`proceduralOnly: true`; external/source GLBs are not eligible to load.

## Mark a change

1. Select a tank and a repeatable view preset.
2. Orbit with drag, zoom with the wheel, and adjust hull/turret/gun pose when
   the problem is ownership or clearance related.
3. Choose `Remove`, `Reshape`, or `Add here`.
4. Choose a single triangle or a connected coplanar patch, then click the
   surface. Shift-click adds more selections.
5. Write the intended change in the instruction field. For reshape/add
   requests, include the proposed offset or primitive dimensions.
6. Use **Copy JSON** or **Download** and provide that JSON with the request.
   **Save PNG** creates a matching visual reference with the colored overlays.

The JSON contains the tank and camera pose, articulation ownership, rig path,
mesh and material identity, exact triangle indices, local/world bounds,
selection centroid, hit normal, representative triangles, and the requested
operation. Highlights are parented to the selected mesh, so turret-owned marks
remain attached while testing turret yaw.

## Shortcuts

- `1`: inspect
- `2`: remove
- `3`: reshape
- `4`: add
- `Cmd/Ctrl+Z`: undo the last annotation
- `Delete`: delete the selected annotation
