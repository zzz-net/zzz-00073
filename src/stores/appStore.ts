import { create } from 'zustand'

interface AppState {
  currentRole: 'admin' | 'ta'
  toggleRole: () => void
  currentSessionId: number | null
  setCurrentSessionId: (id: number | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentRole: 'admin',
  toggleRole: () =>
    set((state) => ({
      currentRole: state.currentRole === 'admin' ? 'ta' : 'admin',
    })),
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}))
