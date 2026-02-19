'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, RotateCcw, Undo2 } from 'lucide-react';
import { GameBoard } from '@/src/components/game-board';
import { useGameStore } from '@/src/lib/game-store';

export function PvPGame() {
  const router = useRouter();
  const { gameState, playMove, resetGame, undo } = useGameStore();

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') resetGame();
      if (e.key === 'u' || e.key === 'U') undo();
      if (e.key === 'Escape') router.push('/');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetGame, undo, router]);

  const handleCellClick = (boardIndex: number, cellIndex: number) => {
    if (gameState.winner) return;
    playMove(boardIndex, cellIndex);
  };

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Menu
        </Button>
        <h1 className="text-lg font-semibold">Player vs Player</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={gameState.moves.length === 0}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={resetGame}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        <div className="flex items-center gap-4 text-sm">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            gameState.currentPlayer === 'X' && !gameState.winner
              ? 'bg-player-x/20 text-player-x'
              : 'text-muted-foreground'
          }`}>
            <span className="font-bold">X</span>
            <span>Player 1</span>
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            gameState.currentPlayer === 'O' && !gameState.winner
              ? 'bg-player-o/20 text-player-o'
              : 'text-muted-foreground'
          }`}>
            <span className="font-bold">O</span>
            <span>Player 2</span>
          </div>
        </div>

        <GameBoard
          state={gameState}
          onCellClick={handleCellClick}
          disabled={!!gameState.winner}
        />

        {gameState.winner && (
          <div className="text-center space-y-3">
            <p className="text-xl font-bold">
              {gameState.winner === 'draw'
                ? "It's a Draw!"
                : `Player ${gameState.winner} Wins!`}
            </p>
            <Button onClick={resetGame}>Play Again</Button>
          </div>
        )}
      </div>
    </>
  );
}
