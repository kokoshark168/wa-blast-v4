/**
 * NetShort Adapter - Partial implementation
 * Supports: Search, Details (but limited episode access)
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

export class NetShortAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('NetShort', {
      baseUrl: 'https://api.netshort.io',
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
        `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`
      );

      if (!response.list) return [];

      return (response.list || []).map(drama => ({
        id: drama.drama_id,
        title: drama.drama_name,
        image: drama.poster,
        year: drama.release_year,
        total_episodes: drama.episodes,
        description: drama.desc,
        source: 'NetShort'
      }));
    } catch (error) {
      console.error(`NetShort search error: ${error.message}`);
      return [];
    }
  }

  async getDetails(dramaId) {
    try {
      const response = await this._request(
        `${this.baseUrl}/drama/${dramaId}`
      );

      return {
        id: response.drama_id,
        title: response.drama_name,
        description: response.description,
        image: response.poster,
        year: response.release_year,
        total_episodes: response.total_episodes,
        rating: response.rating,
        genres: response.genres || []
      };
    } catch (error) {
      console.error(`NetShort getDetails error: ${error.message}`);
      throw error;
    }
  }

  async getEpisodes(dramaId, page = 1) {
    try {
      const response = await this._request(
        `${this.baseUrl}/drama/${dramaId}/episodes?page=${page}`
      );

      if (!response.episodes) return [];

      return (response.episodes || []).map(ep => ({
        episode_number: ep.num,
        title: ep.title,
        url: ep.link,
        duration_seconds: 0,
        quality: 'unknown'
      }));
    } catch (error) {
      console.error(`NetShort getEpisodes error: ${error.message}`);
      return [];
    }
  }

  async health() {
    try {
      const response = await this._request(`${this.baseUrl}/health`);
      return { status: response.status || 'ok', message: 'NetShort API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}
