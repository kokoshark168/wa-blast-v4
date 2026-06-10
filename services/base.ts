import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { childLogger } from '@/lib/logger';

export interface DataSourceHealth {
  name: string;
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
}

/**
 * Base class for all external data-source adapters (Binance, Bybit, etc).
 * Provides a shared axios instance, structured logging, retry, and a
 * uniform health check. Adapters degrade gracefully when API keys are
 * absent so the platform still builds and runs without live credentials.
 */
export abstract class BaseDataSource {
  protected http: AxiosInstance;
  protected log;
  abstract readonly name: string;

  constructor(baseURL: string, headers: Record<string, string> = {}) {
    this.http = axios.create({ baseURL, timeout: 15_000, headers });
    this.log = childLogger(this.constructor.name);
  }

  /** Whether the required credentials/config are present. */
  abstract isConfigured(): boolean;

  protected async request<T>(config: AxiosRequestConfig, retries = 2): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.http.request<T>(config);
        return res.data;
      } catch (err) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        // don't retry client errors
        if (status && status >= 400 && status < 500) break;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
        }
      }
    }
    this.log.error({ err: lastErr, name: this.name }, 'data source request failed');
    throw lastErr;
  }

  async health(): Promise<DataSourceHealth> {
    const configured = this.isConfigured();
    if (!configured) return { name: this.name, configured: false, reachable: false };
    const start = Date.now();
    try {
      await this.ping();
      return { name: this.name, configured: true, reachable: true, latencyMs: Date.now() - start };
    } catch {
      return { name: this.name, configured: true, reachable: false };
    }
  }

  /** Lightweight liveness call; override per source. */
  protected async ping(): Promise<void> {
    /* default no-op */
  }
}
