import { asciiToMap } from './ascii';

/**
 * Twin Fords: 16 x 10, 180-degree rotationally symmetric. Player 1 starts
 * top-left, player 2 bottom-right, with an inlet and two bridges between them.
 */
export const TWIN_FORDS_ASCII = `
  ~~~~~~~~~~~~~~~~
  ~HR.F.C~.M..C.~~
  ~R==.==B==F.=C.~
  ~.C=FM.~.=.M=..~
  ~..===C~~===C.F~
  ~F.C===~~C===..~
  ~..=M.=.~.MF=C.~
  ~.C=.F==B==.==b~
  ~~.C..M.~C.F.bh~
  ~~~~~~~~~~~~~~~~
`;

export const twinFords = asciiToMap(TWIN_FORDS_ASCII, {
  id: 'twinFords',
  name: 'Twin Fords',
  author: 'Original',
  playerCount: 2,
  startingFunds: 0,
  incomePerProperty: 1000,
});
