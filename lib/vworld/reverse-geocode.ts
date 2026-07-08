import type { GeoPoint } from "./geocode";
import { reverseGeocodeDetailed, type ResolvedAddressDetail } from "./address-detail";

/** @deprecated reverseGeocodeDetailed를 사용하세요. */
export async function reverseGeocodePoint(point: GeoPoint): Promise<string | null> {
  const detail = await reverseGeocodeDetailed(point);
  return detail?.fullAddress ?? null;
}

export { reverseGeocodeDetailed, type ResolvedAddressDetail };
