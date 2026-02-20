import { NextResponse } from 'next/server';

// Hugging Face Space URL and Token for private spaces
const HF_SPACE_URL = process.env.HF_SPACE_URL;
const HF_TOKEN = process.env.HF_TOKEN;

export async function GET() {
  try {
    const headers: Record<string, string> = {};
    if (HF_TOKEN) {
      headers['Authorization'] = `Bearer ${HF_TOKEN}`;
    }

    // Gradio API info endpoint - contains model list in named_endpoints
    const response = await fetch(`${HF_SPACE_URL}/gradio_api/info`, {
      cache: 'no-store',
      headers,
    });

    if (response.ok) {
      const info = await response.json();
      
      // Model list is in named_endpoints./predict.parameters[0].enum
      const predictEndpoint = info.named_endpoints?.['/predict'];
      const modelParam = predictEndpoint?.parameters?.[0];
      const modelList = modelParam?.type?.enum || modelParam?.enum || [];

      if (modelList.length > 0) {
        return NextResponse.json(
          modelList.map((modelId: string) => ({
            id: modelId,
            name: modelId.replace(/\//g, ' / ').replace(/_/g, ' '),
            description: 'AlphaZero MCTS model',
            type: 'alphazero',
          }))
        );
      }
    }
  } catch (error) {
    console.error('[v0] Failed to fetch Gradio API info:', error);
  }

  // Return empty array if we can't get the info
  return NextResponse.json([]);
}
