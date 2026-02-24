// Default model for analysis and AI games
export const DEFAULT_MODEL_ID = 'model_iter_100';

// Analysis settings
export const DEFAULT_ANALYSIS_DEPTH = 100; // Number of MCTS simulations
export const DEFAULT_TOP_MOVES = 5; // Number of top moves to show

// Analysis depth presets
export const DEPTH_PRESETS = [
  { label: 'Fast', value: 50 },
  { label: 'Normal', value: 100 },
  { label: 'Deep', value: 200 },
  { label: 'Very Deep', value: 500 },
  { label: 'Very Deep', value: 1000 },
];

// Top moves count options
export const TOP_MOVES_OPTIONS = [3, 5, 7, 10];
