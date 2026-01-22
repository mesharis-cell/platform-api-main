import z from 'zod'

const processReskinRequestSchema = z.object({
  body: z
    .object({
      cost: z
        .number({ message: 'Cost must be a number' })
        .positive('Cost must be greater than 0'),
      admin_notes: z.string().optional(),
    })
    .strict(),
})

const completeReskinRequestSchema = z.object({
  body: z
    .object({
      new_asset_name: z
        .string({ message: 'New asset name is required' })
        .min(1, 'New asset name is required')
        .max(200, 'New asset name must be under 200 characters'),
      completion_photos: z
        .array(z.string().url('Invalid photo URL'))
        .min(1, 'At least one photo is required'),
      completion_notes: z.string().optional(),
    })
    .strict(),
})

const cancelReskinRequestSchema = z.object({
  body: z
    .object({
      cancellation_reason: z
        .string({ message: 'Cancellation reason is required' })
        .min(10, 'Cancellation reason must be at least 10 characters'),
      order_action: z.enum(['continue', 'cancel_order'], {
        message: 'Order action must be "continue" or "cancel_order"',
      }),
    })
    .strict(),
})

export const ReskinRequestsSchemas = {
  processReskinRequestSchema,
  completeReskinRequestSchema,
  cancelReskinRequestSchema,
}
