import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Users, Bot, Search, GitCompare } from 'lucide-react';

const menuItems = [
  {
    href: '/pvp',
    icon: Users,
    title: 'Player vs Player',
    description: 'Play against a friend locally',
  },
  {
    href: '/ai/model-select',
    icon: Bot,
    title: 'Play vs AI',
    description: 'Challenge an AI opponent',
  },
  {
    href: '/analysis',
    icon: Search,
    title: 'Analysis Mode',
    description: 'Analyze positions and games',
  },
  {
    href: '/compare',
    icon: GitCompare,
    title: 'Compare Models',
    description: 'Pit AI models against each other',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Ultimate Tic-Tac-Toe</h1>
          <p className="text-muted-foreground">Master the 9x9 strategic challenge</p>
        </div>

        <div className="grid gap-3">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="cursor-pointer transition-colors hover:bg-secondary/50 border-border">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <item.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Use keyboard shortcuts during gameplay:</p>
          <p className="font-mono text-xs mt-1">R: Restart | U: Undo | ESC: Menu</p>
        </div>
      </div>
    </main>
  );
}
