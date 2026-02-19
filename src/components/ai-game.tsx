'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, RotateCcw, Undo2, Loader2 } from 'lucide-react';
import { GameBoard } from '@/src/components/game-board';
import { useGameStore } from '@/src/lib/game-store';

export function AIGame() {
  const router = useRouter();
  const { gameState, gameSettings, playMove, resetGame, undo, getAIPrediction, fetchModels, aiModels } = useGameStore();
  const hasInitialized = useRef(false);
  const isAIMoveInProgress = useRef(false);
  const [isThinking, setIsThinking] = useState(false);

  const isAITurn = gameSettings.aiFirst
    ? gameState.currentPlayer === 'X'
    : gameState.currentPlayer === 'O';

  // Fetch models on mount and auto-select first model if none selected
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (aiModels.length > 0 && !gameSettings.selectedModel) {
      useGameStore.getState().setGameSettings({ selectedModel: aiModels[0] });
    }
  }, [aiModels, gameSettings.selectedModel]);

  // AI move effect - uses ref to prevent duplicate calls
  useEffect(() => {
    const modelId = gameSettings.selectedModel?.id || (aiModels.length > 0 ? aiModels[0].id : null);
    
    if (!isAITurn || gameState.winner || isAIMoveInProgress.current || !modelId) {
      return;
    }

    const makeMove = async () => {
      if (isAIMoveInProgress.current) return;
      isAIMoveInProgress.current = true;
      setIsThinking(true);

      try {
        const currentState = useGameStore.getState().gameState;
        const prediction = await getAIPrediction(modelId, currentState);
        
        if (prediction && prediction.topMoves && prediction.topMoves.length > 0) {
          const bestMove = prediction.topMoves[0];
          const boardIndex = bestMove.move?.boardIndex ?? bestMove.boardIndex;
          const cellIndex = bestMove.move?.cellIndex ?? bestMove.cellIndex;
          playMove(boardIndex, cellIndex);
        }
      } catch (error) {
        console.error('AI move failed:', error);
      } finally {
        setIsThinking(false);
        isAIMoveInProgress.current = false;
      }
    };

    const timeout = setTimeout(makeMove, 300);
    return () => clearTimeout(timeout);
  }, [isAITurn, gameState.winner, gameState.moves.length, gameSettings.selectedModel, aiModels, getAIPrediction, playMove]);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      resetGame();
    }
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
    if (gameState.winner || isAITurn) return;
    playMove(boardIndex, cellIndex);
  };

  const playerSymbol = gameSettings.aiFirst ? 'O' : 'X';
  const aiSymbol = gameSettings.aiFirst ? 'X' : 'O';

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Menu
        </Button>
        <h1 className="text-lg font-semibold">
          vs {gameSettings.selectedModel?.name || 'AI'}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={gameState.moves.length === 0 || isAITurn}>
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
            gameState.currentPlayer === playerSymbol && !gameState.winner
              ? 'bg-player-x/20 text-player-x'
              : 'text-muted-foreground'
          }`}>
            <span className="font-bold">{playerSymbol}</span>
            <span>You</span>
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
            gameState.currentPlayer === aiSymbol && !gameState.winner
              ? 'bg-player-o/20 text-player-o'
              : 'text-muted-foreground'
          }`}>
            <span className="font-bold">{aiSymbol}</span>
            <span>{gameSettings.selectedModel?.name || 'AI'}</span>
            {isAITurn && !gameState.winner && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="animate-pulse">thinking...</span>
              </>
            )}
          </div>
        </div>

        <GameBoard
          state={gameState}
          onCellClick={handleCellClick}
          disabled={!!gameState.winner || isAITurn}
        />

        {gameState.winner && (
          <div className="text-center space-y-3">
            <p className="text-xl font-bold">
              {gameState.winner === 'draw'
                ? "It's a Draw!"
                : gameState.winner === playerSymbol
                  ? 'You Win!'
                  : 'AI Wins!'}
            </p>
            <Button onClick={resetGame}>Play Again</Button>
          </div>
        )}
      </div>
    </>
  );
}
