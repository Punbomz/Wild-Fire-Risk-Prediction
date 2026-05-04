import { MapContainer, TileLayer, GeoJSON, useMap, CircleMarker, Tooltip, ZoomControl } from "react-leaflet";
import { useEffect, useRef, useCallback } from "react";

// ─── Map controller: zoom to province or district ──────────────────────────
function MapController({ selectedProvince, selectedDistrict, provData, geoData }) {
  const map = useMap();

  // Zoom to province bounds when province selected (but no district yet)
  useEffect(() => {
    if (!selectedProvince || selectedDistrict || !provData) return;
    const feat = provData.features.find((f) => f.properties.NAME_1 === selectedProvince);
    if (!feat) return;
    zoomToBounds(map, feat.geometry);
  }, [selectedProvince, selectedDistrict, provData, map]);

  // Zoom to district bounds when district selected
  useEffect(() => {
    if (!selectedDistrict || !geoData) return;
    const feat = geoData.features.find(
      (f) =>
        f.properties.NAME_2 === selectedDistrict &&
        f.properties.NAME_1 === selectedProvince
    );
    if (!feat) return;
    zoomToBounds(map, feat.geometry, [80, 80]);
  }, [selectedDistrict, selectedProvince, geoData, map]);

  return null;
}

function zoomToBounds(map, geometry, padding = [40, 40]) {
  let allCoords = [];
  const flatten = (arr, depth) => {
    if (depth === 0) { allCoords.push(arr); return; }
    arr.forEach((c) => flatten(c, depth - 1));
  };
  const depth = geometry.type === "Polygon" ? 2 : 3;
  flatten(geometry.coordinates, depth);
  const lats = allCoords.map((c) => c[1]);
  const lngs = allCoords.map((c) => c[0]);
  map.flyToBounds(
    [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
    { padding, duration: 0.9 }
  );
}

// ─── Colour helpers ────────────────────────────────────────────────────────
const getRiskColor = (level) => {
  if (!level) return "#e05c2a";
  const l = level.toString().toLowerCase();
  if (l === "high"   || parseFloat(l) > 0.75) return "#d7191c";
  if (l === "medium" || parseFloat(l) > 0.50) return "#f59b00";
  return "#1a9641";
};

// ─── Dynamic color for points based on percentage (0-1) ───────────────────
const getDynamicColor = (prob) => {
  if (prob >= 0.85) return "#b91c1c"; // แดงเข้ม (Critical)
  if (prob >= 0.70) return "#ef4444"; // แดง (High)
  if (prob >= 0.50) return "#f59e0b"; // ส้ม (Medium)
  if (prob >= 0.30) return "#fbbf24"; // เหลือง (Low-Medium)
  return "#22c55e"; // เขียว (Low)
};

const getRiskLabel = (level) => {
  if (!level) return null;
  const l = level.toString().toLowerCase();
  if (l === "high"   || parseFloat(l) > 0.75) return "High Risk";
  if (l === "medium" || parseFloat(l) > 0.50) return "Medium Risk";
  return "Low Risk";
};

// ─── Province Layer (with built-in name labels via bindTooltip) ────────────
function ProvinceLayer({ provData, selectedProvince, onProvinceClick, showLabels }) {
  const style = useCallback(
    (feature) => {
      const isSel = feature.properties.NAME_1 === selectedProvince;
      return {
        fillColor: isSel ? "#1565c0" : "#4CAF50",
        fillOpacity: isSel ? 0.22 : 0.12,
        color: isSel ? "#1565c0" : "#2e7d32",
        weight: isSel ? 2.5 : 1.2,
        opacity: 0.85,
      };
    },
    [selectedProvince]
  );

  const onEach = useCallback(
    (feature, layer) => {
      const name = feature.properties.NAME_1;
      const { centroid_lat, centroid_lon } = feature.properties;

      // Show province name label only at overview zoom level
      if (showLabels && centroid_lat && centroid_lon) {
        layer.bindTooltip(name, {
          permanent: true,
          direction: "center",
          className: "prov-label",
          interactive: false,
        });
      }

      layer.on("mouseover", () => {
        if (name !== selectedProvince) {
          layer.setStyle({ fillOpacity: 0.30, fillColor: "#388e3c", color: "#1b5e20", weight: 2 });
        } else {
          layer.setStyle({ fillOpacity: 0.35, fillColor: "#1565c0", color: "#0d47a1", weight: 3 });
        }
        layer.getElement() && (layer.getElement().style.cursor = "pointer");
      });

      layer.on("mouseout", () => {
        const isSel = name === selectedProvince;
        layer.setStyle({
          fillColor: isSel ? "#1565c0" : "#4CAF50",
          fillOpacity: isSel ? 0.22 : 0.12,
          color: isSel ? "#1565c0" : "#2e7d32",
          weight: isSel ? 2.5 : 1.2,
          opacity: 0.85,
        });
      });

      layer.on("click", () => onProvinceClick(name));
    },
    [selectedProvince, onProvinceClick]
  );

  if (!provData) return null;

  return (
    <GeoJSON
      key={`prov-${selectedProvince}`}
      data={provData}
      style={style}
      onEachFeature={onEach}
    />
  );
}



// ─── District Layer ────────────────────────────────────────────────────────
function DistrictLayer({
  geoData,
  selectedProvince,
  selectedDistrict,
  districtRisk,
  predictionResult,
  onDistrictClick,
}) {
  const districtData = {
    ...geoData,
    features: geoData.features.filter((f) => f.properties.NAME_1 === selectedProvince),
  };

  const style = useCallback(
    (feature) => {
      const NAME_1 = feature.properties.NAME_1;
      const NAME_2 = feature.properties.NAME_2;
      const isSel = NAME_2 === selectedDistrict;
      const isPredicted =
        predictionResult &&
        NAME_2 === predictionResult.district &&
        NAME_1 === predictionResult.province;

      // 1. ถ้าทำนายแล้ว ให้เน้นขอบและแสดงจุด (สีพื้นหลังจะเข้มขึ้นเพื่อให้เห็นผลชัดเจน)
      if (isPredicted) {
        const c = getDynamicColor(predictionResult.avgRisk || 0.5);
        return { fillColor: c, fillOpacity: 0.4, color: c, weight: 3, opacity: 1 };
      }

      // 2. ถ้าเลือกอำเภออยู่ ให้ไฮไลท์
      if (isSel) {
        return { fillColor: "#1565c0", fillOpacity: 0.35, color: "#1565c0", weight: 3, opacity: 1 };
      }

      // 3. สีพื้นฐาน (Choropleth) ตามค่าความเสี่ยงเฉลี่ยของอำเภอ
      const riskScore = (districtRisk && districtRisk[NAME_1]) ? districtRisk[NAME_1][NAME_2] : 0;
      if (riskScore > 0) {
        return { 
          fillColor: getDynamicColor(riskScore), 
          fillOpacity: 0.25, 
          color: "#2e7d32", 
          weight: 1, 
          opacity: 0.6 
        };
      }

      return { fillColor: "#4CAF50", fillOpacity: 0.14, color: "#2e7d32", weight: 1.2, opacity: 0.8 };
    },
    [selectedDistrict, predictionResult, districtRisk]
  );

  const onEach = useCallback(
    (feature, layer) => {
      const { NAME_1, NAME_2 } = feature.properties;

      // Popup
      layer.bindPopup(() => {
        const isPredicted =
          predictionResult &&
          NAME_2 === predictionResult.district &&
          NAME_1 === predictionResult.province;
        const riskColor = isPredicted ? getRiskColor(predictionResult?.riskLevel) : null;
        const riskLabel = isPredicted ? getRiskLabel(predictionResult?.riskLevel) : null;

        let html = `<div class="popup-title">${NAME_2}</div>`;
        html += `<div class="popup-row"><span class="popup-key">Province</span><span class="popup-value">${NAME_1}</span></div>`;
        if (riskLabel) {
          html += `<div class="popup-row"><span class="popup-key">Risk</span><span class="popup-value" style="color:${riskColor};font-weight:700">${riskLabel}</span></div>`;
        }
        if (isPredicted && predictionResult?.avgRisk !== undefined) {
          html += `<div class="popup-row"><span class="popup-key">Probability</span><span class="popup-value">${(predictionResult.avgRisk * 100).toFixed(1)}%</span></div>`;
        }
        return html;
      });

      const baseStyle = () => {
        const isPredicted =
          predictionResult &&
          NAME_2 === predictionResult.district &&
          NAME_1 === predictionResult.province;
        const isSel = NAME_2 === selectedDistrict;
        if (isPredicted) {
          const c = getRiskColor(predictionResult.riskLevel);
          return { fillColor: c, fillOpacity: 0.45, color: c, weight: 3, opacity: 1 };
        }
        if (isSel) return { fillColor: "#1565c0", fillOpacity: 0.30, color: "#1565c0", weight: 2.5 };
        return { fillColor: "#4CAF50", fillOpacity: 0.14, color: "#2e7d32", weight: 1.2, opacity: 0.8 };
      };

      layer.on("mouseover", () => {
        const isPredicted =
          predictionResult &&
          NAME_2 === predictionResult.district &&
          NAME_1 === predictionResult.province;
        const isSel = NAME_2 === selectedDistrict;
        if (!isPredicted && !isSel) {
          layer.setStyle({ fillColor: "#4CAF50", fillOpacity: 0.35, color: "#1b5e20", weight: 2 });
        } else if (isSel && !isPredicted) {
          layer.setStyle({ fillOpacity: 0.42, fillColor: "#1976d2", color: "#0d47a1", weight: 3 });
        }
        layer.getElement() && (layer.getElement().style.cursor = "pointer");
      });

      layer.on("mouseout", () => layer.setStyle(baseStyle()));

      layer.on("click", () => {
        onDistrictClick(NAME_2);
        layer.openPopup();
      });
    },
    [selectedDistrict, predictionResult, onDistrictClick]
  );

  return (
    <GeoJSON
      key={`dist-${selectedProvince}-${selectedDistrict}-${predictionResult?.district}`}
      data={districtData}
      style={style}
      onEachFeature={onEach}
    />
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function MapView({
  geoData,
  provData,
  selectedProvince,
  selectedDistrict,
  districtRisk,
  predictionResult,
  onProvinceClick,
  onDistrictClick,
}) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={[18.5, 99.5]}
        zoom={7}
        className="map"
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {/* ย้ายปุ่ม Zoom มาที่ขวาล่าง */}
        <ZoomControl position="bottomright" />

        {/* Province view — always shown (as background outline when province selected) */}
        {provData && (
          <ProvinceLayer
            provData={provData}
            selectedProvince={selectedProvince}
            onProvinceClick={onProvinceClick}
            showLabels={!selectedProvince}
          />
        )}

        {/* District layer — shown after province selected */}
        {geoData && selectedProvince && (
          <DistrictLayer
            geoData={geoData}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
            districtRisk={districtRisk}
            predictionResult={predictionResult}
            onDistrictClick={onDistrictClick}
          />
        )}

        {/* ─── Risk Points (Clusters) ─── */}
        {predictionResult && predictionResult.points && predictionResult.points.map((point, idx) => (
          <CircleMarker
            key={`point-${idx}`}
            center={[point.lat, point.lng]}
            // รัศมีแบบ Dynamic: เสี่ยงสูงวงจะกว้างขึ้น
            radius={point.risk > 0.75 ? 12 : 7}
            pathOptions={{
              fillColor: getDynamicColor(point.risk),
              color: "#fff",
              weight: 0.8,
              fillOpacity: point.risk > 0.75 ? 0.9 : 0.7,
              // ใส่ class เฉพาะสำหรับจุดเสี่ยงสูงเพื่อให้กระพริบ
              className: point.risk > 0.75 ? "pulse-marker" : "static-marker"
            }}
          >
            <Tooltip direction="top" offset={[0, -5]} opacity={1} className="risk-tooltip-wrapper">
              <div className="risk-tooltip">
                <div className="tooltip-header">Risk Point Analysis</div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Coordinates:</span>
                  <span className="tooltip-value">{point.lat.toFixed(4)}, {point.lng.toFixed(4)}</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Temperature:</span>
                  <span className="tooltip-value" style={{ color: '#ef4444', fontWeight: 'bold' }}>{point.temp.toFixed(1)} °C</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Risk Level:</span>
                  <span className="tooltip-value" style={{ color: getDynamicColor(point.risk), fontWeight: 'bold' }}>
                    {(point.risk * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">Confidence:</span>
                  <span className="tooltip-value">{point.confidence}%</span>
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        ))}

        <MapController
          selectedProvince={selectedProvince}
          selectedDistrict={selectedDistrict}
          provData={provData}
          geoData={geoData}
        />
      </MapContainer>
      <style jsx global>{`
        .leaflet-bottom.leaflet-right {
          bottom: 60px !important;
          right: 20px !important;
          z-index: 1000;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
        }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          background-color: #0f172a !important;
          color: white !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          font-size: 18px !important;
        }
        .leaflet-control-zoom-in:hover, .leaflet-control-zoom-out:hover {
          background-color: #1e293b !important;
          color: #f97316 !important;
        }

        /* ─── Risk Point Animations ─── */
        .pulse-marker {
          filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.7));
          animation: point-pulse 2s infinite ease-in-out;
        }

        .static-marker {
          filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.3));
        }

        @keyframes point-pulse {
          0% { transform: scale(1); stroke-width: 1; stroke-opacity: 0.8; }
          50% { transform: scale(1.2); stroke-width: 6; stroke-opacity: 0.3; }
          100% { transform: scale(1); stroke-width: 1; stroke-opacity: 0.8; }
        }

        .risk-tooltip-wrapper .leaflet-tooltip {
          background: #0f172a !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 12px !important;
          padding: 0 !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important;
        }

      `}</style>
    </div>
  );
}