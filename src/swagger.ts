import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import config from "./app/config";
import "./app/modules/analytics/analytics.swagger";
import "./app/modules/asset/assets.swagger";
import "./app/modules/auth/Auth.swagger";
import "./app/modules/brand/brand.swagger";
import "./app/modules/calendar/calendar.swagger";
import "./app/modules/catalog/catalog.swagger";
import "./app/modules/collection/collection.swagger";
import "./app/modules/company/company.swagger";
import "./app/modules/invoice/invoice.swagger";
import "./app/modules/order/order.swagger";
import "./app/modules/platform/platform.swagger";
import "./app/modules/scanning/scanning.swagger";
import "./app/modules/upload/upload.swagger";
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
                    example: "34296bfa-406d-4266-bb68-55b65f270176",
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
            name: "Analytics",
            description:
                "Analytics and reporting endpoints for revenue, margins, and order metrics",
        },
        {
            name: "Asset Management",
            description:
                "Asset CRUD operations for inventory management with condition tracking and QR code generation",
        },
        {
            name: "Authentication",
            description: "User authentication and authorization endpoints",
        },
        {
            name: "Brand Management",
            description: "Brand CRUD operations for company brand management",
        },
        {
            name: "Calendar",
            description: "Client Calendar Events (Orders displayed as calendar events)",
        },
        {
            name: "Collection Management",
            description:
                "Collection CRUD operations for managing asset collections and collection items",
        },
        {
            name: "Company Management",
            description: "Company CRUD operations for tenant management",
        },
        {
            name: "Invoice Management",
            description: "Invoice generation and management operations",
        },
        {
            name: "Order Management",
            description: "Order CRUD operations for asset orders and fulfillment",
        },
        {
            name: "Platform Management",
            description: "Platform configuration and feature flags (Platform Admin only)",
        },
        {
            name: "Pricing Tier Management",
            description:
                "Pricing tier CRUD operations for managing location-based and volume-based pricing",
        },
        {
            name: "Scanning",
            description:
                "Warehouse scanning operations for inbound and outbound asset tracking with QR code validation",
        },
        {
            name: "Upload",
            description: "File upload operations for images and documents",
        },
        {
            name: "User Management",
            description: "User CRUD operations for platform users",
        },
        {
            name: "Warehouse Management",
            description: "Warehouse CRUD operations with multi-tenant support",
        },
        {
            name: "Zone Management",
            description:
                "Zone CRUD operations within warehouses for company-specific storage areas",
        },
    ],
};

const options = {
    swaggerDefinition,
    apis: [
        path.join(
            __dirname,
            process.env.NODE_ENV === "production" ? "app/**/*.swagger.js" : "app/**/*.swagger.ts"
        ),
    ],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
