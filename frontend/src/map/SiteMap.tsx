import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../store';
import type { MapFeatures, OverlayKey, SiteLocation } from '../types';
import { BASE_TILE_LAYERS, HAZARD_TILE_LAYERS, HILLSHADE_TILE_LAYER } from './capture';

// Leaflet 地図（要件 FR-101〜105）。背景は地理院タイル、ハザード／陰影は重ね合わせタイル、
// 道路・水域・施設は Overpass 実取得ジオメトリを描画する。マーカーは divIcon を用いるため
// 既定マーカー画像のパス問題を回避できる。
// タイル URL・出典表記は capture.ts の定義（BASE_TILE_LAYERS / HAZARD_TILE_LAYERS /
// HILLSHADE_TILE_LAYER）と共用し、地図キャプチャ（Issue #274）と二重管理しない。

const HAZARD_LAYERS = new Map(HAZARD_TILE_LAYERS.map((t) => [t.key, t]));

// ハザードタイル専用ペイン。ダークテーマの invert フィルタ（styles.css の
// .leaflet-tile-pane）の適用範囲外に置き、洪水浸水・土砂災害の色を凡例と一致させる。
// zIndex はベースタイル（tilePane=200）とベクター重ね（overlayPane=400）の間。
const HAZARD_PANE = 'ocsrc-hazard';
const HAZARD_PANE_Z_INDEX = '250';

export function SiteMap({ mapRef }: { mapRef?: React.MutableRefObject<L.Map | null> }) {
  const { state } = useApp();
  const { location, features, baseLayer, overlays } = state;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayerObjRef = useRef<L.TileLayer | null>(null);
  const overlayObjsRef = useRef<Partial<Record<OverlayKey, L.Layer>>>({});

  // 最新の baseLayer / overlays を init 内から参照するための ref。
  // 描画中の ref 書き込みは react-hooks/refs で禁止されるため、コミット後の
  // effect 内で同期する（地図生成 effect より前に宣言し、実行順を保証）。
  const baseRef = useRef(baseLayer);
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    baseRef.current = baseLayer;
    overlaysRef.current = overlays;
  }, [baseLayer, overlays]);

  // ---- 地図の生成（location が変わるたびに作り直す） ----
  useEffect(() => {
    if (!containerRef.current || !location) return;
    const el = containerRef.current;
    const center: [number, number] = [location.lat, location.lon];
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, 16);
    mapInstanceRef.current = map;
    if (mapRef) mapRef.current = map;
    map.createPane(HAZARD_PANE).style.zIndex = HAZARD_PANE_Z_INDEX;

    const b = BASE_TILE_LAYERS[baseRef.current];
    const base = L.tileLayer(b.urlTemplate, { maxZoom: 18, attribution: b.attribution }).addTo(map);
    baseLayerObjRef.current = base;

    buildOverlays(location, features, overlayObjsRef);
    applyOverlays(map, overlayObjsRef.current, overlaysRef.current);

    // 調査地点ピン（赤、divIcon）
    L.marker(center, {
      icon: L.divIcon({
        className: '',
        html:
          '<div style="position:relative"><div style="width:20px;height:20px;background:#c5392f;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,.4)"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 20],
      }),
    }).addTo(map);

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        /* noop */
      }
    }, 120);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      if (mapRef) mapRef.current = null;
      baseLayerObjRef.current = null;
      overlayObjsRef.current = {};
    };
    // location オブジェクトは解析実行ごとに新規生成される。features も同時に確定する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // ---- ベースマップ切替 ----
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (baseLayerObjRef.current) map.removeLayer(baseLayerObjRef.current);
    const b = BASE_TILE_LAYERS[baseLayer];
    baseLayerObjRef.current = L.tileLayer(b.urlTemplate, { maxZoom: 18, attribution: b.attribution }).addTo(map);
    // ベースは最背面へ
    baseLayerObjRef.current.bringToBack();
  }, [baseLayer]);

  // ---- レイヤ表示切替 ----
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    applyOverlays(map, overlayObjsRef.current, overlays);
  }, [overlays]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

function buildOverlays(
  location: SiteLocation,
  features: MapFeatures,
  ref: React.MutableRefObject<Partial<Record<OverlayKey, L.Layer>>>,
) {
  const center: [number, number] = [location.lat, location.lon];
  const ov: Partial<Record<OverlayKey, L.Layer>> = {};

  ov.range = L.circle(center, { radius: location.radius, color: '#2E5AAC', weight: 2, fillColor: '#2E5AAC', fillOpacity: 0.06, dashArray: '5 5' });

  ov.hillshade = L.tileLayer(HILLSHADE_TILE_LAYER.urlTemplate, { opacity: 0.5, attribution: HILLSHADE_TILE_LAYER.attribution });
  ov.flood = L.tileLayer(HAZARD_LAYERS.get('flood')!.urlTemplate, { opacity: 0.6, pane: HAZARD_PANE, attribution: HAZARD_LAYERS.get('flood')!.attribution });
  ov.sediment = L.tileLayer(HAZARD_LAYERS.get('sediment')!.urlTemplate, { opacity: 0.6, pane: HAZARD_PANE, attribution: HAZARD_LAYERS.get('sediment')!.attribution });

  ov.roads = L.layerGroup((features.roads || []).map((line) => L.polyline(line, { color: '#B5701A', weight: 4, opacity: 0.8 })));
  ov.water = L.layerGroup((features.water || []).map((line) => L.polyline(line, { color: '#2E5AAC', weight: 5, opacity: 0.6 })));
  ov.facilities = L.layerGroup(
    (features.facilities || []).map((f) =>
      L.marker([f.lat, f.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#fff;border:1px solid #b5bcc6;color:#4a5563;font:600 10px/1 'IBM Plex Sans JP',sans-serif;padding:3px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)">${escapeHtml(f.label)}</div>`,
          iconSize: undefined,
          iconAnchor: [0, 8],
        }),
      }),
    ),
  );

  ref.current = ov;
}

function applyOverlays(map: L.Map, ov: Partial<Record<OverlayKey, L.Layer>>, state: Record<OverlayKey, boolean>) {
  (Object.keys(ov) as OverlayKey[]).forEach((k) => {
    const layer = ov[k];
    if (!layer) return;
    if (state[k]) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
