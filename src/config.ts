import * as fs from 'fs';
import * as path from 'path';
import type { Config, ProcessEnv } from './types.js';

class ConfigManager implements Config {
  private readonly _token: string;
  private readonly _channelId: string;
  private readonly _downloadDir: string;
  private readonly _requestDelay: number;
  private readonly _syncIntervalMs: number;
  private readonly _exitOnIdle: boolean;

  constructor() {
    this.loadEnv();
    this.validateConfig();

    const env = process.env as ProcessEnv;
    this._token = this.assertString(env.DISCORD_TOKEN, 'DISCORD_TOKEN');
    this._channelId = this.assertString(env.CHANNEL_ID, 'CHANNEL_ID');
    this._downloadDir = env.DOWNLOAD_DIR ?? 'exports';
    this._requestDelay = this.parseIntWithMin(env.REQUEST_DELAY, 1000, 'REQUEST_DELAY', 1);
    this._syncIntervalMs = this.parseIntWithMin(env.SYNC_INTERVAL_MS, 0, 'SYNC_INTERVAL_MS', 0);
    this._exitOnIdle = this.parseBoolean(env.EXIT_ON_IDLE, true);
  }

  private assertString(value: string | undefined, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${name} должен быть непустой строкой`);
    }
    return value;
  }

  private parseIntWithMin(
    value: string | undefined,
    defaultValue: number,
    name: string,
    min: number
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < min) {
      throw new Error(`${name} должен быть числом не меньше ${min}`);
    }

    return parsed;
  }

  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) {
      return defaultValue;
    }
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    throw new Error('EXIT_ON_IDLE должен быть true/false');
  }

  private loadEnv(): void {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');

    for (const line of envContent.split('\n')) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
        continue;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, equalIndex).trim();
      const value = trimmedLine.slice(equalIndex + 1).trim();
      if (key.length === 0 || value.length === 0) {
        continue;
      }

      process.env[key] = value;
    }
  }

  private validateConfig(): void {
    const env = process.env as ProcessEnv;

    if (!env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN не задан в переменных окружения');
    }

    if (!env.CHANNEL_ID) {
      throw new Error('CHANNEL_ID не задан в переменных окружения');
    }

    if (!/^\d{17,20}$/u.test(env.CHANNEL_ID)) {
      throw new Error('CHANNEL_ID должен быть валидным Discord ID (17-20 цифр)');
    }
  }

  public get token(): string {
    return this._token;
  }

  public get channelId(): string {
    return this._channelId;
  }

  public get downloadDir(): string {
    return this._downloadDir;
  }

  public get requestDelay(): number {
    return this._requestDelay;
  }

  public get syncIntervalMs(): number {
    return this._syncIntervalMs;
  }

  public get exitOnIdle(): boolean {
    return this._exitOnIdle;
  }
}

export const config: Config = new ConfigManager();
