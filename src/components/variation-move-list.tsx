'use client';

import React from "react"

import { useRef, useEffect } from 'react';
import type { MoveNode, MoveTree } from '@/src/lib/game-types';
import { formatCoordinate } from '@/src/lib/game-logic';
import { cn } from '@/src/lib/utils';

interface VariationMoveListProps {
  tree: MoveTree;
  onNodeClick: (node: MoveNode | null) => void;
  onPromoteVariation?: (node: MoveNode) => void;
  onDeleteVariation?: (node: MoveNode) => void;
}

interface MoveDisplay {
  moveNumber: number;
  xNode?: MoveNode;
  oNode?: MoveNode;
  variations: MoveNode[][];
}

function collectMainLine(startNode: MoveNode | null): MoveDisplay[] {
  const displays: MoveDisplay[] = [];
  let current = startNode;
  let pendingX: MoveNode | undefined;
  
  while (current) {
    const move = current.move;
    const moveNum = Math.ceil(move.moveNumber / 2);
    
    if (move.player === 'X') {
      pendingX = current;
    } else {
      let display = displays.find((d) => d.moveNumber === moveNum);
      if (!display) {
        display = { moveNumber: moveNum, variations: [] };
        displays.push(display);
      }
      
      if (pendingX && Math.ceil(pendingX.move.moveNumber / 2) === moveNum) {
        display.xNode = pendingX;
        if (pendingX.parent && pendingX.parent.children.length > 1) {
          const variations = pendingX.parent.children.filter((c) => c !== pendingX);
          if (variations.length > 0) {
            display.variations.push(variations);
          }
        }
        pendingX = undefined;
      }
      
      display.oNode = current;
      
      if (current.parent && current.parent.children.length > 1) {
        const variations = current.parent.children.filter((c) => c !== current);
        if (variations.length > 0) {
          display.variations.push(variations);
        }
      }
    }
    
    current = current.children.find((c) => c.isMainLine) || current.children[0] || null;
  }
  
  if (pendingX) {
    const moveNum = Math.ceil(pendingX.move.moveNumber / 2);
    let display = displays.find((d) => d.moveNumber === moveNum);
    if (!display) {
      display = { moveNumber: moveNum, variations: [] };
      displays.push(display);
    }
    display.xNode = pendingX;
    
    if (pendingX.parent && pendingX.parent.children.length > 1) {
      const variations = pendingX.parent.children.filter((c) => c !== pendingX);
      if (variations.length > 0) {
        display.variations.push(variations);
      }
    }
  }
  
  return displays.sort((a, b) => a.moveNumber - b.moveNumber);
}

function VariationBranch({
  startNode,
  currentNode,
  onNodeClick,
  depth,
}: {
  startNode: MoveNode;
  currentNode: MoveNode | null;
  onNodeClick: (node: MoveNode) => void;
  depth: number;
}) {
  const elements: React.ReactNode[] = [];
  let current: MoveNode | null = startNode;
  let isFirst = true;
  
  while (current) {
    const node = current;
    const move = node.move;
    const moveNum = Math.ceil(move.moveNumber / 2);
    const isCurrent = currentNode === node;
    const coord = formatCoordinate(move.boardIndex, move.cellIndex);
    
    const showNum = isFirst || move.player === 'X';
    
    elements.push(
      <button
        key={`${move.moveNumber}-${move.boardIndex}-${move.cellIndex}`}
        type="button"
        onClick={() => onNodeClick(node)}
        className={cn(
          "inline px-1 py-0.5 rounded font-mono text-xs transition-colors mr-0.5",
          isCurrent
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted"
        )}
      >
        {showNum && (
          <span className="text-muted-foreground mr-0.5">
            {moveNum}.{move.player === 'O' && '..'}
          </span>
        )}
        {coord}
      </button>
    );
    
    if (current.children.length > 1) {
      const variations = current.children.slice(1);
      elements.push(
        <VariationLine
          key={`var-after-${move.moveNumber}`}
          nodes={variations}
          currentNode={currentNode}
          onNodeClick={onNodeClick}
          depth={depth + 1}
        />
      );
    }
    
    isFirst = false;
    current = current.children.find((c) => c.isMainLine) || current.children[0] || null;
  }
  
  return <span className="inline">{elements}</span>;
}

function VariationLine({ 
  nodes, 
  currentNode, 
  onNodeClick,
  depth = 1 
}: { 
  nodes: MoveNode[];
  currentNode: MoveNode | null;
  onNodeClick: (node: MoveNode) => void;
  depth?: number;
}) {
  return (
    <div className={cn(
      "ml-3 pl-2 border-l-2 border-muted/50 my-1 py-0.5",
      depth > 1 && "border-dashed"
    )}>
      {nodes.map((node) => (
        <div key={`var-${node.move.moveNumber}-${node.move.boardIndex}-${node.move.cellIndex}`}>
          <VariationBranch 
            startNode={node} 
            currentNode={currentNode}
            onNodeClick={onNodeClick}
            depth={depth}
          />
        </div>
      ))}
    </div>
  );
}

export function VariationMoveList({ 
  tree, 
  onNodeClick,
}: VariationMoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && listRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [tree.currentNode]);

  if (!tree.root) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        No moves yet
      </div>
    );
  }

  const displays = collectMainLine(tree.root);

  return (
    <div
      ref={listRef}
      className="max-h-[300px] lg:max-h-[400px] overflow-y-auto p-3 space-y-1 text-sm"
    >
      {displays.map((display) => (
        <div key={display.moveNumber} className="leading-relaxed">
          <span className="text-muted-foreground font-medium mr-1">
            {display.moveNumber}.
          </span>
          
          {display.xNode && (
            <button
              ref={tree.currentNode === display.xNode ? activeRef : undefined}
              type="button"
              onClick={() => onNodeClick(display.xNode!)}
              className={cn(
                "inline-block px-1.5 py-0.5 rounded font-mono transition-colors mr-1",
                tree.currentNode === display.xNode
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {formatCoordinate(display.xNode.move.boardIndex, display.xNode.move.cellIndex)}
            </button>
          )}
          
          {display.oNode && (
            <button
              ref={tree.currentNode === display.oNode ? activeRef : undefined}
              type="button"
              onClick={() => onNodeClick(display.oNode!)}
              className={cn(
                "inline-block px-1.5 py-0.5 rounded font-mono transition-colors",
                tree.currentNode === display.oNode
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {formatCoordinate(display.oNode.move.boardIndex, display.oNode.move.cellIndex)}
            </button>
          )}
          
          {display.variations.map((varGroup, vIdx) => (
            <VariationLine
              key={`var-group-${display.moveNumber}-${vIdx}`}
              nodes={varGroup}
              currentNode={tree.currentNode}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
