import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton, SettingRow } from "./copy-field";
import type { CreatedAccessKey } from "./types";

function buildEnvBlock(snippets: CreatedAccessKey["snippets"]): string {
  return snippets.env
    .map(function formatEnv(envVar) {
      return `${envVar.key}=${envVar.value}`;
    })
    .join("\n");
}

export function CreatedKeyCard({
  createdKey,
}: {
  createdKey: CreatedAccessKey;
}) {
  const envBlock = buildEnvBlock(createdKey.snippets);

  return (
    <Card className="border-emerald-800/70 bg-emerald-950/20">
      <CardHeader>
        <CardTitle className="text-sm text-emerald-100">
          Secret shown once
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SettingRow
          label="Access key"
          value={createdKey.accessKey.accessKeyId}
        />
        <SettingRow label="Secret key" value={createdKey.secretAccessKey} />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">Environment</p>
            <CopyButton value={envBlock} />
          </div>
          <pre className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
            {envBlock}
          </pre>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">AWS CLI</p>
            <CopyButton value={createdKey.snippets.awsCli} />
          </div>
          <pre className="overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
            {createdKey.snippets.awsCli}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
