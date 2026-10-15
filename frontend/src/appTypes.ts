export type ModalKind = 'delivery' | 'order' | 'product' | 'dish' | 'settings' | null;
export type Session = { id:string; role:'admin'|'manager'|'supplier'|'waiter'|'cook'; name: string; demo: boolean;visiblePages?:string[]|null;timezone?:string };
