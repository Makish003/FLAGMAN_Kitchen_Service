import {useLayoutEffect, useRef, useState} from 'react';
import {usePresence} from './usePresence';

function restoreFocus(previous: HTMLElement | null) {
  const available = (target: HTMLElement) => target.isConnected && !target.closest('[inert]') && target.getClientRects().length > 0;
  const target = previous && available(previous) ? previous : [...document.querySelectorAll<HTMLElement>('.mobile-menu, #main-content')].find(available);
  if (target && document.activeElement !== target) target.focus();
}

export function useDialog(onClose: () => void, busy = false) {
  const ref = useRef<HTMLDialogElement>(null);
  const [desired, setDesired] = useState(true);
  const guard = useRef({busy, desired});
  guard.current = {busy, desired};
  const previous = useRef<HTMLElement | null>(null);
  const {phase} = usePresence(desired, ref, () => {
    ref.current?.close();
    restoreFocus(previous.current);
    onClose();
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!previous.current) previous.current = document.activeElement as HTMLElement;
    if (node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
      queueMicrotask(() => {
        // StrictMode setup reuses a connected node; a replacement dialog owns focus.
        if (!node?.isConnected && !document.querySelector('dialog[open]')) restoreFocus(previous.current);
      });
    };
  }, []);
  const requestClose = (force = false) => {
    if (!guard.current.desired || (guard.current.busy && !force)) return;
    guard.current.desired = false;
    setDesired(false);
  };
  return {ref, phase, closing: !desired, requestClose};
}
