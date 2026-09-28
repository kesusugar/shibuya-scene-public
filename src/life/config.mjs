// Independent procedural citizens; metres, +X east / -Z north. No character assets.
export const QUALITY={high:{total:1978,idle:64,milling:36,groups:18},medium:{total:210,idle:30,milling:18,groups:8},low:{total:95,idle:12,milling:8,groups:3}};
export const ARCHETYPES={
 office:{height:1.74,width:.42,speed:[1.15,1.5],colors:[0x343f51,0x556173,0x29374b],bag:true},
 student:{height:1.62,width:.38,speed:[1.2,1.6],colors:[0x384768,0x7e4b55,0xd8d3b9],bag:true},
 casual:{height:1.7,width:.43,speed:[1.1,1.5],colors:[0xc38966,0x738d88,0xb7b9c4]},
 hoodie:{height:1.76,width:.48,speed:[1.1,1.5],colors:[0x61616e,0xb59167,0x536c5e],hood:true},
 shopper:{height:1.64,width:.42,speed:[.95,1.35],colors:[0xb98193,0xa2b29b,0xdac5a5],bag:true},
 tourist:{height:1.78,width:.46,speed:[1,1.4],colors:[0xcfa35c,0x527c99,0xb3846b],bag:true,hat:true},
 elderly:{height:1.55,width:.4,speed:[.85,1.1],colors:[0x8c8e80,0x938795,0x647780],gray:true},
 kid:{height:1.18,width:.32,speed:[1.05,1.35],colors:[0xe0b765,0x79b0bd,0xd5878c]},
 jogger:{height:1.76,width:.38,speed:[1.7,2],colors:[0x87ae73,0xc57960,0x6a94b2]},
 pastel:{height:1.69,width:.42,speed:[1.1,1.45],colors:[0xd8adbf,0xc2b9dd,0xb1d7ce],bag:true},
 umbrella:{height:1.67,width:.42,speed:[1,1.3],colors:[0x769aaa,0xae7182,0xd1b58c],umbrella:true}
};
export const BODY_VARIANTS=[{key:'body0',count:776},{key:'body1',count:476},{key:'body2',count:310},{key:'body3',count:416}];
export const HAIR_VARIANTS=[{key:'hair0',count:856},{key:'hair1',count:880},{key:'hair2',count:242}];
export const ACCESSORY_TARGETS={phone:658,bag:174,cane:63,suitcase:63,umbrella:14};
export const RADIUS=.25,STEP=1.25,POOL_SIZE=1978;
export function district(x,z){return x>-10&&x<65&&z>12&&z<105?'hachiko':x< -25&&x> -220&&z< -20&&z> -135?'center-gai':x>30&&z>20&&z<205?'station':'commercial';}
