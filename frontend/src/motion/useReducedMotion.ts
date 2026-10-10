import {useSyncExternalStore} from 'react';

const query = () => matchMedia('(prefers-reduced-motion: reduce)');
const subscribe = (update: () => void) => {
  const media = query();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
};
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => query().matches, () => false);
}
