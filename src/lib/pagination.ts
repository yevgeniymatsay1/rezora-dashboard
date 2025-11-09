import { useState, useMemo, useCallback } from 'react';

/**
 * Pagination utilities and hooks
 */

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Validate and normalize pagination parameters
 */
export function normalizePaginationParams(
  params: PaginationParams,
  maxLimit: number = 100
): { page: number; limit: number } {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(maxLimit, Math.max(1, params.limit || 20));
  
  return { page, limit };
}

/**
 * Custom hook for pagination state management
 */
export function usePagination(initialLimit: number = 20) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  
  const totalPages = useMemo(() => 
    calculateTotalPages(total, limit),
    [total, limit]
  );
  
  const hasNext = useMemo(() => page < totalPages, [page, totalPages]);
  const hasPrev = useMemo(() => page > 1, [page]);
  
  const goToPage = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);
  
  const nextPage = useCallback(() => {
    if (hasNext) {
      setPage(p => p + 1);
    }
  }, [hasNext]);
  
  const prevPage = useCallback(() => {
    if (hasPrev) {
      setPage(p => p - 1);
    }
  }, [hasPrev]);
  
  const changeLimit = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1); // Reset to first page when limit changes
  }, []);
  
  const updateTotal = useCallback((newTotal: number) => {
    setTotal(newTotal);
  }, []);
  
  const reset = useCallback(() => {
    setPage(1);
    setTotal(0);
  }, []);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
    offset: calculateOffset(page, limit),
    goToPage,
    nextPage,
    prevPage,
    changeLimit,
    updateTotal,
    reset,
    setPage
  };
}

/**
 * Create paginated query with Supabase
 */
export function paginateQuery<T>(
  query: any,
  page: number,
  limit: number
): any {
  const offset = calculateOffset(page, limit);
  return query.range(offset, offset + limit - 1);
}

/**
 * Cursor-based pagination for real-time data
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  direction?: 'next' | 'prev';
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

/**
 * Custom hook for cursor-based pagination
 */
export function useCursorPagination<T extends { id: string }>(
  initialLimit: number = 20
) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [limit, setLimit] = useState(initialLimit);
  const [hasMore, setHasMore] = useState(true);
  
  const goToNext = useCallback((nextCursor: string) => {
    if (currentCursor) {
      setCursors(prev => [...prev, currentCursor]);
    }
    setCurrentCursor(nextCursor);
  }, [currentCursor]);
  
  const goToPrev = useCallback(() => {
    if (cursors.length > 0) {
      const newCursors = [...cursors];
      const prevCursor = newCursors.pop();
      setCursors(newCursors);
      setCurrentCursor(prevCursor || null);
    }
  }, [cursors]);
  
  const reset = useCallback(() => {
    setCursors([]);
    setCurrentCursor(null);
    setHasMore(true);
  }, []);
  
  return {
    currentCursor,
    limit,
    hasMore,
    hasPrev: cursors.length > 0,
    goToNext,
    goToPrev,
    setHasMore,
    setLimit,
    reset
  };
}

/**
 * Virtual scrolling helper for large lists
 */
export interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export function calculateVirtualItems<T>(
  items: T[],
  scrollTop: number,
  options: VirtualScrollOptions
): {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  offsetY: number;
} {
  const { itemHeight, containerHeight, overscan = 3 } = options;
  
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / itemHeight) - overscan
  );
  
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(
    items.length,
    startIndex + visibleCount + overscan * 2
  );
  
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;
  
  return {
    visibleItems,
    startIndex,
    endIndex,
    offsetY
  };
}

/**
 * Infinite scroll hook
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  hasMore: boolean,
  threshold: number = 100
) {
  const [loading, setLoading] = useState(false);
  
  const handleScroll = useCallback(async (e: React.UIEvent<HTMLElement>) => {
    const element = e.currentTarget;
    const scrollRemaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    
    if (scrollRemaining < threshold && hasMore && !loading) {
      setLoading(true);
      try {
        await loadMore();
      } finally {
        setLoading(false);
      }
    }
  }, [loadMore, hasMore, loading, threshold]);
  
  return {
    loading,
    handleScroll
  };
}

/**
 * Batch pagination for bulk operations
 */
export async function processBatchPaginated<T, R>(
  fetchPage: (page: number, limit: number) => Promise<T[]>,
  processItem: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    pageSize?: number;
    maxConcurrent?: number;
  } = {}
): Promise<R[]> {
  const {
    batchSize = 10,
    pageSize = 100,
    maxConcurrent = 3
  } = options;
  
  const results: R[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const items = await fetchPage(page, pageSize);
    
    if (items.length === 0) {
      hasMore = false;
      break;
    }
    
    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(item => processItem(item));
      
      // Limit concurrent operations
      const batchResults = await Promise.all(
        batchPromises.slice(0, maxConcurrent)
      );
      
      results.push(...batchResults);
    }
    
    if (items.length < pageSize) {
      hasMore = false;
    }
    
    page++;
  }
  
  return results;
}