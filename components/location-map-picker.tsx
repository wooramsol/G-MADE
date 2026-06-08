"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default marker icon fix for bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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
      // Leaflet lat/lng → EPSG:3857 meters (VWorld uses x,y in 3857 or 4326 depending on API)
      // Our APIs expect EPSG:4326 lon/lat as x,y
      onSelect(e.latlng.lng, e.latlng.lat);
    },
  });
  return null;
}

export default function LocationMapPicker({ selected, onSelect, disabled }: Props) {
  const center: [number, number] = selected
    ? [selected.y, selected.x]
    : [37.5665, 126.978]; // Seoul City Hall

  useEffect(() => {
    // Ensure leaflet CSS doesn't break layout
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: defaultIcon.options.iconUrl,
      iconRetinaUrl: defaultIcon.options.iconRetinaUrl,
      shadowUrl: defaultIcon.options.shadowUrl,
    });
  }, []);

  return (
    <div className="h-[280px] overflow-hidden rounded-lg border [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:z-0">
      <MapContainer
        center={center}
        zoom={selected ? 16 : 11}
        scrollWheelZoom
        key={selected ? `${selected.x}-${selected.y}` : "default"}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onSelect} disabled={disabled} />
        {selected && (
          <Marker position={[selected.y, selected.x]} icon={defaultIcon} />
        )}
      </MapContainer>
    </div>
  );
}
