import multer from "multer";

// Item 3 (attachments hardening): cap individual file size at 25 MB and
// restrict to a known mime allowlist. Rejections are returned by multer
// as 400-class errors via the global handler. No virus scanning in v1 —
// tracked as a follow-up.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set<string>([
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    // Images
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
]);

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
    if (!file.mimetype || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(new Error(`Unsupported file type: ${file.mimetype || "unknown"}`));
        return;
    }
    cb(null, true);
};

const storage = multer.memoryStorage();

const baseOptions: multer.Options = {
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
};

const multipleUpload = multer(baseOptions).fields([
    {
        name: "files",
        maxCount: 10,
    },
]);

const singleUpload = multer(baseOptions);

export const fileUploader = {
    singleUpload,
    multipleUpload,
};

// Exported for service-layer double-checks + tests.
export const UPLOAD_LIMITS = {
    MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES,
};
