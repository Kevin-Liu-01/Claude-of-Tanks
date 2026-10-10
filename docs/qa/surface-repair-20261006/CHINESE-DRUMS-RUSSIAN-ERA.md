# Chinese fuel drums and Russian national ERA

Source implementation and focused physical checks are complete. The first 27 native HIGH screenshots passed a bounded static review; integrated release qualification and final HIGH/LOW/motion review remain pending.

## Chinese drum defect

VT-4A1, ZTZ-99A (`ztz99a2_prototype`) and ZTZ-99A2 used a closed main cylinder plus closed retaining cylinders whose circular end faces occupied the same planes. Their competing depth values caused the broken circular patterns reported by the owner. The native regression reconstructs that exact old arrangement and detects both end faces.

`chineseFuelDrum.ts` gives each end one circular face and uses finite, hollow annular stock for the rims and straps. The retaining rim projects 6 mm beyond the main end face. The repair removes the duplicate surface rather than changing texture resolution or applying a render-order workaround. Existing rear brackets retain physical contact with the hull.

Yun (`cn_t80u_modern`), Kunlun (`cn_t72b3m_modern`) and Qilin (`cn_t72b3_modern`) receive paired drums with individual dimensions, transom-mounted cradles, straps and filler details. Their Chinese packages also change cheek armor, side ERA courses, lighting and rear equipment. Native base hulls, fenders, main-gun assemblies and roof weapons remain in place. Fuel drums are external equipment; their new rear extent must not enlarge the primary combat hull.

The native HIGH/LOW drum regression covers all six vehicles: unique end planes, finite annular rims, receiving-stock contact, cradle/body contact, hull ownership during turret yaw, and retention after ERA loss. Historical duplicate caps and detached supports are negative controls.

Independent review caught main-gun contacts with the first concept-drum placements at legal rearward yaw and gun depression. The drums were lowered and reseated against the actual lower transom; no gun capability was restricted. The corrected native HIGH/LOW check covers 113,400 yaw/pitch/recoil poses with zero contacts. A separate continuous vertical-separation bound includes the entire gun and firing rock: minimum gaps are 104.460 mm (Yun), 64.460 mm (Kunlun), and 74.460 mm (Qilin). The original colliding placements remain negative controls. ERA survival and hull ownership are now observed in actual rendered, draw-range-aware merged buffers, not only pre-merge part records.

## Russian chevrons

Bars-M (`ru_t80u_modern`), Bulat-M (`ru_t72b3m_modern`) and Bastion-M (`ru_t72b3_modern`) replace front square cassettes with 28, 32 and 28 closed upper/lower armor leaves respectively. Opposing rakes form a projecting chevron ridge around the existing welded front cap, cheek and shoulder. The separate side cassettes remain.

Every leaf is fitted to the actual receiving facet with 8 mm of backing insertion, a 4 mm upper/lower service seam and 12 mm neighboring-module seams. Existing left/right ERA damage sectors remove and restore the correct native leaves and hit faces.

Focused HIGH/LOW validation passes 4,400 contact samples and 4,320 hull-sweep poses. An independent full-volume vertical bound covers the angles between those samples: the smallest whole-yaw hull clearance is 20.520 mm. The moving gun retains 36 mm lateral clearance throughout pitch and recoil. Native before/after buffer comparison shows that only the turret applique bucket changes.

## Integration record

- Complete typecheck and public build passed on the authored repair source.
- Attributed native source remains first-party procedural content.
- Regenerated visible fills precede the nine-vehicle source preview; that preview is explicitly labeled as having integrated checks pending.
- Full anatomy, controls, assets and drone-seat regeneration, final HIGH/LOW captures, real Garage verification, the complete test suite and targeted release checks remain separate requirements.
- The final capture matrix includes both drum ends and intact plus independently depleted Russian ERA sectors. Earlier source previews show intact armor only.

## First native preview review

The owner was shown three nine-frame contact sheets covering all nine requested vehicles. The author and an independent reviewer inspected every original drum/ERA closeup. Drum ends show one clean circular face with separated rims; the three lower concept-drum cradles retain visible support. Russian upper/lower wedge leaves seat around the gun throat. Browser errors were empty and all 27 image hashes matched the recorded source-preview freeze (`c9a1b0af` prefix).

Evidence remains under `.qa-dev/surface-repair/newest-preview-evidence/`, with original captures, SHA-256 manifest and independent review. The three frontline overview frames clipped the main-gun muzzle; the final overview camera has been moved back, leaving these provisional originals intact. These intact static previews do not establish LOW detail, damage-state, live Garage, motion or release acceptance.
