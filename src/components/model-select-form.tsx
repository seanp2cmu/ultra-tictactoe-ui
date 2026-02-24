'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Label } from '@/src/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/src/components/ui/radio-group';
import { Slider } from '@/src/components/ui/slider';
import { Switch } from '@/src/components/ui/switch';
import { ArrowLeft, Play } from 'lucide-react';
import { useGameStore } from '@/src/lib/game-store';

export function ModelSelectForm() {
  const router = useRouter();
  const {
    aiModels,
    gameSettings,
    setSelectedModel,
    setAiFirst,
    setSimulations,
    fetchModels,
  } = useGameStore();

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleStart = () => {
    if (gameSettings.selectedModel) {
      router.push('/ai/game');
    }
  };

  return (

    <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Model</CardTitle>
          <CardDescription>Choose your opponent</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={gameSettings.selectedModel?.id || ''}
            onValueChange={(value) => {
              const model = aiModels.find((m) => m.id === value);
              setSelectedModel(model || null);
            }}
            className="space-y-2"
          >
            {aiModels.map((model) => (
              <div
                key={model.id}
                className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 cursor-pointer"
              >
                <RadioGroupItem value={model.id} id={model.id} />
                <Label htmlFor={model.id} className="flex-1 cursor-pointer">
                  <div className="font-medium">{model.name}</div>
                  {model.description && (
                    <div className="text-sm text-muted-foreground">{model.description}</div>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>AI plays first</Label>
              <p className="text-sm text-muted-foreground">Let AI make the first move</p>
            </div>
            <Switch
              checked={gameSettings.aiFirst}
              onCheckedChange={setAiFirst}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>MCTS Simulations</Label>
              <span className="text-sm text-muted-foreground">{gameSettings.simulations}</span>
            </div>
            <Slider
              value={[gameSettings.simulations]}
              onValueChange={([value]) => setSimulations(value)}
              min={10}
              max={1600}
              step={10}
            />
            <p className="text-xs text-muted-foreground">
              Higher values = stronger but slower AI
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={!gameSettings.selectedModel}
      >
        <Play className="h-4 w-4 mr-2" />
        Start Game
      </Button>
    </div>
  );
}
