// Money (roadmap stage 5). Pure: a wallet that is paid for missions and pays the shop, the
// hospital and the police. GTA's rules, softened: dying or being arrested costs a share of what
// you carry, never more than a cap and never into debt.

export const ECONOMY = Object.freeze({
 start: 5000,                  // ¥ a new game starts with
 deathFee: .1, arrestFee: .15, // share of the wallet
 feeCap: 20000,                // ¥ at most per death or arrest
 max: 99999999
});

/** @param {{money?:number}} [options] */
export function createWallet({money = ECONOMY.start} = {}) {
 let cash = Math.max(0, Math.round(Number(money) || 0));
 const log = [];
 const note = (amount, reason) => {log.push({amount, reason}); if (log.length > 20) log.shift();};
 return {
  get money() {return cash;},
  get log() {return log.slice();},
  /** Paid: a mission reward. */
  earn(amount, reason = '') {const a = Math.max(0, Math.round(amount)); cash = Math.min(ECONOMY.max, cash + a); note(a, reason); return cash;},
  /** Buying something: false (and nothing taken) when there is not enough. */
  spend(amount, reason = '') {const a = Math.max(0, Math.round(amount)); if (a > cash) return false; cash -= a; note(-a, reason); return true;},
  /** The hospital's or the police's bill: a share, capped, never below zero. Returns what was taken. */
  penalty(kind) {
   const share = kind === 'arrest' ? ECONOMY.arrestFee : ECONOMY.deathFee;
   const fee = Math.min(ECONOMY.feeCap, Math.round(cash * share));
   cash -= fee; note(-fee, kind); return fee;
  },
  set(value) {cash = Math.max(0, Math.min(ECONOMY.max, Math.round(Number(value) || 0)));}
 };
}

/** ¥12,345 */
export const yen = n => '¥' + Math.round(n).toLocaleString('ja-JP');
