/**
 * MoboReels Adapter - Partial implementation
 * Supports: Search, Episodes (but limited details)
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

export class MoboReelsAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('MoboReels', {
      baseUrl: 'https://api.moboreels.com',
      timeout: 10000,
      retryAttempts: 3,
      ...config
    });
  }

  async validate() {
    return this.baseUrl ? true : false;
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?q=${encodeURIComponent(query)}&type=drama`
      );

      if (!response.data) return [];

      return (response.data || []).map(drama => ({
        id: drama.id,
        title: drama.name,
        image: drama.cover,
        year: drama.year,
        total_episodes: drama.total_episodes || 0,
        source: 'MoboReels'
      }));
    } catch (error) {
      console.error(`MoboReels search error: ${error.message}`);
      return [];
    }
  }

  async getEpisodes(dramaId, page = 1) {
    try {
      const response = await this._request(
        `${this.baseUrl}/drama/${dramaId}/episodes?page=${page}`
      );

      if (!response.episodes) return [];

      return (response.episodes || []).map(ep => ({
        episode_number: ep.ep_num,
        title: ep.ep_title,
        url: ep.video_link,
        duration_seconds: ep.duration || 0,
        quality: ep.quality || '360p',
        released_at: ep.date
      }));
    } catch (error) {
      console.error(`MoboReels getEpisodes error: ${error.message}`);
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/ping`);
      return { status: 'ok', message: 'MoboReels API is accessible' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}
