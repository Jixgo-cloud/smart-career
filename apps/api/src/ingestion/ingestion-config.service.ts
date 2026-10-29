import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface QuotaMeta {
  source: string;
  quota: number;
  default: number;
  min: number;
  max: number;
  category: 'JOB' | 'COURSE';
}

const DEFAULT_QUOTA_SPECS: Record<string, Omit<QuotaMeta, 'quota'>> = {
  JSEARCH: { source: 'JSEARCH', default: 15, min: 1, max: 100, category: 'JOB' },
  JOBSDB: { source: 'JOBSDB', default: 30, min: 1, max: 100, category: 'JOB' },
  JOBTHAI: { source: 'JOBTHAI', default: 25, min: 1, max: 100, category: 'JOB' },
  REMOTIVE: { source: 'REMOTIVE', default: 20, min: 1, max: 100, category: 'JOB' },
  BLOGNONE: { source: 'BLOGNONE', default: 15, min: 1, max: 100, category: 'JOB' },
  YOUTUBE: { source: 'YOUTUBE', default: 10, min: 1, max: 100, category: 'COURSE' },
  UDEMY: { source: 'UDEMY', default: 10, min: 1, max: 100, category: 'COURSE' },
};

@Injectable()
export class IngestionConfigService {
  private getConfigFilePath(): string {
    const dir =
      process.env.INGESTION_CONFIG_DIR ||
      path.join(process.cwd(), 'apps', 'api', 'config');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'ingestion-quotas.json');
  }

  private readSavedQuotas(): Record<string, number> {
    try {
      const file = this.getConfigFilePath();
      if (!fs.existsSync(file)) return {};
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeSavedQuotas(quotas: Record<string, number>) {
    const file = this.getConfigFilePath();
    fs.writeFileSync(file, JSON.stringify(quotas, null, 2), 'utf8');
  }

  getQuotas(): Record<string, QuotaMeta> {
    const saved = this.readSavedQuotas();
    const out: Record<string, QuotaMeta> = {};

    for (const [key, spec] of Object.entries(DEFAULT_QUOTA_SPECS)) {
      const rawVal = saved[key];
      const quota =
        typeof rawVal === 'number' && Number.isFinite(rawVal)
          ? Math.max(spec.min, Math.min(spec.max, Math.floor(rawVal)))
          : spec.default;
      out[key] = {
        ...spec,
        quota,
      };
    }

    return out;
  }

  getQuotaForSource(source: string): number {
    const all = this.getQuotas();
    return all[source.toUpperCase()]?.quota ?? 15;
  }

  updateQuotas(updates: Record<string, number>): Record<string, QuotaMeta> {
    const saved = this.readSavedQuotas();
    for (const [rawKey, rawVal] of Object.entries(updates || {})) {
      const key = rawKey.toUpperCase();
      const spec = DEFAULT_QUOTA_SPECS[key];
      if (!spec) continue;
      const num = Number(rawVal);
      if (Number.isFinite(num)) {
        saved[key] = Math.max(spec.min, Math.min(spec.max, Math.floor(num)));
      }
    }
    this.writeSavedQuotas(saved);
    return this.getQuotas();
  }

  resetQuotas(): Record<string, QuotaMeta> {
    this.writeSavedQuotas({});
    return this.getQuotas();
  }
}
