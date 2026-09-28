// Who is in which car.
//
// RUN 9. Before this, nothing in the project could answer that question. A traffic car was a
// pool slot with a pose and a route and no one inside it; "carjacking" was `takeOver(slot)`,
// which flipped `controlled` on a slot at the moment the button went down. There was nobody to
// pull out because there was nobody in there.
//
// THIS FILE IS THE ONE AUTHORITY. Occupancy is never inferred from a mesh, from `controlled`,
// or from whether a driver happens to be drawn. The renderer reads it; the player's vehicle
// reads it; nothing writes it except through the transitions below.
//
// DATA-ORIENTED ON PURPOSE. The traffic pool is a fixed 146 slots, so occupancy is parallel
// typed arrays indexed by slot id -- no object per car, no allocation per spawn, and a
// driver costs 13 bytes rather than a skeleton. RUN 7 spent a whole run establishing that
// two thousand JS state objects is the thing this project avoids; a hundred and forty-six is
// not two thousand, but the discipline is the same and the arrays are simpler anyway.
//
// A DRIVER IS NOT A BODY. `driverId` and `seed` are an identity, not an actor. What that
// identity looks like is decided by whoever draws it, and only becomes a real pedestrian at
// extraction, through the crowd simulation that already exists.

/** What is in the driver's seat. */
export const OCCUPANT=Object.freeze({NONE:0,TRAFFIC_DRIVER:1,PLAYER:2});

/**
 * Where a traffic driver is in being removed from it.
 *
 * SEATED -> ALERT -> BEING_EXTRACTED -> EXTRACTED, and EXTRACTED immediately empties the
 * seat. The states before that are all still "in the car": the seat is not free, and the
 * player cannot take the wheel, until the body is out.
 */
export const DRIVER=Object.freeze({SEATED:0,ALERT:1,BEING_EXTRACTED:2,EXTRACTED:3});

const NAMES=['NONE','TRAFFIC_DRIVER','PLAYER'];
const DRIVER_NAMES=['SEATED','ALERT','BEING_EXTRACTED','EXTRACTED'];

export function createOccupancy(capacity=146){
 const occupant=new Uint8Array(capacity);
 const driverId=new Int32Array(capacity);
 const driverState=new Uint8Array(capacity);
 const seed=new Int32Array(capacity);
 driverId.fill(-1);
 // The player is in at most one car, and that is enforced here rather than hoped for: the
 // seat the player is in is a single value, so a second one cannot exist.
 let playerVehicle=-1;
 let nextDriverId=1;
 const stats={seated:0,extracted:0,drivers:0};

 const inRange=v=>Number.isInteger(v)&&v>=0&&v<capacity;

 const api={
  OCCUPANT,DRIVER,capacity,

  /** The car the player is in, or -1. */
  get playerVehicle(){return playerVehicle;},
  /** How many seats currently hold a traffic driver. */
  get drivers(){return stats.drivers;},

  /**
   * Put an ordinary driver in a car.
   *
   * `id` is stable for the life of that driver and survives extraction, so the person who
   * gets pulled out of the car is the same person who was sitting in it -- same appearance
   * seed, same body. A driver who changed shape on the way out of the door would read as a
   * different person, which is worse than an empty car.
   */
  seat(vehicle,{id=null,appearanceSeed=null}={}){
   if(!inRange(vehicle))return false;
   if(occupant[vehicle]!==OCCUPANT.NONE)return false;       // never two in one seat
   if(vehicle===playerVehicle)return false;
   occupant[vehicle]=OCCUPANT.TRAFFIC_DRIVER;
   driverId[vehicle]=id??nextDriverId++;
   if(id!==null&&id>=nextDriverId)nextDriverId=id+1;
   driverState[vehicle]=DRIVER.SEATED;
   // The seed drives appearance and nothing else. Deriving it from the driver id rather
   // than from the car means a driver keeps their face when the car they are in changes,
   // and two cars never hold the same person.
   seed[vehicle]=appearanceSeed??driverId[vehicle]*2654435761%2147483647;
   stats.seated++;stats.drivers++;
   return true;
  },

  /** Read the seat. Returns a fresh record, never a live reference into the arrays. */
  read(vehicle){
   if(!inRange(vehicle))return {type:OCCUPANT.NONE,typeName:'NONE',driverId:-1,state:DRIVER.SEATED,stateName:'SEATED',seed:0};
   return {type:occupant[vehicle],typeName:NAMES[occupant[vehicle]],
    driverId:driverId[vehicle],state:driverState[vehicle],
    stateName:DRIVER_NAMES[driverState[vehicle]],seed:seed[vehicle]};
  },

  /** Is there a traffic driver in this car? The question the carjack path asks. */
  hasDriver(vehicle){return inRange(vehicle)&&occupant[vehicle]===OCCUPANT.TRAFFIC_DRIVER;},
  /** Is the seat free for the player to move into? */
  isEmpty(vehicle){return inRange(vehicle)&&occupant[vehicle]===OCCUPANT.NONE;},

  /**
   * Move a seated driver along the extraction sequence. Only forwards, and only one step at
   * a time, so a carjack cannot skip from SEATED straight to an empty seat on one frame --
   * which is exactly the instant takeover this run exists to remove.
   */
  advance(vehicle,to){
   if(!api.hasDriver(vehicle))return false;
   if(to!==driverState[vehicle]+1)return false;
   if(to===DRIVER.EXTRACTED)return false;                   // extraction empties the seat; use `extract`
   driverState[vehicle]=to;
   return true;
  },

  /**
   * Take the driver out. The seat becomes NONE and the caller is handed the identity so it
   * can put a real pedestrian in the world with the same face.
   *
   * The seat is empty from here, and the player still does not own the car: ownership is a
   * separate transition that happens when the player reaches the seat. Between the two the
   * car has no occupant at all, which is the honest description of a carjacking in progress
   * and is what stops the player driving away with the driver still sitting in it.
   */
  extract(vehicle){
   if(!api.hasDriver(vehicle))return null;
   if(driverState[vehicle]!==DRIVER.BEING_EXTRACTED)return null;
   const record={driverId:driverId[vehicle],seed:seed[vehicle],vehicle};
   occupant[vehicle]=OCCUPANT.NONE;driverId[vehicle]=-1;driverState[vehicle]=DRIVER.SEATED;
   stats.extracted++;stats.drivers--;
   return record;
  },

  /** Give up on an extraction in progress: the driver is still in the car, and calms down. */
  abort(vehicle){
   if(!api.hasDriver(vehicle))return false;
   driverState[vehicle]=DRIVER.SEATED;
   return true;
  },

  /**
   * The player takes the seat. Refused while anyone else is in it -- the check is here and
   * not at the call site, because "is the seat free" is this file's question to answer.
   */
  takeSeat(vehicle){
   if(!inRange(vehicle))return false;
   if(occupant[vehicle]!==OCCUPANT.NONE)return false;
   if(playerVehicle===vehicle)return true;
   if(playerVehicle>=0)api.leaveSeat(playerVehicle);        // never in two cars at once
   occupant[vehicle]=OCCUPANT.PLAYER;playerVehicle=vehicle;
   return true;
  },

  /** The player gets out. The car is empty afterwards; traffic may re-seat it later. */
  leaveSeat(vehicle){
   if(!inRange(vehicle)||occupant[vehicle]!==OCCUPANT.PLAYER)return false;
   occupant[vehicle]=OCCUPANT.NONE;
   if(playerVehicle===vehicle)playerVehicle=-1;
   return true;
  },

  /**
   * The car is gone -- despawned, recycled, retiered. Whoever was in it goes with it.
   * Without this a despawned slot keeps its driver and the next car to reuse the slot is
   * born with a stranger already sitting in it.
   */
  vacate(vehicle){
   if(!inRange(vehicle))return false;
   if(occupant[vehicle]===OCCUPANT.TRAFFIC_DRIVER)stats.drivers--;
   occupant[vehicle]=OCCUPANT.NONE;driverId[vehicle]=-1;driverState[vehicle]=DRIVER.SEATED;
   if(playerVehicle===vehicle)playerVehicle=-1;
   return true;
  },

  /** Every seat holding a traffic driver, for the renderer to walk. */
  eachDriver(fn){
   for(let i=0;i<capacity;i++)if(occupant[i]===OCCUPANT.TRAFFIC_DRIVER)
    fn(i,driverId[i],seed[i],driverState[i]);
  },

  inspect(){
   let none=0,traffic=0,player=0;
   for(let i=0;i<capacity;i++){
    if(occupant[i]===OCCUPANT.NONE)none++;
    else if(occupant[i]===OCCUPANT.TRAFFIC_DRIVER)traffic++;else player++;
   }
   return {capacity,none,drivers:traffic,player,playerVehicle,
    seated:stats.seated,extracted:stats.extracted};
  }
 };
 return api;
}
