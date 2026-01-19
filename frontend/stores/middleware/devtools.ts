/**
 * Redux DevTools Middleware Configuration
 * Enables time-travel debugging and action tracking in browser DevTools
 */

export const devtoolsConfig = {
  name: 'Whist Store',
  enabled: process.env.NODE_ENV === 'development',
  trace: true,
  traceLimit: 25,
};
