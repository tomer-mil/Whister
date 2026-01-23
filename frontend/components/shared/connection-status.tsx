'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/stores';
import { connectionPulseVariants } from '@/config/animations';

export function ConnectionStatus() {
  const status = useStore((state) => state.connectionStatus);

  const statusConfig = {
    connected: {
      color: 'bg-emerald-500',
      text: 'Connected',
    },
    connecting: {
      color: 'bg-amber-500',
      text: 'Connecting...',
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'Disconnected',
    },
    reconnecting: {
      color: 'bg-amber-500',
      text: 'Reconnecting...',
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <motion.div
        className={`w-2.5 h-2.5 rounded-full ${config.color}`}
        variants={connectionPulseVariants}
        animate={status}
      />
      <span className="text-xs text-muted-foreground font-medium">{config.text}</span>
    </div>
  );
}
