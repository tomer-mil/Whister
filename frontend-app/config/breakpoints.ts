/**
 * Responsive Design Breakpoints
 * Mobile-first approach for all layouts
 */

export const breakpoints = {
  xs: 320,   // Small phones
  sm: 375,   // Standard phones (iPhone SE, etc.)
  md: 428,   // Large phones (iPhone Pro Max, etc.)
  lg: 768,   // Tablets portrait
  xl: 1024,  // Tablets landscape / Small laptops
  '2xl': 1280, // Desktop
} as const;

export type Breakpoint = keyof typeof breakpoints;

// Tailwind classes mapping
export const breakpointClasses = {
  xs: '',
  sm: 'sm:',
  md: 'md:',
  lg: 'lg:',
  xl: 'xl:',
  '2xl': '2xl:',
} as const;

// Media query strings for hooks
export const mediaQueries = {
  xs: `(min-width: ${breakpoints.xs}px)`,
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  // Orientation
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',
  // Specific combinations
  tabletLandscape: `(min-width: ${breakpoints.lg}px) and (orientation: landscape)`,
  phoneLandscape: `(max-width: ${breakpoints.lg - 1}px) and (orientation: landscape)`,
} as const;

/**
 * Convenience hook for checking if screen matches a specific breakpoint
 */
export function getMediaQuery(breakpoint: Breakpoint): string {
  return mediaQueries[breakpoint];
}

/**
 * Get the width in pixels for a breakpoint
 */
export function getBreakpointWidth(breakpoint: Breakpoint): number {
  return breakpoints[breakpoint];
}

/**
 * Check if a given width is within a breakpoint range
 */
export function isBreakpoint(
  width: number,
  from: Breakpoint,
  to?: Breakpoint
): boolean {
  const fromWidth = breakpoints[from];
  const toWidth = to ? breakpoints[to] : Infinity;
  return width >= fromWidth && width < toWidth;
}
