
export type ResourceType = 'WOOD' | 'BRICK' | 'SHEEP' | 'WHEAT' | 'ORE' | 'DESERT';

export type TerrainType = 'FOREST' | 'HILLS' | 'PASTURE' | 'FIELDS' | 'MOUNTAINS' | 'DESERT';

export type DevCardType = 'KNIGHT' | 'VICTORY_POINT' | 'MONOPOLY' | 'ROAD_BUILDING' | 'YEAR_OF_PLENTY';

export type PortType = '3:1' | 'WOOD' | 'BRICK' | 'SHEEP' | 'WHEAT' | 'ORE';

export interface DevCard {
  id: string;
  type: DevCardType;
  played: boolean;
  boughtThisTurn: boolean;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  resources: Record<ResourceType, number>;
  victoryPoints: number;
  devCards: DevCard[];
  knightCount: number;
}

export interface Hex {
  id: string;
  q: number;
  r: number;
  terrain: TerrainType;
  resource: ResourceType;
  tokenValue: number | null;
}

export interface ChatMessage {
  id: string;
  playerId: number;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface Intersection {
  id: string; 
  coords: { x: number; y: number };
  owner: number | null; // Player ID
  type: 'SETTLEMENT' | 'CITY' | null;
  adjacentHexIds: string[];
  port?: PortType;
}

export interface Edge {
  id: string;
  owner: number | null;
  adjacentIntersections: string[];
}

export type GamePhase = 'INITIAL_PLACEMENT' | 'ROLLING' | 'BUILDING' | 'MOVING_ROBBER' | 'STEALING' | 'TRADING' | 'WON';

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  board: Hex[];
  intersections: Record<string, Intersection>;
  edges: Record<string, Edge>;
  phase: GamePhase;
  diceRoll: [number, number] | null;
  logs: string[];
  chatMessages: ChatMessage[];
  longestRoadOwnerId?: number | null;
  longestRoadLength?: number;
  largestArmyOwnerId?: number | null;
  devCardDeck: DevCardType[];
  robberHexId: string;
  stealingCandidates?: number[];
}
