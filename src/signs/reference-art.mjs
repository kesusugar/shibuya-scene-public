// Reconstructed artwork for the reference advertisement inventory.
//
// Every panel here is drawn from scratch with canvas primitives. No official logo file,
// brand font or downloaded asset is used, and none is committed. These are recognisable
// approximations of the signs visible in the reference frame, in the spirit of a
// streetscape reconstruction; they are not reproductions of the trademark artwork.
//
// The reference panels live in their own atlas rather than in the city atlas. The city
// atlas spreads 32 tiles across every generic sign in the scene, so a tile there is small
// and shared; these are the signs the camera actually reads, so they get their own sheet
// with far more pixels per panel.

import {CanvasTexture, DataTexture, SRGBColorSpace, LinearFilter, RGBAFormat} from 'three';
import {REFERENCE_ADS, PANELS} from './reference-ads.mjs';

// 4096 was measured at 11.7 s to rasterise its 64 MB backing store, against 0.4 s for the
// 16 MB sheet, and it cannot be prebaked away: a committed PNG still has to decode and
// upload the same 64 MB bitmap. HIGH therefore matches the city atlas at 2048, which still
// gives each reference panel 409x341 against a shared city tile's 256x512.
export const REFERENCE_QUALITY = Object.freeze({high: 2048, medium: 1024, low: 512});
// Columns follow the number of panels actually being drawn, so a sheet built for the
// advertisements this scene places does not reserve pixels for the ones it does not.
export const REFERENCE_COLUMNS = 5;
export const columnsFor = count => Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));

export function referenceAtlasEntries(size, count, columns = columnsFor(count)) {
 const rows = Math.max(1, Math.ceil(count / columns)), w = size / columns, h = size / rows;
 const padding = Math.max(2, size / 1024);
 return Array.from({length: count}, (_, id) => {
  const x = (id % columns) * w, y = Math.floor(id / columns) * h;
  return {id, x, y, w, h, padding,
   u0: (x + padding) / size, u1: (x + w - padding) / size,
   v0: 1 - (y + h - padding) / size, v1: 1 - (y + padding) / size};
 });
}

// Drawing helpers. Every painter works in a 0..1 square that is scaled to its tile, so a
// panel's artwork is independent of the atlas resolution it lands on.
function tools(c) {
 const text = (value, size, x, y, {weight = '700', family = '"Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif', align = 'center', max = .92, style = ''} = {}) => {
  c.textAlign = align; c.textBaseline = 'middle';
  c.font = `${style} ${weight} ${size}px ${family}`.trim();
  c.fillText(value, x, y, max);
 };
 const box = (x, y, w, h, fill) => {c.fillStyle = fill; c.fillRect(x, y, w, h);};
 const disc = (x, y, r, fill) => {c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();};
 const ring = (x, y, r, width, stroke) => {c.strokeStyle = stroke; c.lineWidth = width; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();};
 const column = (chars, size, x, top, step, fill) => {c.fillStyle = fill; [...chars].forEach((ch, i) => text(ch, size, x, top + i * step));};
 return {text, box, disc, ring, column};
}

/**
 * One painter per inventory id, drawn in a unit square. Each is a different composition,
 * not a recoloured template: the point of the reference pass is that the camera reads a
 * street of distinct advertisers rather than one sticker repeated in eight palettes.
 */
export const REFERENCE_ART = Object.freeze({
 1(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#c8102e');
  box(.04, .05, .92, .34, '#ffffff');
  c.fillStyle = '#c8102e'; text('カラオケ', .23, .5, .22);
  c.fillStyle = '#ffffff'; text('BIG ECHO', .2, .5, .56, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .72, .6, .035, '#ffd400');
  c.fillStyle = '#ffe9ec'; text('０円クーポン配布中', .075, .5, .87);},

 2(c) {const {text, disc} = tools(c); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 1);
  disc(.5, .38, .21, '#e6007e');
  c.fillStyle = '#ffffff'; text('Æ', .24, .5, .37, {family: 'Georgia,serif'});
  c.fillStyle = '#2b2b2b'; text('AEON', .17, .5, .71, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#7a7a7a'; text('SHIBUYA', .06, .5, .87, {family: 'Arial,sans-serif'});},

 3(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#f7f4ec');
  box(.05, .16, .22, .62, '#c2172b');
  c.fillStyle = '#ffffff'; text('本', .42, .16, .47);
  c.fillStyle = '#1d1d1d'; text('渋谷書店', .23, .63, .42);
  c.fillStyle = '#6b6b6b'; text('SHIBUYA BOOKS', .072, .63, .66, {family: 'Arial,sans-serif'});},

 4(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, .34, 1, '#e4002b');
  c.fillStyle = '#ffffff'; text('Cafe', .18, .17, .3, {family: 'Georgia,serif', style: 'italic', max: .3});
  text('レストラン', .1, .17, .62, {max: .32});
  c.fillStyle = '#e4002b'; text('ガスト', .34, .67, .42, {max: .58});
  c.fillStyle = '#8a8a8a'; text('モーニング 7:00-', .07, .67, .78, {max: .6});},

 5(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .26, '#00833e');
  c.fillStyle = '#ffffff'; text('7F', .19, .13, .13, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#fff6d8'; text('しゃぶしゃぶ食べ放題', .1, .6, .13);
  c.fillStyle = '#00833e'; text('しゃぶ葉', .3, .5, .55);
  c.fillStyle = '#c64a12'; text('SHABU-YO', .085, .5, .82, {family: 'Arial,sans-serif'});},

 6(c) {const {text, box, disc} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .46, '#123c8c');
  c.fillStyle = '#ffffff'; text('英会話', .26, .5, .23);
  disc(.18, .68, .1, '#f08300');
  c.fillStyle = '#123c8c'; text('イーオン', .21, .6, .67);
  c.fillStyle = '#5a5a5a'; text('駅前留学・無料体験', .073, .5, .9);},

 7(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0d2f6b');
  c.fillStyle = '#7fd4ff'; text('光回線', .19, .5, .17);
  box(.08, .3, .84, .3, '#ffffff');
  c.fillStyle = '#0d2f6b'; text('イーチカン', .2, .5, .45);
  c.fillStyle = '#ffe066'; text('月額 2,980円〜', .11, .5, .72);
  c.fillStyle = '#b9d2f2'; text('工事費無料キャンペーン', .065, .5, .89);},

 8(c) {const {text, box, column} = tools(c); box(0, 0, 1, 1, '#f5e7c8');
  box(.06, .04, .88, .92, '#8c1f1f');
  column('もんじゃ', .13, .5, .16, .16, '#ffe9b0');
  box(.24, .78, .52, .02, '#ffe9b0');
  c.fillStyle = '#ffe9b0'; text('鉄板焼', .09, .5, .88);},

 9(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#111318');
  box(.03, .06, .94, .5, '#e01f26');
  c.fillStyle = '#ffffff'; text('LIVE', .3, .5, .2, {family: 'Impact,Arial,sans-serif', weight: '900'});
  text('MAX', .24, .5, .44, {family: 'Impact,Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffd400'; text('カラオケ・ライブハウス', .085, .5, .68);
  c.fillStyle = '#9aa3ad'; text('OPEN 24H', .07, .5, .86, {family: 'Arial,sans-serif'});},

 10(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, .12, 1, .46, '#e60012');
  c.fillStyle = '#ffffff'; text('アコム', .3, .5, .35);
  c.fillStyle = '#e60012'; text('ACOM', .13, .5, .69, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#555555'; text('はじめてのかたは30日間金利0円', .058, .5, .87);},

 11(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0a0a0a');
  c.fillStyle = '#ffffff'; text('LUSH', .34, .5, .42, {family: 'Georgia,"Times New Roman",serif', weight: '700'});
  box(.28, .62, .44, .012, '#ffffff');
  c.fillStyle = '#d8d8d8'; text('FRESH HANDMADE COSMETICS', .052, .5, .75, {family: 'Arial,sans-serif'});},

 12(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  c.fillStyle = '#1a1a1a'; text('1', .3, .5, .17, {family: 'Arial,sans-serif', weight: '900'});
  text('0', .3, .5, .42, {family: 'Arial,sans-serif', weight: '900'});
  text('9', .3, .5, .67, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .86, .6, .03, '#1a1a1a');},

 13(c) {const {text, box, disc, ring} = tools(c); box(0, 0, 1, 1, '#f4f2e9');
  disc(.5, .4, .3, '#1a4fa0'); ring(.5, .4, .325, .022, '#d81f34');
  c.fillStyle = '#ffffff'; text('UC', .3, .5, .41, {family: 'Arial,sans-serif', weight: '900'});
  disc(.29, .84, .07, '#eb001b'); disc(.4, .84, .07, '#f79e1b');
  c.fillStyle = '#1a4fa0'; text('VISA', .12, .72, .85, {family: 'Arial,sans-serif', weight: '900', style: 'italic', max: .3});},

 14(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  box(0, 0, 1, .2, '#0f4c8a');
  c.fillStyle = '#ffffff'; text('のどのお守り', .1, .5, .1);
  c.fillStyle = '#123c2c'; text('龍角散', .3, .5, .42);
  box(.18, .62, .64, .16, '#c8a02c');
  c.fillStyle = '#ffffff'; text('ダイレクト', .12, .5, .7);
  c.fillStyle = '#666666'; text('スティック / 顆粒', .06, .5, .89);},

 15(c) {const {text, box, disc} = tools(c); box(0, 0, 1, 1, '#0b4bb0');
  disc(.5, .36, .17, '#ffffff');
  c.fillStyle = '#0b4bb0'; text('久', .2, .5, .36);
  c.fillStyle = '#ffffff'; text('Hisamitsu', .15, .5, .66, {family: 'Arial,sans-serif', weight: '700'});
  c.fillStyle = '#bcd4f7'; text('久光製薬', .085, .5, .85);},

 16(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#00954a');
  box(.06, .1, .88, .42, '#ffffff');
  c.fillStyle = '#00954a'; text('サロンパス', .21, .5, .31);
  c.fillStyle = '#ffffff'; text('肩・腰・関節に', .11, .5, .65);
  box(.3, .76, .4, .025, '#ffe066');
  c.fillStyle = '#d8f2e2'; text('HISAMITSU', .07, .5, .88, {family: 'Arial,sans-serif'});},

 17(c) {const {text, box, column} = tools(c); box(0, 0, 1, 1, '#140c18');
  c.shadowColor = '#ff4fa3'; c.shadowBlur = 24;
  column('もん字', .16, .5, .2, .22, '#ff7ec0');
  c.shadowBlur = 0;
  c.fillStyle = '#ffe066'; text('お好み焼', .07, .5, .88);},

 // A crimson sheet, not a red band floating on black: the near-black ground this started
 // with vanished against a night facade, leaving only the band reading as the whole sign.
 18(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#bf0000');
  box(0, .66, 1, .34, '#8e0000');
  c.fillStyle = '#ffffff'; text('Rakuten', .22, .5, .33, {family: '"Times New Roman",Georgia,serif', weight: '700'});
  c.fillStyle = '#ffffff'; text('楽天市場', .17, .5, .82);},

 19(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0058a3');
  box(.07, .24, .86, .38, '#ffda1a');
  c.fillStyle = '#0058a3'; text('IKEA', .26, .5, .43, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffffff'; text('渋谷ストア', .12, .5, .77);},

 20(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0c0c0e');
  c.fillStyle = '#ffffff'; text('ACN', .3, .5, .38, {family: 'Arial,sans-serif', weight: '300'});
  c.strokeStyle = '#7b2fd4'; c.lineWidth = .035;
  c.beginPath(); c.moveTo(.3, .2); c.lineTo(.62, .2); c.stroke();
  c.fillStyle = '#8a8f98'; text('CONSULTING', .06, .5, .68, {family: 'Arial,sans-serif'});},

 21(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0b0b12');
  // A vision panel, so the artwork is a lit screen rather than a printed sheet.
  for (let y = 0; y < 1; y += .045) {c.fillStyle = y % .09 < .045 ? '#141a2e' : '#0d1120'; c.fillRect(0, y, 1, .045);}
  box(.08, .12, .84, .34, '#ff2d55');
  c.fillStyle = '#ffffff'; text('DMM', .24, .5, .29, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#7fe8ff'; text('動画・電子書籍', .11, .5, .6);
  box(.2, .72, .6, .04, '#ffd400');
  c.fillStyle = '#9aa7c4'; text('SHIBUYA VISION', .06, .5, .87, {family: 'Arial,sans-serif'});},

 // 大盛堂書店, drawn from a photograph of the shopfront rather than from the reference
 // frame, which is too far away to show it. The sign is a white ground inside a cobalt
 // frame, the five characters set across it in that same cobalt, the middle three boxed in
 // red the way the shop boxes them, and the English underneath in the red. It is a wide,
 // shallow fascia, so it is drawn through trueShape: without that the characters come out
 // stretched half again as wide as they are tall.
 22(c, aspect) {const {text, box} = tools(c);
  const cobalt = '#14409b', red = '#e0231b';
  box(0, 0, 1, 1, cobalt);
  box(.028, .05, .944, .9, '#ffffff');
  trueShape(c, aspect, wide => {
   const span = .84 * wide;
   // Three characters, sized so they stay square whatever shape the panel resolves to:
   // fitting five would only cost the name the height that makes it readable at 130 m.
   const size = Math.min(.66, span / 3.1);
   c.strokeStyle = red; c.lineWidth = .026;
   c.strokeRect(.5 - span / 2, .5 - size * .72, span, size * 1.44);
   c.fillStyle = cobalt; text('大盛堂', size, .5, .5, {max: span * .93});
  });},

 24(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#16181d');
  c.fillStyle = '#e8ecf2'; text('QFRONT', .28, .5, .5, {family: 'Arial,sans-serif', weight: '300'});},

 26(c) {const {text, disc, ring, box} = tools(c); box(0, 0, 1, 1, '#ffffff');
  disc(.5, .42, .26, '#00704a'); ring(.5, .42, .215, .022, '#ffffff');
  c.fillStyle = '#ffffff'; text('☕', .2, .5, .42);
  c.fillStyle = '#00704a'; text('STARBUCKS', .11, .5, .82, {family: 'Arial,sans-serif', weight: '700'});},

 23(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#d9111f');
  c.fillStyle = '#ffffff';
  text('Coca-Cola', .21, .5, .42, {family: '"Brush Script MT","Segoe Script","Apple Chancery",cursive', weight: '700', style: 'italic', max: .86});
  c.strokeStyle = '#ffffff'; c.lineWidth = .016;
  c.beginPath(); c.moveTo(.1, .62); c.bezierCurveTo(.32, .55, .62, .72, .9, .58); c.stroke();
  c.fillStyle = '#ffd9dc'; text('SHIBUYA', .06, .5, .83, {family: 'Arial,sans-serif'});},

 25(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#f2f6ff');
  box(0, 0, 1, .28, '#0b2d6b');
  c.fillStyle = '#ffffff'; text('Start saving now!', .1, .5, .14, {family: 'Arial,sans-serif', weight: '700'});
  c.fillStyle = '#0b2d6b'; text('いま、はじめる', .11, .5, .44);
  box(.18, .58, .64, .17, '#e8b000');
  c.fillStyle = '#20324f'; text('資産形成', .12, .5, .665);
  c.fillStyle = '#6a7a95'; text('SHIBUYA BANK', .06, .5, .87, {family: 'Arial,sans-serif'});},

 27(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#0a3d91');
  c.fillStyle = '#ffffff'; text('TSUTAYA', .2, .5, .38, {family: 'Arial,sans-serif', weight: '900'});
  box(.2, .56, .6, .03, '#ffd400');
  c.fillStyle = '#ffd400'; text('BOOKS / CAFE', .085, .5, .73, {family: 'Arial,sans-serif'});},

 28(c) {const {column, box} = tools(c); box(0, 0, 1, 1, '#123a7a');
  column('SEIBU', .13, .5, .16, .17, '#ffffff');},

 29(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#00a05a');
  box(.06, .3, .16, .18, '#ffffff'); box(.1, .26, .08, .26, '#ffffff');
  c.fillStyle = '#ffffff'; text('CITY DRUG', .17, .6, .39, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#eaffe9'; text('毎日を楽しもう', .13, .5, .72);},

 30(c) {const {text, box} = tools(c); box(0, 0, 1, 1, '#e2001a');
  box(.05, .08, .9, .46, '#ffffff');
  c.fillStyle = '#e2001a'; text('サンドラッグ', .17, .5, .31);
  c.fillStyle = '#ffffff'; text('SUN DRUG', .12, .5, .68, {family: 'Arial,sans-serif', weight: '900'});
  c.fillStyle = '#ffd9dc'; text('処方せん受付', .075, .5, .87);},

 // A vision screen running a key visual: no wordmark, no strapline, just artwork, which is
 // what the block's real screen carries between spots. Drawn from primitives like every
 // other panel here — a generic figure in a house style, not a likeness of any character,
 // and nothing is downloaded. At 130 m what reads is the colour split, the hair silhouette
 // and the pose, so those carry the composition and the detail stays cheap.
 101(c) {const {disc} = tools(c);
  const shape = (style, draw) => {c.fillStyle = style; c.beginPath(); draw(); c.closePath(); c.fill();};
  const poly = (style, pts) => shape(style, () => pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)));
  // Canvas gradients are not available on every context this sheet is painted through, so
  // depth is built from stacked washes instead. Cheap, and it survives the CPU path.
  const oval = (x, y, rx, ry, style, turn = 0) => {
   c.save(); c.translate(x, y); c.rotate(turn); c.scale(1, ry / rx);
   disc(0, 0, rx, style); c.restore();
  };

  // Field: night blue lifted behind the head, so the figure reads without an outline.
  c.fillStyle = '#061a4c'; c.fillRect(0, 0, 1, 1);
  [[.66, '#0c2d78'], [.5, '#12409e'], [.34, '#1a54bb'], [.2, '#2f6fd6']]
   .forEach(([r, s]) => disc(.48, .4, r, s));
  // The diagonal sweep a key visual is built on, with the spray that sells the motion.
  poly('#eef4ff', [[0, .9], [1, .68], [1, 1], [0, 1]]);
  poly('#cfe0ff', [[0, .9], [1, .68], [1, .72], [0, .94]]);
  for (const [x, y, r] of [[.1, .8, .045], [.22, .9, .026], [.85, .63, .05], [.95, .73, .024],
   [.3, .96, .018], [.72, .58, .02]]) disc(x, y, r, '#a9c8ff');

  // Body, under the head so the jaw overlaps the collar.
  poly('#e9edf6', [[.16, 1], [.3, .64], [.7, .64], [.84, 1]]);          // shirt
  poly('#cdd6e6', [[.16, 1], [.3, .64], [.38, .64], [.3, 1]]);         // shaded side
  poly('#123a94', [[.41, .63], [.5, .8], [.59, .63]]);                  // open collar
  poly('#2b5fd0', [[.47, .72], [.53, .72], [.55, .92], [.45, .92]]);    // tie

  // Hair behind the head first, so the face sits into it rather than on top of it.
  shape('#37764a', () => {
   c.moveTo(.235, .66);
   c.bezierCurveTo(.185, .30, .30, .10, .50, .10);
   c.bezierCurveTo(.70, .10, .815, .30, .765, .66);
   c.bezierCurveTo(.72, .44, .66, .30, .50, .30);
   c.bezierCurveTo(.34, .30, .28, .44, .235, .66);
  });

  // Head. An anime skull is a wide cranium tapering to a narrow chin, so it is drawn as
  // curves rather than a circle — a circle is what made the first attempt read as a doll.
  shape('#ffe3ce', () => {
   c.moveTo(.315, .38);
   c.bezierCurveTo(.315, .19, .685, .19, .685, .38);
   c.bezierCurveTo(.685, .50, .60, .60, .50, .665);
   c.bezierCurveTo(.40, .60, .315, .50, .315, .38);
  });
  shape('#f3cab1', () => {                                              // shade down the far side
   c.moveTo(.625, .28); c.bezierCurveTo(.70, .36, .665, .52, .50, .665);
   c.bezierCurveTo(.60, .53, .635, .40, .625, .28);
  });
  poly('#e7b49a', [[.445, .645], [.555, .645], [.535, .70], [.465, .70]]);  // neck, in shade

  // Eyes. The lash line is a curved band rather than a bar, the iris is banded light to
  // dark, and two highlights sit off-centre; that combination is what reads as an eye.
  for (const [x, dir] of [[.425, -1], [.575, 1]]) {
   oval(x, .462, .058, .072, '#ffffff');
   oval(x + dir * .004, .472, .046, .060, '#2f93df');
   oval(x + dir * .004, .480, .035, .047, '#1663ab');
   oval(x + dir * .004, .478, .019, .029, '#0a1c33');
   disc(x - dir * .020, .433, .017, '#ffffff');
   disc(x + dir * .022, .502, .009, '#cfe9ff');
   shape('#23283a', () => {                                            // upper lash
    c.moveTo(x - .063, .424); c.quadraticCurveTo(x, .378, x + .063, .420);
    c.quadraticCurveTo(x, .408, x - .063, .444);
   });
   c.strokeStyle = '#35774a'; c.lineWidth = .015; c.lineCap = 'round';  // brow
   c.beginPath(); c.moveTo(x - dir * .052, .368);
   c.quadraticCurveTo(x, .336, x + dir * .050, .360); c.stroke();
  }
  oval(.5, .552, .012, .008, '#e9bfa5');                                // nose
  shape('#c06a63', () => {                                              // mouth
   c.moveTo(.474, .592); c.quadraticCurveTo(.5, .616, .526, .592);
   c.quadraticCurveTo(.5, .602, .474, .592);
  });
  oval(.383, .535, .035, .017, '#ffc2b1');                              // blush, inside the cheek
  oval(.617, .535, .035, .017, '#ffc2b1');

  // Bangs: locks that hang DOWN from the crown to the brow, each with a pointed tip and
  // each overlapping the next. Spikes pointing up read as a crown, not as hair.
  for (const [x0, x1, tipX, tipY] of [
   [.285, .40, .325, .47], [.375, .495, .445, .425], [.485, .605, .545, .455], [.595, .715, .675, .40]
  ]) shape('#6cc07f', () => {
   c.moveTo(x0, .235); c.quadraticCurveTo((x0 + x1) / 2, .16, x1, .235);
   c.quadraticCurveTo(x1 - .01, .37, tipX, tipY);
   c.quadraticCurveTo(x0 + .015, .35, x0, .235);
  });
  for (const dir of [-1, 1])                                           // side locks past the jaw
   shape('#4f9c63', () => {
    const x = .5 + dir * .215;
    c.moveTo(x - dir * .045, .24);
    c.quadraticCurveTo(x + dir * .075, .40, x + dir * .028, .70);
    c.quadraticCurveTo(x - dir * .012, .52, x - dir * .075, .42);
    c.quadraticCurveTo(x - dir * .075, .30, x - dir * .045, .24);
   });
  // The bangs throw a shadow across the forehead. Without it the hair reads as a hat.
  shape('#f0c2a8', () => {
   c.moveTo(.33, .36); c.quadraticCurveTo(.5, .46, .67, .36);
   c.quadraticCurveTo(.5, .40, .33, .36);
  });
  for (const [x0, x1] of [[.335, .40], [.55, .615]])                    // highlight streaks
   poly('#b6ecc2', [[x0, .30], [x1, .27], [x1 - .014, .215], [x0 + .01, .238]]);
  // Light streaks across the field, which is what gives a key visual its motion.
  c.globalAlpha = .16;
  for (const [x, w] of [[.06, .035], [.18, .018], [.86, .04], [.96, .02]])
   poly('#ffffff', [[x, 0], [x + w, 0], [x + w - .10, .68], [x - .10, .68]]);
  c.globalAlpha = 1;},

 // The MAGNET facade's own panels. The hero builder measures where they hang; these give
 // them a face. Drawn from scratch like every other panel here — no logo file, no brand
 // font, and the wordmark is an approximation of a sign in the frame, not the trademark.
 201(c, aspect) {const {text} = tools(c);
  c.fillStyle = '#08090b'; c.fillRect(0, 0, 1, 1);
  trueShape(c, aspect, wide => {
   const span = .94 * wide, left = .5 - span / 2, s = Math.min(.3, span * .085), cx = left + span * .09, cy = .44;
   // An angular mark rather than a letter, the way the real fascia carries one.
   c.fillStyle = '#ffffff';
   c.beginPath();
   c.moveTo(cx - s, cy + s); c.lineTo(cx - s * .62, cy - s); c.lineTo(cx, cy + s * .18);
   c.lineTo(cx + s * .62, cy - s); c.lineTo(cx + s, cy + s); c.lineTo(cx + s * .52, cy + s);
   c.lineTo(cx + s * .3, cy + s * .04); c.lineTo(cx, cy + s * .84); c.lineTo(cx - s * .3, cy + s * .04);
   c.lineTo(cx - s * .52, cy + s); c.closePath(); c.fill();
   c.fillStyle = '#ffffff';
   text('MAGNET', Math.min(.56, span * .19), left + span * .6, .4,
    {family: 'Arial,sans-serif', weight: '900', max: span * .68});
   c.fillStyle = '#9aa0a6';
   text('by SHIBUYA109', Math.min(.15, span * .052), left + span * .6, .76,
    {family: 'Arial,sans-serif', weight: '700', max: span * .52});
  });},

 202(c, aspect) {const {text, box} = tools(c);
  box(0, 0, 1, 1, '#f5f3ef');
  trueShape(c, aspect, wide => {
   const span = .74 * wide, left = .5 - span / 2;
   c.strokeStyle = '#15171b'; c.lineWidth = Math.max(.008, span * .05);
   c.strokeRect(left, .075, span, .85);
   c.fillStyle = '#15171b';
   text('N°', Math.min(.3, span * .58), .5, .29,
    {family: 'Georgia,"Times New Roman",serif', weight: '400', max: span * .66});
   text('5', Math.min(.58, span * 1.05), .5, .64,
    {family: 'Georgia,"Times New Roman",serif', weight: '400', max: span * .82});
  });},

 203(c, aspect) {const {box, disc} = tools(c);
  // The vision runs a culture spot, so it carries a key visual and no wording. Flat washes
  // only: this sheet is painted through contexts where canvas gradients are unavailable.
  box(0, 0, 1, 1, '#120a1e');
  for (const [fill, x] of [['#ff2d6f', -.34], ['#ff7a3d', -.14], ['#ffd23f', .06], ['#2ee6c6', .26], ['#4d7cff', .46]]) {
   c.fillStyle = fill; c.beginPath();
   c.moveTo(x, 1); c.lineTo(x + .32, 0); c.lineTo(x + .48, 0); c.lineTo(x + .16, 1); c.closePath(); c.fill();
  }
  box(0, .84, 1, .16, '#0d0716');
  trueShape(c, aspect, wide => {
   const r = Math.min(.3, wide * .17), cx = .5 + wide * .1;
   disc(cx, .42, r, '#0d0716');
   disc(cx, .42, r * .74, '#f6f2ff');
   disc(cx, .42, r * .26, '#0d0716');
   box(.5 - wide * .42, .89, wide * .26, .045, '#f6f2ff');
   box(.5 - wide * .42, .955, wide * .15, .03, '#ff2d6f');
  });},
});

/** Ids the inventory carries that this sheet can draw. */
export const PAINTED_IDS = Object.freeze(Object.keys(REFERENCE_ART).map(Number).sort((a, b) => a - b));

/**
 * Paint the sheet.
 *
 * `aspects` maps an advertisement id to the width-over-height of the panel it will be
 * rendered on. Every tile is square and is stretched onto whatever shape its panel turns
 * out to be, so a painter that ignores this draws type that comes out squashed or, on the
 * wide bookshop fascia, stretched half again as wide as it should be. Painters that care
 * take the value and compensate; the rest are unaffected, and 1 is the old behaviour.
 */
export function paintReferenceAtlas(ctx, size, ids = PAINTED_IDS, columns = columnsFor(ids.length), aspects = {}) {
 const entries = referenceAtlasEntries(size, ids.length, columns);
 ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, size, size);
 ids.forEach((id, index) => {
  const e = entries[index], paint = REFERENCE_ART[id];
  if (!paint) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(e.x + e.padding, e.y + e.padding, e.w - 2 * e.padding, e.h - 2 * e.padding); ctx.clip();
  ctx.translate(e.x, e.y); ctx.scale(e.w, e.h);
  ctx.lineJoin = 'round';
  paint(ctx, aspects[id] > 0 ? aspects[id] : 1);
  ctx.restore();
 });
 return entries;
}

/**
 * Draw inside a horizontally widened space so that shapes come out true on a panel that is
 * `aspect` times wider than it is tall. Inside the callback x still runs 0..1 across the
 * panel, but a square drawn there renders square instead of stretched.
 */
export function trueShape(c, aspect, draw) {
 if (!(aspect > 0) || Math.abs(aspect - 1) < 1e-6) return draw(1);
 c.save();
 c.translate(.5, 0); c.scale(1 / aspect, 1); c.translate(-.5, 0);
 draw(aspect);
 c.restore();
}

export function createReferenceAtlas({tier = 'high', maxTextureSize = 4096, canvasFactory, ids = PAINTED_IDS, aspects = {}} = {}) {
 const requested = REFERENCE_QUALITY[tier];
 if (!requested) throw Error('Unknown reference atlas tier');
 if (!(maxTextureSize >= 128)) throw Error('GPU texture limit too small');
 const size = Math.min(requested, 2 ** Math.floor(Math.log2(maxTextureSize)));
 const canvas = canvasFactory ? canvasFactory() : typeof document !== 'undefined' ? document.createElement('canvas') : null;
 let texture, mode;
 if (canvas) {
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Reference sign Canvas 2D unavailable');
  paintReferenceAtlas(ctx, size, ids, undefined, aspects);
  texture = new CanvasTexture(canvas); mode = 'canvas';
 } else {
  texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat); mode = 'cpu-placeholder';
 }
 texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
 texture.generateMipmaps = false; texture.needsUpdate = true;
 const entries = referenceAtlasEntries(size, ids.length);
 const index = new Map(ids.map((id, i) => [id, entries[i]]));
 let disposed = false;
 return {texture, mode, size, ids, entries, entryFor: id => index.get(id) ?? null,
  dispose() {if (disposed) return; disposed = true; texture.dispose();}};
}

/** Inventory entries this sheet has artwork for, for reporting and tests. */
export const PAINTED_ADS = Object.freeze(PANELS.filter(ad => REFERENCE_ART[ad.id]));
