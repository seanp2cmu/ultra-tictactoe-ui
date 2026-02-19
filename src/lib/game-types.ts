export type Player = 'X' | 'O' | null;

export type CellValue = Player;

export type SmallBoard = CellValue[];

export type BigBoard = SmallBoard[];

export type BoardWinner = Player | 'draw';

export interface Move {
  boardIndex: number;
  cellIndex: number;
  player: Player;
  moveNumber: number;
}

// Tree structure for variations
export interface MoveNode {
  move: Move;
  children: MoveNode[];
  parent: MoveNode | null;
  isMainLine: boolean;
}

export interface MoveTree {
  root: MoveNode | null;
  currentNode: MoveNode | null;
}

export interface GameState {
  board: BigBoard;
  boardWinners: BoardWinner[];
  currentPlayer: Player;
  activeBoard: number | null;
  winner: BoardWinner;
  moves: Move[];
  moveIndex: number;
}



export interface AIModel {
  id: string;
  name: string;
  description?: string;
}

export interface GameSettings {
  aiFirst: boolean;
  simulations: number;
  selectedModel: AIModel | null;
}

export interface CompareSettings {
  model1: AIModel | null;
  model2: AIModel | null;
  numberOfGames: number;
  simulations: number;
  temperature: number;
}

export interface CompareResult {
  model1Wins: number;
  model2Wins: number;
  draws: number;
  games: SavedGame[];
  totalDuration: number; // total time in seconds
  avgMoveCount: number;
}

export interface ComparisonProgress {
  isRunning: boolean;
  currentGame: number;
  totalGames: number;
  percentComplete: number;
}

export interface SavedGame {
  id: string;
  date: string;
  moves: Move[];
  winner: BoardWinner;
  model1?: string;
  model2?: string;
  moveCount: number;
  duration: number; // game duration in seconds
}

export interface AnalysisData {
  positionValue: number;
  topMoves: {
    boardIndex: number;
    cellIndex: number;
    probability: number;
    continuation?: string[];
  }[];
}
