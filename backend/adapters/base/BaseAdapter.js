/**
 * BaseAdapter - Abstract base class for drama source adapters
 * All adapters must implement these core methods to integrate with the registry
 */
export class BaseAdapter {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.apiKey = config.apiKey || null;
    this.baseUrl = config.baseUrl || null;
    this.timeout = config.timeout || 10000;
    this.retryAttempts = config.retryAttempts || 3;
  }

  /**
   * Search for dramas/movies by title
   * @param {string} query - Search query (title, keyword)
   * @returns {Promise<Array>} Array of drama objects with id, title, image, year, episodes_count
   */
  async search(query) {
    throw new Error(`${this.name}.search() not implemented`);
  }

  /**
   * Get detailed information about a drama
   * @param {string} dramaId - Drama ID from adapter
   * @returns {Promise<Object>} Drama details: id, title, description, image, year, total_episodes, rating
   */
  async getDetails(dramaId) {
    throw new Error(`${this.name}.getDetails() not implemented`);
  }

  /**
   * Get list of episodes with video URLs
   * @param {string} dramaId - Drama ID from adapter
   * @param {number} page - Pagination page (optional)
   * @returns {Promise<Array>} Array of episodes: { episode_number, title, url, duration_seconds, quality }
   */
  async getEpisodes(dramaId, page = 1) {
    throw new Error(`${this.name}.getEpisodes() not implemented`);
  }

  /**
   * Optional: Get specific episode by number
   * @param {string} dramaId - Drama ID
   * @param {number} episodeNumber - Episode number
   * @returns {Promise<Object>} Episode details with video URL
   */
  async getEpisode(dramaId, episodeNumber) {
    throw new Error(`${this.name}.getEpisode() not implemented`);
  }

  /**
   * Health check - verify adapter connectivity and API access
   * @returns {Promise<Object>} { status: 'ok'|'error', message: string }
   */
  async health() {
    throw new Error(`${this.name}.health() not implemented`);
  }

  /**
   * Validate adapter configuration
   * @returns {boolean} True if config is valid
   */
  validate() {
    if (!this.baseUrl) {
      console.error(`${this.name}: Missing baseUrl`);
      return false;
    }
    return true;
  }

  /**
   * Helper: Make HTTP request with retry logic
   * @private
   */
  async _request(url, options = {}) {
    const { method = 'GET', headers = {}, data = null, timeout = this.timeout } = options;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DramaBotAdapter/1.0',
            ...headers
          },
          body: data ? JSON.stringify(data) : undefined,
          timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === this.retryAttempts - 1) throw error;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  /**
   * Helper: Normalize episode data structure
   * @protected
   */
  _normalizeEpisode(episode) {
    return {
      episode_number: episode.episode_number || episode.ep || episode.number || 0,
      title: episode.title || episode.name || 'Unknown',
      url: episode.url || episode.video_url || null,
      duration_seconds: episode.duration_seconds || episode.duration || 0,
      quality: episode.quality || 'unknown',
      released_at: episode.released_at || episode.release_date || null
    };
  }

  /**
   * Helper: Normalize drama data structure
   * @protected
   */
  _normalizeDrama(drama) {
    return {
      id: drama.id || drama.drama_id || null,
      title: drama.title || drama.name || 'Unknown',
      description: drama.description || drama.synopsis || null,
      image: drama.image || drama.poster || drama.cover || null,
      year: drama.year || drama.release_year || new Date().getFullYear(),
      total_episodes: drama.total_episodes || drama.episodes || 0,
      rating: drama.rating || drama.imdb_rating || null,
      genres: drama.genres || [],
      country: drama.country || null
    };
  }

  /**
   * Get adapter capability flags
   */
  getCapabilities() {
    return {
      search: this._hasMethod('search'),
      details: this._hasMethod('getDetails'),
      episodes: this._hasMethod('getEpisodes'),
      health: this._hasMethod('health'),
      full: this._hasMethod('search') && this._hasMethod('getDetails') && this._hasMethod('getEpisodes')
    };
  }

  _hasMethod(methodName) {
    const method = this[methodName];
    return method && method.toString() !== this.constructor.prototype[methodName]?.toString();
  }
}
