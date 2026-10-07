# First-party asset provenance

Kevin B. Liu's creator credit is now attached to each procedural vehicle's
`root.userData.provenance`. It includes a stable vehicle ID, copyright, license
and attribution pointers. Three.js preserves serializable `userData` in its
JSON representation and exports it as glTF node `extras`. This is inspectable
metadata, not hidden instructions, geometry perturbation, DRM or telemetry.
It adds no meshes, draw calls, textures or per-frame work.

Every public build writes `dist/asset-provenance.json`: SHA-256 fingerprints of
tracked vehicle/world source and first-party icon, map and FX files, together
with the license policy, notices and attribution record. The receipt records
the source revision and a digest of the ordered file inventory. File hashes
describe the actual build checkout; the revision alone does not assert it was
clean. References, downloaded models, fonts, audio and partner branding are
outside this reviewed scope. Existing embedded and third-party notices always
take precedence; the receipt does not relicense anything.

## Generate and verify

From the repository root:

```sh
node tools/asset-provenance.mjs --write=dist/asset-provenance.json
node tools/asset-provenance.mjs --check=dist/asset-provenance.json
```

Verification compares the complete current tracked inventory and bytes, so
edits, additions, deletions and changes to the license/attribution documents
fail. Preserve a release receipt with its matching source revision. Stage new
intended content before generating a release receipt; untracked work is not a
release input. Ordinary builds generate **unsigned** receipts: their hashes
detect differences against a trusted copy, but anyone can regenerate them.

For a signed release, provide an independently managed Ed25519 key stored
outside the repository:

```sh
node tools/asset-provenance.mjs --write=dist/asset-provenance.json --sign-key=/absolute/private/key.pem
node tools/asset-provenance.mjs --check=dist/asset-provenance.json --public-key=/absolute/trusted/public.pem
```

Signing covers the entire receipt, including creator, revision and file hashes.
Verification requires the trusted public key separately; it never trusts a key
supplied inside the receipt. No key is generated, committed or shipped by this
implementation. Keep an independent signed release archive and public-key
fingerprint if you use this path.

## Limits and research

Metadata can be stripped and unsigned hashes can be replaced. A signature proves
that a key signed specific bytes, not that its holder originated the work. None
of this guarantees legal ownership, prevents copying, or makes a watermark
undetectable by agents. Small hidden mesh distortions would also risk gameplay
geometry and could disappear under remeshing, so they are not used.

The [glTF asset schema](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/asset.schema.json)
provides an explicit copyright field; node extras can carry project metadata.
[C2PA](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)
provides a stronger interoperable framework for signed media provenance and
distinguishes verifiable assertions from judgments about authorship. This small
source receipt is **not C2PA**, and does not claim certification or trusted
timestamping. Use a proper C2PA signing pipeline if exported photos/video need
interoperable Content Credentials.

Regression: `node tools/asset-provenance.selftest.mjs` exercises changed content,
forged credits, wrong keys, inventory drift, path traversal and symlinks.
