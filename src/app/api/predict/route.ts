import { NextResponse } from 'next/server';

// Hugging Face Space URL
const HF_SPACE_URL = process.env.HF_SPACE_URL;
const HF_TOKEN = process.env.HF_TOKEN;

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

interface PredictRequest {
  modelId: string;
  gameState: {
    boards: (string | null)[][];
    board?: (string | null)[][];
    boardWinners?: (string | null)[];
    metaBoard?: (string | null)[];
    currentPlayer: 'X' | 'O';
    activeBoard: number | null;
    moveHistory: { boardIndex: number; cellIndex: number; player: string }[];
  };
  simulations?: number;
  temperature?: number;
  topK?: number;
}

// Check sub-board winner from its 9 cells (0=empty, 1=X, 2=O)
function checkSubBoardWinner(cells: number[]): number {
  for (const [a, b, c] of WIN_LINES) {
    if (cells[a] !== 0 && cells[a] === cells[b] && cells[a] === cells[c]) {
      return cells[a]; // 1 or 2
    }
  }
  if (cells.every(c => c !== 0)) return 3; // draw
  return 0; // open
}

// Convert GameState to JSON string expected by Gradio app
function gameStateToBoardJson(gameState: PredictRequest['gameState']): string {
  const inputBoards = gameState.boards || gameState.board || [];
  
  // Convert boards from UI format (board[boardIndex][cellIndex]) to 9x9 grid (boards[row][col])
  const boards: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let bi = 0; bi < 9; bi++) {
    const boardRow = Math.floor(bi / 3);
    const boardCol = bi % 3;
    for (let ci = 0; ci < 9; ci++) {
      const cellRow = Math.floor(ci / 3);
      const cellCol = ci % 3;
      const row = boardRow * 3 + cellRow;
      const col = boardCol * 3 + cellCol;
      const value = inputBoards[bi]?.[ci];
      if (value === 'X') boards[row][col] = 1;
      else if (value === 'O') boards[row][col] = 2;
    }
  }

  // Compute completed_boards from actual cell data (don't rely on boardWinners)
  const completed_boards: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let subR = 0; subR < 3; subR++) {
    for (let subC = 0; subC < 3; subC++) {
      const cells: number[] = [];
      for (let cr = 0; cr < 3; cr++) {
        for (let cc = 0; cc < 3; cc++) {
          cells.push(boards[subR * 3 + cr][subC * 3 + cc]);
        }
      }
      completed_boards[subR][subC] = checkSubBoardWinner(cells);
    }
  }

  // Current player: X=1, O=2
  const current_player = gameState.currentPlayer === 'X' ? 1 : 2;

  // Last move: convert boardIndex/cellIndex to [row, col]
  let last_move: [number, number] | null = null;
  if (gameState.moveHistory.length > 0) {
    const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
    const boardRow = Math.floor(lastMove.boardIndex / 3);
    const boardCol = lastMove.boardIndex % 3;
    const cellRow = Math.floor(lastMove.cellIndex / 3);
    const cellCol = lastMove.cellIndex % 3;
    last_move = [boardRow * 3 + cellRow, boardCol * 3 + cellCol];
  }

  return JSON.stringify({
    boards,
    completed_boards,
    current_player,
    winner: null,
    last_move,
  });
}



export async function POST(request: Request) {
  try {
    const body: PredictRequest = await request.json();
    const { modelId, gameState, simulations = 200, topK = 5 } = body;

    const startTime = Date.now();

    // Call Gradio API
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (HF_TOKEN) {
        headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      }

      const boardJson = gameStateToBoardJson(gameState);
      // Step 1: POST to /gradio_api/call/predict to get event_id
      const callResponse = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: [modelId, boardJson, simulations]
        }),
      });
      
      if (!callResponse.ok) {
        const errorText = await callResponse.text();
        throw new Error(`Gradio call failed: ${callResponse.status} - ${errorText}`);
      }
      
      const callResult = await callResponse.json();
      const eventId = callResult.event_id;
      
      if (!eventId) {
        throw new Error('No event_id in Gradio response');
      }

      // Step 2: GET result using event_id (SSE stream)
      // Use AbortController with timeout to prevent hanging on local Gradio
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 120000);

      const resultResponse = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
        headers,
        signal: abortController.signal,
      });
      
      if (!resultResponse.ok) {
        clearTimeout(timeout);
        const errorText = await resultResponse.text();
        throw new Error(`Gradio result failed: ${resultResponse.status} - ${errorText}`);
      }
      
      // Read SSE stream incrementally — return as soon as we get a data line
      let dataLine: string | null = null;
      const reader = resultResponse.body?.getReader();
      if (!reader) {
        clearTimeout(timeout);
        throw new Error('No response body from Gradio');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: error')) {
              throw new Error(`Gradio error: ${buffer}`);
            }
            if (line.startsWith('data: ')) {
              const candidate = line.slice(6).trim();
              if (candidate && candidate !== 'null') {
                dataLine = candidate;
              }
            }
          }

          // Once we have data, stop reading immediately
          if (dataLine) break;
        }
      } finally {
        reader.cancel().catch(() => {});
        clearTimeout(timeout);
      }
      
      if (!dataLine) {
        throw new Error('No data in Gradio response');
      }
      
      const parsed = JSON.parse(dataLine);
      const outputJsonString = Array.isArray(parsed) ? parsed[0] : parsed;
      const output = typeof outputJsonString === 'string' ? JSON.parse(outputJsonString) : outputJsonString;

      if (output.error) {
        throw new Error(output.error);
      }

      // Principal variation is a separate array - convert to notation strings
      const principalVariation = output.principal_variation || [];
      const pvContinuation = principalVariation.slice(1, 7).map((pv: { action: number; move: [number, number] }) => {
        // move is [row, col] in the 9x9 grid (0-indexed)
        const [row, col] = pv.move;
        const boardRow = Math.floor(row / 3);
        const boardCol = Math.floor(col / 3);
        const cellRow = row % 3;
        const cellCol = col % 3;
        const boardIndex = boardRow * 3 + boardCol;
        const cellIndex = cellRow * 3 + cellCol;
        return `${boardIndex + 1}-${cellIndex + 1}`;
      });

      // Convert response to our format
      const topMoves = (output.best_moves || []).slice(0, topK).map((m: {
        action: number;
        move: [number, number];
        visits: number;
        value: number;
        probability: number;
      }, index: number) => {
        // action is 0-80, represents row*9+col in the 9x9 grid
        // move is [row, col] in the 9x9 grid (0-indexed)
        const [row, col] = m.move;
        
        // Convert 9x9 coordinates to boardIndex (0-8) and cellIndex (0-8)
        const boardRow = Math.floor(row / 3);
        const boardCol = Math.floor(col / 3);
        const cellRow = row % 3;
        const cellCol = col % 3;
        
        const boardIndex = boardRow * 3 + boardCol;
        const cellIndex = cellRow * 3 + cellCol;

        // Only first move gets the principal variation continuation
        const continuation = index === 0 ? pvContinuation : [];

        return {
          move: { boardIndex, cellIndex },
          boardIndex,
          cellIndex,
          probability: m.probability,
          value: m.value,
          visits: m.visits,
          continuation,
          dtw: (m as any).dtw,
        };
      });

      return NextResponse.json({
        topMoves,
        evaluation: output.evaluation || 0,
        thinkingTime: Date.now() - startTime,
        principalVariation: output.principal_variation || [],
        dtwSolved: output.dtw_solved || false,
        dtwOutcome: output.dtw_outcome || null,
        dtwDepth: output.dtw_depth ?? null,
      });
    } catch (apiError) {
      console.error('[v0] Gradio API error:', apiError);
      return NextResponse.json({ error: `Gradio API error: ${apiError}` }, { status: 500 });
    }
  } catch (error) {
    console.error('[v0] Predict API error:', error);
    return NextResponse.json({ error: 'Failed to get prediction' }, { status: 500 });
  }
}
