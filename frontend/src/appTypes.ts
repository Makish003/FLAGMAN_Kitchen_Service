export type ModalKind = 'delivery' | 'order' | 'product' | 'dish' | 'settings' | null;
export type Session = { id:string; role:'manager'|'supplier'|'waiter'|'cook'; name: string; demo: boolean;timezone?:string };
