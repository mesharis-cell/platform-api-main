import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { InvoiceControllers } from "./invoice.controllers";

const router = Router();

// Get invoices list
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    InvoiceControllers.getInvoices
);


// Get single invoice by ID or invoice_id
router.get(
    "/:invoiceId",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    InvoiceControllers.getInvoiceById
);

router.get(
    "/download/:invoiceId",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    InvoiceControllers.downloadInvoice
);

// Download invoice PDF (direct download)
router.get(
    "/download-pdf/:invoiceId",
    InvoiceControllers.downloadInvoicePDF
);

export const InvoiceRoutes = router;
