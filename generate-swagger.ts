import fs from "fs";
import path from "path";
import swaggerSpec from "./src/swagger";

const outputPath = path.join(__dirname, "src/swagger-output.json");

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));

console.log(`Swagger JSON generated at ${outputPath}`);
