// @ts-nocheck
/**
 * Responsive design system for consistent breakpoints
 */

/**
 * Breakpoint values matching Tailwind defaults
 */
export const breakpoints = {
  sm: 640,  // Small devices
  md: 768,  // Tablets
  lg: 1024, // Desktop
  xl: 1280, // Large desktop
  '2xl': 1536 // Extra large desktop
} as const;

/**
 * Media query helpers
 */
export const mediaQueries = {
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  
  // Tablet specific
  tablet: `(min-width: ${breakpoints.md}px) and (max-width: ${breakpoints.lg - 1}px)`,
  tabletUp: `(min-width: ${breakpoints.md}px)`,
  tabletDown: `(max-width: ${breakpoints.lg - 1}px)`,
  
  // Desktop specific
  desktop: `(min-width: ${breakpoints.lg}px)`,
  desktopDown: `(max-width: ${breakpoints.lg - 1}px)`
} as const;

/**
 * Grid column configurations for different viewports
 */
export const gridColumns = {
  // Cards grid
  cards: {
    default: 'grid-cols-1',
    tablet: 'md:grid-cols-2',
    desktop: 'lg:grid-cols-3',
    wide: 'xl:grid-cols-4'
  },
  
  // Form layouts
  forms: {
    default: 'grid-cols-1',
    tablet: 'md:grid-cols-2',
    desktop: 'lg:grid-cols-2'
  },
  
  // Dashboard metrics
  metrics: {
    default: 'grid-cols-1',
    tablet: 'md:grid-cols-2',
    desktop: 'lg:grid-cols-4'
  },
  
  // Settings/profile layouts
  settings: {
    default: 'grid-cols-1',
    tablet: 'md:grid-cols-1',
    desktop: 'lg:grid-cols-2'
  }
} as const;

/**
 * Container widths for different viewports
 */
export const containerWidths = {
  sm: 'max-w-screen-sm',   // 640px
  md: 'max-w-screen-md',   // 768px
  lg: 'max-w-screen-lg',   // 1024px
  xl: 'max-w-screen-xl',   // 1280px
  '2xl': 'max-w-screen-2xl', // 1536px
  full: 'max-w-full'
} as const;

/**
 * Responsive padding/spacing
 */
export const responsivePadding = {
  page: 'p-4 md:p-6 lg:p-8',
  card: 'p-4 md:p-6',
  section: 'py-4 md:py-6 lg:py-8',
  compact: 'p-2 md:p-3 lg:p-4'
} as const;

/**
 * Get responsive grid classes
 */
export function getResponsiveGrid(type: keyof typeof gridColumns): string {
  const config = gridColumns[type];
  return `grid gap-4 md:gap-6 ${config.default} ${config.tablet} ${config.desktop} ${config.wide || ''}`.trim();
}

/**
 * Check if current viewport is tablet
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints.md && window.innerWidth < breakpoints.lg;
}

/**
 * Check if current viewport is desktop or larger
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints.lg;
}