import swaggerJsdoc from "swagger-jsdoc";
import config from "./app/config";

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
  ],
};

const options = {
  swaggerDefinition,
  apis: ["./src/app/**/*.swagger.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
