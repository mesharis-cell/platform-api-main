// --------------------------------- INVOICE NUMBER GENERATOR ---------------------------------

import { and, desc, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { orders } from "../../db/schema"

// FORMAT: INV-YYYYMMDD-###
export async function generateInvoiceNumber(): Promise<string> {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD

    // Find highest invoice number for today
    const result = await db
        .select({ invoiceNumber: orders.invoice_id })
        .from(orders)
        .where(
            and(
                isNotNull(orders.invoice_id),
                sql`${orders.invoice_id} LIKE ${`INV-${dateStr}-%`}`
            )
        )
        .orderBy(desc(orders.invoice_id))
        .limit(1)

    if (result.length === 0) {
        return `INV-${dateStr}-001`
    }

    const lastNumber = result[0].invoiceNumber!
    const sequence = parseInt(lastNumber.split('-')[2]) + 1
    const paddedSequence = sequence.toString().padStart(3, '0')

    return `INV-${dateStr}-${paddedSequence}`
}