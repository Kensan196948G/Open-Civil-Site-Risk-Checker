import { describe, it, expect } from 'vitest';
import { buildReportCsv } from './csv';
import { makeFinding, makeEvidence } from '../__testkit__/factories';

describe('buildReportCsv', () => {
  it('ヘッダ行を規定の列順で出力する', () => {
    const csv = buildReportCsv([makeFinding()]);
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'category,item,priority,summary,distance_m,status,fetched_at,source',
    );
  });

  it('距離は四捨五入、null は空欄', () => {
    const csv = buildReportCsv([
      makeFinding({ distance_m: 123.6 }),
      makeFinding({ id: 'F-002', distance_m: null }),
    ]);
    const [, row1, row2] = csv.split('\n');
    expect(row1.split(',')).toContain('124');
    // null 距離は空フィールド（,, が連続して現れる）
    expect(row2).toContain(',,');
  });

  it('RFC 4180: カンマ・改行・二重引用符を含む値はクォートしエスケープする', () => {
    const csv = buildReportCsv([
      makeFinding({ summary: 'a,b"c\nd' }),
    ]);
    // " は "" に倍化され、フィールド全体が " で囲まれる
    expect(csv).toContain('"a,b""c\nd"');
  });

  it('複数出典は「; 」で連結する', () => {
    const csv = buildReportCsv([
      makeFinding({
        evidence: [
          makeEvidence({ source_key: 'osm_overpass' }),
          makeEvidence({ source_key: 'open_meteo' }),
        ],
      }),
    ]);
    expect(csv).toContain('Overpass; Open-Meteo');
  });
});
