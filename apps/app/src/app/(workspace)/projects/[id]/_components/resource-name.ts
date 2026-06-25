export function generateUniqueName(
  baseName: string,
  existingNames: string[],
): string {
  if (!existingNames.includes(baseName)) return baseName;

  let counter = 2;
  while (existingNames.includes(`${baseName}-${counter}`)) counter++;
  return `${baseName}-${counter}`;
}
