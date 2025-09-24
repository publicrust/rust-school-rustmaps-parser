import * as fs from 'fs-extra';
import * as path from 'path';
import { Collection, Message, type TextBasedChannel } from 'discord.js';
import type { AttachmentInfo, ChannelExport, ChannelExportResult, MessageInfo } from './types.js';
import { config } from './config.js';

export class ChannelMessageCollector {
  private readonly requestDelay: number = config.requestDelay;

  public async exportChannel(channel: TextBasedChannel): Promise<ChannelExportResult> {
    const channelName = this.getChannelName(channel);
    console.log(`🎯 Синхронизация сообщений канала "${channelName}"`);

    await fs.ensureDir(config.downloadDir);

    const exportFilePath = await this.resolveExportFilePath(channel);
    const existingExport = await this.loadExistingExport(exportFilePath);

    if (existingExport === null) {
      console.log('📥 Экспорт ещё не создан. Выгружаем полную историю...');
      const messages = await this.collectAllMessages(channel);
      const exportData = this.buildExportData(channel, messages);
      await this.writeExport(exportFilePath, exportData);
      console.log(`✅ Сообщения сохранены в ${path.relative(process.cwd(), exportFilePath)}`);
      return {
        filePath: exportFilePath,
        newMessages: messages.length,
        totalMessages: messages.length
      };
    }

    console.log(`ℹ️ Найден существующий экспорт (${existingExport.totalMessages} сообщений). Проверяем новые...`);
    const lastMessageId = existingExport.messages.at(-1)?.id ?? null;

    let newMessages: MessageInfo[] = [];
    if (lastMessageId === null) {
      console.log('⚠️ Существующий экспорт пуст. Выполняем полную выгрузку...');
      newMessages = await this.collectAllMessages(channel);
    } else {
      newMessages = await this.collectMessagesAfter(channel, lastMessageId);
    }

    const uniqueNewMessages = this.filterNewMessages(existingExport.messages, newMessages);

    if (uniqueNewMessages.length === 0) {
      console.log('✅ Новых сообщений нет. Экспорт актуален.');
      return {
        filePath: exportFilePath,
        newMessages: 0,
        totalMessages: existingExport.totalMessages
      };
    }

    existingExport.messages.push(...uniqueNewMessages);
    existingExport.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const guild = 'guild' in channel && channel.guild ? channel.guild : null;
    existingExport.guildId = guild?.id ?? null;
    existingExport.guildName = guild?.name ?? null;
    existingExport.channelName = channelName;
    existingExport.exportedAt = new Date().toISOString();
    existingExport.totalMessages = existingExport.messages.length;

    await this.writeExport(exportFilePath, existingExport);

    console.log(`✅ Добавлено сообщений: ${uniqueNewMessages.length}. Всего теперь: ${existingExport.totalMessages}`);
    console.log(`📁 Файл обновлён: ${path.relative(process.cwd(), exportFilePath)}`);

    return {
      filePath: exportFilePath,
      newMessages: uniqueNewMessages.length,
      totalMessages: existingExport.totalMessages
    };
  }

  private filterNewMessages(existing: MessageInfo[], incoming: MessageInfo[]): MessageInfo[] {
    if (incoming.length === 0) {
      return [];
    }

    const knownIds = new Set(existing.map(message => message.id));
    return incoming.filter(message => !knownIds.has(message.id));
  }

  private async collectAllMessages(channel: TextBasedChannel): Promise<MessageInfo[]> {
    const collected: MessageInfo[] = [];
    let beforeId: string | undefined;
    let totalFetched = 0;

    while (true) {
      const fetchOptions: { limit: number; before?: string } = { limit: 100 };
      if (beforeId !== undefined) {
        fetchOptions.before = beforeId;
      }

      const batch: Collection<string, Message> = await channel.messages.fetch(fetchOptions);
      if (batch.size === 0) {
        break;
      }

      const sortedBatch = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const message of sortedBatch) {
        collected.push(this.mapMessage(message));
      }

      totalFetched += batch.size;
      const earliestMessage = sortedBatch[0];
      beforeId = earliestMessage?.id;

      console.log(`   → Получено сообщений: ${totalFetched}`);
      await this.sleep(this.requestDelay);
    }

    collected.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return collected;
  }

  private async collectMessagesAfter(channel: TextBasedChannel, afterId: string): Promise<MessageInfo[]> {
    const collected: MessageInfo[] = [];
    let boundaryId: string | undefined = afterId;

    while (true) {
      const fetchOptions: { limit: number; after?: string } = { limit: 100 };
      if (boundaryId !== undefined) {
        fetchOptions.after = boundaryId;
      }

      const batch: Collection<string, Message> = await channel.messages.fetch(fetchOptions);
      if (batch.size === 0) {
        break;
      }

      const sortedBatch = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      for (const message of sortedBatch) {
        collected.push(this.mapMessage(message));
      }

      boundaryId = sortedBatch.at(-1)?.id;
      console.log(`   → Новых сообщений собрано: ${collected.length}`);
      await this.sleep(this.requestDelay);
    }

    collected.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return collected;
  }

  private buildExportData(channel: TextBasedChannel, messages: MessageInfo[]): ChannelExport {
    const guild = 'guild' in channel && channel.guild ? channel.guild : null;
    return {
      guildId: guild?.id ?? null,
      guildName: guild?.name ?? null,
      channelId: channel.id,
      channelName: this.getChannelName(channel),
      exportedAt: new Date().toISOString(),
      totalMessages: messages.length,
      messages
    } satisfies ChannelExport;
  }

  private getChannelName(channel: TextBasedChannel): string {
    if ('name' in channel && typeof channel.name === 'string') {
      return channel.name;
    }
    return channel.id;
  }

  private async resolveExportFilePath(channel: TextBasedChannel): Promise<string> {
    const existing = await this.findExistingExportFile(channel.id);
    if (existing !== null) {
      return existing;
    }

    const sanitizedName = this.sanitizeChannelName(this.getChannelName(channel));
    return path.join(config.downloadDir, `${sanitizedName}-${channel.id}.json`);
  }

  private async findExistingExportFile(channelId: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(config.downloadDir);
      for (const entry of entries) {
        if (entry.endsWith(`-${channelId}.json`)) {
          return path.join(config.downloadDir, entry);
        }
      }
    } catch (error) {
      console.warn('⚠️ Не удалось прочитать папку экспорта:', error);
    }
    return null;
  }

  private sanitizeChannelName(channelName: string): string {
    return channelName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^-|-$|^$/gu, '') || 'channel';
  }

  private async loadExistingExport(filePath: string): Promise<ChannelExport | null> {
    try {
      if (!(await fs.pathExists(filePath))) {
        return null;
      }
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as ChannelExport;
    } catch (error) {
      console.warn(`⚠️ Не удалось загрузить существующий экспорт (${filePath}):`, error);
      return null;
    }
  }

  private async writeExport(filePath: string, exportData: ChannelExport): Promise<void> {
    await fs.writeJson(filePath, exportData, { spaces: 2 });
  }

  private mapMessage(message: Message): MessageInfo {
    const attachments: AttachmentInfo[] = Array.from(message.attachments.values()).map(attachment => ({
      id: attachment.id,
      name: attachment.name ?? 'unnamed',
      size: attachment.size,
      url: attachment.url,
      proxyUrl: attachment.proxyURL ?? attachment.url,
      contentType: attachment.contentType ?? null
    }));

    const embeds = message.embeds.map(embed => embed.toJSON());

    return {
      id: message.id,
      authorId: message.author.id,
      authorTag: message.author.tag,
      authorDisplayName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt ? message.editedAt.toISOString() : null,
      content: message.content ?? '',
      embeds,
      attachments,
      embedsCount: embeds.length,
      referencedMessageId: message.reference?.messageId ?? null
    } satisfies MessageInfo;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}
