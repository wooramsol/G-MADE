import type { ProjectLocationPoint } from "@/lib/types";

export type LocationLabelInput = {
  address: string;
  adminRegion?: string;
  note?: string;
  x?: number;
  y?: number;
  source?: ProjectLocationPoint["source"];
};

export function formatLocationLabel(input: LocationLabelInput): string {
  const address = mergeAddressWithAdminRegion(input.adminRegion, input.address);
  if (input.note?.trim()) {
    return `${address} (${input.note.trim()})`;
  }
  return address;
}

export function mergeAddressWithAdminRegion(adminRegion: string | undefined, address: string): string {
  const normalizedAddress = address.trim();
  const normalizedAdmin = adminRegion?.trim() ?? "";
  if (!normalizedAdmin) return normalizedAddress;
  if (!normalizedAddress) return normalizedAdmin;
  if (normalizedAddress.includes(normalizedAdmin)) return normalizedAddress;
  if (normalizedAdmin.includes(normalizedAddress)) return normalizedAdmin;

  const adminParts = normalizedAdmin.split(/\s+/);
  const firstToken = normalizedAddress.split(/\s+/)[0] ?? "";
  const startsWithCityOrDistrict =
    /(?:특별시|광역시|특별자치시|도)$/.test(firstToken) ||
    /(?:시|군|구)$/.test(firstToken) ||
    /(?:읍|면|동|리)$/.test(firstToken);

  if (startsWithCityOrDistrict) return normalizedAddress;
  return `${normalizedAdmin} ${normalizedAddress}`.trim();
}

export function buildLocationPointFromSelection(selection: LocationLabelInput & {
  x: number;
  y: number;
  source: ProjectLocationPoint["source"];
}): ProjectLocationPoint {
  return {
    x: selection.x,
    y: selection.y,
    source: selection.source,
    note: selection.note,
    adminRegion: selection.adminRegion,
  };
}

export function resolveOrdinanceLocation(project: {
  location: string;
  locationPoint?: ProjectLocationPoint;
}): string {
  const base = project.location.split(" (")[0]?.trim() ?? project.location.trim();
  return mergeAddressWithAdminRegion(project.locationPoint?.adminRegion, base);
}
