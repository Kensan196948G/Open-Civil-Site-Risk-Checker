import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../store';
import type { BaseLayer, MapFeatures, OverlayKey, SiteLocation } from '../types';

// Leaflet 地図（要件 FR-101〜105）。背景は地理院タイル、ハザード／陰影は重ね合わせタイル、
// 道路・水域・施設は Overpass 実取得ジオメトリを描画する。マーカーは divIcon を用いるため
// 既定マーカー画像のパス問題を回避できる。

const BASE_URLS: Record<BaseLayer, { url: string; attr: string; ext: string }> = {
  pale: { url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', attr: '地理院タイル', ext: 'png' },
  std: { url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', attr: '地理院タイル', ext: 'png' },
  photo: { url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', attr: '地理院タイル(シームレス空中写真)', ext: 'jpg' },
};

// ハザードタイル専用ペイン。ダークテーマの invert フィルタ（styles.css の
// .leaflet-tile-pane）の適用範囲外に置き、洪水浸水・土砂災害の色を凡例と一致させる。
// zIndex はベースタイル（tilePane=200）とベクター重ね（overlayPane=400）の間。
const HAZARD_PANE = 'ocsrc-hazard';
const HAZARD_PANE_Z_INDEX = '250';

export function SiteMap() {
  const { state } = useApp();
  const { location, features, baseLayer, overlays } = state;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
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
    mapRef.current = map;
    map.createPane(HAZARD_PANE).style.zIndex = HAZARD_PANE_Z_INDEX;

    const b = BASE_URLS[baseRef.current];
    const base = L.tileLayer(b.url, { maxZoom: 18, attribution: b.attr }).addTo(map);
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
      mapRef.current = null;
      baseLayerObjRef.current = null;
      overlayObjsRef.current = {};
    };
    // location オブジェクトは解析実行ごとに新規生成される。features も同時に確定する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // ---- ベースマップ切替 ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerObjRef.current) map.removeLayer(baseLayerObjRef.current);
    const b = BASE_URLS[baseLayer];
    baseLayerObjRef.current = L.tileLayer(b.url, { maxZoom: 18, attribution: b.attr }).addTo(map);
    // ベースは最背面へ
    baseLayerObjRef.current.bringToBack();
  }, [baseLayer]);

  // ---- レイヤ表示切替 ----
  useEffect(() => {
    const map = mapRef.current;
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

  ov.hillshade = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', { opacity: 0.5, attribution: '地理院タイル(陰影起伏図)' });
  ov.flood = L.tileLayer('https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png', { opacity: 0.6, pane: HAZARD_PANE, attribution: 'ハザードマップポータルサイト' });
  ov.sediment = L.tileLayer('https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png', { opacity: 0.6, pane: HAZARD_PANE, attribution: 'ハザードマップポータルサイト' });

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
