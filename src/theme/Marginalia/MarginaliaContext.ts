import { createContext, useContext } from 'react';

export type MarginaliaAside = {
  id: string;
  cardId: string;
  kind?: string;
  kindLabel?: string;
  title?: string;
  body?: React.ReactNode;
  meta?: string[];
  cta?: string;
  ctaHref?: string;
};

export type MarginaliaContextValue = {
  register: (id: string, data: Omit<MarginaliaAside, 'id' | 'cardId'>) => void;
  unregister: (id: string) => void;
  setAnchorRef: (id: string, el: HTMLElement | null) => void;
  setHotId: (id: string | null) => void;
  scrollCardIntoView: (id: string) => void;
  getCardId: (id: string) => string;
  hotId: string | null;
};

export const MarginaliaContext = createContext<MarginaliaContextValue | null>(null);

export function useMarginalia(): MarginaliaContextValue | null {
  return useContext(MarginaliaContext);
}
