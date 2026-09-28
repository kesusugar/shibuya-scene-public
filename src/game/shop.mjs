// The shop (roadmap stage 5): a convenience store by the crossing. Walk up to its door and it
// sells what keeps you going -- a first-aid kit (full health), body armour (absorbs most of a blow
// until it is used up) and a repair for your car. Pure: `buy` checks the wallet and says what to
// apply; the scene applies it.

export const SHOP = Object.freeze({
 // Where the door is: the walkable point nearest this anchor (by the crossing, west side).
 anchor: Object.freeze([-22, 38]),
 reach: 3,                     // m from the door to shop
 items: Object.freeze([
  Object.freeze({id: 'heal', name: '救急キット', note: '体力を全回復', price: 1500}),
  Object.freeze({id: 'armor', name: '防弾ベスト', note: '被ダメージを7割軽減（50まで）', price: 4000, armor: 50}),
  Object.freeze({id: 'repair', name: '車の修理', note: '乗っている車／近くの自分の車を修理', price: 2500})
 ]),
 armorAbsorb: .7               // share of each blow the vest takes while it lasts
});

/** The door: the walkable point nearest the anchor (a ring search), or the anchor itself. */
export function shopDoor(ctx) {
 const [ax, az] = SHOP.anchor;
 if (!ctx?.safe) return {x: ax, z: az};
 for (let r = 0; r <= 30; r += 1.5) for (let i = 0; i < (r ? 16 : 1); i++) {
  const a = i / 16 * Math.PI * 2, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
  if (ctx.safe(x, z, .4)) return {x, z};
 }
 return {x: ax, z: az};
}

/**
 * Try to buy `id`. `state` {health, armor, carDamage, hasCar}. Returns {ok, reason?, apply?}: what
 * changed, for the scene to put on the player. Refuses what would do nothing.
 */
export function buy(wallet, id, state = {}) {
 const item = SHOP.items.find(i => i.id === id);
 if (!item) return {ok: false, reason: 'unknown'};
 if (id === 'heal' && (state.health ?? 100) >= 100) return {ok: false, reason: '体力は満タンです'};
 if (id === 'armor' && (state.armor ?? 0) >= item.armor) return {ok: false, reason: 'ベストは新品です'};
 if (id === 'repair' && !(state.hasCar && (state.carDamage ?? 0) > .01)) return {ok: false, reason: '直す車がありません'};
 if (!wallet.spend(item.price, id)) return {ok: false, reason: 'お金が足りません'};
 const apply = id === 'heal' ? {health: 100} : id === 'armor' ? {armor: item.armor} : {carDamage: 0};
 return {ok: true, item, apply};
}

/** How much of a blow reaches the body with `armor` left: {damage, armor}. Pure. */
export function absorb(amount, armor) {
 if (!(armor > 0) || !(amount > 0)) return {damage: Math.max(0, amount || 0), armor: Math.max(0, armor || 0)};
 const taken = Math.min(armor, amount * SHOP.armorAbsorb);
 return {damage: amount - taken, armor: armor - taken};
}
