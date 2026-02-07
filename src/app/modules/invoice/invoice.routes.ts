import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { InvoiceControllers } from "./invoice.controllers";
import { invoiceSchemas } from "./invoice.schemas";
import payloadValidator from "../../middleware/payload-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Get invoices list
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.INVOICES_READ),
    InvoiceControllers.getInvoices
);

// Generate invoice (ADMIN only)
router.post(
    "/generate",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.INVOICES_GENERATE),
    payloadValidator(invoiceSchemas.generateInvoice),
    InvoiceControllers.generateInvoice
);

// Get single invoice by ID or invoice_id
router.get(
    "/:invoiceId",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.INVOICES_READ),
    InvoiceControllers.getInvoiceById
);

router.get(
    "/download/:invoiceId",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.INVOICES_DOWNLOAD),
    InvoiceControllers.downloadInvoice
);

// Download invoice PDF (direct download)
router.get("/download-pdf/:invoiceId", InvoiceControllers.downloadInvoicePDF);

// Confirm payment (ADMIN only)
router.patch(
    "/:orderId/confirm-payment",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.INVOICES_CONFIRM_PAYMENT),
    payloadValidator(invoiceSchemas.confirmPayment),
    InvoiceControllers.confirmPayment
);

// Download cost estimate PDF (direct download)
router.get("/download-cost-estimate-pdf/:orderId", InvoiceControllers.downloadCostEstimatePDF);

// Download inbound request cost estimate PDF (direct download)
router.get("/download-ir-cost-estimate-pdf/:requestId", InvoiceControllers.downloadIRCostEstimatePDF);

export const InvoiceRoutes = router;
