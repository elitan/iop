import {
  detectServiceIconFromKeywords,
  FALLBACK_SERVICE_ICON_URL,
  getServiceIconUrl,
} from "./service-icons";

interface ServiceLike {
  name: string;
  icon?: string | null;
  imageUrl?: string | null;
}

export const FALLBACK_ICON = FALLBACK_SERVICE_ICON_URL;

export function getServiceIcon(service: ServiceLike): string | null {
  if (service.icon) {
    return getServiceIconUrl(service.icon);
  }

  const icon = detectServiceIconFromKeywords([
    service.imageUrl ?? "",
    service.name,
  ]);
  if (icon) {
    return getServiceIconUrl(icon);
  }

  return null;
}
