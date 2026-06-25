import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingRow } from "./copy-field";
import type { ObjectStorageConnection } from "./types";

export function ObjectStorageConnectionCard({
  connection,
}: {
  connection: ObjectStorageConnection;
}) {
  return (
    <Card className="border-neutral-800 bg-neutral-900">
      <CardHeader>
        <CardTitle className="text-sm text-neutral-200">
          S3 Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <SettingRow
          label="External endpoint"
          value={connection.endpoint ?? "Deploying"}
        />
        <SettingRow
          label="Internal endpoint"
          value={connection.internalEndpoint}
        />
        <SettingRow label="Region" value={connection.region} />
        <SettingRow
          label="Force path style"
          value={String(connection.forcePathStyle)}
        />
      </CardContent>
    </Card>
  );
}
