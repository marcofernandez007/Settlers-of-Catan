
import { TerrainType, ResourceType } from './types';

export const HEX_SIZE = 60;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

export const TERRAIN_DATA: Record<TerrainType, { resource: ResourceType; color: string; icon: string }> = {
  FOREST: { resource: 'WOOD', color: '#2d5a27', icon: 'fa-tree' },
  HILLS: { resource: 'BRICK', color: '#a0522d', icon: 'fa-mountain-sun' },
  PASTURE: { resource: 'SHEEP', color: '#7cfc00', icon: 'fa-sheep' },
  FIELDS: { resource: 'WHEAT', color: '#ffd700', icon: 'fa-wheat-awn' },
  MOUNTAINS: { resource: 'ORE', color: '#708090', icon: 'fa-mountain' },
  DESERT: { resource: 'DESERT', color: '#f4a460', icon: 'fa-sun' },
};

export const TOKEN_VALUES = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const BUILDING_COSTS: Record<string, Partial<Record<ResourceType, number>>> = {
  ROAD: { WOOD: 1, BRICK: 1 },
  SETTLEMENT: { WOOD: 1, BRICK: 1, SHEEP: 1, WHEAT: 1 },
  CITY: { WHEAT: 2, ORE: 3 },
  DEV_CARD: { SHEEP: 1, WHEAT: 1, ORE: 1 },
};

export const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];
