// Reference advertisement inventory measured from the CAM-02 reference frame.
//
// The inventory records where each advertisement sits in the reference image as a
// percentage of the frame, so it is resolution independent but NOT aspect independent:
// the percentages only describe the same world direction when they are unprojected
// through the aspect ratio they were measured at. REFERENCE_VIEW therefore pins the
// measuring frame, and placement always unprojects through that frame rather than the
// viewer's current canvas.
//
// Artwork for these slots is reconstructed procedurally in this repository. No official
// logo files, fonts or brand assets are downloaded or committed. Positions are derived
// from a single reference frame and are approximations, not a surveyed advertising
// inventory.

import {inPolygon} from '../geo/core.mjs';

export const REFERENCE_VIEW = Object.freeze({camera: 'scramble', fov: 50, width: 1491, height: 812});

// id, zone, brand, category, left%, top%, width%, height%, aspect, mount, priority
export const REFERENCE_ADS = Object.freeze([
 {id:1,zone:'left_front_building_1f',brand:'カラオケ BIGECHO',category:'karaoke',left:1.3,top:37.6,width:8.1,height:8.6,aspect:0.942,mount:'wall_panel',priority:'high'},
 {id:2,zone:'left_front_building_1f',brand:'AEON',category:'general_retail',left:9.7,top:37.6,width:3.7,height:3.7,aspect:1.0,mount:'wall_panel',priority:'high'},
 {id:3,zone:'left_front_building_2f',brand:'本 渋谷書店',category:'bookstore',left:10.1,top:46.6,width:8.0,height:3.7,aspect:2.162,mount:'wall_panel',priority:'low'},
 {id:4,zone:'left_front_building_2f',brand:'Cafeレストラン ガスト',category:'family_restaurant_chain',left:18.4,top:43.3,width:7.8,height:2.0,aspect:3.9,mount:'wall_panel',priority:'medium'},
 {id:5,zone:'left_front_building_3f',brand:'7F しゃぶ葉',category:'hotpot_restaurant_chain',left:1.3,top:46.6,width:8.1,height:5.4,aspect:1.5,mount:'wall_panel',priority:'medium'},
 {id:6,zone:'left_front_building_3f',brand:'英会話 イーオン',category:'english_school_chain',left:10.1,top:50.7,width:8.0,height:4.7,aspect:1.702,mount:'wall_panel',priority:'medium'},
 {id:7,zone:'left_front_building_4f',brand:'光回線 イーチカン',category:'internet_isp',left:1.3,top:53.2,width:8.1,height:6.5,aspect:1.246,mount:'wall_panel_small',priority:'low'},
 {id:8,zone:'center_left_vertical',brand:'もんじゃ',category:'okonomiyaki_monja_restaurant',left:23.5,top:32.6,width:4.7,height:11.7,aspect:0.402,mount:'wall_panel_vertical',priority:'medium'},
 {id:9,zone:'left_front_building_5f',brand:'LIVE MAX',category:'karaoke_live_house',left:1.3,top:61.0,width:8.1,height:4.9,aspect:1.653,mount:'wall_panel',priority:'medium'},
 {id:10,zone:'left_front_building_5f',brand:'アコム',category:'consumer_finance',left:10.1,top:59.7,width:8.0,height:6.2,aspect:1.29,mount:'wall_panel',priority:'high'},
 {id:11,zone:'left_front_building_5f',brand:'LUSH',category:'cosmetics_goods',left:18.4,top:61.0,width:7.8,height:4.9,aspect:1.592,mount:'wall_panel',priority:'medium'},
 {id:12,zone:'center_vertical_tower_sign',brand:'SHIBUYA 109',category:'fashion_building',left:26.0,top:20.3,width:2.2,height:3.7,aspect:0.595,mount:'sleeve_sign_vertical',priority:'medium'},
 {id:13,zone:'center_upper_round_logo',brand:'UC',category:'credit_card',left:32.4,top:20.3,width:5.5,height:6.2,aspect:0.887,mount:'wall_panel',priority:'high'},
 {id:14,zone:'center_upper',brand:'龍角散ダイレクト',category:'pharma_throat_medicine',left:37.9,top:21.2,width:5.4,height:5.3,aspect:1.019,mount:'wall_panel',priority:'medium'},
 {id:15,zone:'center_upper_blue',brand:'Hisamitsu',category:'pharma',left:45.1,top:20.9,width:5.7,height:5.6,aspect:1.018,mount:'wall_panel',priority:'high'},
 {id:16,zone:'center_upper_green',brand:'サロンパス',category:'pharma_patch',left:45.1,top:26.8,width:5.7,height:5.0,aspect:1.14,mount:'wall_panel',priority:'high'},
 {id:17,zone:'center_vertical_neon',brand:'もん字',category:'restaurant',left:40.1,top:30.8,width:3.8,height:11.7,aspect:0.325,mount:'neon_sign_vertical',priority:'low'},
 {id:18,zone:'center_right_red_black',brand:'Rakuten',category:'ecommerce',left:45.1,top:36.1,width:6.2,height:7.0,aspect:0.886,mount:'wall_panel',priority:'high'},
 {id:19,zone:'center_right_yellow',brand:'IKEA',category:'furniture_interior',left:52.0,top:31.4,width:5.3,height:4.3,aspect:1.233,mount:'wall_panel',priority:'high'},
 {id:20,zone:'center_right_black',brand:'ACN',category:'corporate_logo_media',left:53.0,top:37.6,width:4.3,height:6.7,aspect:0.642,mount:'wall_panel',priority:'medium'},
 {id:21,zone:'center_lower_vision',brand:'DMM',category:'video_streaming_media',left:46.8,top:48.0,width:4.4,height:5.6,aspect:0.786,mount:'large_led_vision',priority:'medium'},
 {id:22,zone:'center_lower_white',brand:'大盛堂書店',category:'bookstore',left:45.1,top:55.4,width:6.6,height:3.1,aspect:2.129,mount:'wall_panel',priority:'low'},
 {id:23,zone:'right_tower_top',brand:'Coca-Cola',category:'beverage',left:64.1,top:2.5,width:15.0,height:12.3,aspect:1.22,mount:'rooftop_large_led_vision',priority:'critical'},
 {id:24,zone:'right_tower_building_name',brand:'QFRONT',category:'building_name',left:77.5,top:16.6,width:4.3,height:1.9,aspect:2.263,mount:'building_nameplate',priority:'low'},
 {id:25,zone:'right_tower_midlevel',brand:'Start saving now!',category:'finance_banner_ad',left:67.4,top:33.3,width:7.4,height:11.0,aspect:0.673,mount:'large_led_vision',priority:'medium'},
 {id:26,zone:'right_building_1f',brand:'STARBUCKS',category:'cafe_chain',left:64.4,top:57.3,width:4.0,height:1.8,aspect:2.222,mount:'facade_logo',priority:'high'},
 {id:27,zone:'right_building_1f',brand:'TSUTAYA',category:'rental_bookstore',left:74.1,top:61.0,width:6.1,height:2.4,aspect:2.542,mount:'facade_logo',priority:'medium'},
 {id:28,zone:'right_edge_building_vertical',brand:'SEIBU',category:'department_store',left:86.3,top:34.5,width:1.2,height:17.2,aspect:0.07,mount:'sleeve_sign_vertical_banner',priority:'medium'},
 {id:29,zone:'right_edge_building_green',brand:'CITY DRUG',category:'drugstore',left:90.2,top:61.0,width:9.7,height:8.0,aspect:1.212,mount:'wall_panel',priority:'low'},
 {id:30,zone:'right_edge_building_red',brand:'サンドラッグ',category:'drugstore',left:90.2,top:69.6,width:9.7,height:8.0,aspect:1.212,mount:'wall_panel',priority:'high'}
]);

/**
 * Panels this scene adds that the reference frame does not show.
 *
 * REFERENCE_ADS is a transcription of one photograph and stays that way, so anything the
 * scene hangs for its own reasons lives here instead of being smuggled into the inventory.
 * These are placed only by anchor — they have no measured position to raycast from — and
 * their ids start at 101 so they can never collide with an inventory entry.
 *
 * `textless` panels carry artwork instead of a name, the way a vision screen runs a key
 * visual rather than a wordmark.
 */
export const EXTRA_PANELS = Object.freeze([
 {id: 101, zone: 'centre_block_vision_lower', brand: 'アニメ キービジュアル', category: 'anime_key_visual',
  left: 0, top: 0, width: 0, height: 0, aspect: 1, mount: 'large_led_vision', priority: 'medium',
  textless: true, extra: true},
 // The MAGNET facade carries these itself: the hero builder already puts them on measured
 // walls, so they are listed here only to own artwork, and excluded from the raycast pass
 // below. A sign reaches them through its anchor's brandArt id.
 {id: 201, zone: 'right_tower_wordmark', brand: 'MAGNET', category: 'building_name',
  left: 0, top: 0, width: 0, height: 0, aspect: 3.75, mount: 'facade_logo', priority: 'high',
  hero: 'magnet', extra: true},
 {id: 202, zone: 'right_tower_return_panel', brand: 'N°5', category: 'fashion_retail',
  left: 0, top: 0, width: 0, height: 0, aspect: .375, mount: 'wall_panel_vertical', priority: 'medium',
  hero: 'magnet', extra: true},
 {id: 203, zone: 'right_tower_vision', brand: 'MAGNET ビジョン', category: 'culture_key_visual',
  left: 0, top: 0, width: 0, height: 0, aspect: 2, mount: 'large_led_vision', priority: 'high',
  hero: 'magnet', textless: true, extra: true}
]);

/** Everything that can be placed: the inventory plus the scene's own additions. */
export const PANELS = Object.freeze([...REFERENCE_ADS, ...EXTRA_PANELS]);

// Buildings this scene actually has where the reference frame's centre block sits.
//
// The inventory percentages describe the reference image, and the reference image is not
// this scene: its centre block is a single tall tower, ours is a row of 14-24 m blocks at a
// different bearing, so an unprojected sight line through those percentages lands on a
// neighbouring plot, on the road, or on nothing at all. For that block the percentages are
// therefore read as an arrangement rather than as a direction — which advertisement sits
// above which, and how large each is relative to its neighbours — and the arrangement is
// mapped onto the facade a viewer can actually see. Keys come from the scene's own
// building data, not from the reference.
// Chosen by measured visible wall area, not by facing. The plot immediately left of QFRONT,
// where the reference puts these signs, keeps only a 2.9 m strip of its 14 m facade clear of
// the blocks in front at any height below 58 m, and even then the advertisements resolve
// about a third of the size. This wall is one block further west than the reference's, and
// shows 28.4 x 38.0 m completely unobstructed.
const CENTRE_BLOCK = 'way/136690966:0:0';   // 118 m out, raised to 38 m, fully visible

// Three, not the reference's six. A column of six on this wall resolves each panel at about
// half the width, and the reference stack's own neighbours (Hisamitsu, サロンパス, もん字)
// belong to a taller building than this plot has. Carrying the three that name the block —
// the sheet, the vision below it and the bookshop fascia at its foot — keeps each large
// enough to read.
export const AD_ANCHORS = Object.freeze({
 18: CENTRE_BLOCK, 21: CENTRE_BLOCK, 22: CENTRE_BLOCK, 101: CENTRE_BLOCK
});

// Which wall of an anchored host carries its group. The centre block's signs hang on the
// narrow return that faces QFRONT, not on the broad west face the visibility scan would
// otherwise choose — see bestCameraEdge for what that costs and why it is worth it.
export const AD_ANCHOR_FACE = Object.freeze({[CENTRE_BLOCK]: 'rightmost'});

/**
 * Where the centre block's advertisements sit on their wall, as bands rather than as a
 * stack, taken from a photograph of the real building.
 *
 * Two earlier attempts got this wrong for the same reason: they derived position from the
 * reference frame's percentages. Those describe a facade seen nearly head-on, so
 * unprojecting them through a view that meets this wall at about 39 degrees divides the
 * width by the foreshortening and turns the portrait vision screen into a landscape one —
 * the right share of the frame, the wrong object. Stacking the results top to bottom then
 * chose the vertical positions by arithmetic rather than by where the signs actually hang.
 *
 * So the band is stated directly. `width` is a share of the usable wall; `top` and `bottom`
 * are heights up the host, 0 at the pavement and 1 at the roof. Each advertisement is
 * independent, which is what lets the vision run the full width of the building from just
 * under the sheet down to its middle, and the bookshop fascia sit just clear of the lit
 * ground floor instead of wherever a stack happens to end.
 */
export const ANCHOR_SHAPES = Object.freeze({
 18: {width: .72, top: .99, bottom: .87},  // the sheet across the top
 21: {width: 1, top: .86, bottom: .50},    // the vision, full width, down to the building's middle
 // The storey between the vision and the fascia, which the other three left bare: a key
 // visual with no wordmark, the way the block's real vision screen runs one.
 101: {width: .95, top: .48, bottom: .27},
 // The bookshop fascia: the building's full width, from just above the lit ground-floor
 // windows up to the storey below the vision. It is the nearest of the three to the camera
 // and the one a passer-by reads, so it gets the depth the other two do not need.
 // `shift` moves it across the FRAME, as a share of the usable wall — negative is toward
 // the left of the picture, whichever way the wall's own tangent happens to run.
 // `clearAbove` reserves wall above it, as a share of its own height: the storey over the
 // fascia carries a generated panel that only clips its top edge, too little to trip the
 // clutter test but enough to crowd the one sign a passer-by is meant to read.
 22: {width: .95, top: .24, bottom: .075, shift: -.02, clearAbove: 1.1}
});

// How much of a wall a group may be squeezed into before it is not worth carrying. Below
// this the panels resolve smaller than the procedural stickers around them and read as
// litter on the facade rather than as the advertisements they are.
export const MIN_ANCHOR_FIT = .12;

// Advertisements deliberately left out of this scene. Recorded rather than deleted so the
// inventory stays a complete transcription of the reference frame.
export const EXCLUDED_ADS = Object.freeze({12: 'out-of-scope-for-this-scene',
 201: 'carried-by-the-hero-facade', 202: 'carried-by-the-hero-facade', 203: 'carried-by-the-hero-facade'});

// Mount types describe how the advertisement is carried, which decides both the sign
// category used for placement auditing and how brightly the face is driven at night.
export const MOUNT_CATEGORY = Object.freeze({
 wall_panel: 'billboard', wall_panel_small: 'flush', wall_panel_vertical: 'blade',
 sleeve_sign_vertical: 'blade', sleeve_sign_vertical_banner: 'blade', neon_sign_vertical: 'blade',
 large_led_vision: 'screen', rooftop_large_led_vision: 'rooftop', facade_logo: 'box',
 building_nameplate: 'rooftop'
});

// Rooftop mounts stand above the roofline, so a ray aimed at them passes over every
// facade and would otherwise land on whatever happens to be far behind.
export const ROOF_MOUNTS = new Set(['rooftop_large_led_vision', 'building_nameplate']);

// A wall panel that resolves far wider than its mount type ever gets built is a sign that
// the ray found the wrong wall, not that Shibuya has a 30 m karaoke panel.
export const MAX_WIDTH = Object.freeze({
 rooftop_large_led_vision: 44, large_led_vision: 28, wall_panel: 26, wall_panel_small: 20,
 wall_panel_vertical: 12, facade_logo: 16, building_nameplate: 22,
 sleeve_sign_vertical: 9, sleeve_sign_vertical_banner: 9, neon_sign_vertical: 12
});

// A blade stands perpendicular to its facade, so its "width" is how far it reaches out over
// the street rather than how wide it reads on the wall. The placement audit rejects a blade
// projecting more than 1.1 m, and a placement reaches width / 2 + .16 m out, so a blade
// sized like a painted panel is always rejected however well it was aimed. Sizing blades to
// this instead keeps the tall narrow proportions a 袖看板 actually has. The 2 cm is slack:
// the audit compares strictly, so a width that lands exactly on the limit still fails.
export const MAX_BLADE_WIDTH = (1.1 - .16) * 2 - .02;

/** Width a mount can actually be built at on a facade. */
export function fitMount(category, width) {
 return category === 'blade' ? Math.min(width, MAX_BLADE_WIDTH) : width;
}

// Hits past this range are behind the buildings the reference frame actually shows.
export const MAX_RANGE = 220;
// Below this the facade is too edge-on for the recorded screen coverage to mean anything.
export const MIN_FACING = .3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const unit = a => {const l = Math.hypot(...a); if (!(l > 0)) throw Error('Zero-length vector'); return scale(a, 1 / l);};

/** Camera basis for the frame the inventory percentages were measured in. */
export function referenceBasis(camera, view = REFERENCE_VIEW) {
 const origin = camera.position, forward = unit(sub(camera.target, origin));
 const right = unit(cross(forward, [0, 1, 0])), up = cross(right, forward);
 return {origin, forward, right, up, tanHalf: Math.tan(view.fov * Math.PI / 360), aspect: view.width / view.height};
}

/**
 * World-space ray through a point in an inventory rectangle, given as fractions of the
 * rectangle (0,0 is its top-left corner and .5,.5 its centre).
 */
export function adRay(ad, basis, u = .5, v = .5) {
 const ndcX = (ad.left + ad.width * u) / 50 - 1, ndcY = 1 - (ad.top + ad.height * v) / 50;
 const x = ndcX * basis.tanHalf * basis.aspect, y = ndcY * basis.tanHalf;
 return {origin: basis.origin, direction: unit([
  basis.right[0] * x + basis.up[0] * y + basis.forward[0],
  basis.right[1] * x + basis.up[1] * y + basis.forward[1],
  basis.right[2] * x + basis.up[2] * y + basis.forward[2]])};
}

function hostEdges(polygon) {
 return polygon.outer.map((a, i) => {
  const b = polygon.outer[(i + 1) % polygon.outer.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return {a, b, length, tangent, normal: [tangent[1], -tangent[0]], index: i};
 }).filter(e => e.length > .1);
}

/**
 * Nearest front-facing facade hit by the ray, treating every host as a vertical prism
 * between its own bottom and top. Back faces are ignored so a ray never lands on the far
 * wall of the building it entered.
 */
export function intersectHosts(ray, hosts, minFacing = MIN_FACING) {
 let best = null;
 for (const host of hosts) {
  for (const e of hostEdges(host.polygon)) {
   const normal = [e.normal[0], 0, e.normal[1]], denom = dot(normal, ray.direction);
   if (denom > -minFacing) continue; // facing away, or too edge-on to size reliably
   const t = dot(normal, [e.a[0] - ray.origin[0], -ray.origin[1], e.a[1] - ray.origin[2]]) / denom;
   if (!(t > 0) || (best && t >= best.distance)) continue;
   const point = [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
   if (point[1] < host.bottom || point[1] > host.top) continue;
   const along = (point[0] - e.a[0]) * e.tangent[0] + (point[2] - e.a[1]) * e.tangent[1];
   if (along < 0 || along > e.length) continue;
   best = {host, edge: e, point, along, distance: t};
  }
 }
 return best;
}

/**
 * World width and height that make the advertisement cover its recorded share of the
 * reference frame. Screen coverage shrinks as a facade turns away from the camera, so the
 * width is divided by how much of the facade tangent survives projection onto the screen.
 */
export function worldSize(ad, basis, hit) {
 const depth = dot(sub(hit.point, basis.origin), basis.forward);
 const tangent = [hit.edge.tangent[0], 0, hit.edge.tangent[1]];
 const foreshortening = Math.abs(dot(tangent, basis.right)), rise = Math.abs(dot([0, 1, 0], basis.up));
 const width = (ad.width / 50) * depth * basis.tanHalf * basis.aspect / Math.max(foreshortening, .15);
 const height = (ad.height / 50) * depth * basis.tanHalf / Math.max(rise, .15);
 return {width, height, depth, foreshortening};
}

/**
 * Host carrying a rooftop mount: the nearest building whose roof plane the ray crosses
 * inside the footprint. The ray is aimed at the foot of the rectangle, which is where the
 * sign meets the roof it stands on.
 */
export function roofHost(ad, basis, hosts) {
 const ray = adRay(ad, basis, .5, 1);
 if (!(ray.direction[1] < -1e-6)) return groundedRoofHost(ray, hosts);
 let best = null;
 for (const host of hosts) {
  const t = (host.top - ray.origin[1]) / ray.direction[1];
  if (!(t > 0) || (best && t >= best.distance)) continue;
  const point = [ray.origin[0] + ray.direction[0] * t, host.top, ray.origin[2] + ray.direction[2] * t];
  if (!inPolygon([point[0], point[2]], host.polygon)) continue;
  const facing = hostEdges(host.polygon)
   .map(e => ({e, facing: -dot([e.normal[0], 0, e.normal[1]], basis.forward)}))
   .sort((a, b) => b.facing - a.facing)[0];
  if (!facing || facing.facing < MIN_FACING) continue;
  const along = (point[0] - facing.e.a[0]) * facing.e.tangent[0] + (point[2] - facing.e.a[1]) * facing.e.tangent[1];
  best = {host, edge: facing.e, point, along: Math.min(Math.max(along, 0), facing.e.length), distance: t};
 }
 return best ?? groundedRoofHost(ray, hosts);
}

/**
 * Fallback for a rooftop sign whose reference building is taller than anything this scene
 * has in that direction: stand it on the roof of the nearest tall building the sight line
 * passes over. The sign then sits lower in frame than the reference, but on a real roof
 * instead of floating, and the caller is told the host was lowered.
 */
export function groundedRoofHost(ray, hosts, minHeight = 18) {
 let best = null;
 for (const host of hosts) {
  if (host.top < minHeight) continue;
  for (const e of hostEdges(host.polygon)) {
   const normal = [e.normal[0], 0, e.normal[1]], denom = dot(normal, ray.direction);
   if (denom > -MIN_FACING) continue;
   const t = dot(normal, [e.a[0] - ray.origin[0], 0, e.a[1] - ray.origin[2]]) / (normal[0] * ray.direction[0] + normal[2] * ray.direction[2]);
   if (!(t > 0) || (best && t >= best.distance)) continue;
   const point = [ray.origin[0] + ray.direction[0] * t, host.top, ray.origin[2] + ray.direction[2] * t];
   const along = (point[0] - e.a[0]) * e.tangent[0] + (point[2] - e.a[1]) * e.tangent[1];
   if (along < 0 || along > e.length) continue;
   best = {host, edge: e, point, along, distance: t, lowered: true};
  }
 }
 return best;
}

// Sampling resolution for the visibility scan. Fine enough to find the gap a foreground
// block leaves, coarse enough that the scan stays a few milliseconds of render-time work.
const SCAN_COLUMNS = 24, SCAN_ROWS = 20;

/**
 * Walls that could stand between the camera and a target at most `reach` away, flattened
 * once per scan. Rebuilding the edge list inside the sample loop costs seconds per wall;
 * hoisting it and dropping everything behind the target costs milliseconds.
 */
function blockerEdges(basis, hosts, self, reach) {
 const out = [];
 for (const host of hosts) {
  if (host === self) continue;
  for (const e of hostEdges(host.polygon)) {
   const near = Math.min(
    Math.hypot(e.a[0] - basis.origin[0], e.a[1] - basis.origin[2]),
    Math.hypot(e.b[0] - basis.origin[0], e.b[1] - basis.origin[2]));
   if (near > reach) continue; // entirely behind the wall being scanned
   out.push({ax: e.a[0], az: e.a[1], tx: e.tangent[0], tz: e.tangent[1],
    nx: e.normal[0], nz: e.normal[1], length: e.length, bottom: host.bottom, top: host.top});
  }
 }
 return out;
}

/** Is anything standing between the camera and this point on a wall? */
function occluded(point, basis, edges, reach) {
 const ox = basis.origin[0], oy = basis.origin[1], oz = basis.origin[2];
 const span = Math.hypot(point[0] - ox, point[1] - oy, point[2] - oz);
 const dx = (point[0] - ox) / span, dy = (point[1] - oy) / span, dz = (point[2] - oz) / span;
 for (const e of edges) {
  const denom = e.nx * dx + e.nz * dz;
  if (denom > -1e-9 && denom < 1e-9) continue;
  const t = (e.nx * (e.ax - ox) + e.nz * (e.az - oz)) / denom;
  if (!(t > .5) || t >= reach - .5) continue;
  const y = oy + dy * t;
  if (y < e.bottom || y > e.top) continue;
  const along = (ox + dx * t - e.ax) * e.tx + (oz + dz * t - e.az) * e.tz;
  if (along >= 0 && along <= e.length) return true;
 }
 return false;
}

/** Largest all-true axis-aligned block in a row-major grid, as {col, row, width, height} in cells. */
function largestBlock(grid, columns, rows) {
 const heights = new Array(columns).fill(0);
 let best = {col: 0, row: 0, width: 0, height: 0, area: 0};
 for (let row = 0; row < rows; row++) {
  for (let c = 0; c < columns; c++) heights[c] = grid[row * columns + c] ? heights[c] + 1 : 0;
  // Standard histogram sweep: each bar is extended left and right while the bars stay tall.
  const stack = [];
  for (let c = 0; c <= columns; c++) {
   const h = c < columns ? heights[c] : 0;
   while (stack.length && heights[stack[stack.length - 1]] >= h) {
    const top = stack.pop(), height = heights[top];
    const leftEdge = stack.length ? stack[stack.length - 1] + 1 : 0;
    const area = height * (c - leftEdge);
    if (area > best.area) best = {col: leftEdge, row: row - height + 1, width: c - leftEdge, height, area};
   }
   stack.push(c);
  }
 }
 return best;
}

/**
 * The largest unbroken patch of a wall the camera can actually see, as fractions of the
 * wall. A facade that faces the viewer is not the same as a facade the viewer can see: in a
 * street this dense a nearer block routinely hides most of one, and a group laid across the
 * whole wall then puts four of its six advertisements behind a building.
 */
export function visibleWallPatch(host, edge, basis, hosts) {
 const height = host.top - host.bottom;
 if (!(edge.length > 0 && height > 0)) return null;
 const corners = [edge.a, edge.b].map(p => Math.hypot(p[0] - basis.origin[0], p[1] - basis.origin[2]));
 const edges = blockerEdges(basis, hosts, host, Math.max(...corners));
 const grid = new Uint8Array(SCAN_COLUMNS * SCAN_ROWS);
 for (let row = 0; row < SCAN_ROWS; row++) {
  const y = host.top - (row + .5) / SCAN_ROWS * height;
  for (let c = 0; c < SCAN_COLUMNS; c++) {
   const along = (c + .5) / SCAN_COLUMNS * edge.length;
   const point = [edge.a[0] + edge.tangent[0] * along + edge.normal[0] * .25, y,
    edge.a[1] + edge.tangent[1] * along + edge.normal[1] * .25];
   const reach = Math.hypot(point[0] - basis.origin[0], point[1] - basis.origin[1], point[2] - basis.origin[2]);
   grid[row * SCAN_COLUMNS + c] = occluded(point, basis, edges, reach) ? 0 : 1;
  }
 }
 const block = largestBlock(grid, SCAN_COLUMNS, SCAN_ROWS);
 if (!block.area) return null;
 return {
  along: [block.col / SCAN_COLUMNS * edge.length, (block.col + block.width) / SCAN_COLUMNS * edge.length],
  y: [host.top - (block.row + block.height) / SCAN_ROWS * height, host.top - block.row / SCAN_ROWS * height],
  coverage: block.area / (SCAN_COLUMNS * SCAN_ROWS)
 };
}

/** Where the midpoint of a wall falls across the reference frame, 0 at the left edge, 100 at the right. */
function edgeFramePosition(edge, host, basis) {
 const mid = [(edge.a[0] + edge.b[0]) / 2, (host.bottom + host.top) / 2, (edge.a[1] + edge.b[1]) / 2];
 const d = sub(mid, basis.origin), z = dot(d, basis.forward);
 if (z <= .01) return -Infinity;
 return (dot(d, basis.right) / (z * basis.tanHalf * basis.aspect) + 1) * 50;
}

/**
 * The facade of a host that carries an anchored group.
 *
 * By default this is the wall showing the largest unbroken patch a viewer can actually see,
 * which is not the same as the widest wall facing the camera — the broadest facade of a
 * building in a street this dense is often the one behind its neighbour.
 *
 * `prefer: 'rightmost'` overrides that with the camera-facing wall furthest right in the
 * frame. On the centre block that is the narrow return facing QFRONT, which is where these
 * signs actually hang; it carries less than a third of the area the broad west face does,
 * and the advertisements resolve correspondingly smaller. That cost is accepted, because
 * being on the right wall is the point of a reference inventory.
 */
export function bestCameraEdge(host, basis, hosts = null, {prefer = 'visible', minFacing = MIN_FACING} = {}) {
 let best = null;
 for (const edge of hostEdges(host.polygon)) {
  const facing = -dot([edge.normal[0], 0, edge.normal[1]], basis.forward);
  if (facing < minFacing) continue;
  const patch = hosts ? visibleWallPatch(host, edge, basis, hosts) : null;
  const score = prefer === 'rightmost' ? edgeFramePosition(edge, host, basis)
   : patch ? (patch.along[1] - patch.along[0]) * (patch.y[1] - patch.y[0])
   : facing * edge.length;
  if (!best || score > best.score) best = {edge, facing, score, patch};
 }
 return best;
}

// Advertisements this close together in the frame share a column of the facade, so they
// have to be stacked clear of each other rather than laid out independently.
const COLUMN_OVERLAP = .2;
// Bare wall left between two advertisements in a column.
const MIN_GAP = .25;
// The ground floor is the shop, and in this scene it is a band of bright lit storefront.
// Signage starts above it on a real building, and an advertisement hung across it here is
// simply washed out — which is what happened to 大盛堂書店 at the foot of the centre stack.
export const SHOPFRONT_CLEARANCE = 4.5;

/** Advertisements sharing a column of the wall, ordered top to bottom. */
function stackColumns(ads) {
 const columns = [];
 for (const ad of [...ads].sort((a, b) => a.left - b.left)) {
  const share = columns.find(col => col.some(o => {
   const over = Math.min(o.left + o.width, ad.left + ad.width) - Math.max(o.left, ad.left);
   return over > COLUMN_OVERLAP * Math.min(o.width, ad.width);
  }));
  if (share) share.push(ad); else columns.push([ad]);
 }
 for (const col of columns) col.sort((a, b) => a.top - b.top);
 return columns;
}

/**
 * Lay a group of anchored advertisements onto one facade.
 *
 * Each advertisement's rectangle is unprojected at the facade's own depth and
 * foreshortening, giving the world size it would need to cover the same share of the view,
 * and all of them are then scaled by one factor so every proportion survives.
 *
 * What does *not* survive is the empty wall between them. The reference building is around
 * twice the height of the one this scene has on that bearing, so preserving the stack's
 * full vertical extent would shrink the advertisements themselves to half size to fit —
 * which is what made them unreadable. The gaps are compressed instead, down to a minimum,
 * exactly as a sign contractor fitting the same set to a shorter building would. Each
 * column is solved separately, so a blade beside the stack keeps its own room.
 */
export function placeAnchorGroup(ads, host, basis, hosts) {
 const pick = bestCameraEdge(host, basis, hosts, {prefer: AD_ANCHOR_FACE[host.key]});
 if (!pick) return null;
 const {edge} = pick;
 const mid = [(edge.a[0] + edge.b[0]) / 2, (host.bottom + host.top) / 2, (edge.a[1] + edge.b[1]) / 2];
 const depth = dot(sub(mid, basis.origin), basis.forward);
 if (!(depth > 0)) return null;
 const foreshortening = Math.abs(dot([edge.tangent[0], 0, edge.tangent[1]], basis.right));
 const rise = Math.abs(dot([0, 1, 0], basis.up));

 const left = Math.min(...ads.map(a => a.left)), right = Math.max(...ads.map(a => a.left + a.width));
 const spanX = right - left;
 if (!(spanX > 0)) return null;

 // Screen percentage -> world metres on this wall, one factor per axis.
 const perX = depth * basis.tanHalf * basis.aspect / Math.max(foreshortening, .15) / 50;
 const perY = depth * basis.tanHalf / Math.max(rise, .15) / 50;
 const groupWidth = spanX * perX;

 // Confine the group to the part of the wall the camera can actually see. Without this a
 // stack laid down a 24 m facade puts its lower half behind whatever stands in front.
 const patch = pick.patch;
 const lowAlong = (patch?.along[0] ?? 0) + WALL_MARGIN, highAlong = (patch?.along[1] ?? edge.length) - WALL_MARGIN;
 const floor = Math.max(patch?.y[0] ?? host.bottom, host.bottom + SHOPFRONT_CLEARANCE) + WALL_MARGIN;
 const ceiling = (patch?.y[1] ?? host.top) - WALL_MARGIN;
 const usableX = highAlong - lowAlong, usableY = ceiling - floor;
 if (!(usableX > 1 && usableY > 1)) return null;

 const centre = lowAlong + usableX / 2;
 // Does running further along this wall move right or left across the frame? Bands state
 // their shift in frame terms, so the wall's own winding must not decide which way they go.
 const rightward = dot([edge.tangent[0], 0, edge.tangent[1]], basis.right) >= 0 ? 1 : -1;
 const out = [];

 // An advertisement with a stated band owns its own piece of the wall, so it is placed
 // directly and takes no part in the stacking below.
 const banded = ads.filter(ad => ANCHOR_SHAPES[ad.id]);
 const span = host.top - host.bottom;
 for (const ad of banded) {
  const shape = ANCHOR_SHAPES[ad.id];
  const category = MOUNT_CATEGORY[ad.mount] ?? 'billboard';
  const top = Math.min(host.bottom + shape.top * span, ceiling);
  const bottom = Math.max(host.bottom + shape.bottom * span, host.bottom + WALL_MARGIN);
  const h = top - bottom;
  const w = fitMount(category, Math.min(shape.width * usableX, MAX_WIDTH[ad.mount] ?? 18));
  if (!(h > .3 && w > .4)) continue;
  const y = (top + bottom) / 2;
  const along = Math.min(Math.max(centre + rightward * (shape.shift ?? 0) * usableX, lowAlong + w / 2), highAlong - w / 2);
  out.push({ad, host, edge, along, y,
   point: [edge.a[0] + edge.tangent[0] * along, y, edge.a[1] + edge.tangent[1] * along],
   distance: depth, rayWidth: shape.width * usableX, width: w, height: h,
   foreshortening, roof: false, lowered: false, anchored: true, anchoredWith: ads.length,
   banded: true, clearAbove: shape.clearAbove ?? 0, visibleCoverage: patch?.coverage ?? 1,
   clamped: w < shape.width * usableX - 1e-6, category});
 }

 const rest = ads.filter(ad => !ANCHOR_SHAPES[ad.id]);
 if (!rest.length) return out.length ? out : {tooSmall: true, fit: 0, patch};

 const sized = new Map(rest.map(ad => [ad.id, {w: ad.width * perX, h: ad.height * perY}]));
 const columns = stackColumns(rest);
 let fit = 1;
 for (const ad of rest) {
  const {w} = sized.get(ad.id);
  // A mount type that never gets built at the resolved width shrinks the whole group, so
  // the arrangement stays intact instead of one panel being squashed out of proportion.
  fit = Math.min(fit, (MAX_WIDTH[ad.mount] ?? 18) / w, usableX / w);
 }
 // Each column must fit its own advertisements plus the minimum wall between them.
 for (const col of columns) {
  const room = usableY - (col.length - 1) * MIN_GAP;
  if (room <= 0) return {tooSmall: true, fit: 0, patch};
  fit = Math.min(fit, room / col.reduce((total, ad) => total + sized.get(ad.id).h, 0));
 }
 if (fit < MIN_ANCHOR_FIT) return {tooSmall: true, fit, patch};

 const width = groupWidth * fit;
 for (const col of columns) {
  const heights = col.map(ad => sized.get(ad.id).h * fit);
  const stack = heights.reduce((a, b) => a + b, 0);
  // Keep the reference spacing where the wall allows it, and take the slack out of the gaps
  // — never out of the advertisements — where it does not. The gap is measured against the
  // panel above it rather than unprojected on its own, so a stated shape carries its
  // spacing with it instead of keeping a gap scaled for the size it is not.
  const wanted = col.slice(1).map((ad, i) =>
   Math.max(0, (ad.top - (col[i].top + col[i].height)) * heights[i] / col[i].height));
  const slack = usableY - stack - (col.length - 1) * MIN_GAP;
  const over = wanted.reduce((total, g) => total + Math.max(0, g - MIN_GAP), 0);
  const squeeze = over > 1e-9 ? Math.min(1, slack / over) : 0;
  const gaps = wanted.map(g => MIN_GAP + Math.max(0, g - MIN_GAP) * squeeze);

  let cursor = ceiling;
  col.forEach((ad, i) => {
   if (i) cursor -= gaps[i - 1];
   const category = MOUNT_CATEGORY[ad.mount] ?? 'billboard';
   const h = heights[i], y = cursor - h / 2;
   cursor -= h;
   const w = fitMount(category, sized.get(ad.id).w * fit);
   const along = lowAlong + (usableX - width) / 2 + (ad.left + ad.width / 2 - left) * perX * fit;
   out.push({ad, host, edge, along, y,
    point: [edge.a[0] + edge.tangent[0] * along, y, edge.a[1] + edge.tangent[1] * along],
    distance: depth, rayWidth: sized.get(ad.id).w, width: w, height: h,
    foreshortening, roof: false, lowered: false, anchored: true, anchoredWith: ads.length,
    column: col.length, visibleCoverage: patch?.coverage ?? 1, clamped: fit < 1 - 1e-6, category});
  });
 }
 return out;
}

/**
 * Resolve the inventory against real hosts. A slot is only accepted when the ray lands on
 * a facade that faces the camera, within the range the reference frame covers, and at a
 * size its mount type is actually built at. Everything else is reported with a reason:
 * those advertisements belong to buildings this scene does not have yet, and inventing a
 * wall for them would put them somewhere the reference never showed them.
 */
export function resolveReferenceAds(hosts, camera, view = REFERENCE_VIEW) {
 const basis = referenceBasis(camera, view), placed = [], unplaced = [];
 const byKey = new Map(hosts.map(h => [h.key, h]));
 const anchorGroups = new Map();
 // PANELS, not REFERENCE_ADS: the scene's own additions are placed by anchor only, and the
 // raycast pass below stays with the inventory, which is the only thing it can aim.
 for (const ad of PANELS) {
  const key = AD_ANCHORS[ad.id];
  if (!key || EXCLUDED_ADS[ad.id]) continue;
  if (!anchorGroups.has(key)) anchorGroups.set(key, []);
  anchorGroups.get(key).push(ad);
 }
 for (const [key, ads] of anchorGroups) {
  const host = byKey.get(key);
  const group = host ? placeAnchorGroup(ads, host, basis, hosts) : null;
  if (Array.isArray(group)) {placed.push(...group); continue;}
  const reason = !host ? 'anchor-host-missing'
   : group?.tooSmall ? 'anchor-wall-too-hidden-to-read'
   : 'anchor-host-has-no-usable-facade';
  for (const ad of ads) unplaced.push({...ad, reason, anchor: key, ...(group?.fit ? {fit: group.fit} : {})});
 }

 // Exclusions are swept over PANELS, not just the inventory: a panel the scene adds for a
 // hero facade to carry is excluded here too, and it still has to be reported rather than
 // vanish from the accounting.
 for (const ad of PANELS) if (EXCLUDED_ADS[ad.id]) unplaced.push({...ad, reason: EXCLUDED_ADS[ad.id], excluded: true});

 for (const ad of REFERENCE_ADS) {
  if (EXCLUDED_ADS[ad.id]) continue;
  if (AD_ANCHORS[ad.id]) continue;
  const roof = ROOF_MOUNTS.has(ad.mount);
  const hit = roof ? roofHost(ad, basis, hosts) : intersectHosts(adRay(ad, basis), hosts);
  if (!hit) {unplaced.push({...ad, reason: roof ? 'no-roof-under-ray' : 'no-host-on-ray'}); continue;}
  if (hit.distance > MAX_RANGE) {unplaced.push({...ad, reason: 'host-beyond-reference-range', distance: hit.distance}); continue;}
  const size = worldSize(ad, basis, hit);
  // A wall running away from the camera shows almost no width on screen, so the recorded
  // screen coverage would demand an implausibly long sign. That is the wrong wall.
  if (size.foreshortening < MIN_FACING) {unplaced.push({...ad, reason: 'facade-recedes-from-view', foreshortening: size.foreshortening}); continue;}
  const limit = MAX_WIDTH[ad.mount] ?? 18;
  if (size.width > limit) {unplaced.push({...ad, reason: 'resolved-wider-than-mount-allows', width: size.width, limit}); continue;}
  // Trim to the wall it landed on rather than overhanging a corner or the roofline.
  const category = MOUNT_CATEGORY[ad.mount] ?? 'billboard';
  const margin = .3, room = hit.edge.length - margin * 2;
  const width = fitMount(category, Math.min(size.width, room));
  const span = hit.host.top - hit.host.bottom - margin * 2;
  const height = Math.min(size.height, roof ? size.height : span);
  if (!(width > .4 && height > .3)) {unplaced.push({...ad, reason: 'no-room-on-host-face'}); continue;}
  const along = Math.min(Math.max(hit.along, width / 2 + margin), hit.edge.length - width / 2 - margin);
  const y = roof
   ? hit.host.top + height / 2
   : Math.min(Math.max(hit.point[1], hit.host.bottom + height / 2 + margin), hit.host.top - height / 2 - margin);
  placed.push({ad, host: hit.host, edge: hit.edge, along, y, point: hit.point, distance: hit.distance, rayWidth: size.width,
   width, height, foreshortening: size.foreshortening, roof, lowered: !!hit.lowered,
   clamped: width < size.width - 1e-6 || height < size.height - 1e-6, category});
 }
 return {basis, placed: fitGroupsToWalls(placed), unplaced};
}

// A wall needs this much clear edge around its advertisements.
const WALL_MARGIN = .3;
// Below this many advertisements a shared wall is not a facade grid, so each one keeps the
// size the raycast gave it rather than being stretched to fill the wall.
const GRID_MINIMUM = 3;

/**
 * Re-lay advertisements that share a wall.
 *
 * Each slot is sized independently from its own screen coverage, which is right in
 * isolation but collides once several slots land on the same facade: the reference frame's
 * left block carries nine advertisements across a facade far wider than the wall this
 * scene models, so nine correctly-sized panels overlap into an unreadable stack.
 *
 * For a wall carrying a grid of them, the group's screen rectangle is mapped linearly onto
 * the wall instead. That reproduces the reference arrangement — same columns, same rows,
 * same relative sizes — and cannot overlap, because the reference rectangles do not.
 */
export function fitGroupsToWalls(placed) {
 const groups = new Map();
 for (const p of placed) {
  // Anchored groups are already laid out as a group; re-fitting them would stretch an
  // arrangement that was chosen to fit this wall in the first place.
  if (p.roof || p.anchored) continue;
  const key = p.host.key + ':' + p.edge.index;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
 }
 for (const group of groups.values()) {
  if (group.length < GRID_MINIMUM) continue;
  const left = Math.min(...group.map(p => p.ad.left)), right = Math.max(...group.map(p => p.ad.left + p.ad.width));
  const top = Math.min(...group.map(p => p.ad.top)), bottom = Math.max(...group.map(p => p.ad.top + p.ad.height));
  const spanX = right - left, spanY = bottom - top;
  if (!(spanX > 0 && spanY > 0)) continue;
  const host = group[0].host, edge = group[0].edge;
  const usableX = edge.length - WALL_MARGIN * 2;
  // Keep the grid inside the storeys the raycast actually found it on, not the whole tower.
  const foundTop = Math.max(...group.map(p => p.y + p.height / 2));
  const foundBottom = Math.min(...group.map(p => p.y - p.height / 2));
  const ceiling = Math.min(host.top - WALL_MARGIN, foundTop);
  const floor = Math.max(host.bottom + WALL_MARGIN, foundBottom);
  const usableY = ceiling - floor;
  if (!(usableX > 1 && usableY > 1)) continue;
  for (const p of group) {
   // Through fitMount, because a blade's width is its reach over the street: stretching one
   // to fill its share of the wall hangs a neon sign metres above the pavement, and the
   // placement audit throws it out for standing too far off the facade.
   p.width = fitMount(p.category, p.ad.width / spanX * usableX);
   p.height = p.ad.height / spanY * usableY;
   p.along = WALL_MARGIN + (p.ad.left + p.ad.width / 2 - left) / spanX * usableX;
   p.y = ceiling - (p.ad.top + p.ad.height / 2 - top) / spanY * usableY;
   p.griddedWith = group.length;
   p.clamped = p.clamped || p.width < p.rayWidth - 1e-6;
  }
 }
 return placed;
}
