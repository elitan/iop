export interface ContainerCommandOptions {
  entrypoint?: string;
  command?: string[];
}

export function buildContainerCommandOptions(
  command: string | null | undefined,
): ContainerCommandOptions {
  if (!command) {
    return {};
  }

  return {
    entrypoint: "/bin/sh",
    command: ["-c", command],
  };
}
