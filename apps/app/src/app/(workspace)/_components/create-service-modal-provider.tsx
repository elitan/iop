"use client";

import { createContext, useContext } from "react";

interface CreateServiceModalContextValue {
  openCreateServiceModal: () => void;
}

const CreateServiceModalContext =
  createContext<CreateServiceModalContextValue | null>(null);

export function CreateServiceModalProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: CreateServiceModalContextValue;
}): React.ReactElement {
  return (
    <CreateServiceModalContext.Provider value={value}>
      {children}
    </CreateServiceModalContext.Provider>
  );
}

export function useCreateServiceModal(): CreateServiceModalContextValue {
  const context = useContext(CreateServiceModalContext);
  if (!context) {
    throw new Error(
      "useCreateServiceModal must be used within CreateServiceModalProvider",
    );
  }
  return context;
}
