import { Request } from 'express';

export interface PaginationOptions {
    page: number;
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: 'ASC' | 'DESC';
}

export const getPaginationOptions = (req: Request, defaultSortBy: string = 'created_at'): PaginationOptions => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const sortBy = (req.query.sort_by as string) || defaultSortBy;
    const sortOrder = (req.query.sort_dir as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    return { page, limit, offset, sortBy, sortOrder };
};

export const formatPaginationResponse = <T>(rows: T[], count: number, page: number, limit: number, dataKey: string = 'data') => {
    return {
        [dataKey]: rows,
        meta: {
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            itemsPerPage: limit
        }
    };
};
