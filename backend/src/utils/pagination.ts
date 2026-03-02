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
    let limit = parseInt(req.query.limit as string) || 10;

    // Constrain limit to a maximum of 100
    if (limit > 100) limit = 100;
    if (limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    let sortBy = (req.query.sort_by as string) || defaultSortBy;
    // Sanitize sortBy to prevent SQL Injection or weird columns
    if (!/^[a-zA-Z0-9_]+$/.test(sortBy)) {
        sortBy = defaultSortBy;
    }

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
