'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/src/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { ArrowLeft, RotateCcw, FolderOpen, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GitBranch, Loader2, Settings, Cpu } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog';
import { Label } from '@/src/components/ui/label';
import { Switch } from '@/src/components/ui/switch';
import { DEFAULT_MODEL_ID, DEFAULT_ANALYSIS_DEPTH, DEFAULT_TOP_MOVES, DEPTH_PRESETS, TOP_MOVES_OPTIONS } from '@/src/lib/constants';
import { GameBoard } from '@/src/components/game-board';
import { VariationMoveList } from '@/src/components/variation-move-list';
import { useGameStore } from '@/src/lib/game-store';
import { createInitialState, replayMoves } from '@/src/lib/game-logic';
import { 
  createMoveTree, 
  addMoveToTree, 
  goToNode, 
  goToParent, 
  goToChild, 
  goToStart as treeGoToStart,
  goToEnd as treeGoToEnd,
  getMovesFromRoot,
  promoteVariation,
  deleteVariation,
} from '@/src/lib/move-tree';
import type { AnalysisData, MoveNode, MoveTree, GameState } from '@/src/lib/game-types';

function getGameStateFromTree(tree: MoveTree): GameState {
  const moves = getMovesFromRoot(tree.currentNode);
  if (moves.length === 0) {
    return createInitialState();
  }
  return replayMoves(moves, moves.length - 1);
}

export function AnalysisView() {
  const router = useRouter();
  const { 
    savedGames, 
    aiModels, 
    fetchModels, 
    analysisResult, 
    isAnalyzing, 
    analyzePosition,
    gameSettings,
    reviewingGame,
  } = useGameStore();

  const [moveTree, setMoveTree] = useState<MoveTree>(createMoveTree);
  const [loadSheetOpen, setLoadSheetOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [hasLoadedReviewGame, setHasLoadedReviewGame] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState(DEFAULT_ANALYSIS_DEPTH);
  const [topMovesCount, setTopMovesCount] = useState(DEFAULT_TOP_MOVES);

  const gameState = useMemo(() => getGameStateFromTree(moveTree), [moveTree]);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Load reviewing game if available (from compare results)
  useEffect(() => {
    if (reviewingGame && reviewingGame.moves && reviewingGame.moves.length > 0 && !hasLoadedReviewGame) {
      let tree = createMoveTree();
      for (const move of reviewingGame.moves) {
        tree = addMoveToTree(tree, move);
      }
      setMoveTree(tree);
      setHasLoadedReviewGame(true);
    }
  }, [reviewingGame, hasLoadedReviewGame]);

  // Auto-select default model when models are loaded
  useEffect(() => {
    if (aiModels.length > 0 && !selectedModelId) {
      // Try to find the default model, otherwise use first model
      const defaultModel = aiModels.find(m => m.id === DEFAULT_MODEL_ID);
      setSelectedModelId(defaultModel?.id || aiModels[0].id);
    }
  }, [aiModels, selectedModelId]);

  // Auto-analyze when position changes (debounced to avoid flooding server)
  useEffect(() => {
    if (!autoAnalyze || !selectedModelId || gameState.winner) return;
    const timer = setTimeout(() => {
      analyzePosition(selectedModelId, gameState, { simulations: analysisDepth, topK: topMovesCount });
    }, 400);
    return () => clearTimeout(timer);
  }, [autoAnalyze, selectedModelId, gameState, analyzePosition, analysisDepth, topMovesCount]);

  // Convert API result to AnalysisData format
  // evaluation from API is from current player's perspective — normalize to X's perspective
  // Use a ref to avoid eval bar flicker: when navigating moves, currentPlayer flips
  // but analysisResult is stale (from previous position), causing a momentary sign flip.
  // We only update when analysisResult itself changes (i.e. fresh server response).
  const lastAnalysisRef = useRef<AnalysisData | null>(null);
  const lastResultRef = useRef<typeof analysisResult>(null);

  const analysis: AnalysisData | null = useMemo(() => {
    // If analysisResult hasn't changed, keep the previous analysis (avoid flicker)
    if (analysisResult === lastResultRef.current) {
      return lastAnalysisRef.current;
    }
    lastResultRef.current = analysisResult;

    if (!analysisResult || !analysisResult.topMoves) {
      lastAnalysisRef.current = null;
      return null;
    }
    const rawEval = analysisResult.evaluation ?? 0;
    const xEval = gameState.currentPlayer === 'X' ? rawEval : -rawEval;
    const result: AnalysisData = {
      positionValue: xEval,
      topMoves: analysisResult.topMoves.map(m => ({
        boardIndex: m.move?.boardIndex ?? m.boardIndex,
        cellIndex: m.move?.cellIndex ?? m.cellIndex,
        probability: m.probability,
        continuation: m.continuation || [],
        dtw: m.dtw,
        value: m.value,
      })),
      dtwSolved: analysisResult.dtwSolved,
      dtwOutcome: analysisResult.dtwOutcome,
      dtwDepth: analysisResult.dtwDepth,
    };
    lastAnalysisRef.current = result;
    return result;
  }, [analysisResult, gameState.currentPlayer]);

  const handleReset = useCallback(() => {
    setMoveTree(createMoveTree());
    setHasLoadedReviewGame(true); // Prevent re-loading reviewing game after reset
  }, []);

  const handleGoToPrev = useCallback(() => {
    setMoveTree((tree) => goToParent(tree));
  }, []);

  const handleGoToNext = useCallback(() => {
    setMoveTree((tree) => goToChild(tree, 0));
  }, []);

  const handleGoToStart = useCallback(() => {
    setMoveTree((tree) => treeGoToStart(tree));
  }, []);

  const handleGoToEnd = useCallback(() => {
    setMoveTree((tree) => treeGoToEnd(tree));
  }, []);

  const handleNodeClick = useCallback((node: MoveNode | null) => {
    setMoveTree((tree) => goToNode(tree, node));
  }, []);

  const handlePromoteVariation = useCallback((node: MoveNode) => {
    setMoveTree((tree) => promoteVariation(tree, node));
  }, []);

  const handleDeleteVariation = useCallback((node: MoveNode) => {
    setMoveTree((tree) => deleteVariation(tree, node));
  }, []);

  const handleManualAnalyze = useCallback(() => {
    if (selectedModelId) {
      analyzePosition(selectedModelId, gameState, { simulations: analysisDepth, topK: topMovesCount });
    }
  }, [selectedModelId, analyzePosition, gameState, analysisDepth, topMovesCount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') handleReset();
      if (e.key === 'l' || e.key === 'L') setLoadSheetOpen(true);
      if (e.key === 'Escape') router.push('/');
      if (e.key === 'ArrowLeft') handleGoToPrev();
      if (e.key === 'ArrowRight') handleGoToNext();
      if (e.key === 'ArrowUp') {
        if (moveTree.currentNode?.parent) {
          const siblings = moveTree.currentNode.parent.children;
          const currentIndex = siblings.indexOf(moveTree.currentNode);
          if (currentIndex > 0) {
            setMoveTree((tree) => goToNode(tree, siblings[currentIndex - 1]));
          }
        }
      }
      if (e.key === 'ArrowDown') {
        if (moveTree.currentNode?.parent) {
          const siblings = moveTree.currentNode.parent.children;
          const currentIndex = siblings.indexOf(moveTree.currentNode);
          if (currentIndex < siblings.length - 1) {
            setMoveTree((tree) => goToNode(tree, siblings[currentIndex + 1]));
          }
        }
      }
      if (e.key === 'Home') handleGoToStart();
      if (e.key === 'End') handleGoToEnd();
      if (e.key === ' ') {
        e.preventDefault();
        handleManualAnalyze();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReset, router, handleGoToPrev, handleGoToNext, handleGoToStart, handleGoToEnd, moveTree.currentNode, handleManualAnalyze]);

  const handleCellClick = (boardIndex: number, cellIndex: number) => {
    if (gameState.winner) return;
    
    const moves = getMovesFromRoot(moveTree.currentNode);
    const newMove = {
      boardIndex,
      cellIndex,
      player: gameState.currentPlayer,
      moveNumber: moves.length + 1,
    };
    
    setMoveTree((tree) => addMoveToTree(tree, newMove));
  };

  const handleLoadGame = (game: typeof savedGames[0]) => {
    let tree = createMoveTree();
    for (const move of game.moves) {
      tree = addMoveToTree(tree, move);
    }
    setMoveTree(tree);
    setLoadSheetOpen(false);
  };

  const evalPercent = analysis ? ((analysis.positionValue + 1) / 2) * 100 : 50;
  const currentMoveIndex = getMovesFromRoot(moveTree.currentNode).length - 1;
  const hasVariations = moveTree.currentNode?.parent?.children && 
    moveTree.currentNode.parent.children.length > 1;

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Menu
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Analysis Mode</h1>
          {hasVariations && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              Variation
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Sheet open={loadSheetOpen} onOpenChange={setLoadSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Load Game</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                {savedGames.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved games</p>
                ) : (
                  savedGames.map((game) => {
                    const dateStr = game.date.includes('T')
                      ? new Date(game.date).toLocaleString()
                      : game.date;
                    return (
                      <Card
                        key={game.id}
                        className="cursor-pointer hover:bg-secondary/50"
                        onClick={() => handleLoadGame(game)}
                      >
                        <CardContent className="p-3">
                          <div className="flex justify-between items-center">
                            <div>
                              {game.model1 && (
                                <p className="font-medium text-sm">{game.model1}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {dateStr} · {game.moveCount} moves
                                {game.winner && ` · ${game.winner === 'draw' ? 'Draw' : `${game.winner} wins`}`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }))}
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden h-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="flex items-stretch gap-3">
            {/* Vertical Evaluation Bar */}
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="text-xs font-medium text-player-x">X</span>
              <div className="flex-1 w-3 rounded-full overflow-hidden bg-player-o relative">
                <div
                  className="absolute top-0 w-full bg-player-x transition-all duration-300"
                  style={{ height: `${evalPercent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-player-o">O</span>
              {analysis?.dtwSolved ? (
                <div className="flex flex-col items-center mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    analysis.dtwOutcome === 'win' 
                      ? (gameState.currentPlayer === 'X' ? 'bg-player-x/20 text-player-x' : 'bg-player-o/20 text-player-o')
                      : analysis.dtwOutcome === 'loss'
                        ? (gameState.currentPlayer === 'X' ? 'bg-player-o/20 text-player-o' : 'bg-player-x/20 text-player-x')
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {analysis.dtwOutcome === 'win' ? 'W' : analysis.dtwOutcome === 'loss' ? 'L' : 'D'}
                    {analysis.dtwDepth != null ? analysis.dtwDepth : ''}
                  </span>
                  <span className="text-[9px] text-muted-foreground">DTW</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground mt-1">
                  {analysis 
                    ? `${analysis.positionValue > 0 ? '+' : ''}${analysis.positionValue.toFixed(2)}`
                    : '0.00'
                  }
                </span>
              )}
            </div>

            <div className="w-[320px] sm:w-[400px] md:w-[450px]">
              <GameBoard
                state={gameState}
                onCellClick={handleCellClick}
                disabled={!!gameState.winner}
                analysisData={analysis ?? undefined}
                showAnalysis={!!analysis}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGoToStart} disabled={!moveTree.currentNode}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleGoToPrev} disabled={!moveTree.currentNode}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {currentMoveIndex + 1} move{currentMoveIndex !== 0 ? 's' : ''}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGoToNext} 
              disabled={!moveTree.currentNode?.children.length}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGoToEnd} 
              disabled={!moveTree.currentNode?.children.length}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>

          {hasVariations && (
            <p className="text-xs text-muted-foreground">
              Use Arrow Up/Down to switch between variations
            </p>
          )}
        </div>

        <div className="lg:w-80 flex flex-col">
          <Card className='flex-1 flex flex-col overflow-hidden'>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Analysis</span>
                  <Switch className="ml-2" 
                    checked={autoAnalyze} 
                    onCheckedChange={setAutoAnalyze}
                  />
                  {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Analysis Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                          <SelectTrigger>
                            <SelectValue placeholder={aiModels.length === 0 ? "Loading..." : "Select model"} />
                          </SelectTrigger>
                          <SelectContent>
                            {aiModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center gap-2">
                                  <Cpu className="h-3 w-3" />
                                  {model.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Analysis Depth</Label>
                        <Select value={String(analysisDepth)} onValueChange={(v) => setAnalysisDepth(Number(v))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEPTH_PRESETS.map((preset) => (
                              <SelectItem key={preset.value} value={String(preset.value)}>
                                {preset.label} ({preset.value})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Top Moves Count</Label>
                        <Select value={String(topMovesCount)} onValueChange={(v) => setTopMovesCount(Number(v))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TOP_MOVES_OPTIONS.map((count) => (
                              <SelectItem key={count} value={String(count)}>
                                {count} moves
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {!analysis ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  {isAnalyzing ? 'Analyzing...' : 'Select a model to analyze'}
                </p>
              ) : (
                <div className="divide-y">
                  {analysis.topMoves.map((move, i) => {
                    // Convert boardIndex/cellIndex to 9x9 grid coordinates
                    const boardRow = Math.floor(move.boardIndex / 3);
                    const boardCol = move.boardIndex % 3;
                    const cellRow = Math.floor(move.cellIndex / 3);
                    const cellCol = move.cellIndex % 3;
                    const row = boardRow * 3 + cellRow; // 0-8
                    const col = boardCol * 3 + cellCol; // 0-8
                    const colLabel = 'abcdefghi'[col];
                    const rowLabel = row + 1;
                    const moveNotation = `${colLabel}${rowLabel}`;
                    
                    return (
                      <div
                        key={i}
                        className="p-0.5 hover:bg-secondary/30 cursor-pointer transition-colors"
                        onClick={() => handleCellClick(move.boardIndex, move.cellIndex)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span 
                              className="rounded w-16 h-5 text-xs font-bold flex items-center justify-between text-background flex-row px-1"
                              style={{ 
                                backgroundColor: `oklch(0.85 0.18 85 / ${0.6 - i * 0.1})` 
                              }}
                            >
                              <div>
                                {i + 1}. 
                              </div>
                              <div>
                                {(move.probability * 100).toFixed(1)}%
                              </div>
                            </span>
                            <div className="font-mono text-sm flex flex-wrap gap-1 items-center">
                              <span className={gameState.currentPlayer === 'X' ? 'text-player-x font-semibold' : 'text-player-o font-semibold'}>
                                {moveNotation}
                              </span>
                              {move.dtw != null && (
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                  analysis?.dtwSolved
                                    ? move.dtw === 0 ? 'bg-muted text-muted-foreground'
                                    : (move.value ?? 0) > 0 ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-500'
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {(move.value ?? 0) > 0 ? 'W' : (move.value ?? 0) < 0 ? 'L' : 'D'}{move.dtw}
                                </span>
                              )}
                              {move.continuation && move.continuation.length > 0 && (
                                <>
                                  {move.continuation.slice(0, 4).map((cont, j) => {
                                    // Convert "boardIndex-cellIndex" (1-indexed) to "colrow" format
                                    const parts = cont.split('-');
                                    if (parts.length === 2) {
                                      const bi = parseInt(parts[0]) - 1;
                                      const ci = parseInt(parts[1]) - 1;
                                      const bRow = Math.floor(bi / 3);
                                      const bCol = bi % 3;
                                      const cRow = Math.floor(ci / 3);
                                      const cCol = ci % 3;
                                      const r = bRow * 3 + cRow;
                                      const c = bCol * 3 + cCol;
                                      const notation = `${'abcdefghi'[c]}${r + 1}`;
                                      return (
                                        <span key={j} className={`text-muted-foreground ${(gameState.currentPlayer === 'X') !== (j % 2 == 0) ? 'text-player-x' : 'text-player-o' }`}>
                                          {notation}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span key={j} className={`text-muted-foreground ${(gameState.currentPlayer === 'X') !== (j % 2 == 0) ? 'text-player-x' : 'text-player-o' }`}>
                                        {cont}
                                      </span>
                                    );
                                  })}
                                  {move.continuation.length > 4 && (
                                    <span className="text-muted-foreground/50">...</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className='mt-4'> 
                <div>
                  Move Tree
                </div>
                <VariationMoveList
                  tree={moveTree}
                  onNodeClick={handleNodeClick}
                  onPromoteVariation={handlePromoteVariation}
                  onDeleteVariation={handleDeleteVariation}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
