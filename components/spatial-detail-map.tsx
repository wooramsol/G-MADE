"use client";

import { useEffect } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const LAYER_COLORS: Record<string, string> = {
  "landscape-zone": "#2463b3",
  "land-use-zone": "#16a34a",
  "cultural-heritage": "#dc2626",
};

type LayerFeature = {
  layerId: string;
  layerLabel: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
};

type Props = {
  point: { x: number; y: number };
  layerFeatures?: LayerFeature[];
};

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function SpatialDetailMap({ point, layerFeatures = [] }: Props) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: markerIcon.options.iconUrl,
      iconRetinaUrl: markerIcon.options.iconRetinaUrl,
      shadowUrl: markerIcon.options.shadowUrl,
    });
  }, []);

  const center: [number, number] = [point.y, point.x];
  const geoJsonFeatures = layerFeatures
    .filter((feature) => feature.geometry)
    .map((feature) => ({
      type: "Feature" as const,
      properties: { layerId: feature.layerId, name: feature.name, layerLabel: feature.layerLabel },
      geometry: feature.geometry as GeoJSON.Geometry,
    }));

  return (
    <div className="space-y-2">
      <div className="h-[320px] overflow-hidden rounded-xl border border-[#d7dee8] [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:z-0">
        <MapContainer center={center} zoom={15} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={center} icon={markerIcon} />
          {geoJsonFeatures.map((feature, index) => (
            <GeoJSON
              key={`${feature.properties.layerId}-${index}`}
              data={feature}
              style={{
                color: LAYER_COLORS[feature.properties.layerId] ?? "#64748b",
                weight: 2,
                fillOpacity: 0.15,
              }}
            />
          ))}
        </MapContainer>
      </div>
      {layerFeatures.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {Array.from(new Set(layerFeatures.map((f) => f.layerId))).map((layerId) => (
            <span
              key={layerId}
              className="rounded-full px-2.5 py-1 font-bold"
              style={{
                backgroundColor: `${LAYER_COLORS[layerId] ?? "#64748b"}22`,
                color: LAYER_COLORS[layerId] ?? "#64748b",
              }}
            >
              {layerFeatures.find((f) => f.layerId === layerId)?.layerLabel ?? layerId}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
