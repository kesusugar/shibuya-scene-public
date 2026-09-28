// Reconstructed from the user's reference photograph, not official vector artwork.
// Coordinates remain existing scene slots until host-building survey is complete.
export const REAL_BRANDS = [
 ['UC','VISA','#f5f5ed','#0649b9','uc-reference'],
 ['Hisamitsu','サロンパス','#063bba','#ffffff','hisamitsu-reference']
];
export function paintRealBrand(c,style){
 if(style==='uc-reference'){
  c.fillStyle='#f5f5ed';c.fillRect(0,0,512,512);
  c.fillStyle='#e72639';c.beginPath();c.arc(256,212,177,0,Math.PI*2);c.fill();
  c.fillStyle='#fff';c.beginPath();c.arc(256,212,166,0,Math.PI*2);c.fill();
  c.fillStyle='#0649b9';c.beginPath();c.arc(256,212,151,0,Math.PI*2);c.fill();
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';c.font='bold 204px Arial';c.fillText('UC',256,219,272);
  c.fillStyle='#e92735';c.beginPath();c.arc(125,441,30,0,Math.PI*2);c.fill();
  c.fillStyle='#efa72b';c.beginPath();c.arc(168,441,30,0,Math.PI*2);c.fill();
  c.fillStyle='#0649b9';c.font='italic bold 64px Arial';c.fillText('VISA',341,443,170);return true;
 }
 if(style==='hisamitsu-reference'){
  c.fillStyle='#063bba';c.fillRect(0,0,512,256);c.fillStyle='#009a42';c.fillRect(0,256,512,256);
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';c.font='bold 82px Arial';c.fillText('Hisamitsu',256,131,464);
  c.font='900 91px "Yu Gothic","Meiryo",sans-serif';c.fillText('サロンパス',256,377,467);return true;
 }
 return false;
}
