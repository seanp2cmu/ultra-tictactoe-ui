import type { BigBoard, BoardWinner, CellValue, GameState, Move, Player, SmallBoard } from './game-types';

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createInitialBoard(): BigBoard {
  return Array(9).fill(null).map(() => Array(9).fill(null));
}

export function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    boardWinners: Array(9).fill(null),
    currentPlayer: 'X',
    activeBoard: null,
    winner: null,
    moves: [],
    moveIndex: -1,
  };
}

export function checkSmallBoardWinner(board: SmallBoard): BoardWinner {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Player;
    }
  }
  if (board.every(cell => cell !== null)) {
    return 'draw';
  }
  return null;
}

export function checkBigBoardWinner(boardWinners: BoardWinner[]): BoardWinner {
  for (const [a, b, c] of WINNING_LINES) {
    if (
      boardWinners[a] &&
      boardWinners[a] !== 'draw' &&
      boardWinners[a] === boardWinners[b] &&
      boardWinners[a] === boardWinners[c]
    ) {
      return boardWinners[a] as Player;
    }
  }
  if (boardWinners.every(w => w !== null)) {
    return 'draw';
  }
  return null;
}

export function isValidMove(state: GameState, boardIndex: number, cellIndex: number): boolean {
  if (state.winner) return false;
  if (state.board[boardIndex][cellIndex] !== null) return false;
  if (state.boardWinners[boardIndex] !== null) return false;
  if (state.activeBoard !== null && state.activeBoard !== boardIndex) return false;
  return true;
}

export function getValidMoves(state: GameState): { boardIndex: number; cellIndex: number }[] {
  const moves: { boardIndex: number; cellIndex: number }[] = [];
  
  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    if (state.boardWinners[boardIndex] !== null) continue;
    if (state.activeBoard !== null && state.activeBoard !== boardIndex) continue;
    
    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      if (state.board[boardIndex][cellIndex] === null) {
        moves.push({ boardIndex, cellIndex });
      }
    }
  }
  
  return moves;
}

export function makeMove(state: GameState, boardIndex: number, cellIndex: number): GameState {
  if (!isValidMove(state, boardIndex, cellIndex)) {
    return state;
  }

  const newBoard = state.board.map((b, i) =>
    i === boardIndex ? b.map((c, j) => (j === cellIndex ? state.currentPlayer : c)) : [...b]
  );

  const newBoardWinners = [...state.boardWinners];
  newBoardWinners[boardIndex] = checkSmallBoardWinner(newBoard[boardIndex]);

  const newWinner = checkBigBoardWinner(newBoardWinners);

  let newActiveBoard: number | null = cellIndex;
  if (newBoardWinners[cellIndex] !== null) {
    newActiveBoard = null;
  }

  const move: Move = {
    boardIndex,
    cellIndex,
    player: state.currentPlayer,
    moveNumber: state.moveIndex + 2,
  };

  const newMoves = [...state.moves.slice(0, state.moveIndex + 1), move];

  return {
    board: newBoard,
    boardWinners: newBoardWinners,
    currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
    activeBoard: newActiveBoard,
    winner: newWinner,
    moves: newMoves,
    moveIndex: newMoves.length - 1,
  };
}

export function undoMove(state: GameState): GameState {
  if (state.moveIndex < 0) return state;
  
  return replayMoves(state.moves, state.moveIndex - 1);
}

export function replayMoves(moves: Move[], upToIndex: number): GameState {
  let state = createInitialState();
  state.moves = moves;
  
  for (let i = 0; i <= upToIndex && i < moves.length; i++) {
    const move = moves[i];
    const newBoard = state.board.map((b, bi) =>
      bi === move.boardIndex ? b.map((c, ci) => (ci === move.cellIndex ? move.player : c)) : [...b]
    );

    const newBoardWinners = [...state.boardWinners];
    newBoardWinners[move.boardIndex] = checkSmallBoardWinner(newBoard[move.boardIndex]);

    const newWinner = checkBigBoardWinner(newBoardWinners);

    let newActiveBoard: number | null = move.cellIndex;
    if (newBoardWinners[move.cellIndex] !== null) {
      newActiveBoard = null;
    }

    state = {
      board: newBoard,
      boardWinners: newBoardWinners,
      currentPlayer: move.player === 'X' ? 'O' : 'X',
      activeBoard: newActiveBoard,
      winner: newWinner,
      moves: moves,
      moveIndex: i,
    };
  }
  
  return state;
}

export function formatCoordinate(boardIndex: number, cellIndex: number): string {
  const boardRow = Math.floor(boardIndex / 3);
  const boardCol = boardIndex % 3;
  const cellRow = Math.floor(cellIndex / 3);
  const cellCol = cellIndex % 3;
  
  const row = boardRow * 3 + cellRow;
  const col = boardCol * 3 + cellCol;
  
  const colLetter = String.fromCharCode(65 + col);
  return `${colLetter}${row + 1}`;
}

// Simple AI for demonstration
export function getAIMove(state: GameState, simulations: number = 100): { boardIndex: number; cellIndex: number } | null {
  const validMoves = getValidMoves(state);
  if (validMoves.length === 0) return null;
  
  // Simple heuristic-based AI
  let bestMove = validMoves[0];
  let bestScore = -Infinity;
  
  for (const move of validMoves) {
    let score = 0;
    
    // Simulate the move
    const testState = makeMove(state, move.boardIndex, move.cellIndex);
    
    // Check if this move wins the small board
    if (testState.boardWinners[move.boardIndex] === state.currentPlayer) {
      score += 100;
    }
    
    // Check if this move wins the game
    if (testState.winner === state.currentPlayer) {
      score += 1000;
    }
    
    // Prefer center cells
    if (move.cellIndex === 4) score += 10;
    
    // Prefer center board
    if (move.boardIndex === 4) score += 5;
    
    // Prefer corners
    if ([0, 2, 6, 8].includes(move.cellIndex)) score += 3;
    if ([0, 2, 6, 8].includes(move.boardIndex)) score += 2;
    
    // Add some randomness
    score += Math.random() * simulations / 50;
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  
  return bestMove;
}

// Mock analysis for demonstration
export function analyzePosition(state: GameState, simulations: number = 100): {
  positionValue: number;
  topMoves: { boardIndex: number; cellIndex: number; probability: number; continuation?: string[] }[];
} {
  const validMoves = getValidMoves(state);
  
  if (validMoves.length === 0) {
    return { positionValue: 0, topMoves: [] };
  }
  
  const scores: { move: typeof validMoves[0]; score: number }[] = [];
  
  for (const move of validMoves) {
    const testState = makeMove(state, move.boardIndex, move.cellIndex);
    let score = 0.5;
    
    if (testState.winner === state.currentPlayer) score = 1;
    else if (testState.boardWinners[move.boardIndex] === state.currentPlayer) score += 0.2;
    if (move.cellIndex === 4) score += 0.05;
    if (move.boardIndex === 4) score += 0.03;
    
    score += (Math.random() - 0.5) * 0.1;
    
    scores.push({ move, score: Math.min(1, Math.max(0, score)) });
  }
  
  scores.sort((a, b) => b.score - a.score);
  
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  
  return {
    positionValue: state.currentPlayer === 'X' ? 0.1 + Math.random() * 0.2 : -0.1 - Math.random() * 0.2,
    topMoves: scores.slice(0, 5).map(s => ({
      boardIndex: s.move.boardIndex,
      cellIndex: s.move.cellIndex,
      probability: s.score / totalScore,
      continuation: [`${formatCoordinate(s.move.boardIndex, s.move.cellIndex)}`],
    })),
  };
}
