import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function truncateTransportRates() {
    const client = await pool.connect();

    try {
        console.log("Truncating transport_rates table...");

        // Truncate the table to remove all data
        await client.query("TRUNCATE TABLE transport_rates CASCADE;");

        console.log("✓ transport_rates table truncated successfully!");
        console.log("Now you can run: npx drizzle-kit push");
    } catch (error) {
        console.error("✗ Truncate failed:", error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

truncateTransportRates();
