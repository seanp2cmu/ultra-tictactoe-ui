import { NextRequest } from 'next/server';

// Hugging Face Space URL and Token
const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://sean2474-ultra-tictactoe.hf.space';
const HF_TOKEN = process.env.HF_TOKEN;

export async function POST(request: NextRequest) {
  const { model1, model2, numGames, simulations, temperature } = await request.json();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HF_TOKEN) {
    headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  }

  // Create a readable stream to forward SSE events
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Call Gradio API for compare
        const endpoints = ['/gradio_api/call/compare', '/call/compare'];
        let eventId: string | null = null;
        let usedEndpoint: string | null = null;

        for (const endpoint of endpoints) {
          try {
            const callResponse = await fetch(`${HF_SPACE_URL}${endpoint}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                data: [model1, model2, numGames, simulations, temperature]
              }),
            });

            if (callResponse.ok) {
              const callResult = await callResponse.json();
              eventId = callResult.event_id;
              usedEndpoint = endpoint;
              break;
            }
          } catch (e) {
            console.log(`Endpoint ${endpoint} failed:`, e);
          }
        }

        if (!eventId || !usedEndpoint) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to start comparison' })}\n\n`));
          controller.close();
          return;
        }

        // Stream results from Gradio
        const resultResponse = await fetch(`${HF_SPACE_URL}${usedEndpoint}/${eventId}`, {
          headers,
        });

        if (!resultResponse.ok || !resultResponse.body) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to get results' })}\n\n`));
          controller.close();
          return;
        }

        const reader = resultResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr && dataStr !== 'null') {
                try {
                  // Gradio returns array, first element is the JSON string
                  const parsed = JSON.parse(dataStr);
                  const jsonStr = Array.isArray(parsed) ? parsed[0] : parsed;
                  const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
                  
                  // Forward the data as SSE
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch (e) {
                  console.log('Failed to parse:', dataStr);
                }
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        console.error('Compare API error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(error) })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
