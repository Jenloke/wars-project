import { asciiToMap } from './ascii';

/**
 * Tern Reach: 20 x 14, 180-degree rotationally symmetric. Two home islands, each
 * with a port and an airport, meet through a central island over two bridges;
 * its two neutral airports are the prize. An islet city off each flank can only
 * be reached by lander or copter, and reefs break up the sea lanes.
 */
export const TERN_REACH_ASCII = `
  ~~~~~~~~~~~~~~~~~~~~
  ~HR==.F.:~~~*~~~~~~~
  ~R.F=.M.C~~~~~~:.~~~
  ~A==C==.P~~*~~~.C~~~
  ~:..F.=F.~~~~~:.F.~~
  ~~C.:.==:~~~~~~~~*~~
  ~~~~~~~B~CT..:~~~~~~
  ~~~~~~:..TC~B~~~~~~~
  ~~*~~~~~~~~:==.:.C~~
  ~~.F.:~~~~~.F=.F..:~
  ~~~C.~~~*~~p.==C==a~
  ~~~.:~~~~~~C.M.=F.b~
  ~~~~~~~*~~~:.F.==bh~
  ~~~~~~~~~~~~~~~~~~~~
`;

export const ternReach = asciiToMap(TERN_REACH_ASCII, {
  id: 'ternReach',
  name: 'Tern Reach',
  author: 'Original',
  playerCount: 2,
  startingFunds: 0,
  incomePerProperty: 1000,
});
