# Shibuya Reference Site Match

Base: a9b5f75 / Visual QA v12. Current source: commit containing this report; new QA version is reported in the handoff.

## Crowd and choreography
- Tier budgets remain HIGH420 / MEDIUM210 / LOW95. The application explicitly enables the new Scramble choreography option; the original ambient simulation remains available for the existing core regression tests.
- HIGH allocates357 actors (85%) to safe, distinct waiting slots around existing mapped Scramble crossings;63 supporting idle actors retain Hachiko/station/Center-gai presence. Initial357 distinct waiting coordinates, all within80m of the crossing origin. Medium/low preserve the same share with integer rounding.
- Fixed reversible crossing paths replace personal destination search for the357 actors. Existing main crossing groups and diagonal run both directions. Small speed/start offsets remain. WAITING → CROSSING → EXITING → next-cycle reassignment repeats without despawning at the camera or snapping back to a spawn point.
- Scramble actor-to-actor occupancy and avoidance are deliberately bypassed, including exit-person reservations. Vehicle overlap checks, route surface bounds and signal vehicle-clear checks remain. Each entrant holds the existing pedestrian lock until it reaches a safe exit; cars resume after clearance. No O(N²) collision solver or new character mesh pools.
- A full150-second traffic/crowd test measured max357 simultaneous crossers,357 completed crossing routes, major road/vehicle/bounds findings0, signal violations0; both vehicle axes resumed. These are CPU simulation results, not a visual smoothness claim.

## Commercial surfaces, signs and night
- Nearby selected road-facing shop glazing is continuous through floors1–4 within90m, using the existing instanced shop material. No broad upper-floor rebuild.
- Sign placements use tighter central modules and four commercial rows. Total763→734; Scramble16→33, frontage31→35, Center-gai260→275; secondary270→205. Peripheral105 retained. Large Hero screens, intermediate boards, lower bands, blades and roof signs remain separate roles. Placement audit major0. Original atlas/artwork reused; no reference ads copied.
- Existing local ground pool increased modestly (central weight.14→.24, corner.09→.15). Near-origin Hero glass below14m receives a bounded warm commercial emission floor. Existing shop glow, wet/reflections and vehicle/train emissions continue. Dark sky, global exposure and Bloom.18 HIGH remain unchanged. No new real lights, texture sets, render passes or shadow effects.
- Existing fixed camera positions retained. Wider presentation viewport and concentrated crowd change composition without distorting scene geometry.

## UI and verification
- Default compact mode exposes title, camera tabs, day/night, quality and four stats. Details toggle restores the original side panel, module switches and all diagnostic reports. Hidden reports are not rendered in compact mode. Existing ResizeObserver updates camera aspect on panel changes.
- Five new behavior tests PASS.38 relevant existing tests PASS. Final build PASS; existing bundler large-chunk and route-classification warnings remain. A focused crossing-time HIGH→LOW check also PASS: active count converges to95 and signal occupants clear.43 unique tests /44 successful executions total.
- Web reference retrieval failed. Cloud QA preview navigation timed out once; no retries. The prior WebGL2 restriction is still a known environment limitation. Current visual comparison, GPU shader compilation, UI browser behavior and console status are BLOCKED/unverified. No FPS/GPU tris/calls claimed. User-provided earlier30–40fps observations are not measurements of this build.
- Check CAM03 DAY/NIGHT, CAM02 DAY/NIGHT, CAM01 NIGHT and CAM05 DAY/NIGHT on a real device. Final visual PASS and image baseline remain pending. Pedestrian interpenetration within choreographed streams is intentional per this specification; rigid physical crowd realism is not claimed.
- Existing untracked logs preserved. GTA/player/gameplay not implemented. Stop after saving/updating QA.
