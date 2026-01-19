/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from 'nanoid';
import type {
  UIState,
  UIActions,
  Toast,
} from '@/types/store';

export interface UISlice extends UIState, UIActions {}

const initialUIState: UIState = {
  toasts: [],
  activeModal: null,
  modalProps: {},
  isLoading: false,
  loadingMessage: null,
  connectionStatus: 'disconnected',
};

export const createUISlice: any = (set: any) => ({
  ...initialUIState,

  showToast: (toast) => {
    const id = nanoid();
    const fullToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    };

    set((state) => ({
      toasts: [...state.toasts, fullToast],
    }));

    // Auto-dismiss after duration
    if (fullToast.duration && fullToast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, fullToast.duration);
    }
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  openModal: (modalId, props = {}) => {
    set({
      activeModal: modalId,
      modalProps: props,
    });
  },

  closeModal: () => {
    set({
      activeModal: null,
      modalProps: {},
    });
  },

  setLoading: (isLoading, message) => {
    set({
      isLoading,
      loadingMessage: message ?? null,
    });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },
});
