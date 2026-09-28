/**
 * What a citizen looks like, decided once from who they are.
 *
 * RUN 6.8. RUN 6 gave the eight nearest people the player's body and they came out looking
 * like one person recoloured eight times: same hair, same head, same build, same clothes,
 * different colours. The eye reads silhouette first, so no number of extra palette entries
 * fixes that. This module picks a silhouette.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE: an appearance is a pure function of the pedestrian's
 * id. Not of the pool slot they landed in, not of the frame, not of the tier, not of how many
 * citizens happen to be near. Walk away from someone and walk back and they are the same
 * person. The pool recycles its slots constantly and its ordering churns every frame, so
 * anything that reads from the pool would make people change clothes as the camera moves --
 * which is worse than the clone problem it would be trying to solve.
 *
 * The one deliberate exception is `deduplicate` at the bottom, and it is bounded: it may move
 * a shirt colour, never a body, a hairstyle, a build or a height. Silhouette is what the run
 * is about, and silhouette is never negotiated at runtime.
 */
import {ARCHETYPES as LIFE} from './config.mjs';
import {PATTERN} from './garment-pattern.mjs';

/**
 * The appearance archetypes, in the order the recipe indexes them.
 *
 * Four, from two CC0 bodies and three CC0 hairstyles already verified for RUN 2 -- there is no
 * new asset here. `rig` names an armature in citizen.glb, `hair` a hairstyle attached to it.
 * These are not a gender classification; they are silhouettes, and the point is that the
 * outlines differ at a glance: a cropped head, a parted head, a long head, and two builds.
 *
 * `height` and `width` are multipliers on whatever height the pedestrian's own life archetype
 * asks for. They are small on purpose -- see APPEARANCE.
 */
export const ARCHETYPES=Object.freeze([
 Object.freeze({id:'m:Hair_SimpleParted',rig:'m',hair:'Hair_SimpleParted',name:'casual',   height:1.000,width:1.00}),
 Object.freeze({id:'f:Hair_Long',        rig:'f',hair:'Hair_Long',        name:'long hair',height:0.955,width:0.95}),
 Object.freeze({id:'m:Hair_Buzzed',      rig:'m',hair:'Hair_Buzzed',      name:'cropped',  height:1.035,width:1.05}),
 Object.freeze({id:'f:Hair_SimpleParted',rig:'f',hair:'Hair_SimpleParted',name:'short bob',height:0.975,width:0.97})
]);

export const APPEARANCE=Object.freeze({
 // Per-person jitter on top of the archetype's own multiplier. Height and width both stay
 // inside what the RUN 5 foot IK can absorb on a kerb: the solver adapts a correct animation
 // to the ground, and a body scaled far from the one the clips were authored for stops being
 // a correct animation. Measured ranges, not guesses -- see qa/gta-upgrade/appearance.mjs.
 heightJitter:.035,      // +-3.5% on top of the archetype, so the full spread is about +-8%
 widthJitter:.025,       // +-2.5%, full spread about +-7%
 minHeight:1.48,maxHeight:1.96
});

/**
 * Tops and bottoms a Shibuya crossing actually contains.
 *
 * Muted and mostly cool, because a real crowd is: navy, charcoal, grey, white, beige, with
 * occasional colour. A rainbow crowd reads as a toy. The player's warm red is deliberately
 * absent from this list and a test asserts the distance, so the person you are controlling
 * stays findable in a crowd that now shares their body.
 */
const TOPS=Object.freeze([
 // Dark
 0x1b1f27,0x2f3a45,0x24303d,0x333c47,0x3a4149,
 // Mid
 0x4a5460,0x6b7280,0x8c9196,0x5b6472,
 // Light -- the ones that actually separate a person from the person behind them. The first
 // version of this palette was all mid-dark blue-grey, which fixed the bodies and left the
 // clothes looking like a uniform.
 0xe7e3da,0xd8d2c6,0xcfc9bd,0xeceae5,0xb8c4cc,
 // Colour, muted. A real crossing has some; a rainbow crowd reads as a toy.
 0x3f5d52,0x9aa88f,0x7d6b52,0x2b4a63,0x5a4a6b
]);
const BOTTOMS=Object.freeze([
 0x1c2028,0x2a2f38,0x232a36,0x39404b,0x2d3542,0x171a20,
 // Lighter legs, so a dark top is not always over dark trousers -- but every one of them
 // stays DARKER THAN SKIN. The first version had beige at 0x8a8578 and 0xa89f8d, and in a
 // crowd of two thousand those legs read as bare: at LOD2 the trouser hem is a few vertices
 // and the eye only has the tone to go on. Chasing a minimum distance from every skin tone
 // is the wrong rule -- a dark-skinned person in dark trousers is not a bug -- so the rule
 // that is actually enforced is luminance, and a test pins it.
 0x3a414c,0x44403a,0x333b33,0x3f3a44
]);
const SHOES=Object.freeze([0x14161a,0x1f2126,0x2b2d33,0xe8e6e1,0x3a3c42]);
const SKINS=Object.freeze([0xe8c9a8,0xdfb994,0xc79a72,0xa3764f,0x7a5334,0x5d3d26]);
const HAIRS=Object.freeze([0x141215,0x1b1a1c,0x241d1a,0x2e2320,0x3a2a1e,0x55483c,0x6f6259]);

/**
 * Patterns by life archetype (PLAN-LOOKS-AND-FLEET Step A). Weights, not shares: each row is
 * normalised. Office workers lean to solid and pinstripe, young people to border, check and
 * print, older people to solid. Bottoms carry denim and suit pinstripe; check is a skirt.
 *
 * The life archetype is read from the id the same way the simulation's spawn assigns it
 * (`styleOf`), never from the pedestrian record: the HQ layer only has the id, and the rule is
 * that a look is a pure function of it.
 */
const S=PATTERN;
export const PATTERN_WEIGHTS=Object.freeze({
 office:  {top:{[S.solid]:55,[S.pinstripe]:25,[S.openJacket]:15,[S.check]:5},bottom:{[S.solid]:70,[S.pinstripe]:25,[S.check]:5}},
 student: {top:{[S.solid]:40,[S.border]:20,[S.check]:15,[S.print]:10,[S.openJacket]:15},bottom:{[S.solid]:45,[S.denim]:40,[S.check]:15}},
 casual:  {top:{[S.solid]:45,[S.border]:20,[S.check]:10,[S.print]:10,[S.openJacket]:15},bottom:{[S.solid]:40,[S.denim]:60}},
 hoodie:  {top:{[S.solid]:70,[S.border]:10,[S.print]:20},bottom:{[S.solid]:40,[S.denim]:60}},
 shopper: {top:{[S.solid]:45,[S.border]:15,[S.check]:15,[S.print]:15,[S.openJacket]:10},bottom:{[S.solid]:45,[S.denim]:40,[S.check]:15}},
 tourist: {top:{[S.solid]:45,[S.border]:15,[S.check]:20,[S.print]:20},bottom:{[S.solid]:45,[S.denim]:55}},
 elderly: {top:{[S.solid]:75,[S.check]:15,[S.openJacket]:10},bottom:{[S.solid]:85,[S.check]:15}},
 kid:     {top:{[S.solid]:40,[S.border]:30,[S.print]:30},bottom:{[S.solid]:60,[S.denim]:40}},
 jogger:  {top:{[S.solid]:85,[S.border]:15},bottom:{[S.solid]:100}},
 pastel:  {top:{[S.solid]:40,[S.border]:20,[S.check]:20,[S.print]:20},bottom:{[S.solid]:50,[S.denim]:30,[S.check]:20}},
 umbrella:{top:{[S.solid]:55,[S.border]:15,[S.check]:10,[S.openJacket]:20},bottom:{[S.solid]:55,[S.denim]:45}}
});
/** The adult life archetypes in the order `CrowdSimulation.spawn` indexes them by id. */
const ADULT_STYLES=Object.freeze(Object.keys(LIFE).filter(k=>k!=='kid'));
/** The life archetype an id is spawned as (a lone adult; group kids are the exception). */
export const styleOf=id=>ADULT_STYLES[Math.abs(id|0)%ADULT_STYLES.length];

function weighted(table,u){
 let total=0;for(const k in table)total+=table[k];
 let x=u*total;
 for(const k in table){x-=table[k];if(x<0)return Number(k);}
 return Number(Object.keys(table).at(-1));
}
/** A third decorrelated hash: patterns must not correlate with colours already chosen. */
function hash3(id){
 let h=Math.imul((id|0)^0x2c1b3c6d,0x297a2d39);
 h^=h>>>15;h=Math.imul(h,0x68e31da4|1);h^=h>>>14;h=Math.imul(h,0xb5297a4d);h^=h>>>16;
 return h>>>0;
}
/** The top and bottom pattern of citizen `id`. Pure. */
export function patternOf(id){
 const w=PATTERN_WEIGHTS[styleOf(id)],h=hash3(id);
 return {top:weighted(w.top,(h&0xffff)/65536),bottom:weighted(w.bottom,(h>>>16)/65536)};
}

/** Everything the recipe can choose from, for tests and for the status document. */
export const PALETTE=Object.freeze({tops:TOPS,bottoms:BOTTOMS,shoes:SHOES,skins:SKINS,hairs:HAIRS});

/**
 * One well-mixed 32-bit hash per citizen, sliced into independent choices.
 *
 * Independent is the word that matters. Taking `id % tops.length` and `id % skins.length`
 * from the same id correlates them, and a correlated crowd has visible repeating runs down a
 * pavement. Mixing once and then reading disjoint bit ranges does not.
 */
function hash(id){
 let h=Math.imul((id|0)^0x9e3779b9,0x85ebca6b);
 h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
 return h>>>0;
}
/** A second, decorrelated hash, for the choices the first one runs out of bits for. */
function hash2(id){
 let h=Math.imul((id|0)+0x7f4a7c15,0x2545f491);
 h^=h>>>15;h=Math.imul(h,0x27220a95);h^=h>>>13;
 return h>>>0;
}
const pick=(h,shift,list)=>list[(h>>>shift)%list.length];
/** A signed -1..1 from a bit slice, for the jitters. */
const spread=(h,shift)=>(((h>>>shift)&255)/255)*2-1;

/**
 * PLAN-POLICE W2: officers. An officer is a pedestrian re-drawn with `appearanceId` in this range,
 * so the uniform is still a pure function of the id the renderers are given: navy top and trousers,
 * black shoes, no pattern, the body and hair of the pedestrian they were. No badge or emblem.
 */
export const OFFICER_BASE=0x100000;
export const UNIFORM=Object.freeze({top:0x1f2c47,bottom:0x1a2233,shoe:0x121316});

/**
 * The appearance of citizen `id`. Pure: same id, same result, forever.
 *
 * `baseHeight` is the height their life archetype asks for (an adult, a kid, a tourist); the
 * appearance scales it rather than replacing it, so a child stays child-sized.
 */
export function appearanceOf(id,baseHeight=1.76){
 if(id>=OFFICER_BASE){
  const look=appearanceOf(id-OFFICER_BASE,baseHeight);
  return {...look,id,top:UNIFORM.top,bottom:UNIFORM.bottom,shoe:UNIFORM.shoe,topPattern:0,bottomPattern:0,uniform:true};
 }
 const h=hash(id),g=hash2(id);
 const archetype=ARCHETYPES[h%ARCHETYPES.length];
 const height=Math.min(APPEARANCE.maxHeight,Math.max(APPEARANCE.minHeight,
  baseHeight*archetype.height*(1+spread(h,8)*APPEARANCE.heightJitter)));
 const width=archetype.width*(1+spread(g,8)*APPEARANCE.widthJitter);
 const pattern=patternOf(id);
 return {
  id,archetype,
  rig:archetype.rig,hair:archetype.hair,
  skin:pick(h,16,SKINS),
  hairColour:pick(h,22,HAIRS),
  top:pick(g,0,TOPS),
  bottom:pick(g,16,BOTTOMS),
  shoe:pick(g,24,SHOES),
  topPattern:pattern.top,bottomPattern:pattern.bottom,
  height,width
 };
}

/** The palette shape `dressCitizen` wants, from an appearance. */
export const paletteOf=look=>({skin:look.skin,top:look.top,bottom:look.bottom,
 hair:look.hairColour,shoe:look.shoe,topPattern:look.topPattern??0,bottomPattern:look.bottomPattern??0});

/**
 * Keep two people standing next to each other from being the same person.
 *
 * With four archetypes and sixteen tops there are sixty-four visible combinations, and eight
 * citizens drawn from sixty-four collide more often than intuition suggests -- about a 40%
 * chance of at least one pair. One pair of twins in the front row is exactly the thing this
 * run exists to remove.
 *
 * So, among the handful actually on screen: walk them in ascending id and, when someone
 * repeats a (archetype, top) already taken, step their top along the palette until it does
 * not. Ascending id is what makes it stable -- the same set of people always produces the
 * same answer, whatever order the pool happens to hold them in, and the lowest id always
 * keeps the colour the recipe gave them.
 *
 * It moves a shirt colour and nothing else -- never a pattern (Step A). Body, hairstyle,
 * build and height are whatever `appearanceOf` said, always.
 */
export function deduplicate(looks){
 const ordered=[...looks].sort((a,b)=>a.id-b.id);
 const taken=new Set();
 const out=new Map();
 for(const look of ordered){
  let top=look.top,attempts=0;
  // A uniform is the same on everyone who wears it (W2): never re-coloured.
  if(look.uniform){out.set(look.id,look);continue;}
  while(taken.has(`${look.archetype.id}|${top}`)&&attempts<TOPS.length){
   top=TOPS[(TOPS.indexOf(top)+1)%TOPS.length];attempts++;
  }
  taken.add(`${look.archetype.id}|${top}`);
  out.set(look.id,top===look.top?look:{...look,top});
 }
 return out;
}
