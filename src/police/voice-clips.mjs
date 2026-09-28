// Roadmap ①: the police's recorded lines (public/audio/police/, made by scripts/police-voice/).
//
// The loudspeaker, an officer's shout and the dispatcher each ask for a line by situation
// ('stopCar', 'dropGun', 'fleeingCar', ...); a situation with several lines rotates through them.
// Nothing loads until something first asks and the audio context exists; until the clips have
// decoded, `pick` returns null and the caller stays silent (the formant voice is not a fallback:
// the owner found it unintelligible).

export function createPoliceClips(getContext, {base = 'audio/police/', fetchImpl = globalThis.fetch?.bind(globalThis)} = {}) {
 let loading = null, ready = false;
 const bySituation = new Map(), cursor = new Map();
 const stats = {decoded: 0, errors: 0};
 const add = clip => {
  const list = bySituation.get(clip.situation) ?? [];
  list.push(clip); list.sort((a, b) => (a.id < b.id ? -1 : 1));
  bySituation.set(clip.situation, list);
 };
 const api = {
  stats,
  get ready() {return ready;},
  /** Start loading (once). Returns the promise, or null while there is no context yet. */
  load() {
   if (loading) return loading;
   const ctx = getContext?.();
   if (!ctx || !fetchImpl) return null;
   loading = (async () => {
    const manifest = await (await fetchImpl(base + 'manifest.json')).json();
    await Promise.all(manifest.clips.map(async c => {
     try {
      const bytes = await (await fetchImpl(base + c.file)).arrayBuffer();
      add({...c, buffer: await ctx.decodeAudioData(bytes)}); stats.decoded++;
     } catch {stats.errors++;}
    }));
    ready = true;
   })().catch(() => {stats.errors++;});
   return loading;
  },
  /** For tests and tools: a clip ({id, situation, use, text, buffer}) without loading anything. */
  add(clip) {add(clip); ready = true;},
  has(situation) {return !!bySituation.get(situation)?.length;},
  /** The next line for `situation`, rotating; not `avoid` (an id) when another exists. Null if none (yet). */
  pick(situation, avoid = null) {
   if (!ready) {api.load(); return null;}
   const list = bySituation.get(situation);
   if (!list?.length) return null;
   let i = (cursor.get(situation) ?? 0) % list.length;
   if (list[i].id === avoid && list.length > 1) i = (i + 1) % list.length;
   cursor.set(situation, i + 1);
   return list[i];
  }
 };
 return api;
}
