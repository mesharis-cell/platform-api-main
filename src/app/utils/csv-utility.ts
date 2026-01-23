import httpStatus from "http-status";
import Papa from "papaparse";
import CustomizedError from "../error/customized-error";

// ----------------------------------- HELPER: CSV FILE PARSER --------------------------------
export const CSVFileParser = async (
    file: Express.Multer.File
): Promise<{
    data: Record<string, any>[];
    errors: string[];
}> => {
    return new Promise((resolve) => {
        const fileContent = file.buffer.toString("utf-8");

        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
            transform: (value) => value.trim(),
            complete: (results: any) => {
                const errors: string[] = [];

                // Check for parsing errors
                if (results.errors.length > 0) {
                    errors.push(
                        ...results.errors.map(
                            (e: any) => `Parse error at row ${e.row}: ${e.message}`
                        )
                    );
                }

                // Add row numbers to data
                const parsedData: Record<string, any>[] = (results.data as any[]).map(
                    (row, index) => ({
                        ...row,
                        rowNumber: index + 2, // +2 because index is 0-based and CSV has header row
                    })
                );

                resolve({
                    data: parsedData,
                    errors,
                });
            },
            error: (error: any) => {
                resolve({
                    data: [],
                    errors: [error.message],
                });
            },
        });
    });
};

// ----------------------------------- HELPER: VALIDATE CSV STRUCTURE -------------------------
export const CSVStructureValidator = (
    rows: Record<string, any>[],
    allFields: string[],
    requiredFields: string[],
    identityField: string = "name"
): { errors: Record<string, any>[]; valid_rows: Record<string, any>[] } => {
    const errors = [];

    if (rows.length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "CSV file is empty");
    }

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const requiredMissingFields: string[] = [];

        requiredFields.forEach((col) => {
            if (!(col in row)) {
                requiredMissingFields.push(col);
            }
        });

        const unknownFields: string[] = [];

        Object.keys(row).forEach((col) => {
            if (!allFields.includes(col)) {
                unknownFields.push(col);
            }
        });

        if (requiredMissingFields.length > 0 || unknownFields.length > 0) {
            const error = {
                name: row[identityField] || "Unkonwn",
                ...(requiredMissingFields.length > 0
                    ? { required_fields: requiredMissingFields.join(", ") }
                    : {}),
                ...(unknownFields.length > 0 ? { unknown_fields: unknownFields.join(", ") } : {}),
            };
            errors.push(error);
        }
    }

    return {
        errors,
        valid_rows: rows,
    };
};
