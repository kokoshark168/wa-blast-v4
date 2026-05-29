/**
 * ShortMax Adapter - Full implementation
 * Supports: Search, Details, Episodes
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

export class ShortMaxAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('ShortMax', {
      baseUrl: 'https://api.shortmax.tv',
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
        `${this.baseUrl}/v1/search`,
        {
          method: 'POST',
          data: { query, limit: 20 }
        }
      );

      if (!response.results || !Array.isArray(response.results)) {
        return [];
      }

      return response.results.map(drama => this._normalizeDrama({
        id: drama.content_id,
        title: drama.content_title,
        image: drama.thumbnail_url,
        year: drama.release_year,
        total_episodes: drama.episode_count,
        rating: drama.imdb_rating,
        description: drama.plot_summary,
        country: drama.origin_country,
        genres: drama.categories || []
      }));
    } catch (error) {
      console.error(`ShortMax search error: ${error.message}`);
      return [];
    }
  }

  async getDetails(dramaId) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v1/content/${dramaId}`
      );

      return this._normalizeDrama({
        id: response.content_id,
        title: response.content_title,
        description: response.plot_summary,
        image: response.thumbnail_url,
        year: response.release_year,
        total_episodes: response.episode_count,
        rating: response.imdb_rating,
        country: response.origin_country,
        genres: response.categories || []
      });
    } catch (error) {
      console.error(`ShortMax getDetails error: ${error.message}`);
      throw error;
    }
  }

  async getEpisodes(dramaId, page = 1) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v1/content/${dramaId}/episodes?page=${page}&per_page=50`
      );

      if (!response.episodes || !Array.isArray(response.episodes)) {
        return [];
      }

      return response.episodes.map(ep => this._normalizeEpisode({
        episode_number: ep.episode_num,
        title: ep.episode_title,
        url: ep.stream_url,
        duration_seconds: ep.duration_sec,
        quality: ep.resolution || '480p',
        released_at: ep.air_date
      }));
    } catch (error) {
      console.error(`ShortMax getEpisodes error: ${error.message}`);
      return [];
    }
  }

  async getEpisode(dramaId, episodeNumber) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v1/content/${dramaId}/episodes/${episodeNumber}`
      );

      return this._normalizeEpisode({
        episode_number: response.episode_num,
        title: response.episode_title,
        url: response.stream_url,
        duration_seconds: response.duration_sec,
        quality: response.resolution || '480p',
        released_at: response.air_date
      });
    } catch (error) {
      console.error(`ShortMax getEpisode error: ${error.message}`);
      throw error;
    }
  }

  async health() {
    try {
      const response = await this._request(`${this.baseUrl}/v1/status`);
      if (response.operational) {
        return { status: 'ok', message: 'ShortMax API is operational' };
      }
      return { status: 'error', message: 'ShortMax API not operational' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}
