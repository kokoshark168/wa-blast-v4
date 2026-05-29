/**
 * Dramas Routes - Search, details, episodes
 */
import express from 'express';
import pino from 'pino';
import db from '../utils/db.js';
import { registry } from '../adapters/registry.js';
import { verifyAuth } from '../middleware/auth.js';
import { VideoMergeWorker } from '../workers/VideoMergeWorker.js';

const router = express.Router();
const logger = pino();
const mergeWorker = new VideoMergeWorker();

// Search dramas
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query required (min 2 chars)' });
    }

    const results = await registry.searchAll(q);
    res.json({ count: results.length, results });
  } catch (error) {
    logger.error(`Search error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get drama details
router.get('/:dramaId', async (req, res) => {
  try {
    const { dramaId } = req.params;
    const { source } = req.query;

    // Check cache first
    let drama = db.prepare(`
      SELECT * FROM dramas WHERE external_id = ?
    `).get(dramaId);

    if (drama) {
      return res.json(drama);
    }

    // Fetch from adapter
    const details = await registry.getDetails(dramaId, source);

    // Cache result
    db.prepare(`
      INSERT OR IGNORE INTO dramas
      (external_id, source, title, description, image_url, year, total_episodes, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dramaId,
      source || 'unknown',
      details.title,
      details.description,
      details.image,
      details.year,
      details.total_episodes,
      details.rating
    );

    res.json(details);
  } catch (error) {
    logger.error(`Get details error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get episodes
router.get('/:dramaId/episodes', async (req, res) => {
  try {
    const { dramaId } = req.params;
    const { source, page = 1 } = req.query;

    const episodes = await registry.getEpisodes(dramaId, source, parseInt(page));
    res.json({ count: episodes.length, episodes });
  } catch (error) {
    logger.error(`Get episodes error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Request video (merge + upload)
router.post('/:dramaId/request-video', verifyAuth, async (req, res) => {
  try {
    const { dramaId } = req.params;
    const { source } = req.body;
    const userId = req.state.userId;

    // Check VIP status
    const user = db.prepare(`
      SELECT vip_tier, vip_expires_at FROM users WHERE id = ?
    `).get(userId);

    const now = new Date();
    const expiresAt = user.vip_expires_at ? new Date(user.vip_expires_at) : null;
    const isVIP = expiresAt && expiresAt > now && user.vip_tier !== 'free';

    if (!isVIP) {
      return res.status(403).json({ error: 'VIP subscription required' });
    }

    // Check if already cached
    const cached = mergeWorker.getCachedParts(dramaId);
    if (cached.length > 0) {
      return res.json({
        status: 'cached',
        parts: cached.map(p => ({
          part_number: p.part_number,
          episodes: `${p.episodes_start}-${p.episodes_end}`,
          file_id: p.file_id
        }))
      });
    }

    // Queue merge job
    logger.info(`Queuing merge for drama ${dramaId}`);

    res.json({
      status: 'queued',
      message: 'Video merge has been queued. Check status in a few moments.',
      drama_id: dramaId
    });

    // Start async merge in background
    mergeWorker.mergeEpisodes(dramaId, source)
      .then(parts => {
        logger.info(`Merge completed for drama ${dramaId}: ${parts.length} parts`);
      })
      .catch(error => {
        logger.error(`Merge failed for drama ${dramaId}: ${error.message}`);
      });
  } catch (error) {
    logger.error(`Request video error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get cached parts
router.get('/:dramaId/parts', verifyAuth, async (req, res) => {
  try {
    const { dramaId } = req.params;

    const parts = mergeWorker.getCachedParts(dramaId);

    if (parts.length === 0) {
      return res.status(404).json({ error: 'No merged videos available yet' });
    }

    res.json({
      drama_id: dramaId,
      parts: parts.map(p => ({
        part_number: p.part_number,
        episodes: `${p.episodes_start}-${p.episodes_end}`,
        file_id: p.file_id,
        created_at: p.created_at
      }))
    });
  } catch (error) {
    logger.error(`Get parts error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
