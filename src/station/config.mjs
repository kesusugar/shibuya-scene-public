/** S5 elevations are local scene metres, inferred POC levels, not OSM ele/sea level. */
export const STATION=Object.freeze({limit:250,base:.15,jrDeck:6.5,ginzaDeck:14,jrGauge:1.067,ginzaGauge:1.435,railTop:.55,platformTop:1.5,platformClearance:2.05,sleeperSpacing:.65,pierSpacing:24,postSpacing:12,pedestrianTop:6.2,pedestrianWidth:3.2});
export const RESERVATIONS=Object.freeze([
 {id:'way/810356690',use:'Ginza platform/roof envelope',status:'used'},
 {id:'way/904652357',use:'Hachiko exit envelope; JR station context',status:'used'},
 {id:'way/904652318',use:'Indoor Central Paid Area: deferred, not a separate station mass',status:'untouched'},
 {id:'way/904734439',use:'Keio station: outside JR/Ginza scope',status:'untouched'},
 {id:'way/1350895889',use:'New South Exit: outside Hachiko core scope',status:'untouched'}
]);
export const PEDESTRIAN_IDS=['way/854794950','way/906194249','way/1354871463','way/1354871464'];
// Explicit source-backed interfaces; no invented links to the truncated network.
export const PEDESTRIAN_TERMINALS={
 'way/854794950:end':{type:'indoor-interface',source:'way/858994296'},
 'way/906194249:start':{type:'building-interface',source:'way/87250190'},
 'way/906194249:end':{type:'closed-continuation',reason:'source ends before next connection; end barrier retained'},
 'way/1354871464:end':{type:'ground-stair',height:.15}
};
