import type { GameState } from './game-types';

// =====================================================
// API Configuration
// =====================================================

// Hugging Face Spaces URL (Gradio API)
// Set this environment variable to your HF Space URL
// Example: https://your-username-ultimate-ttt.hf.space
const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || '';

// =====================================================
// Types
// =====================================================

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  type?: 'alphazero' | 'mcts' | 'random';
}

export interface ModelPrediction {
  move: { boardIndex: number; cellIndex: number };
  boardIndex?: number;
  cellIndex?: number;
  probability: number;
  value: number;
  dtw?: number;
  continuation?: string[];
}

export interface ModelResponse {
  topMoves: ModelPrediction[];
  evaluation: number; // -1 to 1, from current player's perspective
  thinkingTime: number; // ms
  policy?: number[]; // full 81 probabilities
  principalVariation?: { action: number; move: number[]; visits: number; value: number }[];
  dtwSolved?: boolean;
  dtwOutcome?: 'win' | 'loss' | 'draw' | null;
  dtwDepth?: number | null;
}

// =====================================================
// Convert GameState to board_json for predict.py API
// =====================================================

export function gameStateToBoardJson(state: GameState, moves?: { boardIndex: number; cellIndex: number }[]): string {
  // Convert to 9x9 grid format for predict.py
  // Values: 0 = empty, 1 = player 1 (X), 2 = player 2 (O)
  const boards: number[][] = Array(9).fill(null).map(() => Array(9).fill(0));
  
  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    const boardRow = Math.floor(boardIndex / 3);
    const boardCol = boardIndex % 3;
    
    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      const cellRow = Math.floor(cellIndex / 3);
      const cellCol = cellIndex % 3;
      
      const globalRow = boardRow * 3 + cellRow;
      const globalCol = boardCol * 3 + cellCol;
      
      const cell = state.board[boardIndex][cellIndex];
      if (cell === 'X') {
        boards[globalRow][globalCol] = 1;
      } else if (cell === 'O') {
        boards[globalRow][globalCol] = 2;
      }
    }
  }
  
  // Convert board winners to 3x3 completed boards
  const completedBoards: number[][] = Array(3).fill(null).map(() => Array(3).fill(0));
  
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const winner = state.boardWinners[i];
    
    if (winner === 'X') {
      completedBoards[row][col] = 1;
    } else if (winner === 'O') {
      completedBoards[row][col] = 2;
    } else if (winner === 'draw') {
      completedBoards[row][col] = 3;
    }
  }
  
  // Compute last_move from the most recent move
  let lastMove: number[] | null = null;
  if (moves && moves.length > 0) {
    const last = moves[moves.length - 1];
    const boardRow = Math.floor(last.boardIndex / 3);
    const boardCol = last.boardIndex % 3;
    const cellRow = Math.floor(last.cellIndex / 3);
    const cellCol = last.cellIndex % 3;
    lastMove = [boardRow * 3 + cellRow, boardCol * 3 + cellCol];
  }
  
  const winnerMap: Record<string, number | null> = { 'X': 1, 'O': 2, 'draw': 3 };
  
  return JSON.stringify({
    boards,
    completed_boards: completedBoards,
    current_player: state.currentPlayer === 'X' ? 1 : 2,
    winner: state.winner ? (winnerMap[state.winner] ?? null) : null,
    last_move: lastMove,
  });
}

// =====================================================
// Convert predict.py best_moves to ModelPrediction[]
// =====================================================

function parseBestMoves(
  bestMoves: { action: number; move: number[]; visits: number; value: number; probability: number }[]
): ModelPrediction[] {
  return bestMoves.map(m => {
    // predict.py returns move as [row, col] in 9x9 grid
    // Convert to boardIndex/cellIndex
    const row = m.move[0];
    const col = m.move[1];
    const boardRow = Math.floor(row / 3);
    const boardCol = Math.floor(col / 3);
    const cellRow = row % 3;
    const cellCol = col % 3;
    const boardIndex = boardRow * 3 + boardCol;
    const cellIndex = cellRow * 3 + cellCol;
    
    return {
      move: { boardIndex, cellIndex },
      probability: m.probability,
      value: m.value,
    };
  });
}

// =====================================================
// Hugging Face Gradio API Client (matches predict.py)
// =====================================================

interface PredictPyResponse {
  evaluation: number;
  eval_percentage: number;
  best_moves: { action: number; move: number[]; visits: number; value: number; probability: number }[];
  principal_variation: { action: number; move: number[]; visits: number; value: number }[];
  current_player: number;
  model: string;
  total_simulations: number;
}

async function callGradioPredict(
  modelId: string,
  boardJson: string,
  numSimulations: number
): Promise<PredictPyResponse> {
  // Gradio SSE API: POST /call/predict then GET /call/predict/{event_id}
  const callResponse = await fetch(`${HF_SPACE_URL}/call/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [modelId, boardJson, numSimulations],
    }),
  });
  
  if (!callResponse.ok) {
    const text = await callResponse.text();
    throw new Error(`Gradio call error: ${callResponse.status} - ${text}`);
  }
  
  const { event_id } = await callResponse.json();
  
  // Poll SSE endpoint for result
  const resultResponse = await fetch(`${HF_SPACE_URL}/call/predict/${event_id}`);
  if (!resultResponse.ok) {
    const text = await resultResponse.text();
    throw new Error(`Gradio result error: ${resultResponse.status} - ${text}`);
  }
  
  // Parse SSE response — look for "data:" line
  const sseText = await resultResponse.text();
  const lines = sseText.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const payload = JSON.parse(line.slice(6));
      // predict.py returns a single JSON string in data[0]
      const resultStr = payload[0];
      return typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    }
  }
  
  throw new Error('No data in Gradio SSE response');
}

// =====================================================
// Model API Client Class
// =====================================================

class ModelAPIClient {
  private abortController: AbortController | null = null;

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    if (HF_SPACE_URL) {
      try {
        const response = await fetch(`${HF_SPACE_URL}/api/models`);
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        console.error('Failed to fetch models from HF Space:', error);
      }
    }
    
    return [];
  }

  async predict(
    modelId: string,
    state: GameState,
    options: {
      simulations?: number;
      temperature?: number;
      topK?: number;
    } = {}
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    const { simulations = 100, topK = 5 } = options;

    // If HF Space is configured, use real API
    if (HF_SPACE_URL) {
      try {
        const moves = state.moves?.slice(0, (state.moveIndex ?? -1) + 1);
        const boardJson = gameStateToBoardJson(state, moves);
        const result = await callGradioPredict(modelId, boardJson, simulations);
        
        const allMoves = parseBestMoves(result.best_moves || []);
        const topMoves = allMoves.slice(0, topK);
        
        // Convert PV moves to continuation format (boardIndex-cellIndex, 1-indexed)
        if (result.principal_variation && topMoves.length > 0) {
          const continuation = result.principal_variation.slice(1).map(pv => {
            const row = pv.move[0];
            const col = pv.move[1];
            const boardRow = Math.floor(row / 3);
            const boardCol = Math.floor(col / 3);
            const cellRow = row % 3;
            const cellCol = col % 3;
            const bi = boardRow * 3 + boardCol + 1; // 1-indexed
            const ci = cellRow * 3 + cellCol + 1;   // 1-indexed
            return `${bi}-${ci}`;
          });
          (topMoves[0] as any).continuation = continuation;
        }
        
        return {
          topMoves,
          evaluation: result.evaluation,
          thinkingTime: Date.now() - startTime,
          principalVariation: result.principal_variation,
        };
      } catch (error) {
        console.error('HF Space API error:', error);
        throw error;
      }
    }

    throw new Error('HF Space URL not configured');
  }

  async getBestMove(
    modelId: string,
    state: GameState,
    simulations?: number
  ): Promise<{ boardIndex: number; cellIndex: number } | null> {
    const response = await this.predict(modelId, state, { simulations, topK: 1 });
    return response.topMoves.length > 0 ? response.topMoves[0].move : null;
  }
}

export const modelAPI = new ModelAPIClient();


