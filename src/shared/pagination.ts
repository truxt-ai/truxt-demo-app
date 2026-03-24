export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function parsePagination(query: Record<string, any>, defaults = { page: 1, pageSize: 20 }): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || defaults.page);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || query.page_size) || defaults.pageSize));
  return { page, pageSize };
}

export function paginate<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);
  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

export function paginationToSQL(params: PaginationParams): { limit: number; offset: number } {
  return {
    limit: params.pageSize,
    offset: (params.page - 1) * params.pageSize,
  };
}
