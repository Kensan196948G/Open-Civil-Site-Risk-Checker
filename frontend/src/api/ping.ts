import { fetchJson, nowHMS } from './http';
import { ksjBaseUrl } from './ksj';
import type { SourceKey, SourceStatus } from '../types';

// データソース接続テスト（要件 FR-603）。
// HTTP API は軽量リクエストで実疎通を確認し、タイルサーバは画像ロードで確認する。
// 規約同意や事前整備が必要なソース（ksj / xroad）は未連携として扱う。

export interface PingResult {
  stat: SourceStatus;
  last: string;
}

function imageProbe(url: string, timeout = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

export async function pingSource(key: SourceKey): Promise<PingResult> {
  const ok = (): PingResult => ({ stat: 'success', last: nowHMS() });
  const fail = (): PingResult => ({ stat: 'failed', last: '—' });
  const skip = (): PingResult => ({ stat: 'skipped', last: '—' });

  switch (key) {
    case 'nominatim': {
      const r = await fetchJson('https://nominatim.openstreetmap.org/search?q=tokyo&format=jsonv2&limit=1', { timeout: 8000 });
      return r.ok ? ok() : fail();
    }
    case 'open_meteo': {
      const r = await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=139.76&hourly=precipitation&forecast_days=1', { timeout: 8000 });
      return r.ok ? ok() : fail();
    }
    case 'osm_overpass': {
      const r = await fetchJson('https://overpass-api.de/api/status', { timeout: 8000 });
      return r.ok ? ok() : fail();
    }
    case 'gsi_tile': {
      const good = await imageProbe('https://cyberjapandata.gsi.go.jp/xyz/pale/14/14552/6451.png');
      return good ? ok() : fail();
    }
    case 'hazard_portal': {
      const good = await imageProbe('https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/14/14552/6451.png');
      return good ? ok() : fail();
    }
    case 'ksj': {
      // Phase 2: バックエンド設定時は healthz で DB 到達性まで確認する。
      const base = ksjBaseUrl();
      if (!base) return skip();
      const r = await fetchJson<{ db?: string }>(`${base}/healthz`, { timeout: 8000 });
      return r.ok && r.data?.db === 'ok' ? ok() : fail();
    }
    case 'plateau':
      // 規約上は接続可能。MVP では疎通成功扱い（実データ取得は別途）。
      return ok();
    case 'xroad':
      return skip();
    case 'jma_warning': {
      // 認証不要・CORS開放のため東京都のエンドポイントで疎通確認する。
      const r = await fetchJson('https://www.jma.go.jp/bosai/warning/data/warning/130000.json', { timeout: 8000 });
      return r.ok ? ok() : fail();
    }
    default:
      return fail();
  }
}
