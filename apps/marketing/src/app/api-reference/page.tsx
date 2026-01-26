"use client";

import dynamic from "next/dynamic";

const ApiReferenceReact = dynamic(
  () =>
    import("@scalar/api-reference-react").then((mod) => mod.ApiReferenceReact),
  { ssr: false },
);

export default function ApiReferencePage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: "/openapi.json",
        theme: "kepler",
        hideModels: false,
        hideDownloadButton: false,
        defaultHttpClient: {
          targetKey: "js",
          clientKey: "fetch",
        },
      }}
    />
  );
}
