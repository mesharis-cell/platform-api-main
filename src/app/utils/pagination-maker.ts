type TPaginationOptions = {
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
};
const paginationMaker = (paginationOptions: TPaginationOptions) => {
    const { page, limit, sort_by, sort_order } = paginationOptions;
    const pageNumber = Math.max(1, Number(page)) || 1;
    const limitNumber = Math.min(Math.max(1, Number(limit)), 100) || 10;
    const skip = (pageNumber - 1) * limitNumber;
    const sortWith = sort_by || "created_at";
    const sortSequence = sort_order || "desc";

    return {
        pageNumber,
        limitNumber,
        skip,
        sortWith,
        sortSequence,
    };
};

export default paginationMaker;
