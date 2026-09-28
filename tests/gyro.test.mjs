import test from 'node:test';
import assert from 'node:assert/strict';
import {GYRO,parseImuReport,createGyroIntegrator,gyroSettings,subcommand,createGyro} from '../src/player/gyro.mjs';

// A 0x30 report's data (without its id) carrying the same gyro counts in all three samples.
function report(gyro, accel = [0, 0, 4096]) {
 const data = new DataView(new ArrayBuffer(48));
 for (let i = 0; i < 3; i++) {
  const o = GYRO.imuOffset + i * 12;
  [...accel, ...gyro].forEach((v, k) => data.setInt16(o + k * 2, v, true));
 }
 return data;
}
const countsFor = dps => Math.round(dps / GYRO.dpsPerCount);

test('parses the three IMU samples of a full report', () => {
 const frames = parseImuReport(report([10, -20, 300], [1, 2, 3]));
 assert.equal(frames.length, 3);
 assert.deepEqual(frames[0], {accel: [1, 2, 3], gyro: [10, -20, 300]});
 assert.equal(parseImuReport(new Uint8Array(20)), null);
});

test('learns the at-rest offset before turning anything, then integrates to the right angle', () => {
 const g = createGyroIntegrator();
 const drift = [5, -3, 7];                       // counts: a typical at-rest offset
 for (let i = 0; i < 100; i++) g.push(drift);
 assert.ok(g.calibrated);
 assert.deepEqual(g.take(), {yaw: 0, pitch: 0});
 // Held still with the offset: nothing moves, however long.
 for (let i = 0; i < 400; i++) g.push(drift);
 const still = g.take();
 assert.ok(Math.abs(still.yaw) < 1e-9 && Math.abs(still.pitch) < 1e-9);
 // 90 dps about Z for one second: a quarter turn to the left.
 const z = countsFor(90);
 for (let i = 0; i < 200; i++) g.push([drift[0], drift[1], drift[2] + z]);
 const t = g.take();
 assert.ok(Math.abs(t.yaw - Math.PI / 2) < .01, `yaw ${t.yaw}`);
 assert.ok(Math.abs(t.pitch) < 1e-9);
 // Tilting the top up (about Y) is pitch.
 for (let i = 0; i < 200; i++) g.push([drift[0], drift[1] + countsFor(-45), drift[2]]);
 assert.ok(Math.abs(g.take().pitch + Math.PI / 4) < .01);
});

test('does not calibrate on a controller that is being moved', () => {
 const g = createGyroIntegrator();
 for (let i = 0; i < 100; i++) g.push([0, 0, i % 2 ? countsFor(40) : 0]);
 assert.equal(g.calibrated, false);
 for (let i = 0; i < 100; i++) g.push([0, 0, 0]);
 assert.equal(g.calibrated, true);
});

test('a slow drift of the offset is followed while the controller is still', () => {
 const g = createGyroIntegrator();
 for (let i = 0; i < 100; i++) g.push([0, 0, 0]);
 // The offset creeps to 20 counts (1.2 dps, above the deadzone): learned while still.
 for (let i = 0; i < 2000; i++) g.push([0, 0, 20]);
 g.take();
 for (let i = 0; i < 200; i++) g.push([0, 0, 20]);
 assert.ok(Math.abs(g.take().yaw) < 1e-6);
});

test('settings are bounded and default to aim-only', () => {
 assert.deepEqual(gyroSettings({}), {enabled: false, mode: 'aim', sensitivity: GYRO.sensitivity.default, invertX: false, invertY: false});
 assert.equal(gyroSettings({gyroSens: 99}).sensitivity, GYRO.sensitivity.max);
 assert.equal(gyroSettings({gyroMode: 'always', gyro: 1}).mode, 'always');
});

test('the subcommand report carries a counter, neutral rumble and the command', () => {
 const r = subcommand(17, 0x40, [1]);
 assert.equal(r[0], 1);
 assert.deepEqual([...r.slice(1, 9)], [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40]);
 assert.equal(r[9], 0x40); assert.equal(r[10], 1);
});

// A fake WebHID: one Pro Controller that records what was sent and can be fed reports.
function fakeHid() {
 const sent = [], listeners = {};
 const device = {vendorId: 0x057e, productId: 0x2009, productName: 'Pro Controller', opened: false,
  async open() {this.opened = true;}, async close() {this.opened = false;},
  async sendReport(id, data) {sent.push([id, data[9], data[10]]);},
  addEventListener(type, f) {listeners[type] = f;}, removeEventListener(type) {delete listeners[type];}};
 const store = new Map();
 return {sent, device, feed: data => listeners.inputreport?.({reportId: 0x30, data}),
  storage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)},
  hid: {async requestDevice() {return [device];}, async getDevices() {return [device];}, addEventListener() {}}};
}

test('connecting turns the IMU on and asks for full reports; aim-only turns only while aiming', async () => {
 const f = fakeHid();
 const gyro = createGyro({hid: f.hid, storage: f.storage});
 gyro.configure({enabled: true, sensitivity: 1});
 assert.ok(await gyro.connect());
 assert.deepEqual(f.sent, [[0x01, 0x40, 0x01], [0x01, 0x03, 0x30]]);
 assert.equal(gyro.status, 'calibrating');
 for (let i = 0; i < 34; i++) f.feed(report([0, 0, 0]));
 assert.equal(gyro.status, 'on');
 for (let i = 0; i < 67; i++) f.feed(report([0, 0, countsFor(90)]));   // ~1 s at 90 dps
 assert.deepEqual(gyro.turn(false), {yaw: 0, pitch: 0}, 'not aiming: nothing, and drained');
 for (let i = 0; i < 67; i++) f.feed(report([0, 0, countsFor(90)]));
 const t = gyro.turn(true);
 assert.ok(Math.abs(t.yaw - Math.PI / 2) < .02, `yaw ${t.yaw}`);
 gyro.configure({invertX: true, sensitivity: 2});
 for (let i = 0; i < 67; i++) f.feed(report([0, 0, countsFor(90)]));
 assert.ok(Math.abs(gyro.turn(true).yaw + Math.PI) < .04);
 assert.equal(JSON.parse(f.storage.getItem('shibuya.pad')).gyroInvertX, 1);
 await gyro.disconnect();
 assert.equal(gyro.connected, false);
});

test('without WebHID the gyro says so and connects to nothing', async () => {
 const gyro = createGyro({hid: undefined, storage: null});
 assert.equal(gyro.status, 'unsupported');
 assert.equal(await gyro.connect(), false);
 assert.deepEqual(gyro.turn(true), {yaw: 0, pitch: 0});
});
