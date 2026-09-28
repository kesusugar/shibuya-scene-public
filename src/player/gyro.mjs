// Gyro aim for the Switch Pro Controller (roadmap stage 0).
//
// The Gamepad API gives the sticks and buttons but not the motion sensor, so the sensor is read
// over WebHID (Chrome and Edge): the controller is asked to turn its IMU on (subcommand 0x40) and
// to send full reports (subcommand 0x03, mode 0x30). Each 0x30 report carries three IMU samples
// taken 5 ms apart; each sample is accelerometer x,y,z then gyroscope x,y,z, signed 16-bit little
// endian, the gyroscope at about 0.061 degrees per second per count.
//
// Turning the controller is then turning the camera, one to one at sensitivity 1 -- the way the
// Switch's own shooters do it. By default only while aiming (ZL held), so walking around with the
// pad in the hands does not swing the view; 'always' is there for those who want it.
//
// The sensor is never quite still: an at-rest offset of a few counts would walk the camera round
// on its own. The offset is measured when the controller is held still (and learned again whenever
// it is still for a moment), and rates below `deadzone` are dropped.
//
// Pure except for `createGyro`, which owns the device: `parseImuReport` and the `GyroIntegrator`
// are tested on made-up reports.

export const GYRO = Object.freeze({
 vendorId: 0x057e,
 products: Object.freeze([0x2009]),       // the Pro Controller (0x2006/0x2007 are the Joy-Con)
 dpsPerCount: .0610352,                   // 4000 dps over 65536 counts (the factory default range)
 sampleSeconds: .005,                     // three samples per report, 5 ms apart
 imuOffset: 12,                           // bytes into a 0x30 report's data (after its report id)
 deadzone: .6,                            // dps below which a rate counts as zero
 still: 2.5,                              // dps under which the controller counts as held still
 stillSeconds: .6,                        // ...for this long before the offset is learned again
 biasLearn: .02,                          // weight of each still sample in the offset
 sensitivity: Object.freeze({min: .25, max: 4, default: 1.5}),
 // Which sensor axis turns which way. Held normally, turning the controller left and right is
 // about its Z (through the face), tilting its top up and down about its Y (across the grips).
 axes: Object.freeze({yaw: 2, pitch: 1, yawSign: 1, pitchSign: 1})
});

const DEG = Math.PI / 180;

/**
 * The three IMU samples in one 0x30 report's data (a DataView or Uint8Array, without the report id).
 * Returns null when it is not long enough to hold them.
 * @returns {null|Array<{accel:[number,number,number], gyro:[number,number,number]}>}
 */
export function parseImuReport(data) {
 const view = data instanceof DataView ? data : new DataView(data.buffer, data.byteOffset, data.byteLength);
 if (view.byteLength < GYRO.imuOffset + 36) return null;
 const out = [];
 for (let i = 0; i < 3; i++) {
  const o = GYRO.imuOffset + i * 12, v = k => view.getInt16(o + k * 2, true);
  out.push({accel: [v(0), v(1), v(2)], gyro: [v(3), v(4), v(5)]});
 }
 return out;
}

/**
 * Sensor samples in, camera angle out. `push` a sample's gyro counts; `take()` returns the yaw and
 * pitch (radians, + turns left / + tilts up) turned since the last take, and zeroes them.
 */
export function createGyroIntegrator({axes = GYRO.axes} = {}) {
 let bias = null, stillFor = 0, yaw = 0, pitch = 0, samples = 0;
 const primed = [];
 return {
  get calibrated() {return bias !== null;},
  get bias() {return bias ? [...bias] : null;},
  get samples() {return samples;},
  push(gyro, seconds = GYRO.sampleSeconds) {
   samples++;
   const dps = gyro.map(c => c * GYRO.dpsPerCount);
   // The first half second decides the offset: the controller has just been picked up or plugged
   // in, and is most likely lying still.
   if (bias === null) {
    primed.push(dps);
    if (primed.length >= 100) {
     const mean = [0, 1, 2].map(k => primed.reduce((s, d) => s + d[k], 0) / primed.length);
     const spread = Math.max(...primed.map(d => Math.hypot(d[0] - mean[0], d[1] - mean[1], d[2] - mean[2])));
     if (spread < GYRO.still) bias = mean;
     primed.length = 0;
    }
    return;
   }
   const rate = dps.map((d, k) => d - bias[k]);
   const mag = Math.hypot(rate[0], rate[1], rate[2]);
   if (mag < GYRO.still) {
    stillFor += seconds;
    if (stillFor >= GYRO.stillSeconds) for (let k = 0; k < 3; k++) bias[k] += (dps[k] - bias[k]) * GYRO.biasLearn;
   } else stillFor = 0;
   if (mag < GYRO.deadzone) return;
   yaw += rate[axes.yaw] * axes.yawSign * DEG * seconds;
   pitch += rate[axes.pitch] * axes.pitchSign * DEG * seconds;
  },
  take() {const out = {yaw, pitch}; yaw = pitch = 0; return out;},
  reset() {bias = null; stillFor = 0; yaw = pitch = 0; primed.length = 0;}
 };
}

/** Gyro settings kept with the pad's in `shibuya.pad`. */
export function gyroSettings(saved = {}) {
 const s = Number(saved.gyroSens ?? GYRO.sensitivity.default);
 return {
  enabled: !!Number(saved.gyro ?? 0),
  mode: saved.gyroMode === 'always' ? 'always' : 'aim',
  sensitivity: Number.isFinite(s) ? Math.max(GYRO.sensitivity.min, Math.min(GYRO.sensitivity.max, s)) : GYRO.sensitivity.default,
  invertX: !!Number(saved.gyroInvertX ?? 0),
  invertY: !!Number(saved.gyroInvertY ?? 0)
 };
}

/** The subcommand output report: [counter, 8 bytes of neutral rumble, subcommand, ...args]. */
export function subcommand(counter, id, args = []) {
 const out = new Uint8Array(10 + args.length);
 out[0] = counter & 0x0f;
 out.set([0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40], 1);
 out[9] = id; out.set(args, 10);
 return out;
}

/**
 * The device side. `connect()` must run from a click (the browser's device picker); `resume()`
 * reopens a controller this site was already allowed, without asking. `take()` is the frame's
 * turn, as the integrator gives it.
 */
export function createGyro({hid = typeof navigator !== 'undefined' ? navigator.hid : undefined, storage = safeStorage()} = {}) {
 const integrator = createGyroIntegrator();
 const load = () => {try {return JSON.parse(storage?.getItem('shibuya.pad') ?? '{}') ?? {};} catch {return {};}};
 const settings = gyroSettings(load());
 let device = null, counter = 0, status = hid ? 'off' : 'unsupported', lastReportAt = 0;
 const listeners = new Set();
 const set = s => {status = s; for (const f of listeners) f(s);};
 const onReport = e => {
  if (e.reportId !== 0x30) return;
  const frames = parseImuReport(e.data); if (!frames) return;
  lastReportAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const f of frames) integrator.push(f.gyro);
  if (status === 'calibrating' && integrator.calibrated) set('on');
 };
 const onDisconnect = e => {if (e.device === device) {device = null; integrator.reset(); set('off');}};
 const send = (id, args) => device.sendReport(0x01, subcommand(counter++, id, args));
 const open = async d => {
  if (!d.opened) await d.open();
  device = d; integrator.reset();
  d.addEventListener('inputreport', onReport);
  await send(0x40, [0x01]);            // IMU on
  await send(0x03, [0x30]);            // full reports, with the IMU
  set('calibrating');
  return true;
 };
 const filters = GYRO.products.map(productId => ({vendorId: GYRO.vendorId, productId}));
 const api = {
  get status() {return status;},
  get connected() {return !!device;},
  get calibrated() {return integrator.calibrated;},
  get deviceName() {return device?.productName ?? null;},
  get lastReportAt() {return lastReportAt;},
  /** {enabled, mode, sensitivity, invertX, invertY}; change through configure(). */
  get settings() {return settings;},
  configure(patch = {}) {
   Object.assign(settings, gyroSettings({...toSaved(settings), ...toSaved({...settings, ...patch})}));
   try {storage?.setItem('shibuya.pad', JSON.stringify({...load(), ...toSaved(settings)}));} catch {}
   for (const f of listeners) f(status);
   return settings;
  },
  /**
   * The turn to apply this frame, radians {yaw, pitch}: zero when off, or when set to aim-only and
   * not aiming. Always drains what was measured, so turning while not aiming is not saved up.
   */
  turn(aiming) {
   const t = integrator.take();
   if (!settings.enabled || !device || (settings.mode === 'aim' && !aiming)) return {yaw: 0, pitch: 0};
   return {yaw: t.yaw * settings.sensitivity * (settings.invertX ? -1 : 1), pitch: t.pitch * settings.sensitivity * (settings.invertY ? -1 : 1)};
  },
  onStatus(f) {listeners.add(f); return () => listeners.delete(f);},
  async connect() {
   if (!hid) return false;
   try {
    const [d] = await hid.requestDevice({filters});
    if (!d) return false;
    return await open(d);
   } catch (err) {set('error'); return false;}
  },
  async resume() {
   if (!hid || device) return !!device;
   try {
    const d = (await hid.getDevices()).find(x => x.vendorId === GYRO.vendorId && GYRO.products.includes(x.productId));
    return d ? await open(d) : false;
   } catch {return false;}
  },
  async disconnect() {
   const d = device; device = null; integrator.reset(); set('off');
   if (d) {d.removeEventListener('inputreport', onReport); try {await d.close();} catch {}}
  },
  take() {return integrator.take();},
  recalibrate() {integrator.reset(); if (device) set('calibrating');}
 };
 hid?.addEventListener?.('disconnect', onDisconnect);
 return api;
}

const toSaved = s => ({gyro: s.enabled ? 1 : 0, gyroMode: s.mode, gyroSens: s.sensitivity, gyroInvertX: s.invertX ? 1 : 0, gyroInvertY: s.invertY ? 1 : 0});
function safeStorage() {try {return typeof localStorage !== 'undefined' ? localStorage : null;} catch {return null;}}

let shared = null;
/** The one gyro the page has: the settings panel connects it, the player controller reads it. */
export function sharedGyro() {return shared ??= createGyro();}
