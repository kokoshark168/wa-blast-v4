/**
 * Search-only Adapters (15+)
 * These adapters provide search functionality but limited or no episode access
 */
import { BaseAdapter } from '../base/BaseAdapter.js';

// 1. MyDramalist Search
export class MyDramalistAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('MyDramalist', { baseUrl: 'https://api.mydramalist.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?query=${encodeURIComponent(query)}`
      );
      return (response.dramas || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.image_url,
        year: d.year,
        total_episodes: d.eps,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'MyDramalist API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 2. DramaGo Search
export class DramaGoAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('DramaGo', { baseUrl: 'https://api.dramago.net', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`
      );
      return (response.results || []).map(d => ({
        id: d.id,
        title: d.name,
        image: d.poster,
        year: d.year,
        total_episodes: d.ep_count
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/api/status`);
      return { status: 'ok', message: 'DramaGo API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 3. KissAsian Search
export class KissAsianAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('KissAsian', { baseUrl: 'https://api.kissasian.ch', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?title=${encodeURIComponent(query)}`
      );
      return (response.list || []).map(d => ({
        id: d.movie_id,
        title: d.title,
        image: d.image,
        year: d.year,
        total_episodes: d.episodes
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'KissAsian API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 4. DramaFever Search
export class DramaFeverAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('DramaFever', { baseUrl: 'https://api.dramafever.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v2/search/titles?query=${encodeURIComponent(query)}`
      );
      return (response.items || []).map(d => ({
        id: d.id,
        title: d.name,
        image: d.hero_image_url,
        year: d.release_year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/v2/health`);
      return { status: 'ok', message: 'DramaFever API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 5. Viki Search (Rakuten)
export class VikiAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Viki', { baseUrl: 'https://api.viki.io', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v4/search?q=${encodeURIComponent(query)}&type=series`
      );
      return (response.response || []).map(d => ({
        id: d.id,
        title: d.titles?.en || d.original_title,
        image: d.images?.poster?.url,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/v4/health`);
      return { status: 'ok', message: 'Viki API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 6. ZeeTV Search
export class ZeeTVAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('ZeeTV', { baseUrl: 'https://api.zee5.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/content/search?q=${encodeURIComponent(query)}`
      );
      return (response.search_results || []).map(d => ({
        id: d.content_id,
        title: d.title,
        image: d.thumbnail,
        year: d.release_date?.split('-')[0],
        total_episodes: d.episode_count
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'ZeeTV API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 7. WeTV Search
export class WeTVAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('WeTV', { baseUrl: 'https://api.wetv.vip', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/search?keyword=${encodeURIComponent(query)}`
      );
      return (response.list || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.image,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/api/health`);
      return { status: 'ok', message: 'WeTV API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 8. Netflix (Limited - Search Only)
export class NetflixAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Netflix', { baseUrl: 'https://api.netflix.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?query=${encodeURIComponent(query)}`
      );
      return (response.results || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.artwork_url,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'Netflix API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 9. iQIYI Search
export class IQIYIAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('iQIYI', { baseUrl: 'https://api.iqiyi.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?q=${encodeURIComponent(query)}`
      );
      return (response.items || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.image,
        year: d.year,
        total_episodes: d.episodes
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'iQIYI API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 10. Bilibili Search
export class BilibiliAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Bilibili', { baseUrl: 'https://api.bilibili.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/x/web-interface/search/type?search_type=media_bangumi&keyword=${encodeURIComponent(query)}`
      );
      return (response.result || []).map(d => ({
        id: d.season_id,
        title: d.title,
        image: d.cover,
        year: d.publish_year,
        total_episodes: d.media_count
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'Bilibili API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 11. Tencent Video Search
export class TencentVideoAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('TencentVideo', { baseUrl: 'https://api.v.qq.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?q=${encodeURIComponent(query)}`
      );
      return (response.list || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.pic,
        year: d.year,
        rating: d.score
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'Tencent Video API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 12. Youku Search
export class YoukuAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Youku', { baseUrl: 'https://api.youku.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v2/search?word=${encodeURIComponent(query)}`
      );
      return (response.sdata || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.image,
        year: d.year,
        total_episodes: d.ep_count
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'Youku API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 13. Mango TV Search
export class MangoTVAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('MangoTV', { baseUrl: 'https://api.mgtv.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?kw=${encodeURIComponent(query)}`
      );
      return (response.data || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.img,
        year: d.year,
        rating: d.mark
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'MangoTV API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 14. Himaxin Search
export class HimaxinAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('Himaxin', { baseUrl: 'https://api.himaxin.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/search?query=${encodeURIComponent(query)}`
      );
      return (response.results || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.poster_url,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/api/health`);
      return { status: 'ok', message: 'Himaxin API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 15. GagaOOlala Search
export class GagaOOlalaAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('GagaOOlala', { baseUrl: 'https://api.gagaoolala.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/api/v1/search?keyword=${encodeURIComponent(query)}`
      );
      return (response.series || []).map(d => ({
        id: d.id,
        title: d.name,
        image: d.cover,
        year: d.release_year,
        total_episodes: d.episodes_count,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/api/v1/health`);
      return { status: 'ok', message: 'GagaOOlala API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 16. CatchPlay Search
export class CatchPlayAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('CatchPlay', { baseUrl: 'https://api.catchplay.com', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/search?q=${encodeURIComponent(query)}&type=series`
      );
      return (response.items || []).map(d => ({
        id: d.id,
        title: d.title,
        image: d.image_url,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/health`);
      return { status: 'ok', message: 'CatchPlay API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// 17. Rakuten Viki Search (Alternative)
export class RakutenVikiAdapter extends BaseAdapter {
  constructor(config = {}) {
    super('RakutenViki', { baseUrl: 'https://api.viki.io', ...config });
  }

  async search(query) {
    try {
      const response = await this._request(
        `${this.baseUrl}/v4/search?q=${encodeURIComponent(query)}&types=series,movies`
      );
      return (response.response || []).map(d => ({
        id: d.id,
        title: d.titles?.en || 'Unknown',
        image: d.images?.poster?.url,
        year: d.year,
        rating: d.rating
      }));
    } catch (error) {
      return [];
    }
  }

  async health() {
    try {
      await this._request(`${this.baseUrl}/v4/health`);
      return { status: 'ok', message: 'RakutenViki API responding' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

// Export all adapters
export const searchAdapters = [
  MyDramalistAdapter,
  DramaGoAdapter,
  KissAsianAdapter,
  DramaFeverAdapter,
  VikiAdapter,
  ZeeTVAdapter,
  WeTVAdapter,
  NetflixAdapter,
  IQIYIAdapter,
  BilibiliAdapter,
  TencentVideoAdapter,
  YoukuAdapter,
  MangoTVAdapter,
  HimaxinAdapter,
  GagaOOlalaAdapter,
  CatchPlayAdapter,
  RakutenVikiAdapter
];
