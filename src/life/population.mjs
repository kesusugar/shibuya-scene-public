// How many people are out at each time of day (roadmap stage 4), as a share of the tier's crowd.
// Shibuya is never empty: the crossing is busiest by day and into the evening, still busy at
// night (the bars and the last trains), and quietest at dawn. No rain (the owner's call).
export const POPULATION = Object.freeze({dawn: .35, day: 1, dusk: .9, night: .6});

/** The share for a time state ('dawn' | 'day' | 'dusk' | 'night'); 1 for anything else. */
export function populationFor(time) {return POPULATION[time] ?? 1;}
