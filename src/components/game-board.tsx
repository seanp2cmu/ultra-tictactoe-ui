'use client';

import { cn } from '@/src/lib/utils';
import type { AnalysisData, BoardWinner, GameState } from '@/src/lib/game-types';
import { isValidMove } from '@/src/lib/game-logic';

interface GameBoardProps {
  state: GameState;
  onCellClick: (boardIndex: number, cellIndex: number) => void;
  disabled?: boolean;
  analysisData?: AnalysisData | null;
  showAnalysis?: boolean;
}

// Alpha values for top 5 moves: 1st is most opaque, 5th is most transparent
const ANALYSIS_ALPHA = [0.6, 0.45, 0.35, 0.25, 0.15];

function Cell({
  value,
  onClick,
  isValid,
  isLastMove,
  analysisRank,
  probability,
}: {
  value: string | null;
  onClick: () => void;
  isValid: boolean;
  isLastMove: boolean;
  analysisRank?: number;
  probability?: number;
}) {
  const alpha = analysisRank !== undefined ? ANALYSIS_ALPHA[analysisRank] : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isValid}
      className={cn(
        'relative aspect-square w-full flex items-center justify-center text-lg sm:text-xl md:text-2xl font-bold transition-all',
        'border border-white/30 rounded-sm',
        isValid && 'hover:bg-muted/50 cursor-pointer',
        !isValid && 'cursor-default',
        isLastMove && 'ring-2 ring-highlight ring-inset',
        value === 'X' && 'text-player-x',
        value === 'O' && 'text-player-o'
      )}
    >
      {value}
      {analysisRank !== undefined && isValid && (
        <span 
          className="absolute inset-0 flex items-center justify-center rounded-sm"
          style={{ backgroundColor: `oklch(0.85 0.18 85 / ${alpha})` }}
        >
          <span className="text-xs font-bold text-background drop-shadow-sm">
            {analysisRank + 1}
          </span>
          {probability !== undefined && (
            <span className="absolute bottom-0.5 text-[8px] font-medium text-background/80 drop-shadow-sm">
              {(probability * 100).toFixed(0)}%
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function SmallBoard({
  boardIndex,
  board,
  winner,
  isActive,
  state,
  onCellClick,
  disabled,
  lastMove,
  analysisData,
  showAnalysis,
}: {
  boardIndex: number;
  board: (string | null)[];
  winner: BoardWinner;
  isActive: boolean;
  state: GameState;
  onCellClick: (boardIndex: number, cellIndex: number) => void;
  disabled?: boolean;
  lastMove: { boardIndex: number; cellIndex: number } | null;
  analysisData?: AnalysisData | null;
  showAnalysis?: boolean;
}) {
  const getAnalysisRank = (cellIndex: number) => {
    if (!showAnalysis || !analysisData) return undefined;
    const idx = analysisData.topMoves.findIndex(
      (m) => m.boardIndex === boardIndex && m.cellIndex === cellIndex
    );
    return idx >= 0 && idx < 5 ? idx : undefined;
  };

  const getProbability = (cellIndex: number) => {
    if (!showAnalysis || !analysisData) return undefined;
    const move = analysisData.topMoves.find(
      (m) => m.boardIndex === boardIndex && m.cellIndex === cellIndex
    );
    return move?.probability;
  };

  

  return (
    <div
      className={cn(
        'relative p-1 sm:p-1.5 rounded-md transition-all',
        isActive && !winner && 'bg-active-board/50 ring-2 ring-primary/50',
        winner && 'opacity-80'
      )}
    >
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {board.map((cell, cellIndex) => (
          <Cell
            key={cellIndex}
            value={cell}
            onClick={() => onCellClick(boardIndex, cellIndex)}
            isValid={!disabled && isValidMove(state, boardIndex, cellIndex)}
            isLastMove={
              lastMove?.boardIndex === boardIndex && lastMove?.cellIndex === cellIndex
            }
            analysisRank={getAnalysisRank(cellIndex)}
            probability={getProbability(cellIndex)}
          />
        ))}
      </div>
      {winner && winner !== 'draw' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md">
          <span
            className={cn(
              'text-4xl sm:text-5xl md:text-6xl font-black',
              winner === 'X' && 'text-player-x',
              winner === 'O' && 'text-player-o'
            )}
          >
            {winner}
          </span>
        </div>
      )}
      {winner === 'draw' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-md">
          <span className="text-2xl sm:text-3xl font-bold text-muted-foreground">-</span>
        </div>
      )}
    </div>
  );
}

export function GameBoard({
  state,
  onCellClick,
  disabled,
  analysisData,
  showAnalysis,
}: GameBoardProps) {
  const lastMove = state.moves?.[state.moveIndex] || null;

  

  const columnLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const rowLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="w-full max-w-[500px] mx-auto">
      {/* Column labels */}
      <div className="flex pl-6 pr-2 mb-1">
        {columnLabels.map((label) => (
          <div key={label} className="flex-1 text-center text-xs text-muted-foreground font-medium">
            {label}
          </div>
        ))}
      </div>
      
      <div className="flex">
        {/* Row labels */}
        <div className="flex flex-col justify-around w-5 mr-1">
          {rowLabels.map((label) => (
            <div key={label} className="flex-1 flex items-center justify-center text-xs text-muted-foreground font-medium">
              {label}
            </div>
          ))}
        </div>
        
        {/* Board */}
        <div className="flex-1 grid grid-cols-3 gap-1 sm:gap-2 p-2 sm:p-3 bg-card rounded-lg border border-border">
          {state.board.map((smallBoard, boardIndex) => (
            <SmallBoard
              key={boardIndex}
              boardIndex={boardIndex}
              board={smallBoard}
              winner={state.boardWinners[boardIndex]}
              isActive={state.activeBoard === null || state.activeBoard === boardIndex}
              state={state}
              onCellClick={onCellClick}
              disabled={disabled}
              lastMove={lastMove}
              analysisData={analysisData}
              showAnalysis={showAnalysis}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
