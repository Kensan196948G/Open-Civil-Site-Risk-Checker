import { describe, expect, it } from 'vitest';
import {
  buildAiMemoPrompt,
  buildGenerateRequest,
  ensureDisclaimer,
  extractResponseText,
  findForbiddenExpressions,
} from './aiMemo';
import type { Finding, SiteLocation } from '../types';
import type { AiSettings } from '../settings/aiSettings';

const LOC: SiteLocation = {
  address: '東京都千代田区霞が関1-1',
  lat: 35.6745,
  lon: 139.7524,
  radius: 500,
  coordLabel: '35.67450, 139.75240',
  radiusLabel: '500m',
};

const FINDING: Finding = {
  id: 'river-1',
  category: 'rivers',
  priority: 'B',
  title: '水路・河川・水域が検索半径内に存在',
  summary: '検索半径内に水域が2件あります。',
  status: 'found',
  distance_m: 152,
  caution: '護岸・暗渠区間の有無を確認してください。',
  evidence: [
    {
      source_key: 'osm_overpass',
      layer_name: 'waterway',
      attribution: '© OpenStreetMap contributors',
      fetched_at: '2026-07-04 12:00:00',
      source_updated_at: '随時更新（OSM）',
      quality_note: '',
      props: {},
    },
  ],
};

const SETTINGS: AiSettings = {
  apiKey: 'sk-ant-test-12345678',
  model: 'claude-sonnet-5',
  savedAt: '2026-07-04 12:00:00',
};

describe('buildAiMemoPrompt', () => {
  it('テンプレート版メモ・断定禁止・8セクション維持の指示を含む', () => {
    const p = buildAiMemoPrompt(LOC, [FINDING]);
    expect(p).toContain('東京都千代田区霞が関1-1');
    expect(p).toContain('断定表現');
    expect(p).toContain('8 セクション');
    expect(p).toContain('創作しない');
    expect(p).toContain('# AI調査メモ'); // テンプレート本体が埋め込まれている
    expect(p).toContain('根拠：river-1');
  });
});

describe('findForbiddenExpressions', () => {
  it('禁止表現を重複なしで列挙する', () => {
    const hits = findForbiddenExpressions('この地点は安全です。施工可能で問題なし。安全です。');
    expect(hits).toContain('安全です');
    expect(hits).toContain('施工可能');
    expect(hits).toContain('問題なし');
    expect(hits.filter((h) => h === '安全です')).toHaveLength(1);
  });

  it('準拠した文面では 0 件', () => {
    expect(findForbiddenExpressions('河川管理者資料の確認を推奨します（要確認）。')).toHaveLength(0);
  });
});

describe('ensureDisclaimer', () => {
  it('免責文が無ければ「注意事項」として付加する', () => {
    const t = ensureDisclaimer('## 1. 調査地点\n- 住所：X');
    expect(t).toContain('断定するものではありません');
    expect(t).toContain('## 注意事項');
  });

  it('免責文があればそのまま', () => {
    const src = '本メモは…断定するものではありません。';
    expect(ensureDisclaimer(src)).toBe(src);
  });
});

describe('buildGenerateRequest', () => {
  it('Anthropic Messages API + ブラウザ直接ヘッダ + モデル指定', () => {
    const r = buildGenerateRequest(SETTINGS, 'PROMPT');
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    const h = r.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('sk-ant-test-12345678');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(r.init.body as string);
    expect(body.model).toBe('claude-sonnet-5');
    expect(body.max_tokens).toBe(3000);
    expect(body.messages[0].content).toBe('PROMPT');
  });
});

describe('extractResponseText', () => {
  it('text ブロックを連結する', () => {
    const t = extractResponseText({ content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] });
    expect(t).toBe('AB');
  });

  it('解析不能・空応答は null', () => {
    expect(extractResponseText(null)).toBeNull();
    expect(extractResponseText({})).toBeNull();
    expect(extractResponseText({ content: [{ type: 'text', text: '  ' }] })).toBeNull();
  });
});
