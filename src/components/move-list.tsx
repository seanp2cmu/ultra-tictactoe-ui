'use client';

import { formatCoordinate } from '@/src/lib/game-logic';
import type { Move } from '@/src/lib/game-types';
import { cn } from '@/src/lib/utils';
import { useRef, useEffect } from 'react';

interface MoveListProps {
  moves: Move[];
  currentMoveIndex: number;
  onMoveClick: (index: number) => void;
}

export function MoveList({ moves, currentMoveIndex, onMoveClick }: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to current move
  useEffect(() => {
    if (activeRef.current && listRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentMoveIndex]);

  // Group moves into pairs (chess-style notation)
  const movePairs: { moveNumber: number; xMove?: Move; oMove?: Move; xIndex?: number; oIndex?: number }[] = [];
  
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const pairIndex = Math.floor(i / 2);
    
    if (!movePairs[pairIndex]) {
      movePairs[pairIndex] = { moveNumber: pairIndex + 1 };
    }
    
    if (move.player === 'X') {
      movePairs[pairIndex].xMove = move;
      movePairs[pairIndex].xIndex = i;
    } else {
      movePairs[pairIndex].oMove = move;
      movePairs[pairIndex].oIndex = i;
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-sm">Move List</h3>
      </div>
      <div
        ref={listRef}
        className="max-h-[300px] lg:max-h-[400px] overflow-y-auto p-2 space-y-1"
      >
        {movePairs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No moves yet</p>
        ) : (
          movePairs.map((pair) => (
            <div key={pair.moveNumber} className="flex items-center gap-1 text-sm">
              <span className="w-8 text-muted-foreground text-right pr-1">
                {pair.moveNumber}.
              </span>
              {pair.xMove && pair.xIndex !== undefined && (
                <button
                  ref={currentMoveIndex === pair.xIndex ? activeRef : undefined}
                  type="button"
                  onClick={() => onMoveClick(pair.xIndex!)}
                  className={cn(
                    'flex-1 px-2 py-1 rounded font-mono text-left transition-colors',
                    currentMoveIndex === pair.xIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {formatCoordinate(pair.xMove.boardIndex, pair.xMove.cellIndex)}
                </button>
              )}
              {pair.oMove && pair.oIndex !== undefined && (
                <button
                  ref={currentMoveIndex === pair.oIndex ? activeRef : undefined}
                  type="button"
                  onClick={() => onMoveClick(pair.oIndex!)}
                  className={cn(
                    'flex-1 px-2 py-1 rounded font-mono text-left transition-colors',
                    currentMoveIndex === pair.oIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {formatCoordinate(pair.oMove.boardIndex, pair.oMove.cellIndex)}
                </button>
              )}
              {!pair.oMove && <span className="flex-1" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
