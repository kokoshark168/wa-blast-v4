/**
 * Reelife Adapter - Partial implementation
 * Supports: Search only (episodes require additional authentication)
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

export class ReellifeAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Reelife', {
      baseUrl: 'https://api.reellife.tv',
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
        `${this.baseUrl}/api/v2/search`,
        {
          method: 'POST',
          data: { search_term: query, max_results: 20 }
        }
      );

      if (!response.shows) return [];

      return (response.shows || []).map(drama => ({
        id: drama.show_id,
        title: drama.show_title,
        image: drama.cover_image,
        year: drama.first_aired_year,
        total_episodes: drama.num_episodes,
        description: drama.synopsis,
        rating: drama.avg_rating,
        source: 'Reelife'
      }));
    } catch (error) {
      console.error(`Reelife search error: ${error.message}`);
      return [];
    }
  }

  async getEpisodes(dramaId, page = 1) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/v2/shows/${dramaId}/episodes?page=${page}&per_page=30`
      );

      if (!response.episodes) return [];

      return (response.episodes || []).map(ep => ({
        episode_number: ep.episode_num,
        title: ep.title,
        url: ep.stream_url,
        duration_seconds: ep.duration_minutes * 60,
        quality: ep.available_quality || 'hd'
      }));
    } catch (error) {
      console.error(`Reelife getEpisodes error: ${error.message}`);
      return [];
    }
  }

  async health() {
    try {
      const response = await this._request(`${this.baseUrl}/api/v2/health`);
      return { status: response.status || 'ok', message: 'Reelife API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}
