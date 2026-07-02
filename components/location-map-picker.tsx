"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 마커 아이콘은 CDN 대신 로컬 정적 자산 사용 (오프라인·CSP 환경 대응)
const defaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type Props = {
  selected: { x: number; y: number } | null;
  onSelect: (x: number, y: number) => void;
  disabled?: boolean;
};

function ClickHandler({
  onSelect,
  disabled,
}: {
  onSelect: (x: number, y: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      // Our APIs expect EPSG:4326 lon/lat as x,y
      onSelect(e.latlng.lng, e.latlng.lat);
    },
  });
  return null;
}

/** 선택 좌표가 바뀌면 지도를 재생성하지 않고 view만 이동한다. */
function RecenterOnSelect({ selected }: { selected: { x: number; y: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.setView([selected.y, selected.x], Math.max(map.getZoom(), 16));
    }
  }, [map, selected]);

  return null;
}

export default function LocationMapPicker({ selected, onSelect, disabled }: Props) {
  const center: [number, number] = selected
    ? [selected.y, selected.x]
    : [37.5665, 126.978]; // Seoul City Hall

  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: defaultIcon.options.iconUrl,
      iconRetinaUrl: defaultIcon.options.iconRetinaUrl,
      shadowUrl: defaultIcon.options.shadowUrl,
    });
  }, []);

  return (
    <div
      aria-label="사업 위치 선택 지도"
      className="h-[280px] overflow-hidden rounded-lg border [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:z-0"
      role="application"
    >
      <MapContainer center={center} zoom={selected ? 16 : 11} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onSelect} disabled={disabled} />
        <RecenterOnSelect selected={selected} />
        {selected && <Marker position={[selected.y, selected.x]} icon={defaultIcon} />}
      </MapContainer>
    </div>
  );
}
