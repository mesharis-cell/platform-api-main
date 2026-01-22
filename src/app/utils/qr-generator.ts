/**
 * QR Code Generator Utility
 * Improved QR code generation for assets (including reskinned assets)
 */

import crypto from 'crypto'

/**
 * Generate unique QR code for asset
 * Format: {PREFIX}-{HASH}
 */
export function generateAssetQRCode(assetName: string, companyId: string): string {
  // Create prefix from asset name (first 3 chars, uppercase, alphanumeric only)
  const prefix = assetName
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X')

  // Generate short hash from name + company + timestamp
  const hash = crypto
    .createHash('sha256')
    .update(`${assetName}-${companyId}-${Date.now()}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase()

  return `${prefix}-${hash}`
}

/**
 * Validate QR code format
 */
export function isValidQRCode(qrCode: string): boolean {
  // Format: XXX-XXXXXXXX (3 chars, dash, 8 chars)
  const pattern = /^[A-Z]{3}-[A-Z0-9]{8}$/
  return pattern.test(qrCode)
}
