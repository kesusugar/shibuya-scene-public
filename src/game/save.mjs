// Saving (roadmap stage 5): what the player has earned survives a reload. One slot in this
// browser's storage; a version so an old save from a different shape is ignored rather than
// half-read. Pure given a storage (tests pass their own).

export const SAVE = Object.freeze({key: 'shibuya.save', version: 1});

const safeStorage = () => {try {return typeof localStorage !== 'undefined' ? localStorage : null;} catch {return null;}};

/** What a save holds, validated: {money, armor, completed: {missionId: count}, best: {missionId: score}, savedAt}. */
export function sanitise(data) {
 if (!data || data.version !== SAVE.version) return null;
 const num = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d;
 const counts = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
  .filter(([k, v]) => /^[a-z]{2,16}$/.test(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.max(0, Math.round(Number(v)))]));
 return {version: SAVE.version, money: Math.round(num(data.money, 0, 99999999, 0)), armor: num(data.armor, 0, 100, 0),
  completed: counts(data.completed), best: counts(data.best), savedAt: String(data.savedAt ?? '')};
}

export function createSave(storage = safeStorage()) {
 return {
  get available() {return !!storage;},
  save(state) {
   const data = sanitise({...state, version: SAVE.version, savedAt: new Date().toISOString()});
   try {storage?.setItem(SAVE.key, JSON.stringify(data)); return !!storage;} catch {return false;}
  },
  load() {
   try {return sanitise(JSON.parse(storage?.getItem(SAVE.key) ?? 'null'));} catch {return null;}
  },
  clear() {try {storage?.removeItem(SAVE.key);} catch {}}
 };
}
