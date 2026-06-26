import type { ContractOutputs } from "@/contracts";

export type ObjectStorageDetails = ContractOutputs["objectStorages"]["get"];
export type ObjectStorageBucket = ObjectStorageDetails["buckets"][number];
export type ObjectStorageBucketObject =
  ContractOutputs["objectStorages"]["listBucketObjects"]["objects"][number];
export type ObjectStorageAccessKey = ObjectStorageDetails["accessKeys"][number];
export type ObjectStorageConnection = ObjectStorageDetails["connection"];
export type CreatedAccessKey =
  ContractOutputs["objectStorages"]["createAccessKey"];
export type AccessKeyPermission = ObjectStorageAccessKey["permissions"];
