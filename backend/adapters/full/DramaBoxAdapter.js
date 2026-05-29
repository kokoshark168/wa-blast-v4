/**
 * DramaBox Adapter - Full implementation
 * Supports: Search, Details, Episodes
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

export class DramaBoxAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('DramaBox', {
      baseUrl: 'https://api.dramatv.live',
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
        `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=20`
      );

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return response.data.map(drama => this._normalizeDrama({
        id: drama.id,
        title: drama.title,
        image: drama.poster_url,
        year: drama.year,
        total_episodes: drama.episodes_count,
        rating: drama.rating,
        description: drama.synopsis,
        country: drama.country,
        genres: drama.genres || []
      }));
    } catch (error) {
      console.error(`DramaBox search error: ${error.message}`);
      return [];
    }
  }

  async getDetails(dramaId) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/dramas/${dramaId}`
      );

      return this._normalizeDrama({
        id: response.id,
        title: response.title,
        description: response.synopsis,
        image: response.poster_url,
        year: response.year,
        total_episodes: response.episodes_count,
        rating: response.rating,
        country: response.country,
        genres: response.genres || []
      });
    } catch (error) {
      console.error(`DramaBox getDetails error: ${error.message}`);
      throw error;
    }
  }

  async getEpisodes(dramaId, page = 1) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/dramas/${dramaId}/episodes?page=${page}&limit=50`
      );

      if (!response.episodes || !Array.isArray(response.episodes)) {
        return [];
      }

      return response.episodes.map(ep => this._normalizeEpisode({
        episode_number: ep.number,
        title: ep.title,
        url: ep.video_url,
        duration_seconds: ep.duration,
        quality: ep.quality || '720p',
        released_at: ep.released_date
      }));
    } catch (error) {
      console.error(`DramaBox getEpisodes error: ${error.message}`);
      return [];
    }
  }

  async getEpisode(dramaId, episodeNumber) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/dramas/${dramaId}/episodes/${episodeNumber}`
      );

      return this._normalizeEpisode({
        episode_number: response.number,
        title: response.title,
        url: response.video_url,
        duration_seconds: response.duration,
        quality: response.quality || '720p',
        released_at: response.released_date
      });
    } catch (error) {
      console.error(`DramaBox getEpisode error: ${error.message}`);
      throw error;
    }
  }

  async health() {
    try {
      const response = await this._request(`${this.baseUrl}/api/health`);
      if (response.status === 'ok') {
        return { status: 'ok', message: 'DramaBox API is operational' };
      }
      return { status: 'error', message: 'DramaBox API returned non-ok status' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}
