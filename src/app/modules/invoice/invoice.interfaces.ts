import { z } from "zod";
import { invoiceSchemas } from "./invoice.schemas";

// ----------------------------------- CONFIRM PAYMENT PAYLOAD --------------------------------
export type ConfirmPaymentPayload = z.infer<typeof invoiceSchemas.confirmPayment>["body"];
