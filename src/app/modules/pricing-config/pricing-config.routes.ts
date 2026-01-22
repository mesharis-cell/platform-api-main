import { Router } from 'express'
import auth from '../../middleware/auth'
import payloadValidator from '../../middleware/payload-validator'
import platformValidator from '../../middleware/platform-validator'
import requirePermission from '../../middleware/permission'
import { PERMISSIONS } from '../../constants/permissions'
import { PricingConfigControllers } from './pricing-config.controllers'
import { PricingConfigSchemas } from './pricing-config.schemas'

const router = Router()

// Get platform default config
router.get(
  '/',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.PRICING_CONFIG_READ),
  PricingConfigControllers.getPlatformDefaultConfig
)

// Get company-specific config
router.get(
  '/:companyId',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.PRICING_CONFIG_READ),
  PricingConfigControllers.getCompanyConfig
)

// Set platform default config
router.put(
  '/',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.PRICING_CONFIG_UPDATE),
  payloadValidator(PricingConfigSchemas.setPricingConfigSchema),
  PricingConfigControllers.setPlatformDefault
)

// Set company-specific config
router.put(
  '/:companyId',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.PRICING_CONFIG_UPDATE),
  payloadValidator(PricingConfigSchemas.setPricingConfigSchema),
  PricingConfigControllers.setCompanyOverride
)

// Remove company override (use platform default)
router.delete(
  '/:companyId',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.PRICING_CONFIG_UPDATE),
  PricingConfigControllers.removeCompanyOverride
)

export const PricingConfigRoutes = router
