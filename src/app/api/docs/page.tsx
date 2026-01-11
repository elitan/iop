"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export default function DocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: "/api/openapi.json",
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
