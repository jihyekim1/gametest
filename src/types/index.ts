export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type GameType = 'wipe' | 'telepathy' | 'mirror';

export interface Game {
  id: string;
  name: string;
  type: GameType;
  description: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  isActive: boolean;
  phase: 2 | 3;
  comingSoon: boolean;
}


export type GamePhase = 'nickname' | 'countdown' | 'playing' | 'round-result' | 'game-over';
