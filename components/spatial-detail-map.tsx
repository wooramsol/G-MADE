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

function shortenLabel(name: string, max = 14): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

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

  const layerSummary = Array.from(
    layerFeatures.reduce((map, feature) => {
      const current = map.get(feature.layerId) ?? {
        layerId: feature.layerId,
        layerLabel: feature.layerLabel,
        names: [] as string[],
      };
      if (!current.names.includes(feature.name)) {
        current.names.push(feature.name);
      }
      map.set(feature.layerId, current);
      return map;
    }, new Map<string, { layerId: string; layerLabel: string; names: string[] }>()),
  ).map(([, value]) => value);

  return (
    <div className="space-y-2">
      <div className="h-[320px] overflow-hidden rounded-xl border border-[#d7dee8] [&_.leaflet-container]:h-full [&_.leaflet-container]:w-full [&_.leaflet-container]:z-0 [&_.zone-map-label]:rounded-md [&_.zone-map-label]:border [&_.zone-map-label]:border-white/80 [&_.zone-map-label]:bg-white/90 [&_.zone-map-label]:px-1.5 [&_.zone-map-label]:py-0.5 [&_.zone-map-label]:text-[10px] [&_.zone-map-label]:font-bold [&_.zone-map-label]:leading-tight [&_.zone-map-label]:text-[#15345b] [&_.zone-map-label]:shadow-sm">
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
              onEachFeature={(geoFeature, layer) => {
                const name = geoFeature.properties?.name;
                if (!name) return;
                layer.bindTooltip(shortenLabel(name), {
                  permanent: true,
                  direction: "center",
                  className: "zone-map-label",
                });
              }}
            />
          ))}
        </MapContainer>
      </div>
      {layerSummary.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {layerSummary.map((layer) => (
            <span
              key={layer.layerId}
              className="rounded-full px-2.5 py-1 font-bold"
              style={{
                backgroundColor: `${LAYER_COLORS[layer.layerId] ?? "#64748b"}22`,
                color: LAYER_COLORS[layer.layerId] ?? "#64748b",
              }}
              title={layer.names.join(", ")}
            >
              {layer.layerLabel} {layer.names.length}건
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
