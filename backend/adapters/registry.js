/**
 * Adapter Registry - Central point for discovering and routing to drama source adapters
 * Supports fallback routing, parallel search, and capability-based routing
 */
import pino from 'pino';

const logger = pino();

export class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.fullAdapters = []; // Search + Details + Episodes
    this.partialAdapters = []; // Partial implementations
    this.searchOnlyAdapters = []; // Search only
  }

  /**
   * Register an adapter
   * @param {BaseAdapter} adapter - Adapter instance
   * @param {string} group - 'full'|'partial'|'search' - capability group
   */
  register(adapter, group = 'full') {
    if (!adapter.name) throw new Error('Adapter must have a name');
    if (!adapter.validate()) {
      logger.warn(`Adapter ${adapter.name} failed validation`);
      return false;
    }

    this.adapters.set(adapter.name, adapter);

    if (group === 'full') {
      this.fullAdapters.push(adapter);
    } else if (group === 'partial') {
      this.partialAdapters.push(adapter);
    } else if (group === 'search') {
      this.searchOnlyAdapters.push(adapter);
    }

    logger.info(`✓ Registered ${adapter.name} (${group})`);
    return true;
  }

  /**
   * Search across all adapters (parallel search with fallback)
   * @param {string} query - Search query
   * @returns {Promise<Array>} Merged results
   */
  async searchAll(query) {
    if (!query || query.trim().length === 0) return [];

    const results = [];
    const errors = [];

    // Parallel search across all adapters
    const searchPromises = [
      ...this.fullAdapters,
      ...this.partialAdapters,
      ...this.searchOnlyAdapters
    ].map(async (adapter) => {
      try {
        if (!adapter.search) return [];
        const adapterResults = await adapter.search(query);
        return (adapterResults || []).map(r => ({
          ...r,
          source: adapter.name
        }));
      } catch (error) {
        errors.push({ adapter: adapter.name, error: error.message });
        return [];
      }
    });

    const allResults = await Promise.all(searchPromises);
    allResults.forEach(res => results.push(...res));

    if (errors.length > 0) {
      logger.debug(`Search errors: ${JSON.stringify(errors)}`);
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = [];
    for (const result of results) {
      const key = (result.title || '').toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(result);
      }
    }

    return unique;
  }

  /**
   * Get details - try full adapters first, then others
   * @param {string} dramaId - Drama ID
   * @param {string} sourceAdapter - Preferred adapter name
   * @returns {Promise<Object>}
   */
  async getDetails(dramaId, sourceAdapter) {
    if (!dramaId) throw new Error('dramaId required');

    // Try specified adapter first
    if (sourceAdapter) {
      const adapter = this.adapters.get(sourceAdapter);
      if (adapter && adapter.getDetails) {
        try {
          return await adapter.getDetails(dramaId);
        } catch (error) {
          logger.warn(`getDetails failed for ${sourceAdapter}: ${error.message}`);
        }
      }
    }

    // Fallback to full adapters
    for (const adapter of this.fullAdapters) {
      try {
        if (adapter.getDetails) {
          return await adapter.getDetails(dramaId);
        }
      } catch (error) {
        logger.debug(`getDetails failed for ${adapter.name}: ${error.message}`);
      }
    }

    throw new Error(`Could not get details for drama: ${dramaId}`);
  }

  /**
   * Get episodes - try full adapters first
   * @param {string} dramaId - Drama ID
   * @param {string} sourceAdapter - Preferred adapter name
   * @param {number} page - Pagination
   * @returns {Promise<Array>}
   */
  async getEpisodes(dramaId, sourceAdapter, page = 1) {
    if (!dramaId) throw new Error('dramaId required');

    // Try specified adapter first
    if (sourceAdapter) {
      const adapter = this.adapters.get(sourceAdapter);
      if (adapter && adapter.getEpisodes) {
        try {
          return await adapter.getEpisodes(dramaId, page);
        } catch (error) {
          logger.warn(`getEpisodes failed for ${sourceAdapter}: ${error.message}`);
        }
      }
    }

    // Fallback to full adapters
    for (const adapter of this.fullAdapters) {
      try {
        if (adapter.getEpisodes) {
          return await adapter.getEpisodes(dramaId, page);
        }
      } catch (error) {
        logger.debug(`getEpisodes failed for ${adapter.name}: ${error.message}`);
      }
    }

    throw new Error(`Could not get episodes for drama: ${dramaId}`);
  }

  /**
   * Health check all adapters
   * @returns {Promise<Object>} Status of all adapters
   */
  async healthCheck() {
    const results = {};
    const healthPromises = Array.from(this.adapters.values()).map(async (adapter) => {
      try {
        const health = await adapter.health();
        return { name: adapter.name, status: health.status, message: health.message };
      } catch (error) {
        return { name: adapter.name, status: 'error', message: error.message };
      }
    });

    const statuses = await Promise.all(healthPromises);
    statuses.forEach(s => {
      results[s.name] = { status: s.status, message: s.message };
    });

    return results;
  }

  /**
   * Get registered adapters summary
   */
  getSummary() {
    return {
      total: this.adapters.size,
      full: this.fullAdapters.length,
      partial: this.partialAdapters.length,
      search: this.searchOnlyAdapters.length,
      adapters: {
        full: this.fullAdapters.map(a => a.name),
        partial: this.partialAdapters.map(a => a.name),
        search: this.searchOnlyAdapters.map(a => a.name)
      }
    };
  }

  /**
   * Get adapter by name
   */
  getAdapter(name) {
    return this.adapters.get(name);
  }

  /**
   * List all registered adapters
   */
  listAdapters() {
    return Array.from(this.adapters.values()).map(a => ({
      name: a.name,
      capabilities: a.getCapabilities()
    }));
  }
}

// Global registry instance
export const registry = new AdapterRegistry();
