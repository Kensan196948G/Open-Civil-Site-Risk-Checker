// 住所履歴（評価書 #11・最近の住所クイック選択）のテスト。
// パース・追加（先頭・重複除去・最大件数）の純粋ロジックを検証する。

import { describe, expect, it } from 'vitest';
import { MAX_RECENT_ADDRESSES, parseRecentAddresses, pushRecentAddress } from './recentAddresses';

describe('parseRecentAddresses', () => {
  it('null・不正 JSON・非配列は空リストを返す', () => {
    expect(parseRecentAddresses(null)).toEqual([]);
    expect(parseRecentAddresses('{bad json')).toEqual([]);
    expect(parseRecentAddresses('"string"')).toEqual([]);
    expect(parseRecentAddresses('{"a":1}')).toEqual([]);
  });

  it('文字列のみ・空文字を除外して返す', () => {
    expect(parseRecentAddresses(JSON.stringify(['東京都千代田区（架空）', '', 123, '神奈川県横浜市（架空）']))).toEqual([
      '東京都千代田区（架空）',
      '神奈川県横浜市（架空）',
    ]);
  });

  it('最大件数に丸める', () => {
    const many = Array.from({ length: 10 }, (_, i) => `住所${i}（架空）`);
    expect(parseRecentAddresses(JSON.stringify(many))).toHaveLength(MAX_RECENT_ADDRESSES);
  });
});

describe('pushRecentAddress', () => {
  it('新しい住所を先頭に追加する', () => {
    const next = pushRecentAddress(['B（架空）', 'C（架空）'], 'A（架空）');
    expect(next[0]).toBe('A（架空）');
    expect(next).toHaveLength(3);
  });

  it('重複は先頭へ移動し、重複分は除去する', () => {
    const next = pushRecentAddress(['B（架空）', 'A（架空）', 'C（架空）'], 'A（架空）');
    expect(next).toEqual(['A（架空）', 'B（架空）', 'C（架空）']);
  });

  it('空文字・空白のみは無視する', () => {
    expect(pushRecentAddress(['A（架空）'], '')).toEqual(['A（架空）']);
    expect(pushRecentAddress(['A（架空）'], '   ')).toEqual(['A（架空）']);
  });

  it('最大件数に丸める', () => {
    let list: string[] = [];
    for (let i = 0; i < 8; i += 1) list = pushRecentAddress(list, `住所${i}（架空）`);
    expect(list).toHaveLength(MAX_RECENT_ADDRESSES);
    expect(list[0]).toBe('住所7（架空）');
  });
});
