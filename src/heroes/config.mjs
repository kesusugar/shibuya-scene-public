import {HERO_IDS} from '../data/normalize.mjs';
export const HERO_CONFIG=Object.freeze({base:.15,limit:250,panelOffset:.045,screenOffset:.09,curveSegments:24,floorHeight:3.6});
export const HERO_DEFINITIONS=Object.freeze([
 {key:'qfront',name:'QFRONT',id:HERO_IDS.qfront,builder:'qfront',height:45.9,source:'OSM height; roof included',screenBottom:8,screenHeight:23.5},
 {key:'109',name:'SHIBUYA 109',id:HERO_IDS['109'],builder:'109',height:33.6,source:'OSM height'},
 {key:'magnet',name:'MAGNET',id:HERO_IDS.magnet,builder:'magnet',height:34.2,source:'OSM height'},
 {key:'scrambleSquare',name:'Shibuya Scramble Square',id:HERO_IDS.scrambleSquare,builder:'scrambleSquare',height:229.706,source:'OSM height; official description approximately 230m'},
 {key:'seibuA',name:'Seibu Shibuya A',id:HERO_IDS.seibuA,builder:'seibuA',height:30,source:'OSM height'},
 {key:'seibuB',name:'Seibu Shibuya B',id:HERO_IDS.seibuB,builder:'seibuB',height:31.1,source:'OSM height'},
 {key:'markCityEast',name:'Shibuya Mark City East',id:HERO_IDS.markCityEast,builder:'markCity',height:99.67,source:'https://www.s-markcity.co.jp/company/',variant:'east'},
 {key:'markCityWest',name:'Shibuya Mark City West',id:'way/54500467',builder:'markCity',height:95.55,source:'https://www.s-markcity.co.jp/company/',variant:'west'},
 {key:'stream',name:'Shibuya Stream',id:HERO_IDS.stream,builder:'stream',height:179.95,source:'OSM height; official description approximately 180m'}
]);
export const REFERENCES=[
 {url:'https://www.tokyu-reit.co.jp/portfolio/detail?id=1',use:'QFRONT: scramble-facing commercial block and large vision; 8 above-ground floors.'},
 {url:'https://www.tokyu.co.jp/company/news/pdf/130725-3-1.pdf',use:'QFRONT screen location at Hachiko crossing; placeholder only, no assets copied.'},
 {url:'https://www.shibuya-scramble-square.com/assets/pdf/about/191101.pdf',use:'Scramble Square approximately 230m / 47 floors.'},
 {url:'https://www.s-markcity.co.jp/company/',use:'Mark City East 99.67m, West 95.55m. Overrides five-level OSM podium-only tags.'},
 {url:'https://www.tokyu.co.jp/company/news/pdf/171117-s.pdf',use:'Stream approximately 180m / 35 floors. OSM height retained.'}
];
