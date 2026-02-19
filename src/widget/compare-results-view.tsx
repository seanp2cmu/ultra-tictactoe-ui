'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Progress } from '@/src/components/ui/progress';
import { ArrowLeft, RotateCcw, X, Clock, Hash, Timer, Trophy, Loader2, Play } from 'lucide-react';
import { useGameStore } from '@/src/lib/game-store';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function CompareResultsView() {
  const router = useRouter();
  const {
    compareResult,
    compareSettings,
    comparisonProgress,
    loadGame,
    cancelComparison,
    startComparison,
    fetchModels,
  } = useGameStore();

  // Fetch models and start comparison when component mounts
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (!comparisonProgress.isRunning && (!compareResult || compareResult.games.length === 0)) {
      if (compareSettings.model1 && compareSettings.model2) {
        startComparison();
      } else {
        router.push('/compare');
      }
    }
  }, []);

  const handleCancel = () => {
    cancelComparison();
    router.push('/compare');
  };

  const handleViewGame = (gameId: string) => {
    const game = compareResult?.games.find((g) => g.id === gameId);
    if (game) {
      loadGame(game);
      router.push('/analysis');
    }
  };

  const isRunning = comparisonProgress.isRunning;
  const hasResults = compareResult && compareResult.games.length > 0;

  // Calculate stats from current results
  const total = compareResult ? compareResult.model1Wins + compareResult.model2Wins + compareResult.draws : 0;
  const model1Percent = total > 0 ? (compareResult!.model1Wins / total) * 100 : 0;
  const model2Percent = total > 0 ? (compareResult!.model2Wins / total) * 100 : 0;
  const drawPercent = total > 0 ? (compareResult!.draws / total) * 100 : 0;

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={isRunning ? handleCancel : () => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {isRunning ? 'Cancel' : 'Menu'}
        </Button>
        <h1 className="text-lg font-semibold">
          {isRunning ? 'Running Comparison' : 'Comparison Results'}
        </h1>
        {!isRunning && (
          <Button variant="outline" size="sm" onClick={() => router.push('/compare')}>
            <RotateCcw className="h-4 w-4 mr-2" />
            New
          </Button>
        )}
        {isRunning && <div className="w-20" />}
      </header>

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-6 overflow-y-auto">
        {/* Progress Card - Always show when running */}
        {isRunning && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Simulating Games
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-player-x">{compareSettings.model1?.name}</span>
                <span className="text-muted-foreground">vs</span>
                <span className="text-player-o">{compareSettings.model2?.name}</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Game {comparisonProgress.currentGame} of {comparisonProgress.totalGames}</span>
                  <span className="font-medium">{comparisonProgress.percentComplete}%</span>
                </div>
                <Progress value={comparisonProgress.percentComplete} className="h-2" />
              </div>

              <Button variant="destructive" size="sm" className="w-full" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results Summary - Show when we have any results */}
        {hasResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                {isRunning ? 'Current Results' : 'Final Results'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-player-x">{compareResult.model1Wins}</p>
                  <p className="text-sm text-muted-foreground">{compareSettings.model1?.name}</p>
                  <p className="text-xs text-muted-foreground">{model1Percent.toFixed(1)}%</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-muted-foreground">{compareResult.draws}</p>
                  <p className="text-sm text-muted-foreground">Draws</p>
                  <p className="text-xs text-muted-foreground">{drawPercent.toFixed(1)}%</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-3xl font-bold text-player-o">{compareResult.model2Wins}</p>
                  <p className="text-sm text-muted-foreground">{compareSettings.model2?.name}</p>
                  <p className="text-xs text-muted-foreground">{model2Percent.toFixed(1)}%</p>
                </div>
              </div>

              <div className="h-4 rounded-full overflow-hidden bg-muted flex">
                <div className="h-full bg-player-x transition-all" style={{ width: `${model1Percent}%` }} />
                <div
                  className="h-full bg-muted-foreground/30 transition-all"
                  style={{ width: `${drawPercent}%` }}
                />
                <div className="h-full bg-player-o transition-all" style={{ width: `${model2Percent}%` }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Statistics - Show when not running */}
        {hasResults && !isRunning && (
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Hash className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Total Games</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Timer className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatDuration(compareResult.totalDuration)}</p>
                  <p className="text-xs text-muted-foreground">Total Time</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/50">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{compareResult.avgMoveCount}</p>
                  <p className="text-xs text-muted-foreground">Avg Moves</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game List - Show when we have games, including during running */}
        {hasResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Game List</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {compareResult.games.length} game{compareResult.games.length !== 1 ? 's' : ''}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {compareResult.games.map((game, index) => (
                  <button
                    type="button"
                    key={game.id}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/50 cursor-pointer text-left transition-colors"
                    onClick={() => handleViewGame(game.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium w-16">Game {index + 1}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          game.winner === 'X'
                            ? 'bg-player-x/20 text-player-x'
                            : game.winner === 'O'
                              ? 'bg-player-o/20 text-player-o'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {game.winner === 'draw' || game.winner === null
                          ? 'Draw'
                          : game.winner === 'X'
                            ? compareSettings.model1?.name
                            : compareSettings.model2?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {game.moveCount} moves
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(game.duration)}
                      </span>
                      <Play className="h-3 w-3" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state when starting */}
        {!hasResults && isRunning && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Starting comparison...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
