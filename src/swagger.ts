import swaggerJsdoc from "swagger-jsdoc";
import config from "./app/config";
import "./app/modules/auth/Auth.swagger";
import "./app/modules/collection/collection.swagger";
import "./app/modules/pricing-tier/pricing-tier.swagger";
import "./app/modules/user/user.swagger";
import "./app/modules/warehouse/warehouse.swagger";
import "./app/modules/zone/zone.swagger";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "PMG Asset Fulfillment Platform API",
    version: "1.0.0",
    description:
      "Multi-tenant asset management and order fulfillment platform API documentation",
    contact: {
      name: "PMG Platform",
      email: "support@pmg-platform.com",
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: "Local Development Server",
    },
    {
      url: "http://52.64.200.190",
      description: "Remote Server",
    },
    {
      url: "https://pmg-backend.vercel.app",
      description: "Vercel Deployment",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token obtained from /auth/login endpoint",
      },
    },
    parameters: {
      PlatformHeader: {
        name: "X-Platform",
        in: "header",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
          example: "593c027e-0774-4b0b-ae46-ec59c4f11304",
        },
        description: "Platform UUID (required on all requests)",
      },
      CompanyHeader: {
        name: "X-Company",
        in: "header",
        required: false,
        schema: {
          type: "string",
          format: "uuid",
        },
        description: "Optional company filter for operations API",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                example: "PLATFORM_REQUIRED",
              },
              message: {
                type: "string",
                example: "X-Platform header is required",
              },
              details: {
                type: "object",
              },
            },
          },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            example: 1,
          },
          limit: {
            type: "integer",
            example: 20,
          },
          total: {
            type: "integer",
            example: 100,
          },
          total_pages: {
            type: "integer",
            example: 5,
          },
        },
      },
    },
  },
  tags: [
    {
      name: "Platform Management",
      description:
        "Platform configuration and feature flags (Platform Admin only)",
    },
    {
      name: "Warehouse Management",
      description:
        "Warehouse CRUD operations with multi-tenant support",
    },
    {
      name: "Zone Management",
      description:
        "Zone CRUD operations within warehouses for company-specific storage areas",
    },
    {
      name: "Collection Management",
      description:
        "Collection CRUD operations for managing asset collections and collection items",
    },
    {
      name: "Pricing Tier Management",
      description:
        "Pricing tier CRUD operations for managing location-based and volume-based pricing",
    },
  ],
};

// Detect if we're running compiled JavaScript (production) or TypeScript (development)
// Check the file extension of the current module instead of the directory path
// This works with Vercel and other platforms that may run from different directories
const fs = require('fs');
const path = require('path');

// Check if this file exists as .js (compiled) or .ts (source)
const isProduction = __filename.endsWith('.js');

// Use absolute paths for better reliability in production
const rootDir = path.join(__dirname, '..');

const apiPath = isProduction
  ? path.join(rootDir, 'dist', 'app', '**', '*.swagger.js')
  : path.join(rootDir, 'src', 'app', '**', '*.swagger.ts');

console.log('Swagger Configuration:');
console.log('- __filename:', __filename);
console.log('- __dirname:', __dirname);
console.log('- rootDir:', rootDir);
console.log('- isProduction:', isProduction);
console.log('- API path:', apiPath);

const options = {
  swaggerDefinition,
  // Use absolute paths for better reliability
  apis: [apiPath],
};

const swaggerSpec = swaggerJsdoc(options);

console.log('Swagger spec generated with', Object.keys((swaggerSpec as any).paths || {}).length, 'endpoints');

export default swaggerSpec;
