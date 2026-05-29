/**
 * Telegram Upload Worker
 * Uploads merged videos to self-hosted telegram-bot-api and caches file_id
 */
import fs from 'fs';
import pino from 'pino';
import db from '../utils/db.js';
import crypto from 'crypto';

const logger = pino();

export class TelegramUploadWorker {
  constructor(options = {}) {
    this.botApiUrl = options.botApiUrl || process.env.TELEGRAM_BOT_API_URL || 'http://localhost:8081';
    this.botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.channelId = options.channelId || '@dramabotchannel'; // Dummy channel for file upload
    this.timeout = options.timeout || 60000; // 1 minute
  }

  /**
   * Upload video to Telegram and get file_id
   * @param {string} filePath - Path to video file
   * @param {string} fileName - Display name
   * @returns {Promise<string>} file_id
   */
  async uploadVideo(filePath, fileName) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileSize = fs.statSync(filePath).size;
      logger.info(`Uploading video: ${fileName} (${this.formatSize(fileSize)})`);

      // Check if already cached
      const cached = db.prepare(`
        SELECT file_id FROM file_cache
        WHERE file_hash = ?
      `).get(this.hashFile(filePath));

      if (cached) {
        logger.info(`Using cached file_id: ${cached.file_id}`);
        return cached.file_id;
      }

      // Upload via self-hosted Bot API
      const fileId = await this.uploadViaBotApi(filePath, fileName);

      // Cache file_id
      db.prepare(`
        INSERT OR IGNORE INTO file_cache (file_path, file_hash, file_id, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(filePath, this.hashFile(filePath), fileId);

      logger.info(`Video uploaded successfully. file_id: ${fileId}`);
      return fileId;
    } catch (error) {
      logger.error(`Upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload to self-hosted telegram-bot-api server
   */
  async uploadViaBotApi(filePath, fileName) {
    try {
      const fileStream = fs.createReadStream(filePath);

      // FormData for multipart upload
      const formData = new FormData();
      formData.append('chat_id', this.channelId);
      formData.append('video', fileStream, fileName);

      const response = await fetch(
        `${this.botApiUrl}/bot${this.botToken}/sendVideo`,
        {
          method: 'POST',
          body: formData,
          timeout: this.timeout
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok || !data.result?.video?.file_id) {
        throw new Error(`Invalid response: ${JSON.stringify(data)}`);
      }

      return data.result.video.file_id;
    } catch (error) {
      logger.error(`Bot API upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file from Telegram using file_id
   */
  async getFile(fileId) {
    try {
      const response = await fetch(
        `${this.botApiUrl}/bot${this.botToken}/getFile?file_id=${fileId}`
      );

      if (!response.ok) {
        throw new Error(`Get file failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok || !data.result?.file_path) {
        throw new Error(`Invalid response: ${JSON.stringify(data)}`);
      }

      return data.result;
    } catch (error) {
      logger.error(`Get file error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download file from Telegram
   */
  async downloadFile(fileId, outputPath) {
    try {
      const fileInfo = await this.getFile(fileId);
      const fileUrl = `${this.botApiUrl}/file/bot${this.botToken}/${fileInfo.file_path}`;

      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(buffer));

      logger.info(`File downloaded: ${outputPath}`);
      return outputPath;
    } catch (error) {
      logger.error(`Download error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Hash file for caching
   */
  hashFile(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Format file size
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Clean old cache entries
   */
  cleanOldCache(daysOld = 30) {
    const result = db.prepare(`
      DELETE FROM file_cache
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `).run(daysOld);

    logger.info(`Cleaned ${result.changes} old cache entries`);
    return result.changes;
  }
}
