# Coupled traffic and building accents

Reproduced the reported all-red condition with the actual 1,978-person high-quality crowd and traffic together: zero central stream admissions over 240 simulated seconds. Three choreographed pedestrians were blocked near (-28, -6) by the lead taxi; the scheduled vehicle green also elapsed while pedestrian occupancy was still present.

The queue now stops 3.5 m farther upstream. Pedestrian clearance holds the end of WALK rather than consuming vehicle green time. Choreographed pedestrians release the crossing after reaching safe sidewalk on the latter half of their route, while continuing their remaining exit walk. Queues use 6.2 m pitch instead of 7.4 m and up to 18 vehicles per route, subject to available upstream space and collision checks. Physical collision checks and pedestrian exclusion remain enabled. Yellow/all-red clearance is intentionally retained.

Added up to 24 sign-mounted accent fixtures with luminous cores and soft depth-tested halos, separate from street lighting. Daylight disables the halos. The overlay is two batches and adds no point lights.

Validation: signal-clearance and accent unit tests pass; central allocation and complete pedestrian-green traffic tests pass; TypeScript passes. The coupled 300-second regression script is scripts/check-coupled-flow.mjs; at 270 seconds, both vehicle axes had run in two cycles and central stream admissions reached 40. In-app night view was inspected after reload. No push performed.
