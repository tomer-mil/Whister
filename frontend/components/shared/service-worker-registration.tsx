'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('[SW] Registration failed:', error);
    });
  }, []);

  return null;
}
