"use client";

import { createContext, useContext, useMemo } from "react";

import type { InstanceAboutResponse, InstanceResponse } from "@/lib/api/types";

type InstanceAboutBootstrap = {
  instance: InstanceResponse | null;
  about: InstanceAboutResponse | null;
};

const InstanceAboutContext = createContext<InstanceAboutBootstrap>({
  instance: null,
  about: null,
});

export function InstanceAboutProvider({
  instance,
  about,
  children,
}: InstanceAboutBootstrap & { children: React.ReactNode }) {
  const value = useMemo(() => ({ instance, about }), [instance, about]);
  return <InstanceAboutContext.Provider value={value}>{children}</InstanceAboutContext.Provider>;
}

export function useInstanceAboutBootstrap(): InstanceAboutBootstrap {
  return useContext(InstanceAboutContext);
}
