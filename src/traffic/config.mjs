export const PROFILES={high:{moving:62,parked:12},medium:{moving:30,parked:7},low:{moving:14,parked:3}};
// Looks C: the spawn weights are the plan's Scramble mix (taxis 25, minivan 14, kei 12,
// vans 10, trucks 8, scooter 5, coupe 2, police 1.5, bus on major roads only); the sedan takes
// what is left. `steer`, `grip` and `slide` are the handling the player gets in that body
// (vehicle-dynamics.mjs): steering lock, lateral grip and the handbrake slide's decay.
// Names are generic classes; no real maker or model name belongs in src/ (tests/name-guard).
export const VEHICLES={
 taxi:{width:1.72,length:4.5,height:1.5,speed:10,accel:1.8,brake:4,weight:15,color:0x3f927c,roofSign:true},
 sedan:{width:1.78,length:4.6,height:1.45,speed:11,accel:1.9,brake:4,weight:17.5,color:0x879ba9},
 kei:{width:1.45,length:3.35,height:1.55,speed:9,accel:1.7,brake:4,weight:7,color:0xd9c78e,steer:.66},
 van:{width:1.75,length:4.6,height:2,speed:9,accel:1.5,brake:4,weight:5,color:0xd4d8d4,steer:.56,grip:12},
 bus:{width:2.35,length:9,height:3,speed:8,accel:1.2,brake:3,weight:5,color:0x8dafb5,majorOnly:true,livery:'bus',steer:.45,grip:10},
 keiTruck:{width:1.45,length:3.4,height:1.75,speed:8,accel:1.5,brake:4,weight:4,color:0xc9d5d0},
 scooter:{width:.7,length:1.85,height:1.25,speed:8,accel:1.8,brake:4,weight:5,color:0xb96553},
 longVan:{width:1.88,length:5.1,height:2.15,speed:9,accel:1.4,brake:3.8,weight:5,color:0xe6e6e1,name:'Cargo Hauler',steer:.52,grip:11},
 minivan:{width:1.85,length:4.95,height:1.93,speed:10,accel:1.6,brake:4,weight:14,color:0x1c1e22,name:'Grand Voyage',steer:.56,grip:12},
 tallKei:{width:1.48,length:3.4,height:1.78,speed:9,accel:1.6,brake:4,weight:5,color:0xe8dcb4,name:'Tall Box K',steer:.64,grip:12},
 cityTaxi:{width:1.7,length:4.4,height:1.75,speed:10,accel:1.7,brake:4,weight:10,color:0x1d2440,name:'Metro Cab',roofSign:true},
 truck2t:{width:1.9,length:4.8,height:2.3,speed:8,accel:1.2,brake:3.5,weight:4,color:0xeeeeea,name:'Delivery 2t',cargo:{to:.06,height:2.95},steer:.5,grip:10},
 police:{width:1.8,length:4.9,height:1.47,speed:12,accel:2.1,brake:4.5,weight:1.5,color:0x121417,name:'Patrol',livery:'police',lightbar:true,steer:.64,grip:14,police:true},
 // PLAN-POLICE W2/W4 ☆4–☆5: never in ordinary traffic (weight 0). An unmarked dark saloon with a
 // magnetic red beacon, and a riot-squad transport in blue and white. Generic, unlettered.
 unmarked:{width:1.8,length:4.9,height:1.47,speed:13,accel:2.2,brake:4.5,weight:0,color:0x1a1d22,name:'Unmarked',fixedPaint:true,beacon:true,steer:.64,grip:14,police:true},
 // PLAN-LOOKS Step D: two one-off night cars, parked near the crossing (HIGH and MEDIUM). Weight 0:
 // never ordinary traffic. A compact FR coupe in silver-blue with a clean kit and a big wing, and a
 // short wide two-seater in gunmetal on black rims. Drift tune and a higher-revving voice. No decals.
 heroSilver:{width:1.72,length:4.3,height:1.28,speed:14,accel:2.5,brake:4.8,weight:0,color:0x9aa7b4,name:'Tsuki S',fixedPaint:true,hero:true,
  kit:{bonnet:false,wing:'big'},steer:.74,grip:8,slide:1.6,engine:{idleHz:64,revHz:220,wave:'sawtooth'}},
 heroDark:{width:1.84,length:4.2,height:1.27,speed:14.5,accel:2.7,brake:5,weight:0,color:0x3b3f45,name:'Yoru Z',fixedPaint:true,hero:true,rim:0x151618,
  kit:{bonnet:false,wing:'small'},steer:.72,grip:8.5,slide:1.7,engine:{idleHz:58,revHz:205,wave:'sawtooth'}},
 // Roadmap stage 4: an ambulance, sent only to collect the dead (life/aftermath.mjs). Weight 0:
 // never ordinary traffic. White with a red lower band and a red lightbar; generic, unlettered.
 ambulance:{width:1.88,length:5.3,height:2.4,speed:12,accel:1.8,brake:4.2,weight:0,color:0xf3f3ef,name:'Ambulance',livery:'ambulance',lightbar:true,steer:.52,grip:11,handDriven:true},
 // Roadmap stage 6: a street motorbike the player can ride (traffic/motorbike-shape.mjs). Weight 0:
 // never ordinary traffic; a few stand parked round the map. Quicker off the line (`power`) and
 // faster than any car, narrow, and a hard hit throws the rider off. Generic, unbadged.
 motorbike:{width:.8,length:2.1,height:1.2,speed:17,accel:3.6,brake:6.5,weight:0,color:0xb3161c,name:'Street Naked',fixedPaint:true,twoWheel:true,handDriven:true,power:1.4,steer:.85,grip:15,slide:1.2,engine:{idleHz:74,revHz:310,wave:'square'}},
 riotBus:{width:2.3,length:7.6,height:2.9,speed:10,accel:1.3,brake:3.2,weight:0,color:0x1f3f7a,name:'Riot Transport',livery:'riot',steer:.45,grip:10,police:true},
 coupe:{width:1.78,length:4.4,height:1.3,speed:13,accel:2.4,brake:4.5,weight:2,color:0x9c1d22,name:'Street GT',steer:.68,grip:14},
 // PLAN-POLICE-AND-OWN-CAR Step H: the player's own drift fastback. Weight 0 and `owned`: traffic
 // never spawns or drives one. Orange with a black bonnet and kit (`kit`), pop-up lamps, round
 // tail lamps, dark rims, and a drift tune: more lock, less lateral grip, a longer handbrake slide.
 // PLAN-POLICE-VOICE-KAZE-DETAIL Step K2: the plan's orange, and a clearcoat physical material
 // (materialsFor in vehicle-asset.mjs) instead of the standard paint every other type gets.
 ownCar:{width:1.76,length:4.3,height:1.23,speed:14,accel:2.6,brake:4.8,weight:0,color:0xf39a1d,name:'Kaze FR',
  owned:true,kit:true,clearcoat:true,popups:true,roundTails:true,rim:0x25282c,steer:.74,grip:7.5,slide:1.5,
  track:.55,engine:{idleHz:74,revHz:236,wave:'square'}}
};
export const MAJOR=new Set(['trunk','primary','secondary','tertiary','trunk_link','primary_link','secondary_link','tertiary_link']);
export const DRIVEABLE=new Set([...MAJOR,'residential','unclassified','service','living_street']);
