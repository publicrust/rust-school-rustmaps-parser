import type { APIEmbed } from 'discord.js';

export interface Config {
  readonly token: string;
  readonly channelId: string;
  readonly downloadDir: string;
  readonly requestDelay: number;
  readonly syncIntervalMs: number;
  readonly exitOnIdle: boolean;
}

export interface AttachmentInfo {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly url: string;
  readonly proxyUrl: string;
  readonly contentType: string | null;
}

export interface MessageInfo {
  readonly id: string;
  readonly authorId: string;
  readonly authorTag: string;
  readonly authorDisplayName: string;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly content: string;
  readonly embeds: readonly APIEmbed[];
  readonly attachments: readonly AttachmentInfo[];
  readonly embedsCount: number;
  readonly referencedMessageId: string | null;
}

export interface ChannelExport {
  guildId: string | null;
  guildName: string | null;
  channelId: string;
  channelName: string;
  exportedAt: string;
  totalMessages: number;
  messages: MessageInfo[];
}

export interface ChannelExportResult {
  readonly filePath: string;
  readonly newMessages: number;
  readonly totalMessages: number;
}

export interface EnvVariables {
  readonly DISCORD_TOKEN?: string | undefined;
  readonly CHANNEL_ID?: string | undefined;
  readonly DOWNLOAD_DIR?: string | undefined;
  readonly REQUEST_DELAY?: string | undefined;
  readonly SYNC_INTERVAL_MS?: string | undefined;
  readonly EXIT_ON_IDLE?: string | undefined;
}

export interface ProcessEnv {
  readonly DISCORD_TOKEN: string | undefined;
  readonly CHANNEL_ID: string | undefined;
  readonly DOWNLOAD_DIR: string | undefined;
  readonly REQUEST_DELAY: string | undefined;
  readonly SYNC_INTERVAL_MS: string | undefined;
  readonly EXIT_ON_IDLE: string | undefined;
  readonly [key: string]: string | undefined;
}
