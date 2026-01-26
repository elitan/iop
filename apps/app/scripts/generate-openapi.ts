import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "../src/contracts";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const spec = await generator.generate(contract, {
  info: {
    title: "Frost API",
    version: "1.0.0",
    description: "API for Frost deployment platform",
  },
  servers: [{ url: "/api" }],
});

const outputPath = process.argv[2] || "../marketing/public/openapi.json";
await Bun.write(outputPath, JSON.stringify(spec, null, 2));
console.error(`Generated OpenAPI spec at ${outputPath}`);
