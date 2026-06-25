import type { ObjectStorageConnectionSnippets } from "./types";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

export function buildObjectStorageConnectionSnippets(input: {
  endpoint: string | null;
  internalEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): ObjectStorageConnectionSnippets {
  const endpoint = input.endpoint ?? input.internalEndpoint;
  const env = [
    { key: "S3_ENDPOINT", value: endpoint },
    { key: "S3_INTERNAL_ENDPOINT", value: input.internalEndpoint },
    { key: "S3_REGION", value: input.region },
    { key: "S3_BUCKET", value: input.bucket },
    { key: "S3_ACCESS_KEY_ID", value: input.accessKeyId },
    { key: "S3_SECRET_ACCESS_KEY", value: input.secretAccessKey },
    { key: "S3_FORCE_PATH_STYLE", value: "true" },
  ];

  return {
    env,
    awsCli: [
      `AWS_ACCESS_KEY_ID=${shellQuote(input.accessKeyId)}`,
      `AWS_SECRET_ACCESS_KEY=${shellQuote(input.secretAccessKey)}`,
      "aws",
      "--endpoint-url",
      shellQuote(endpoint),
      "s3",
      "ls",
      shellQuote(`s3://${input.bucket}`),
    ].join(" "),
    javascript: `const client = new S3Client({
  region: ${jsString(input.region)},
  endpoint: ${jsString(endpoint)},
  forcePathStyle: true,
  credentials: {
    accessKeyId: ${jsString(input.accessKeyId)},
    secretAccessKey: ${jsString(input.secretAccessKey)},
  },
});`,
  };
}
