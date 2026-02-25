# Express + Drizzle + Zod Starter Kit

A production-ready starter template for building RESTful APIs with **Express.js**, **Drizzle ORM**, and **Zod** validation. This kit provides a solid foundation with best practices, modular architecture, and TypeScript support.

## ✨ Features

- 🚀 **Express.js** - Fast, unopinionated web framework
- 🗄️ **Drizzle ORM** - Lightweight TypeScript ORM for PostgreSQL
- ✅ **Zod** - TypeScript-first schema validation
- 🔒 **Type Safety** - Full TypeScript support throughout
- 🏗️ **Modular Architecture** - Clean, scalable folder structure
- 🛡️ **Error Handling** - Global error handler with Zod error formatting
- 🔧 **Environment Config** - Centralized configuration management
- 🎯 **Auto Import Cleanup** - VS Code settings for automatic import organization
- 🔄 **Hot Reload** - Development server with `ts-node-dev`

## 📋 Prerequisites

- Node.js (v20 or higher)
- Bun (v1.2 or higher)
- PostgreSQL database

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone git@github.com:codemine24/express-drizzle-starter.git
cd drizzle
```

### 2. Install dependencies

```bash
bun install --frozen-lockfile
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS=your_staging_project_ref
DB_DESTRUCTIVE_ALLOWED_HOSTS=localhost,127.0.0.1
DB_DESTRUCTIVE_BLOCKED_ENVS=production,prod
```

### 4. Run database migrations

```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

### 5. Start the development server

```bash
bun run dev
```

The server will start at `http://localhost:5000`

## 📁 Project Structure

```
├── src/
│   ├── app/
│   │   ├── config/           # Environment configuration
│   │   ├── error/            # Error handlers (Zod, etc.)
│   │   ├── interface/        # TypeScript interfaces
│   │   ├── middleware/       # Express middleware
│   │   │   ├── global-error-handler.ts
│   │   │   ├── not-found-handler.ts
│   │   │   └── validate-request.ts
│   │   ├── modules/          # Feature modules
│   │   │   └── user/
│   │   │       ├── user.controllers.ts
│   │   │       ├── user.interfaces.ts
│   │   │       ├── user.routes.ts
│   │   │       ├── user.schemas.ts
│   │   │       └── user.services.ts
│   │   ├── routes/           # Route aggregation
│   │   └── shared/           # Shared utilities
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   └── schema.ts         # Drizzle schema definitions
│   ├── app.ts                # Express app setup
│   └── server.ts             # Server entry point
├── drizzle/                  # Generated migrations
├── .vscode/
│   └── settings.json         # VS Code workspace settings
├── drizzle.config.ts         # Drizzle configuration
├── tsconfig.json             # TypeScript configuration
└── package.json
```

## 🏗️ Architecture

### Module Structure

Each feature module follows a consistent pattern:

- **`*.schemas.ts`** - Zod validation schemas
- **`*.interfaces.ts`** - TypeScript type definitions
- **`*.services.ts`** - Business logic and database operations
- **`*.controllers.ts`** - Request/response handling
- **`*.routes.ts`** - Route definitions

### Example: User Module

```typescript
// user.schemas.ts - Validation
const createUser = z.object({
    body: z
        .object({
            name: z.string({ message: "Name is required" }),
            email: z.string().email({ message: "Invalid email address" }),
        })
        .strict(),
});

// user.interfaces.ts - Types
export type TCreateUserPayload = z.infer<typeof UserSchemas.createUser>["body"];

// user.services.ts - Business Logic
const createUser = async (data: TCreateUserPayload) => {
    const result = await db.insert(users).values(data).returning();
    return result[0];
};

// user.controllers.ts - Request Handler
const createUser = catchAsync(async (req, res) => {
    const result = await UserServices.createUser(req.body);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "User created successfully",
        data: result,
    });
});

// user.routes.ts - Routes
router.post("/", validateRequest(UserSchemas.createUser), UserControllers.createUser);
```

## 🗄️ Database Schema

Define your database schema using Drizzle ORM in `src/db/schema.ts`:

```typescript
import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    created_at: timestamp("created_at").defaultNow(),
});
```

### Generate and Run Migrations

```bash
# Generate migration files
bunx drizzle-kit generate

# Apply migrations to database
bunx drizzle-kit migrate

# Open Drizzle Studio (database GUI)
bunx drizzle-kit studio
```

## 🛡️ Error Handling

The starter kit includes comprehensive error handling:

- **Global Error Handler** - Catches all errors and formats responses
- **Zod Error Handler** - Formats validation errors consistently
- **Not Found Handler** - Handles 404 routes
- **Process Error Handlers** - Handles unhandled rejections and exceptions

Example error response:

```json
{
    "success": false,
    "message": "Validation error",
    "errorSources": [
        {
            "path": "body.email",
            "message": "Invalid email address"
        }
    ],
    "stack": "..." // Only in development mode
}
```

## 📝 Available Scripts

```bash
# Development
bun run dev          # Start development server with hot reload

# Production
bun run build        # Compile TypeScript to JavaScript
bun run start        # Run production server

# Database
bunx drizzle-kit generate   # Generate migrations
bunx drizzle-kit migrate    # Run migrations
bunx drizzle-kit studio     # Open Drizzle Studio
bun run db:rebuild          # Drop+recreate schema, then apply current schema (NO seed data)
bun run db:seed             # Wipe data tables then seed demo data (guarded)
bun run db:reset            # db:rebuild + db:seed
```

### Destructive DB guardrails

- `db:rebuild` and `db:seed` are blocked unless target DB is explicitly allow-listed.
- Supabase targets are checked by project ref extracted from `DATABASE_URL` username (`postgres.<project_ref>`).
- Non-Supabase targets are checked against `DB_DESTRUCTIVE_ALLOWED_HOSTS`.
- Both commands are blocked when `NODE_ENV`/`APP_ENV` is in `DB_DESTRUCTIVE_BLOCKED_ENVS`.
- Both commands require explicit confirmation phrase:
    - `db:rebuild` -> `REBUILD <project_ref_or_host:port/db>`
    - `db:seed` -> `SEED <project_ref_or_host:port/db>`
    - `db:reset` (one env var for both steps) -> `ALL <project_ref_or_host:port/db>`
- In non-interactive shells, pass confirmation via:

```bash
DB_DESTRUCTIVE_CONFIRM="REBUILD your_project_ref" bun run db:rebuild
DB_DESTRUCTIVE_CONFIRM="SEED your_project_ref" bun run db:seed
DB_DESTRUCTIVE_CONFIRM="ALL your_project_ref" bun run db:reset
```

## 🔧 Configuration

### Environment Variables

Configure your application in `src/app/config/index.ts`:

```typescript
export default {
    node_env: process.env.NODE_ENV,
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    app_name: "Drizzle",
};
```

### VS Code Settings

The `.vscode/settings.json` automatically:

- Removes unused imports on save
- Organizes imports alphabetically
- Formats code on save

## 🎯 Creating a New Module

1. Create a new folder in `src/app/modules/[module-name]`
2. Create the following files:
    - `[module-name].schemas.ts` - Zod schemas
    - `[module-name].interfaces.ts` - TypeScript types
    - `[module-name].services.ts` - Business logic
    - `[module-name].controllers.ts` - Request handlers
    - `[module-name].routes.ts` - Route definitions
3. Register routes in `src/app/routes/index.ts`

## 🔒 Middleware

### Validate Request

Validates incoming requests using Zod schemas:

```typescript
router.post("/users", validateRequest(UserSchemas.createUser), UserControllers.createUser);
```

### CORS

Configured in `src/app.ts`:

```typescript
app.use(
    cors({
        origin: ["http://localhost:3000"],
        credentials: true,
    })
);
```

## 📦 Tech Stack

| Technology    | Purpose            |
| ------------- | ------------------ |
| Express.js    | Web framework      |
| Drizzle ORM   | Database ORM       |
| Zod           | Schema validation  |
| TypeScript    | Type safety        |
| PostgreSQL    | Database           |
| ts-node-dev   | Development server |
| cookie-parser | Cookie parsing     |
| cors          | CORS handling      |
| http-status   | HTTP status codes  |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Zod](https://zod.dev/)

---

**Happy Coding! 🚀**
