import { ChannelType, Client, GatewayIntentBits, type Channel, type TextBasedChannel } from 'discord.js';
import { config } from './config.js';
import { ChannelMessageCollector } from './channelCollector.js';
import type { ChannelExportResult } from './types.js';

class DiscordChannelExporter {
  private readonly client: Client;
  private readonly collector: ChannelMessageCollector;
  private syncTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private activeChannel: TextBasedChannel | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.collector = new ChannelMessageCollector();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', this.onReady.bind(this));
    this.client.on('error', this.onError.bind(this));
    this.client.on('warn', this.onWarn.bind(this));

    process.on('SIGINT', () => {
      void this.shutdown(0);
    });
    process.on('SIGTERM', () => {
      void this.shutdown(0);
    });
  }

  private async onReady(): Promise<void> {
    const clientUser = this.client.user;
    if (clientUser === null) {
      throw new Error('Client user is not available');
    }

    console.log(`✅ Бот ${clientUser.tag} успешно запущен!`);
    console.log(`📁 Папка для экспорта: ${config.downloadDir}`);

    try {
      await this.startChannelSync();
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error('❌ Ошибка при синхронизации канала:', errorMessage);
      await this.shutdown(1);
    }
  }

  private onError(error: Error): void {
    console.error('❌ Критическая ошибка Discord клиента:', error);
  }

  private onWarn(warning: string): void {
    console.warn('⚠️ Предупреждение Discord клиента:', warning);
  }

  private async startChannelSync(): Promise<void> {
    console.log('🔍 Получаем канал...');

    const channel: Channel | null = await this.client.channels.fetch(config.channelId);
    if (channel === null) {
      throw new Error(`Канал с ID ${config.channelId} не найден`);
    }

    if (!channel.isTextBased()) {
      const channelTypeName = ChannelType[channel.type] ?? 'Unknown';
      throw new Error(`Канал ${config.channelId} не является текстовым (тип: ${channelTypeName})`);
    }

    const textChannel = channel as TextBasedChannel;
    const channelName = 'name' in textChannel && typeof textChannel.name === 'string'
      ? textChannel.name
      : textChannel.id;

    this.activeChannel = textChannel;
    console.log(`📋 Канал найден: "${channelName}"`);

    const initialResult = await this.performSync();

    if (config.exitOnIdle) {
      if (initialResult !== null) {
        if (initialResult.newMessages === 0) {
          console.log('✅ Канал актуален. EXIT_ON_IDLE активен, выходим.');
        } else {
          console.log('✅ Синхронизация завершена. EXIT_ON_IDLE активен, выходим.');
        }
      }
      await this.shutdown(0);
      return;
    }

    if (config.syncIntervalMs <= 0) {
      console.log('✅ Выгрузка завершена! Завершаем работу бота...');
      await this.shutdown(0);
      return;
    }

    console.log(`⏰ Периодическая синхронизация каждые ${this.formatInterval(config.syncIntervalMs)}`);
    this.scheduleNextSync();
  }

  private async performSync(): Promise<ChannelExportResult | null> {
    if (this.activeChannel === null) {
      return null;
    }

    try {
      return await this.collector.exportChannel(this.activeChannel);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error('❌ Ошибка при экспортировании сообщений:', errorMessage);
      throw error;
    }
  }

  private scheduleNextSync(): void {
    if (config.exitOnIdle || config.syncIntervalMs <= 0) {
      return;
    }

    if (this.syncTimer !== null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    this.syncTimer = setTimeout(() => {
      void this.handleScheduledSync();
    }, config.syncIntervalMs);
    console.log(`⏱️ Следующая проверка через ${this.formatInterval(config.syncIntervalMs)}`);
  }

  private async handleScheduledSync(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    let syncResult: ChannelExportResult | null = null;
    try {
      syncResult = await this.performSync();
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error('❌ Ошибка при плановой синхронизации:', errorMessage);
    }

    if (!this.isShuttingDown) {
      if (config.exitOnIdle && (syncResult === null || syncResult.newMessages === 0)) {
        console.log('✅ Новых сообщений не обнаружено. Завершаем работу бота по настройке EXIT_ON_IDLE.');
        await this.shutdown(0);
        return;
      }

      this.scheduleNextSync();
    }
  }

  private formatInterval(ms: number): string {
    if (ms < 1000) {
      return `${ms} мс`;
    }
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) {
      return `${totalSeconds} с`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) {
      return `${minutes} мин`;
    }
    return `${minutes} мин ${seconds} с`;
  }

  private async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    if (this.syncTimer !== null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    console.log('\n🔄 Завершение работы бота...');

    try {
      if (this.client.isReady()) {
        await this.client.destroy();
        console.log('✅ Discord клиент закрыт');
      }
    } catch (error) {
      console.error('❌ Ошибка при закрытии Discord клиента:', error);
    }

    process.exit(exitCode);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  public async start(): Promise<void> {
    try {
      console.log('🤖 Запуск Discord бота...');
      await this.client.login(config.token);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error('❌ Ошибка при запуске бота:', errorMessage);
      await this.shutdown(1);
    }
  }
}

function handleUnhandledRejection(reason: unknown): void {
  console.error('❌ Необработанное отклонение промиса:', reason);
  process.exit(1);
}

function handleUncaughtException(error: Error): void {
  console.error('❌ Необработанное исключение:', error);
  process.exit(1);
}

function handleStartupError(error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('❌ Критическая ошибка при запуске:', errorMessage);
  process.exit(1);
}

process.on('unhandledRejection', handleUnhandledRejection);
process.on('uncaughtException', handleUncaughtException);

const bot = new DiscordChannelExporter();
bot.start().catch(handleStartupError);
