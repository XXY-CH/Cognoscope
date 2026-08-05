/**
 * Graph canvas rendering contracts shared by the force-graph adapter.
 * Keeps browser motion preferences and mutable canvas data out of the page.
 */
import { useEffect, useState } from 'react';

export interface RenderGraphNode {
  id: string;
  label: string;
  kind: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface RenderGraphLink {
  source: string;
  target: string;
  weight?: number;
  origin: string;
  reason?: string;
}

export interface RenderGraphData {
  nodes: RenderGraphNode[];
  links: RenderGraphLink[];
}

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}
