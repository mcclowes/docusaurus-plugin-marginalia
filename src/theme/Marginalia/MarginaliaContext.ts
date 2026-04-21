import { createContext, useContext } from 'react';

export type MarginaliaAside = {
  id: string;
  kind?: string;
  kindLabel?: string;
  title?: string;
  body?: React.ReactNode;
  meta?: string[];
  cta?: string;
  ctaHref?: string;
};

export type MarginaliaContextValue = {
  register: (id: string, data: Omit<MarginaliaAside, 'id'>) => void;
  unregister: (id: string) => void;
  setAnchorRef: (id: string, el: HTMLElement | null) => void;
  setHotId: (id: string | null) => void;
  scrollCardIntoView: (id: string) => void;
  hotId: string | null;
};

export const MarginaliaContext = createContext<MarginaliaContextValue | null>(null);

export function useMarginalia(): MarginaliaContextValue | null {
  return useContext(MarginaliaContext);
}
