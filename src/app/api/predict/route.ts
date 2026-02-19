import { NextResponse } from 'next/server';

// Hugging Face Space URL
const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://sean2474-ultra-tictactoe.hf.space';
const HF_TOKEN = process.env.HF_TOKEN;

interface PredictRequest {
  modelId: string;
  gameState: {
    boards: (string | null)[][]; // Can be named 'board' or 'boards'
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

// Convert GameState to JSON string expected by Gradio app
function gameStateToBoardJson(gameState: PredictRequest['gameState']): string {
  // Use 'boards' or 'board' field (game-store uses 'boards', but actual GameState uses 'board')
  const inputBoards = gameState.boards || gameState.board || [];
  
  // Convert boards: X=1, O=2, empty=0
  const boards: number[][] = [];
  for (let bi = 0; bi < 9; bi++) {
    const boardRow: number[] = [];
    for (let ci = 0; ci < 9; ci++) {
      const value = inputBoards[bi]?.[ci];
      if (value === 'X') boardRow.push(1);
      else if (value === 'O') boardRow.push(2);
      else boardRow.push(0);
    }
    boards.push(boardRow);
  }

  // Convert completed boards to 3x3 array
  const completed_boards: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const boardWinners = gameState.boardWinners || gameState.metaBoard || [];
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const winner = boardWinners[i];
    if (winner === 'X') completed_boards[r][c] = 1;
    else if (winner === 'O') completed_boards[r][c] = 2;
    else if (winner === 'draw') completed_boards[r][c] = 3;
  }

  // Current player: X=1, O=2
  const current_player = gameState.currentPlayer === 'X' ? 1 : 2;

  // Last move: convert to [row, col] format
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

      // Step 2: GET result using event_id (SSE format)
      const resultResponse = await fetch(`${HF_SPACE_URL}/gradio_api/call/predict/${eventId}`, {
        headers,
      });
      
      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        throw new Error(`Gradio result failed: ${resultResponse.status} - ${errorText}`);
      }
      
      // Parse SSE response
      const resultText = await resultResponse.text();
      const lines = resultText.split('\n');
      let dataLine: string | null = null;
      
      for (const line of lines) {
        if (line.startsWith('event: error')) {
          const errorData = lines.find(l => l.startsWith('data: '))?.slice(6);
          throw new Error(`Gradio error: ${errorData}`);
        }
        if (line.startsWith('data: ')) {
          dataLine = line.slice(6);
        }
      }
      
      if (!dataLine || dataLine === 'null') {
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
        };
      });

      return NextResponse.json({
        topMoves,
        evaluation: output.evaluation || 0,
        thinkingTime: Date.now() - startTime,
        principalVariation: output.principal_variation || [],
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
