import { describe, it, expect } from 'vitest';
import {
  radiusLabel,
  distanceLabel,
  CATEGORY_LABEL,
  SOURCE_SHORT,
  getPrio,
  getStatus,
} from './constants';
import type { Category, SourceKey } from '../types';

describe('radiusLabel', () => {
  it('1000m 未満は m 表記', () => {
    expect(radiusLabel(100)).toBe('100m');
    expect(radiusLabel(500)).toBe('500m');
  });
  it('1000m 以上は km 表記', () => {
    expect(radiusLabel(1000)).toBe('1km');
    expect(radiusLabel(3000)).toBe('3km');
  });
});

describe('distanceLabel', () => {
  it('距離があれば四捨五入して「約Nm」', () => {
    expect(distanceLabel(123.4)).toBe('約123m');
    expect(distanceLabel(123.6)).toBe('約124m');
  });
  it('距離が null で intersects=true は「重なりあり」', () => {
    expect(distanceLabel(null, true)).toBe('重なりあり');
  });
  it('距離が null で intersects 無し/false は null（距離概念なし）', () => {
    expect(distanceLabel(null)).toBeNull();
    expect(distanceLabel(null, false)).toBeNull();
  });
});

describe('ラベル辞書の網羅性（断定表現の一元管理）', () => {
  const categories: Category[] = [
    'roads',
    'rivers',
    'hazard',
    'terrain',
    'weather',
    'facilities',
    'data_quality',
  ];
  it('全カテゴリに日本語ラベルが存在する', () => {
    categories.forEach((c) => {
      expect(CATEGORY_LABEL[c]).toBeTruthy();
    });
  });

  const sources: SourceKey[] = [
    'nominatim',
    'osm_overpass',
    'open_meteo',
    'ksj',
    'hazard_portal',
    'gsi_tile',
    'plateau',
    'xroad',
    'jma_warning',
  ];
  it('全ソースキーに短縮名が存在する', () => {
    sources.forEach((k) => {
      expect(SOURCE_SHORT[k]).toBeTruthy();
    });
  });

  it('優先度ラベルは「リスク断定」ではなく「確認度合い」を表す', () => {
    // D は「リスクが低い」ではなく「データ不足」（要件 §9.2）
    expect(getPrio('light').D.name).toBe('データ不足');
    expect(getPrio('dark').D.name).toBe('データ不足');
  });

  it('状態は「該当なし」と「データ未取得」を別ラベルで区別する（FR-304）', () => {
    const s = getStatus('light');
    expect(s.not_found.label).toBe('該当なし');
    expect(s.no_data.label).toBe('データ未取得');
    expect(s.not_found.label).not.toBe(s.no_data.label);
  });
});
