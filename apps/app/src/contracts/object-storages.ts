import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  objectStorageAccessKeyPermissionSchema,
  objectStorageAccessKeysSchema,
  objectStorageBucketsSchema,
  objectStoragesSchema,
} from "@/lib/db-schemas";
import {
  serviceAttentionStatusSchema,
  serviceRuntimeStatusSchema,
} from "./shared";

const objectStorageSchema = objectStoragesSchema
  .omit({
    engine: true,
    adminTokenEncrypted: true,
    metricsTokenEncrypted: true,
  })
  .extend({
    endpoint: z.string().nullable(),
    runtimeStatus: serviceRuntimeStatusSchema,
    attentionStatus: serviceAttentionStatusSchema,
    hostPort: z.number().nullable(),
  });

const objectStorageBucketSchema = objectStorageBucketsSchema;

const objectStorageAccessKeySchema = objectStorageAccessKeysSchema.omit({
  secretAccessKeyEncrypted: true,
});

const objectStorageConnectionSchema = z.object({
  endpoint: z.string().nullable(),
  internalEndpoint: z.string(),
  region: z.string(),
  forcePathStyle: z.boolean(),
});

const connectionSnippetSchema = z.object({
  env: z.array(z.object({ key: z.string(), value: z.string() })),
  awsCli: z.string(),
  javascript: z.string(),
});

const objectStorageDetailsSchema = z.object({
  objectStorage: objectStorageSchema,
  buckets: z.array(objectStorageBucketSchema),
  accessKeys: z.array(objectStorageAccessKeySchema),
  connection: objectStorageConnectionSchema,
});

const objectStorageBucketObjectSchema = z.object({
  key: z.string(),
  size: z.number(),
  lastModified: z.number().nullable(),
  etag: z.string().nullable(),
});

const objectStorageBucketObjectListSchema = z.object({
  bucketId: z.string(),
  prefix: z.string(),
  nextCursor: z.string().nullable(),
  objects: z.array(objectStorageBucketObjectSchema),
});

export const objectStoragesContract = {
  create: oc
    .route({ method: "POST", path: "/projects/{projectId}/object-storages" })
    .input(
      z.object({
        projectId: z.string(),
        environmentId: z.string(),
        name: z.string().min(1),
        bucketName: z.string().min(1).optional(),
      }),
    )
    .output(objectStorageDetailsSchema),

  list: oc
    .route({ method: "GET", path: "/projects/{projectId}/object-storages" })
    .input(z.object({ projectId: z.string() }))
    .output(z.array(objectStorageSchema)),

  get: oc
    .route({ method: "GET", path: "/object-storages/{objectStorageId}" })
    .input(z.object({ objectStorageId: z.string() }))
    .output(objectStorageDetailsSchema),

  delete: oc
    .route({ method: "DELETE", path: "/object-storages/{objectStorageId}" })
    .input(z.object({ objectStorageId: z.string() }))
    .output(z.object({ success: z.boolean() })),

  createBucket: oc
    .route({
      method: "POST",
      path: "/object-storages/{objectStorageId}/buckets",
    })
    .input(
      z.object({
        objectStorageId: z.string(),
        name: z.string().min(1),
      }),
    )
    .output(objectStorageBucketSchema),

  deleteBucket: oc
    .route({
      method: "DELETE",
      path: "/object-storages/{objectStorageId}/buckets/{bucketId}",
    })
    .input(
      z.object({
        objectStorageId: z.string(),
        bucketId: z.string(),
      }),
    )
    .output(z.object({ success: z.boolean() })),

  listBucketObjects: oc
    .route({
      method: "GET",
      path: "/object-storages/{objectStorageId}/buckets/{bucketId}/objects",
    })
    .input(
      z.object({
        objectStorageId: z.string(),
        bucketId: z.string(),
        prefix: z.string().optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(objectStorageBucketObjectListSchema),

  createAccessKey: oc
    .route({
      method: "POST",
      path: "/object-storages/{objectStorageId}/access-keys",
    })
    .input(
      z.object({
        objectStorageId: z.string(),
        bucketId: z.string(),
        name: z.string().min(1),
        permissions:
          objectStorageAccessKeyPermissionSchema.default("read-write"),
      }),
    )
    .output(
      z.object({
        accessKey: objectStorageAccessKeySchema,
        secretAccessKey: z.string(),
        snippets: connectionSnippetSchema,
      }),
    ),

  revokeAccessKey: oc
    .route({
      method: "DELETE",
      path: "/object-storages/{objectStorageId}/access-keys/{accessKeyId}",
    })
    .input(
      z.object({
        objectStorageId: z.string(),
        accessKeyId: z.string(),
      }),
    )
    .output(z.object({ success: z.boolean() })),
};
