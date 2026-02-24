'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AIModel,
  CompareResult,
  CompareSettings,
  ComparisonProgress,
  GameSettings,
  GameState,
  Move,
  SavedGame,
} from './game-types';
import { createInitialState, getValidMoves, makeMove, replayMoves, undoMove } from './game-logic';
import { AI_MODELS, MOCK_SAVED_GAMES } from '@/src/constants/models';
import { getCachedAnalysis, setCachedAnalysis } from './analysis-cache';

interface ModelPrediction {
  move: { boardIndex: number; cellIndex: number };
  boardIndex?: number;
  cellIndex?: number;
  probability: number;
  value: number;
  dtw?: number;
  continuation?: string[];
}

interface ModelResponse {
  topMoves: ModelPrediction[];
  evaluation: number;
  thinkingTime: number;
  dtwSolved?: boolean;
  dtwOutcome?: 'win' | 'loss' | 'draw' | null;
  dtwDepth?: number | null;
}

interface GameStore {
  // Game state
  gameState: GameState;

  // Settings
  gameSettings: GameSettings;
  compareSettings: CompareSettings;

  // Data
  aiModels: AIModel[];
  savedGames: SavedGame[];
  compareResult: CompareResult | null;
  reviewingGame: SavedGame | null;

  // Comparison progress
  comparisonProgress: ComparisonProgress;
  comparisonAbortController: AbortController | null;

  // Analysis state
  analysisResult: ModelResponse | null;
  isAnalyzing: boolean;

  // Actions
  resetGame: () => void;
  playMove: (boardIndex: number, cellIndex: number) => void;
  undo: () => void;
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  goToPrevMove: () => void;
  goToNextMove: () => void;

  // Settings actions
  setAiFirst: (first: boolean) => void;
  setSimulations: (sims: number) => void;
  setSelectedModel: (model: AIModel | null) => void;
  setGameSettings: (settings: Partial<GameSettings>) => void;
  setCompareModel1: (model: AIModel | null) => void;
  setCompareModel2: (model: AIModel | null) => void;
  setCompareGames: (games: number) => void;
  setCompareSimulations: (sims: number) => void;
  setTemperature: (temp: number) => void;

  // AI actions
  fetchModels: () => Promise<void>;
  getAIPrediction: (modelId: string, state: GameState) => Promise<ModelResponse | null>;
  analyzePosition: (modelId: string, state?: GameState, options?: { simulations?: number; topK?: number }) => Promise<void>;

  // Game management
  loadGame: (game: SavedGame) => void;
  saveCurrentGame: (label?: string) => void;
  startComparison: () => Promise<void>;
  cancelComparison: () => void;
  getComparisonGame: (gameId: string) => SavedGame | undefined;
}

// API call to get prediction from model
async function fetchPrediction(
  modelId: string,
  gameState: GameState,
  options: { simulations?: number; temperature?: number; topK?: number } = {},
  signal?: AbortSignal
): Promise<ModelResponse> {
const requestBody = {
    modelId,
    gameState: {
      boards: gameState.board,
      metaBoard: gameState.boardWinners,
      currentPlayer: gameState.currentPlayer,
      activeBoard: gameState.activeBoard,
      moveHistory: gameState.moves.map(m => ({
        boardIndex: m.boardIndex,
        cellIndex: m.cellIndex,
        player: m.player,
      })),
    },
    simulations: options.simulations || 100,
    temperature: options.temperature || 1.0,
    topK: options.topK || 5,
  };
  
  // Timeout after 15s to prevent hanging requests from blocking future ones
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  const response = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Prediction failed: ' + errorText);
  }

  return response.json();
}

// Simulate a complete game between two models
async function simulateGameWithModels(
  model1Id: string,
  model2Id: string,
  model1Name: string,
  model2Name: string,
  gameIndex: number,
  simulations: number,
  temperature: number,
  signal: AbortSignal
): Promise<SavedGame> {
  let state = createInitialState();
  const moves: Move[] = [];
  const startTime = Date.now();
  let moveNumber = 1;

  // Play until game is over or max moves reached
  while (state.winner === null && moveNumber <= 81) {
    if (signal.aborted) {
      throw new Error('Cancelled');
    }

    const currentModelId = state.currentPlayer === 'X' ? model1Id : model2Id;

    try {
      const prediction = await fetchPrediction(
        currentModelId,
        state,
        { simulations, temperature, topK: 1 },
        signal
      );

      if (prediction.topMoves.length === 0) {
        // No valid moves, game is a draw
        break;
      }

      const bestMove = prediction.topMoves[0].move;
      
      // Verify move is valid
      const validMoves = getValidMoves(state);
      const isValid = validMoves.some(
        m => m.boardIndex === bestMove.boardIndex && m.cellIndex === bestMove.cellIndex
      );

      if (!isValid) {
        // Model returned invalid move, pick random valid move
        const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        if (!randomMove) break;
        
        moves.push({
          boardIndex: randomMove.boardIndex,
          cellIndex: randomMove.cellIndex,
          player: state.currentPlayer,
          moveNumber,
        });
        state = makeMove(state, randomMove.boardIndex, randomMove.cellIndex);
      } else {
        moves.push({
          boardIndex: bestMove.boardIndex,
          cellIndex: bestMove.cellIndex,
          player: state.currentPlayer,
          moveNumber,
        });
        state = makeMove(state, bestMove.boardIndex, bestMove.cellIndex);
      }

      moveNumber++;
    } catch (error) {
      if (signal.aborted) {
        throw new Error('Cancelled');
      }
      // On error, make a random valid move
      const validMoves = getValidMoves(state);
      if (validMoves.length === 0) break;
      
      const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      moves.push({
        boardIndex: randomMove.boardIndex,
        cellIndex: randomMove.cellIndex,
        player: state.currentPlayer,
        moveNumber,
      });
      state = makeMove(state, randomMove.boardIndex, randomMove.cellIndex);
      moveNumber++;
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  return {
    id: `compare-game-${gameIndex}-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    moves,
    winner: state.winner,
    model1: model1Name,
    model2: model2Name,
    moveCount: moves.length,
    duration,
  };
}

export const useGameStore = create<GameStore>()(persist((set, get) => ({
  // Initial state
  gameState: createInitialState(),

  gameSettings: {
    aiFirst: false,
    simulations: 100,
    selectedModel: null,
  },

  compareSettings: {
    model1: null,
    model2: null,
    numberOfGames: 10,
    simulations: 100,
    temperature: 1.0,
  },

  aiModels: AI_MODELS,
  savedGames: MOCK_SAVED_GAMES,
  compareResult: null,
  reviewingGame: null,

  comparisonProgress: {
    isRunning: false,
    currentGame: 0,
    totalGames: 0,
    percentComplete: 0,
  },
  comparisonAbortController: null,

  analysisResult: null,
  isAnalyzing: false,

  // Actions
  resetGame: () => set({ gameState: createInitialState(), analysisResult: null }),

  playMove: (boardIndex, cellIndex) =>
    set((state) => ({
      gameState: makeMove(state.gameState, boardIndex, cellIndex),
      analysisResult: null,
    })),

  undo: () =>
    set((state) => ({
      gameState: undoMove(state.gameState),
      analysisResult: null,
    })),

  goToMove: (index) =>
    set((state) => ({
      gameState: replayMoves(state.gameState.moves, index),
      analysisResult: null,
    })),

  goToStart: () =>
    set((state) => ({
      gameState: {
        ...createInitialState(),
        moves: state.gameState.moves,
        moveIndex: -1,
      },
      analysisResult: null,
    })),

  goToEnd: () =>
    set((state) => ({
      gameState: replayMoves(state.gameState.moves, state.gameState.moves.length - 1),
      analysisResult: null,
    })),

  goToPrevMove: () => {
    const { gameState } = get();
    if (gameState.moveIndex >= 0) {
      set({ 
        gameState: replayMoves(gameState.moves, gameState.moveIndex - 1),
        analysisResult: null,
      });
    }
  },

  goToNextMove: () => {
    const { gameState } = get();
    if (gameState.moveIndex < gameState.moves.length - 1) {
      set({ 
        gameState: replayMoves(gameState.moves, gameState.moveIndex + 1),
        analysisResult: null,
      });
    }
  },

  // Settings actions
  setAiFirst: (first) =>
    set((state) => ({
      gameSettings: { ...state.gameSettings, aiFirst: first },
    })),

  setSimulations: (sims) =>
    set((state) => ({
      gameSettings: { ...state.gameSettings, simulations: sims },
    })),

  setSelectedModel: (model) =>
    set((state) => ({
      gameSettings: { ...state.gameSettings, selectedModel: model },
    })),

  setGameSettings: (settings) =>
    set((state) => ({
      gameSettings: { ...state.gameSettings, ...settings },
    })),

  setCompareModel1: (model) =>
    set((state) => ({
      compareSettings: { ...state.compareSettings, model1: model },
    })),

  setCompareModel2: (model) =>
    set((state) => ({
      compareSettings: { ...state.compareSettings, model2: model },
    })),

  setCompareGames: (games) =>
    set((state) => ({
      compareSettings: { ...state.compareSettings, numberOfGames: games },
    })),

  setCompareSimulations: (sims) =>
    set((state) => ({
      compareSettings: { ...state.compareSettings, simulations: sims },
    })),

  setTemperature: (temp) =>
    set((state) => ({
      compareSettings: { ...state.compareSettings, temperature: temp },
    })),

  // AI actions
  fetchModels: async () => {
    try {
      const response = await fetch('/api/models');
      if (response.ok) {
        const models = await response.json();
        set({ aiModels: models });
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  },

  getAIPrediction: async (modelId, state) => {
    try {
      const { gameSettings } = get();
      return await fetchPrediction(modelId, state, {
        simulations: gameSettings.simulations,
        topK: 5,
      });
    } catch (error) {
      console.error('Failed to get AI prediction:', error);
      return null;
    }
  },

  analyzePosition: async (modelId, stateOverride, options) => {
    const { gameState: storeState, gameSettings } = get();
    const gameState = stateOverride || storeState;
    
    if (gameState.winner !== null) {
      set({ analysisResult: null, isAnalyzing: false });
      return;
    }

    const sims = options?.simulations ?? gameSettings.simulations;
    const topK = options?.topK ?? 5;

    // Check cache first
    const moves = gameState.moves.slice(0, gameState.moveIndex + 1);
    const cached = getCachedAnalysis(modelId, moves, sims);
    if (cached) {
      set({ analysisResult: cached, isAnalyzing: false });
      return;
    }

    set({ isAnalyzing: true });

    try {
      const result = await fetchPrediction(modelId, gameState, {
        simulations: sims,
        topK,
      });
      
      if (!result.topMoves) {
        result.topMoves = [];
      }
      
      // Cache the result
      setCachedAnalysis(modelId, moves, sims, result);
      
      set({ analysisResult: result, isAnalyzing: false });
    } catch {
      set({ analysisResult: null, isAnalyzing: false });
    }
  },

  // Game management
  loadGame: (game) =>
    set({
      reviewingGame: game,
      gameState: replayMoves(game.moves, game.moves.length - 1),
      analysisResult: null,
    }),

  saveCurrentGame: (label?: string) =>
    set((state) => {
      const modelName = state.gameSettings.selectedModel?.name || 'AI';
      const newGame: SavedGame = {
        id: `game-${Date.now()}`,
        date: new Date().toISOString(),
        moves: state.gameState.moves,
        winner: state.gameState.winner,
        model1: label || `You vs ${modelName}`,
        moveCount: state.gameState.moves.length,
        duration: 0,
      };
      return { savedGames: [newGame, ...state.savedGames] };
    }),

  startComparison: async () => {
    const { compareSettings } = get();
    if (!compareSettings.model1 || !compareSettings.model2) return;

    const abortController = new AbortController();
    const totalGames = compareSettings.numberOfGames;

    set({
      comparisonAbortController: abortController,
      comparisonProgress: {
        isRunning: true,
        currentGame: 0,
        totalGames,
        percentComplete: 0,
      },
      compareResult: {
        model1Wins: 0,
        model2Wins: 0,
        draws: 0,
        games: [],
        totalDuration: 0,
        avgMoveCount: 0,
      },
    });

    try {
      // Call the compare API with SSE streaming
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model1: compareSettings.model1.id,
          model2: compareSettings.model2.id,
          numGames: totalGames,
          simulations: compareSettings.simulations,
          temperature: compareSettings.temperature,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start comparison');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                console.error('Compare API error:', data.error);
                continue;
              }

              if (data.status === 'in_progress') {
                // Update progress and add latest game
                const latestGame = data.latest_game;
                const savedGame: SavedGame = {
                  id: `compare-game-${latestGame.game_number}-${Date.now()}`,
                  date: new Date().toISOString().split('T')[0],
                  moves: latestGame.moves.map((m: { move_number: number; player: number; action: number; position: [number, number] }) => {
                    // position is [row, col] in the 9x9 grid (0-indexed)
                    const [row, col] = m.position;
                    const boardRow = Math.floor(row / 3);
                    const boardCol = Math.floor(col / 3);
                    const cellRow = row % 3;
                    const cellCol = col % 3;
                    return {
                      boardIndex: boardRow * 3 + boardCol,
                      cellIndex: cellRow * 3 + cellCol,
                      player: m.player === 1 ? 'X' : 'O' as const,
                      moveNumber: m.move_number,
                    };
                  }),
                  winner: latestGame.winner === 1 ? 'X' : latestGame.winner === 2 ? 'O' : 'draw',
                  model1: compareSettings.model1?.name,
                  model2: compareSettings.model2?.name,
                  moveCount: latestGame.total_moves,
                  duration: latestGame.elapsed_time,
                };

                const currentResult = get().compareResult;
                const games = currentResult ? [...currentResult.games, savedGame] : [savedGame];

                set({
                  comparisonProgress: {
                    isRunning: true,
                    currentGame: data.completed_games,
                    totalGames: data.total_games,
                    percentComplete: Math.round((data.completed_games / data.total_games) * 100),
                  },
                  compareResult: {
                    model1Wins: data.current_summary.model1_wins,
                    model2Wins: data.current_summary.model2_wins,
                    draws: data.current_summary.draws,
                    games,
                    totalDuration: Math.round(data.current_summary.total_time),
                    avgMoveCount: Math.round(games.reduce((sum, g) => sum + g.moveCount, 0) / games.length),
                  },
                });
              } else if (data.status === 'completed') {
                // Final results
                const games: SavedGame[] = data.games.map((g: {
                  game_number: number;
                  moves: { move_number: number; player: number; action: number; position: [number, number] }[];
                  winner: number | null;
                  elapsed_time: number;
                  total_moves: number;
                }) => ({
                  id: `compare-game-${g.game_number}-${Date.now()}`,
                  date: new Date().toISOString().split('T')[0],
                  moves: g.moves.map(m => {
                    const [row, col] = m.position;
                    const boardRow = Math.floor(row / 3);
                    const boardCol = Math.floor(col / 3);
                    const cellRow = row % 3;
                    const cellCol = col % 3;
                    return {
                      boardIndex: boardRow * 3 + boardCol,
                      cellIndex: cellRow * 3 + cellCol,
                      player: m.player === 1 ? 'X' : 'O' as const,
                      moveNumber: m.move_number,
                    };
                  }),
                  winner: g.winner === 1 ? 'X' : g.winner === 2 ? 'O' : 'draw',
                  model1: compareSettings.model1?.name,
                  model2: compareSettings.model2?.name,
                  moveCount: g.total_moves,
                  duration: g.elapsed_time,
                }));

                set({
                  compareResult: {
                    model1Wins: data.summary.model1_wins,
                    model2Wins: data.summary.model2_wins,
                    draws: data.summary.draws,
                    games,
                    totalDuration: Math.round(data.summary.total_time),
                    avgMoveCount: Math.round(games.reduce((sum, g) => sum + g.moveCount, 0) / games.length),
                  },
                  comparisonProgress: {
                    isRunning: false,
                    currentGame: totalGames,
                    totalGames,
                    percentComplete: 100,
                  },
                  comparisonAbortController: null,
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Mark as complete if not already
      const progress = get().comparisonProgress;
      if (progress.isRunning) {
        set({
          comparisonProgress: {
            ...progress,
            isRunning: false,
          },
          comparisonAbortController: null,
        });
      }
    } catch (error) {
      // Comparison was cancelled or errored
      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled by user
      } else {
        console.error('Comparison error:', error);
      }
      
      const progress = get().comparisonProgress;
      set({
        comparisonProgress: {
          ...progress,
          isRunning: false,
        },
        comparisonAbortController: null,
      });
    }
  },

  cancelComparison: () => {
    const { comparisonAbortController } = get();
    if (comparisonAbortController) {
      comparisonAbortController.abort();
    }
  },

  getComparisonGame: (gameId) => {
    const { compareResult } = get();
    return compareResult?.games.find((g) => g.id === gameId);
  },
}), {
  name: 'uttt-game-storage',
  partialize: (state) => ({
    gameState: state.gameState,
    gameSettings: state.gameSettings,
    savedGames: state.savedGames,
  }),
}));
