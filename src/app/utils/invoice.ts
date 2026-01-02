import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { orders } from "../../db/schema"

// --------------------------------- INVOICE NUMBER GENERATOR ---------------------------------
// FORMAT: INV-YYYYMMDD-###
// export const invoiceNumberGenerator = async (platformId: string): Promise<string> => {
//     const today = new Date()
//     const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD

//     // Find highest invoice number for today
//     const result = await db
//         .select({ invoice_id: orders.invoice_id })
//         .from(orders)
//         .where(
//             and(
//                 eq(orders.platform_id, platformId),
//                 isNotNull(orders.invoice_id),
//                 sql`${orders.invoice_id} LIKE ${`INV-${dateStr}-%`}`
//             )
//         )
//         .orderBy(desc(orders.invoice_id))
//         .limit(1)

//     if (result.length === 0) {
//         return `INV-${dateStr}-001`
//     }

//     const lastNumber = result[0].invoice_id!
//     const sequence = parseInt(lastNumber.split('-')[2]) + 1
//     const paddedSequence = sequence.toString().padStart(3, '0')

//     return `INV-${dateStr}-${paddedSequence}`
// }

export const invoiceGenerator = async (data: { invoice_id: string | null, invoice_paid_at: Date | null }, regenerate: boolean = false) => {
    if (data.invoice_id && !regenerate) {
        throw new Error(
            'Invoice already exists for this order. Use regenerate flag to create new invoice.'
        )
    }

    // Prevent regeneration after payment confirmed
    if (regenerate && data.invoice_paid_at) {
        throw new Error(
            'Cannot regenerate invoice after payment has been confirmed'
        )
    }

    // Generate or reuse invoice number
    // let invoiceNumber: string
    // if (regenerate && data.invoice_id) {
    //     // Archive old PDF if exists
    //     if (order.invoicePdfUrl) {
    //         try {
    //             await deleteFileFromS3(order.invoicePdfUrl)
    //         } catch (error) {
    //             console.error('Failed to delete old invoice PDF:', error)
    //             // Continue anyway, non-blocking
    //         }
    //     }
    //     invoiceNumber = data.invoice_id
    // } else {
    //     invoiceNumber = await generateInvoiceNumber()
    // }
}