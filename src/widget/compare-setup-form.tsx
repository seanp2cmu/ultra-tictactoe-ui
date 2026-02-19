'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Slider } from '@/src/components/ui/slider';
import { ArrowLeft, Play } from 'lucide-react';
import { useGameStore } from '@/src/lib/game-store';

export function CompareSetupForm() {
  const router = useRouter();
  const {
    aiModels,
    compareSettings,
    setCompareModel1,
    setCompareModel2,
    setCompareGames,
    setCompareSimulations,
    setTemperature,
    fetchModels,
  } = useGameStore();

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Auto-select models when loaded
  useEffect(() => {
    if (aiModels.length > 0 && !compareSettings.model1) {
      setCompareModel1(aiModels[0]);
    }
    if (aiModels.length > 1 && !compareSettings.model2) {
      setCompareModel2(aiModels[1]);
    }
  }, [aiModels, compareSettings.model1, compareSettings.model2, setCompareModel1, setCompareModel2]);

const handleStart = () => {
    if (compareSettings.model1 && compareSettings.model2) {
      router.push('/compare/results');
    }
  };

  const canStart = compareSettings.model1 && compareSettings.model2 && compareSettings.model1.id !== compareSettings.model2.id;

  return (
    <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Models</CardTitle>
          <CardDescription>Choose two AI models to compare</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Model 1 (plays as X)</Label>
            <Select
              value={compareSettings.model1?.id || ''}
              onValueChange={(value) => {
                const model = aiModels.find((m) => m.id === value);
                setCompareModel1(model || null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {aiModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model 2 (plays as O)</Label>
            <Select
              value={compareSettings.model2?.id || ''}
              onValueChange={(value) => {
                const model = aiModels.find((m) => m.id === value);
                setCompareModel2(model || null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {aiModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Number of Games</Label>
              <span className="text-sm text-muted-foreground">{compareSettings.numberOfGames}</span>
            </div>
            <Slider
              value={[compareSettings.numberOfGames]}
              onValueChange={([value]) => setCompareGames(value)}
              min={1}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>MCTS Simulations</Label>
              <span className="text-sm text-muted-foreground">{compareSettings.simulations}</span>
            </div>
            <Slider
              value={[compareSettings.simulations]}
              onValueChange={([value]) => setCompareSimulations(value)}
              min={10}
              max={1000}
              step={10}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">{compareSettings.temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[compareSettings.temperature]}
              onValueChange={([value]) => setTemperature(value)}
              min={0}
              max={2}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">
              Higher = more random moves
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={handleStart}
        disabled={!canStart}
      >
        <Play className="h-4 w-4 mr-2" />
        Start Comparison
      </Button>
    </div>
  );
}
