import type { AIModel, SavedGame } from '@/src/lib/game-types';

// AI Models - fetched from server, empty array as initial value
export const AI_MODELS: AIModel[] = [];

// Saved games - initially empty
export const MOCK_SAVED_GAMES: SavedGame[] = [];

// Game configuration constants
export const DEFAULT_SIMULATIONS = 100;
export const MIN_SIMULATIONS = 10;
export const MAX_SIMULATIONS = 1000;
export const DEFAULT_TEMPERATURE = 1.0;
export const DEFAULT_COMPARE_GAMES = 10;
