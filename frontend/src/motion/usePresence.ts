import {useLayoutEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {useReducedMotion} from './useReducedMotion';

export type Phase = 'entering' | 'open' | 'exiting' | 'closed';
const milliseconds = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);

// CSS owns interpolation. Only phase boundaries cause React updates.
export function usePresence<T extends HTMLElement>(desired: boolean, ref: RefObject<T | null>, onExited?: () => void, immediate = false) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(desired ? 'entering' : 'closed');
  const current = useRef({desired, onExited});
  current.current = {desired, onExited};
  useLayoutEffect(() => {
    const node = ref.current;
    // Reverse from the current presentation when an entrance/exit is interrupted.
    if (node && ((desired && phase === 'exiting') || (!desired && phase === 'entering'))) {
      const style = getComputedStyle(node);
      node.style.setProperty('--motion-from-opacity', style.opacity);
      node.style.setProperty('--motion-from-transform', style.transform);
      if (node instanceof HTMLDialogElement) node.style.setProperty('--motion-backdrop-from-opacity', getComputedStyle(node, '::backdrop').opacity);
    }
    setPhase(previous => desired ? (previous === 'closed' || previous === 'exiting' ? 'entering' : previous) : (previous === 'closed' ? previous : 'exiting'));
  }, [desired]);
  useLayoutEffect(() => {
    if (phase !== 'entering' && phase !== 'exiting') return;
    if ((phase === 'exiting') === desired) return;
    let finished = false;
    const finish = () => {
      if (finished || current.current.desired !== desired) return;
      finished = true;
      ref.current?.style.removeProperty('--motion-from-opacity');
      ref.current?.style.removeProperty('--motion-from-transform');
      ref.current?.style.removeProperty('--motion-backdrop-from-opacity');
      setPhase(desired ? 'open' : 'closed');
      if (!desired) current.current.onExited?.();
    };
    const node = ref.current;
    if (!node || reduced || immediate) { finish(); return; }
    const style = getComputedStyle(node);
    const names = style.animationName.split(',').map(name => name.trim());
    const durations = style.animationDuration.split(',').map(milliseconds);
    const delays = style.animationDelay.split(',').map(milliseconds);
    const duration = Math.max(0, ...names.map((name, i) => name === 'none' ? 0 : durations[i % durations.length] + delays[i % delays.length]));
    if (!duration) { finish(); return; }
    const end = (event: AnimationEvent) => {
      if (event.target === node && !event.pseudoElement && names.includes(event.animationName)) finish();
    };
    node.addEventListener('animationend', end);
    // A missing browser event cannot strand modality; the fallback follows computed CSS.
    const timer = setTimeout(finish, duration + 50);
    return () => { finished = true; clearTimeout(timer); node.removeEventListener('animationend', end); };
  }, [desired, phase, reduced, immediate, ref]);
  return {phase, present: desired || phase !== 'closed'};
}
