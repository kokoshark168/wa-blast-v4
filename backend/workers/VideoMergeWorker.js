/**
 * Video Merge Worker
 * Fetches episodes from drama sources, merges them with ffmpeg, and caches file_id
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import db from '../utils/db.js';
import { registry } from '../adapters/registry.js';
import { TelegramUploadWorker } from './TelegramUploadWorker.js';

const logger = pino();

export class VideoMergeWorker {
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
    this.uploadWorker = new TelegramUploadWorker(options);
    this.tempDir = options.tempDir || process.env.TEMP_DIR || './uploads/temp';
    this.outputDir = options.outputDir || process.env.OUTPUT_DIR || './uploads/merged';
    this.timeout = options.timeout || parseInt(process.env.FFMPEG_TIMEOUT, 10) || 300000; // 5 minutes

    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.tempDir, this.outputDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Merge drama episodes into parts
   * @param {string} dramaId - Drama ID
   * @param {string} sourceAdapter - Adapter name
   * @param {number} episodesPerPart - Episodes to merge per file (default 30)
   * @returns {Promise<Array>} Array of merged parts with file_ids
   */
  async mergeEpisodes(dramaId, sourceAdapter, episodesPerPart = 30) {
    logger.info(`Starting merge for drama ${dramaId} from ${sourceAdapter}`);

    try {
      // drama_parts.drama_id is an INTEGER FK to dramas.id — resolve the
      // external (adapter) id to the internal row id before any insert.
      const dramaRowId = this.resolveDramaRowId(dramaId, sourceAdapter, { create: true });

      // Get episodes
      let episodes = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && episodes.length < 1000) {
        try {
          const pageEpisodes = await registry.getEpisodes(dramaId, sourceAdapter, page);
          if (pageEpisodes.length === 0) {
            hasMore = false;
          } else {
            episodes = episodes.concat(pageEpisodes);
            page++;
          }
        } catch (error) {
          logger.warn(`Failed to get episodes page ${page}: ${error.message}`);
          hasMore = false;
        }
      }

      if (episodes.length === 0) {
        throw new Error(`No episodes found for drama ${dramaId}`);
      }

      logger.info(`Found ${episodes.length} episodes for drama ${dramaId}`);

      // Split into parts
      const parts = [];
      for (let i = 0; i < episodes.length; i += episodesPerPart) {
        const partEpisodes = episodes.slice(i, i + episodesPerPart);
        const partNumber = Math.floor(i / episodesPerPart) + 1;

        logger.info(`Processing part ${partNumber}: episodes ${i + 1}-${Math.min(i + episodesPerPart, episodes.length)}`);

        try {
          const fileId = await this.mergePart(dramaId, sourceAdapter, partNumber, partEpisodes);

          parts.push({
            drama_id: dramaId,
            source: sourceAdapter,
            part_number: partNumber,
            episodes_start: i + 1,
            episodes_end: Math.min(i + episodesPerPart, episodes.length),
            episode_count: partEpisodes.length,
            file_id: fileId,
            status: 'completed',
            created_at: new Date().toISOString()
          });

          // Save to database
          db.prepare(`
            INSERT INTO drama_parts (drama_id, source, part_number, episodes_start, episodes_end, file_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(drama_id, part_number) DO UPDATE SET
              file_id = excluded.file_id,
              updated_at = datetime('now')
          `).run(dramaRowId, sourceAdapter || null, partNumber, i + 1, Math.min(i + episodesPerPart, episodes.length), fileId);
        } catch (error) {
          logger.error(`Failed to merge part ${partNumber}: ${error.message}`);
          parts.push({
            drama_id: dramaId,
            part_number: partNumber,
            status: 'failed',
            error: error.message
          });
        }
      }

      return parts;
    } catch (error) {
      logger.error(`Merge failed for drama ${dramaId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Merge a single part (episodes) into one video
   */
  async mergePart(dramaId, sourceAdapter, partNumber, episodes) {
    // Sanitize: dramaId is user-controlled and must not influence file paths
    // (e.g. "../../etc" would escape tempDir/outputDir)
    const safeDramaId = String(dramaId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const partName = `${safeDramaId}-part-${partNumber}`;
    const concatFile = path.join(this.tempDir, `${partName}-concat.txt`);
    const outputFile = path.join(this.outputDir, `${partName}.mp4`);
    const downloadedFiles = [];

    try {
      // Download episode URLs
      const fileList = [];

      for (let i = 0; i < episodes.length; i++) {
        const episode = episodes[i];
        if (!episode.url) {
          logger.warn(`Episode ${episode.episode_number} has no URL, skipping`);
          continue;
        }

        const tempFile = path.join(this.tempDir, `${partName}-ep${episode.episode_number}.mp4`);

        try {
          await this.downloadVideo(episode.url, tempFile);
          downloadedFiles.push(tempFile);
          fileList.push(`file '${tempFile}'`);
        } catch (error) {
          logger.warn(`Failed to download episode ${episode.episode_number}: ${error.message}`);
        }
      }

      if (fileList.length === 0) {
        throw new Error('No episodes could be downloaded');
      }

      // Write concat file
      fs.writeFileSync(concatFile, fileList.join('\n'));

      // Merge videos
      await this.concat(concatFile, outputFile);

      // Upload to Telegram and get file_id
      const fileId = await this.uploadWorker.uploadVideo(outputFile, `${partName}.mp4`);

      return fileId;
    } catch (error) {
      logger.error(`Merge part error: ${error.message}`);
      throw error;
    } finally {
      // Always clean up temp/output artifacts, including on failure
      for (const f of downloadedFiles) {
        try { fs.unlinkSync(f); } catch (e) { /* already gone */ }
      }
      try { fs.unlinkSync(concatFile); } catch (e) { /* already gone */ }
      try { fs.unlinkSync(outputFile); } catch (e) { /* already gone */ }
    }
  }

  /**
   * Resolve the internal dramas.id for an external adapter drama id.
   * Optionally creates a minimal catalog row so FK constraints are satisfied.
   */
  resolveDramaRowId(externalId, source, { create = false } = {}) {
    const row = db.prepare('SELECT id FROM dramas WHERE external_id = ?').get(String(externalId));
    if (row) return row.id;
    if (!create) return null;

    const result = db.prepare(`
      INSERT INTO dramas (external_id, source, title, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(String(externalId), source || 'unknown', String(externalId));
    return result.lastInsertRowid;
  }

  /**
   * Download video from URL (streamed to disk; mocked in tests)
   */
  async downloadVideo(url, outputPath) {
    logger.debug(`Downloading: ${url} -> ${outputPath}`);

    const response = await fetch(url, {
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(this.timeout) : undefined
    });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    // Stream to disk — episodes can be large, never buffer them in memory
    const { Readable } = await import('stream');
    const { pipeline } = await import('stream/promises');
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath));

    return outputPath;
  }

  /**
   * Concatenate videos using ffmpeg
   */
  async concat(concatFile, outputFile) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c', 'copy', // Fast copy without re-encoding if codecs match
        '-y', // Overwrite output
        outputFile
      ]);

      let stderr = '';
      let timeout;

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug(`ffmpeg: ${data.toString()}`);
      });

      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        } else if (fs.existsSync(outputFile)) {
          resolve(outputFile);
        } else {
          reject(new Error('Output file not created'));
        }
      });

      ffmpeg.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Timeout
      timeout = setTimeout(() => {
        ffmpeg.kill();
        reject(new Error('ffmpeg timeout'));
      }, this.timeout);
    });
  }

  /**
   * Check if drama is already merged and cached.
   * Accepts the external (adapter) drama id as used by the API routes.
   */
  getCachedParts(dramaId) {
    return db.prepare(`
      SELECT dp.* FROM drama_parts dp
      JOIN dramas d ON dp.drama_id = d.id
      WHERE d.external_id = ?
      ORDER BY dp.part_number ASC
    `).all(String(dramaId));
  }

  /**
   * Clear cached parts (external drama id)
   */
  clearCache(dramaId) {
    db.prepare(`
      DELETE FROM drama_parts
      WHERE drama_id IN (SELECT id FROM dramas WHERE external_id = ?)
    `).run(String(dramaId));
  }
}
