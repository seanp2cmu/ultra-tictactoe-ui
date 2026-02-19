import { CompareSetupForm } from '@/src/widget/compare-setup-form';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Menu
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Compare Models</h1>
        <div className="w-20" />
      </header>
      <CompareSetupForm />
    </main>
  );
}
