import type { Move, MoveNode, MoveTree, GameState } from './game-types';
import { formatCoordinate, createInitialState, makeMove } from './game-logic';

export function createMoveTree(): MoveTree {
  return {
    root: null,
    currentNode: null,
  };
}

export function addMoveToTree(tree: MoveTree, move: Move): MoveTree {
  const newNode: MoveNode = {
    move,
    children: [],
    parent: tree.currentNode,
    isMainLine: tree.currentNode === null || tree.currentNode.children.length === 0,
  };

  if (tree.root === null) {
    return {
      root: newNode,
      currentNode: newNode,
    };
  }

  if (tree.currentNode) {
    // Check if this move already exists as a child
    const existingChild = tree.currentNode.children.find(
      (child) =>
        child.move.boardIndex === move.boardIndex &&
        child.move.cellIndex === move.cellIndex
    );

    if (existingChild) {
      // Move to existing variation
      return {
        ...tree,
        currentNode: existingChild,
      };
    }

    // Add as new variation
    tree.currentNode.children.push(newNode);
  }

  return {
    ...tree,
    currentNode: newNode,
  };
}

export function goToNode(tree: MoveTree, node: MoveNode | null): MoveTree {
  return {
    ...tree,
    currentNode: node,
  };
}

export function goToParent(tree: MoveTree): MoveTree {
  if (!tree.currentNode || !tree.currentNode.parent) {
    return { ...tree, currentNode: null };
  }
  return { ...tree, currentNode: tree.currentNode.parent };
}

export function goToChild(tree: MoveTree, childIndex: number = 0): MoveTree {
  if (!tree.currentNode || tree.currentNode.children.length === 0) {
    return tree;
  }
  const child = tree.currentNode.children[childIndex];
  if (!child) return tree;
  return { ...tree, currentNode: child };
}

export function goToMainLine(tree: MoveTree): MoveTree {
  if (!tree.currentNode || tree.currentNode.children.length === 0) {
    return tree;
  }
  // Main line is typically the first child (isMainLine === true)
  const mainLineChild = tree.currentNode.children.find((c) => c.isMainLine) || tree.currentNode.children[0];
  return { ...tree, currentNode: mainLineChild };
}

export function goToStart(tree: MoveTree): MoveTree {
  return { ...tree, currentNode: null };
}

export function goToEnd(tree: MoveTree): MoveTree {
  let node = tree.root;
  if (!node) return tree;
  
  while (node.children.length > 0) {
    node = node.children.find((c) => c.isMainLine) || node.children[0];
  }
  
  return { ...tree, currentNode: node };
}

export function getMovesFromRoot(node: MoveNode | null): Move[] {
  const moves: Move[] = [];
  let current = node;
  
  while (current) {
    moves.unshift(current.move);
    current = current.parent;
  }
  
  return moves;
}

export function getPathFromRoot(node: MoveNode | null): MoveNode[] {
  const path: MoveNode[] = [];
  let current = node;
  
  while (current) {
    path.unshift(current);
    current = current.parent;
  }
  
  return path;
}

export function promoteVariation(tree: MoveTree, node: MoveNode): MoveTree {
  if (!node.parent) return tree;
  
  const parent = node.parent;
  const index = parent.children.indexOf(node);
  
  if (index > 0) {
    // Move to first position
    parent.children.splice(index, 1);
    parent.children.unshift(node);
    
    // Update main line flags
    parent.children.forEach((child, i) => {
      child.isMainLine = i === 0;
    });
  }
  
  return { ...tree };
}

export function deleteVariation(tree: MoveTree, node: MoveNode): MoveTree {
  if (!node.parent) {
    // Deleting root
    return createMoveTree();
  }
  
  const parent = node.parent;
  const index = parent.children.indexOf(node);
  
  if (index >= 0) {
    parent.children.splice(index, 1);
    
    // Update main line if needed
    if (parent.children.length > 0 && !parent.children.some((c) => c.isMainLine)) {
      parent.children[0].isMainLine = true;
    }
  }
  
  // Move current to parent if we deleted current branch
  let newCurrent = tree.currentNode;
  if (tree.currentNode) {
    const path = getPathFromRoot(tree.currentNode);
    if (path.includes(node)) {
      newCurrent = parent;
    }
  }
  
  return { ...tree, currentNode: newCurrent };
}

// Format move tree for display
export interface DisplayNode {
  node: MoveNode;
  depth: number;
  isVariation: boolean;
  variationIndex: number;
}

export function flattenTreeForDisplay(tree: MoveTree): DisplayNode[] {
  const result: DisplayNode[] = [];
  
  function traverse(node: MoveNode | null, depth: number, isVariation: boolean, variationIndex: number) {
    if (!node) return;
    
    result.push({ node, depth, isVariation, variationIndex });
    
    // First child (main line) continues at same depth
    if (node.children.length > 0) {
      traverse(node.children[0], depth, false, 0);
    }
    
    // Other children are variations
    for (let i = 1; i < node.children.length; i++) {
      traverse(node.children[i], depth + 1, true, i);
    }
  }
  
  if (tree.root) {
    traverse(tree.root, 0, false, 0);
  }
  
  return result;
}

// Get variation notation like chess
export function getVariationNotation(node: MoveNode): string {
  const { move } = node;
  const coord = formatCoordinate(move.boardIndex, move.cellIndex);
  
  if (move.player === 'X') {
    return `${Math.ceil(move.moveNumber / 2)}. ${coord}`;
  } else {
    return `${Math.ceil(move.moveNumber / 2)}. ... ${coord}`;
  }
}

// Reconstruct game state from move tree by replaying moves from root to current node
export function getGameStateFromTree(tree: MoveTree): GameState {
  let state = createInitialState();
  
  if (!tree.currentNode) {
    return state;
  }
  
  const moves = getMovesFromRoot(tree.currentNode);
  
  for (const move of moves) {
    state = makeMove(state, move.boardIndex, move.cellIndex);
  }
  
  return state;
}
