import type { GameState } from './game-types';

// =====================================================
// API Configuration
// =====================================================

// Hugging Face Spaces URL (Gradio API)
// Set this environment variable to your HF Space URL
// Example: https://your-username-ultimate-ttt.hf.space
const HF_SPACE_URL = process.env.NEXT_PUBLIC_HF_SPACE_URL || '';

// =====================================================
// Types
// =====================================================

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  type?: 'alphazero' | 'mcts' | 'random';
}

export interface ModelPrediction {
  move: { boardIndex: number; cellIndex: number };
  probability: number;
  value: number;
}

export interface ModelResponse {
  topMoves: ModelPrediction[];
  evaluation: number; // -1 to 1
  thinkingTime: number; // ms
  policy?: number[]; // full 81 probabilities
}

// =====================================================
// Convert GameState to AlphaZero Model Input Format
// Based on the _board_to_input function in the model code
// =====================================================

export function gameStateToModelInput(state: GameState): {
  boards: number[][];
  completedBoards: number[][];
  currentPlayer: 1 | 2;
} {
  // Convert to 9x9 grid format
  // Model expects boards[row][col] where:
  // - row = boardRow * 3 + cellRow
  // - col = boardCol * 3 + cellCol
  // Values: 0 = empty, 1 = player 1 (X), 2 = player 2 (O)
  
  const boards: number[][] = Array(9).fill(null).map(() => Array(9).fill(0));
  
  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    const boardRow = Math.floor(boardIndex / 3);
    const boardCol = boardIndex % 3;
    
    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      const cellRow = Math.floor(cellIndex / 3);
      const cellCol = cellIndex % 3;
      
      const globalRow = boardRow * 3 + cellRow;
      const globalCol = boardCol * 3 + cellCol;
      
      const cell = state.boards[boardIndex][cellIndex];
      if (cell === 'X') {
        boards[globalRow][globalCol] = 1;
      } else if (cell === 'O') {
        boards[globalRow][globalCol] = 2;
      }
    }
  }
  
  // Convert board winners to 3x3 completed boards
  // Values: 0 = incomplete, 1 = X won, 2 = O won, 3 = draw
  const completedBoards: number[][] = Array(3).fill(null).map(() => Array(3).fill(0));
  
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const winner = state.boardWinners[i];
    
    if (winner === 'X') {
      completedBoards[row][col] = 1;
    } else if (winner === 'O') {
      completedBoards[row][col] = 2;
    } else if (winner === 'draw') {
      completedBoards[row][col] = 3;
    }
  }
  
  return {
    boards,
    completedBoards,
    currentPlayer: state.currentPlayer === 'X' ? 1 : 2,
  };
}

// =====================================================
// Convert Policy (81 values) to Top Moves
// =====================================================

export function policyToTopMoves(
  policy: number[],
  state: GameState,
  evaluation: number,
  topK: number = 5
): ModelPrediction[] {
  const legalMoves: { index: number; prob: number }[] = [];
  
  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    // Skip completed boards
    if (state.boardWinners[boardIndex]) continue;
    // Check active board constraint
    if (state.activeBoard !== null && state.activeBoard !== boardIndex) continue;
    
    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      if (!state.boards[boardIndex][cellIndex]) {
        const index = boardIndex * 9 + cellIndex;
        legalMoves.push({ index, prob: policy[index] || 0 });
      }
    }
  }
  
  // Normalize probabilities among legal moves
  const totalProb = legalMoves.reduce((sum, m) => sum + m.prob, 0);
  if (totalProb > 0) {
    for (const m of legalMoves) {
      m.prob /= totalProb;
    }
  }
  
  // Sort and take top K
  legalMoves.sort((a, b) => b.prob - a.prob);
  
  return legalMoves.slice(0, topK).map(m => ({
    move: {
      boardIndex: Math.floor(m.index / 9),
      cellIndex: m.index % 9,
    },
    probability: m.prob,
    value: evaluation,
  }));
}

// =====================================================
// Hugging Face Gradio API Client
// =====================================================

async function callGradioAPI(
  boards: number[][],
  completedBoards: number[][],
  currentPlayer: 1 | 2,
  modelId: string,
  numSimulations: number,
  temperature: number
): Promise<{ policy: number[]; value: number }> {
  // Gradio API format: POST to /call/{fn_index} then GET /call/{fn_index}/{event_id}
  // Or use the /api/predict endpoint for simple cases
  
  const response = await fetch(`${HF_SPACE_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fn_index: 0, // The predict function
      data: [
        JSON.stringify(boards),
        JSON.stringify(completedBoards),
        currentPlayer,
        modelId,
        numSimulations,
        temperature,
      ],
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gradio API error: ${response.status} - ${text}`);
  }
  
  const result = await response.json();
  // Gradio returns { data: [policy, value] }
  const [policyStr, value] = result.data;
  const policy = typeof policyStr === 'string' ? JSON.parse(policyStr) : policyStr;
  
  return { policy, value };
}

// =====================================================
// Model API Client Class
// =====================================================

class ModelAPIClient {
  private abortController: AbortController | null = null;

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    if (HF_SPACE_URL) {
      try {
        const response = await fetch(`${HF_SPACE_URL}/api/models`);
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        console.error('Failed to fetch models from HF Space:', error);
      }
    }
    
    return [];
  }

  async predict(
    modelId: string,
    state: GameState,
    options: {
      simulations?: number;
      temperature?: number;
      topK?: number;
    } = {}
  ): Promise<ModelResponse> {
    const startTime = Date.now();
    const { simulations = 100, temperature = 1.0, topK = 5 } = options;

    // If HF Space is configured, use real API
    if (HF_SPACE_URL) {
      try {
        const input = gameStateToModelInput(state);
        const { policy, value } = await callGradioAPI(
          input.boards,
          input.completedBoards,
          input.currentPlayer,
          modelId,
          simulations,
          temperature
        );
        
        const topMoves = policyToTopMoves(policy, state, value, topK);
        
        return {
          topMoves,
          evaluation: value,
          thinkingTime: Date.now() - startTime,
          policy,
        };
      } catch (error) {
        console.error('HF Space API error:', error);
        throw error;
      }
    }

    throw new Error('HF Space URL not configured');
  }

  async getBestMove(
    modelId: string,
    state: GameState,
    simulations?: number
  ): Promise<{ boardIndex: number; cellIndex: number } | null> {
    const response = await this.predict(modelId, state, { simulations, topK: 1 });
    return response.topMoves.length > 0 ? response.topMoves[0].move : null;
  }
}

export const modelAPI = new ModelAPIClient();



// =====================================================
// Hugging Face Space Gradio App (Python)
// Save this as app.py in your HF Space
// =====================================================
/*
import gradio as gr
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
import os

# ============ Model Definition (from your code) ============

class ResidualBlock(nn.Module):
    def __init__(self, channels):
        super(ResidualBlock, self).__init__()
        self.residual = nn.Sequential(
            nn.Conv2d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
            nn.Conv2d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(channels)
        )
        
    def forward(self, x):
        residual = x
        out = self.residual(x)
        out += residual
        out = F.relu(out)
        return out


class Model(nn.Module):
    def __init__(self, num_res_blocks=10, num_channels=256):
        super(Model, self).__init__()
        self.num_channels = num_channels
        
        self.input = nn.Sequential(
            nn.Conv2d(6, num_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(num_channels)
        )
        self.res_blocks = nn.ModuleList([
            ResidualBlock(num_channels) for _ in range(num_res_blocks)
        ])
        
        self.policy_conv = nn.Conv2d(num_channels, 2, kernel_size=1)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * 9 * 9, 81)
        
        self.value_conv = nn.Conv2d(num_channels, 1, kernel_size=1)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(9 * 9, 64)
        self.value_fc2 = nn.Linear(64, 1)
        
    def forward(self, x):
        x = F.relu(self.input(x))
        for res_block in self.res_blocks:
            x = res_block(x)
        
        policy = F.relu(self.policy_bn(self.policy_conv(x)))
        policy = policy.view(-1, 2 * 9 * 9)
        policy = self.policy_fc(policy)
        
        value = F.relu(self.value_bn(self.value_conv(x)))
        value = value.view(-1, 9 * 9)
        value = F.relu(self.value_fc1(value))
        value = torch.tanh(self.value_fc2(value))
        
        return policy, value


# ============ Model Loading ============

models = {}

def load_model(model_id: str):
    if model_id in models:
        return models[model_id]
    
    # Try to load from models/ directory
    model_path = f"models/{model_id}.pth"
    if not os.path.exists(model_path):
        raise ValueError(f"Model not found: {model_id}")
    
    checkpoint = torch.load(model_path, map_location='cpu')
    num_res_blocks = checkpoint.get('num_res_blocks', 10)
    num_channels = checkpoint.get('num_channels', 256)
    
    model = Model(num_res_blocks=num_res_blocks, num_channels=num_channels)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    
    models[model_id] = model
    return model


# ============ Prediction Function ============

def predict(
    boards_json: str,
    completed_boards_json: str,
    current_player: int,
    model_id: str,
    num_simulations: int = 100,
    temperature: float = 1.0
):
    """
    Args:
        boards_json: 9x9 board state as JSON string. Values: 0=empty, 1=X, 2=O
        completed_boards_json: 3x3 completed boards as JSON string. Values: 0=incomplete, 1=X, 2=O, 3=draw
        current_player: 1 for X, 2 for O
        model_id: Model to use
        num_simulations: MCTS simulations (not used for raw network output)
        temperature: Temperature for softmax (not used for raw network output)
    
    Returns:
        policy: JSON string of 81 probabilities
        value: Float from -1 to 1
    """
    boards = np.array(json.loads(boards_json), dtype=np.float32)
    completed_boards = np.array(json.loads(completed_boards_json))
    
    # Build 6-channel input tensor
    player1_plane = (boards == 1).astype(np.float32)
    player2_plane = (boards == 2).astype(np.float32)
    current_player_plane = np.ones((9, 9), dtype=np.float32) if current_player == 1 else np.zeros((9, 9), dtype=np.float32)
    
    completed_p1_plane = np.zeros((9, 9), dtype=np.float32)
    completed_p2_plane = np.zeros((9, 9), dtype=np.float32)
    completed_draw_plane = np.zeros((9, 9), dtype=np.float32)
    
    for br in range(3):
        for bc in range(3):
            r_start, r_end = br * 3, (br + 1) * 3
            c_start, c_end = bc * 3, (bc + 1) * 3
            if completed_boards[br][bc] == 1:
                completed_p1_plane[r_start:r_end, c_start:c_end] = 1
            elif completed_boards[br][bc] == 2:
                completed_p2_plane[r_start:r_end, c_start:c_end] = 1
            elif completed_boards[br][bc] == 3:
                completed_draw_plane[r_start:r_end, c_start:c_end] = 1
    
    state_tensor = torch.FloatTensor(np.stack([
        player1_plane, player2_plane, current_player_plane,
        completed_p1_plane, completed_p2_plane, completed_draw_plane
    ], axis=0)).unsqueeze(0)
    
    model = load_model(model_id)
    
    with torch.no_grad():
        policy_logits, value = model(state_tensor)
        policy_probs = F.softmax(policy_logits / max(temperature, 0.01), dim=1)
        policy = policy_probs.numpy()[0].tolist()
        value = float(value.numpy()[0][0])
    
    return json.dumps(policy), value


# ============ Models List API ============

def get_models():
    # List available models in models/ directory
    model_list = []
    models_dir = "models"
    
    if os.path.exists(models_dir):
        for f in os.listdir(models_dir):
            if f.endswith('.pth'):
                model_id = f.replace('.pth', '')
                model_list.append({
                    "id": model_id,
                    "name": model_id.replace('-', ' ').title(),
                    "description": f"AlphaZero model",
                    "type": "alphazero"
                })
    
    if not model_list:
        model_list = [
            {"id": "random", "name": "Random Bot", "description": "Random moves", "type": "random"}
        ]
    
    return model_list


# ============ Gradio Interface ============

with gr.Blocks() as demo:
    gr.Markdown("# Ultimate Tic-Tac-Toe AlphaZero API")
    gr.Markdown("API for neural network predictions in Ultimate Tic-Tac-Toe")
    
    with gr.Tab("Predict"):
        with gr.Row():
            with gr.Column():
                boards_input = gr.Textbox(
                    label="Boards (9x9 JSON)",
                    placeholder='[[0,0,0,...], ...]',
                    lines=3
                )
                completed_input = gr.Textbox(
                    label="Completed Boards (3x3 JSON)",
                    placeholder='[[0,0,0], [0,0,0], [0,0,0]]',
                    lines=2
                )
                player_input = gr.Number(label="Current Player (1=X, 2=O)", value=1, precision=0)
                model_input = gr.Dropdown(
                    choices=[m["id"] for m in get_models()],
                    label="Model",
                    value=get_models()[0]["id"] if get_models() else None
                )
                sims_input = gr.Number(label="Simulations", value=100, precision=0)
                temp_input = gr.Number(label="Temperature", value=1.0)
                predict_btn = gr.Button("Predict", variant="primary")
            
            with gr.Column():
                policy_output = gr.Textbox(label="Policy (81 probabilities)", lines=5)
                value_output = gr.Number(label="Value (-1 to 1)")
        
        predict_btn.click(
            predict,
            inputs=[boards_input, completed_input, player_input, model_input, sims_input, temp_input],
            outputs=[policy_output, value_output]
        )
    
    with gr.Tab("Models"):
        models_output = gr.JSON(label="Available Models", value=get_models())
        refresh_btn = gr.Button("Refresh")
        refresh_btn.click(get_models, outputs=models_output)

# Custom API endpoint for models list
@demo.app.get("/api/models")
def api_models():
    return get_models()

demo.launch()
*/
