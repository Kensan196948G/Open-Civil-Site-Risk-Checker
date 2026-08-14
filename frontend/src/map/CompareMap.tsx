// 候補地比較の地図（SCR-010・Issue #175）。選択した候補地の位置関係・検索範囲を
// 1 枚の Leaflet 地図に表示する。ベースタイルは capture.ts の定義（単一ソース）を
// 使い、マーカーは divIcon（番号バッジ + 案件名）。複数地点は fitBounds で全体を表示する。

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_TILE_LAYERS } from './capture';
import { comparePointLabel, type CompareMapPoint } from './compareMapPoints';

const RANK_COLORS = ['#2E5AAC', '#B5701A', '#3E76D6', '#6B45B0'];

export function CompareMap({ points }: { points: CompareMapPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // 地図生成（1 回のみ）。
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([35.68, 139.75], 12);
    mapRef.current = map;
    L.tileLayer(BASE_TILE_LAYERS.pale.urlTemplate, { maxZoom: 18, attribution: BASE_TILE_LAYERS.pale.attribution }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
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
      markersRef.current = null;
    };
  }, []);

  // 地点の変更に合わせてマーカーを再構築。
  useEffect(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (points.length === 0) return;

    const bounds = L.latLngBounds([]);
    points.forEach((p, i) => {
      const latlng: [number, number] = [p.lat, p.lon];
      bounds.extend(latlng);
      // 検索範囲円（案件の半径。範囲外の見落とし防止の参考表示）。
      L.circle(latlng, {
        radius: p.radius,
        color: RANK_COLORS[i % RANK_COLORS.length],
        weight: 1.5,
        fillColor: RANK_COLORS[i % RANK_COLORS.length],
        fillOpacity: 0.06,
        dashArray: '4 4',
      }).addTo(group);
      L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="width:22px;height:22px;border-radius:50%;background:${RANK_COLORS[i % RANK_COLORS.length]};color:#fff;font:700 12px/22px 'IBM Plex Mono',monospace;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${p.rank}</div>
            <div style="background:rgba(255,255,255,.94);border:1px solid #b5bcc6;color:#1c2733;font:600 10px/1.4 'IBM Plex Sans JP',sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2)">${comparePointLabel(p)}</div>
          </div>`,
          iconSize: undefined,
          iconAnchor: [11, 11],
        }),
      }).addTo(group);
    });

    if (points.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([points[0].lat, points[0].lon], 14);
    }
  }, [points]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      {/* 地図コンテナは常時マウント（0 件→復帰でインスタンスが失われないようにする）。 */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, borderRadius: 10, border: '1px solid var(--border-3)', overflow: 'hidden' }} />
      {points.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          比較地点を選択すると、ここに位置関係・検索範囲を表示します。
        </div>
      )}
    </div>
  );
}
