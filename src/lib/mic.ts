// Only one thing listens at a time. The speech events are app-wide, so each
// listener checks it owns the mic before using what it hears.
let owner: string | null = null;
export const micOwner = () => owner;
export const claimMic = (who: string) => {
  owner = who;
};
export const releaseMic = (who: string) => {
  if (owner === who) owner = null;
};
