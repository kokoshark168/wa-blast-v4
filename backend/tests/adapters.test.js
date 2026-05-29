/**
 * Adapter Tests - Mocked API calls
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { DramaBoxAdapter } from '../adapters/full/DramaBoxAdapter.js';
import { ShortMaxAdapter } from '../adapters/full/ShortMaxAdapter.js';
import { AdapterRegistry } from '../adapters/registry.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Adapter Search (Mocked)', () => {
  beforeAll(() => {
    fetch.mockClear();
  });

  it('should search dramas with DramaBox adapter', async () => {
    const mockResponse = {
      data: [
        {
          id: '1',
          title: 'Test Drama 1',
          poster_url: 'http://test.jpg',
          year: 2024,
          episodes_count: 16,
          rating: 8.5,
          synopsis: 'Test synopsis'
        }
      ]
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const adapter = new DramaBoxAdapter();
    const results = await adapter.search('test');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Drama 1');
    expect(results[0].year).toBe(2024);
    expect(fetch).toHaveBeenCalled();
  });

  it('should search dramas with ShortMax adapter', async () => {
    const mockResponse = {
      results: [
        {
          content_id: '2',
          content_title: 'Short Drama',
          thumbnail_url: 'http://test2.jpg',
          release_year: 2023,
          episode_count: 12,
          imdb_rating: 7.8
        }
      ]
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const adapter = new ShortMaxAdapter();
    const results = await adapter.search('short');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Short Drama');
    expect(fetch).toHaveBeenCalled();
  });

  it('should return empty array on network error', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const adapter = new DramaBoxAdapter();
    const results = await adapter.search('test');

    expect(results).toEqual([]);
  });

  it('should retry on failure', async () => {
    fetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      });

    const adapter = new DramaBoxAdapter({ retryAttempts: 2 });
    const results = await adapter.search('test');

    expect(results).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2); // One fail, one retry
  });
});

describe('Adapter Registry', () => {
  beforeAll(() => {
    fetch.mockClear();
  });

  it('should search across multiple adapters', async () => {
    const registry = new AdapterRegistry();

    // Mock both adapters
    fetch.mockClear();
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '1', title: 'Drama A', poster_url: '', year: 2024, episodes_count: 16 }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ content_id: '2', content_title: 'Drama B', thumbnail_url: '', release_year: 2023, episode_count: 12 }]
        })
      });

    const adapter1 = new DramaBoxAdapter();
    const adapter2 = new ShortMaxAdapter();

    registry.register(adapter1, 'full');
    registry.register(adapter2, 'full');

    const results = await registry.searchAll('drama');

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should deduplicate results by title', async () => {
    const registry = new AdapterRegistry();

    fetch.mockClear();
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '1', title: 'Same Drama', poster_url: '', year: 2024, episodes_count: 16 }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ content_id: '2', content_title: 'Same Drama', thumbnail_url: '', release_year: 2024, episode_count: 16 }]
        })
      });

    const adapter1 = new DramaBoxAdapter();
    const adapter2 = new ShortMaxAdapter();

    registry.register(adapter1, 'full');
    registry.register(adapter2, 'full');

    const results = await registry.searchAll('drama');

    // Should have deduplicated
    const titles = results.map(r => r.title.toLowerCase());
    const unique = new Set(titles);
    expect(unique.size).toEqual(results.length);
  });
});

describe('Adapter Health Checks (Mocked)', () => {
  beforeAll(() => {
    fetch.mockClear();
  });

  it('should report healthy status', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' })
    });

    const adapter = new DramaBoxAdapter();
    const health = await adapter.health();

    expect(health.status).toBe('ok');
  });

  it('should report error on health check failure', async () => {
    fetch.mockRejectedValueOnce(new Error('Service unavailable'));

    const adapter = new DramaBoxAdapter();
    const health = await adapter.health();

    expect(health.status).toBe('error');
    expect(health.message).toBeDefined();
  });

  it('should perform parallel health checks', async () => {
    const registry = new AdapterRegistry();

    fetch.mockClear();
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ operational: true }) });

    const adapter1 = new DramaBoxAdapter();
    const adapter2 = new ShortMaxAdapter();

    registry.register(adapter1, 'full');
    registry.register(adapter2, 'full');

    const health = await registry.healthCheck();

    expect(Object.keys(health).length).toBeGreaterThan(0);
  });
});

describe('Episode Fetching (Mocked)', () => {
  beforeAll(() => {
    fetch.mockClear();
  });

  it('should fetch and normalize episodes', async () => {
    const mockResponse = {
      episodes: [
        { number: 1, title: 'Ep 1', video_url: 'http://ep1.mp4', duration: 3600, quality: '720p' },
        { number: 2, title: 'Ep 2', video_url: 'http://ep2.mp4', duration: 3600, quality: '720p' }
      ]
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const adapter = new DramaBoxAdapter();
    const episodes = await adapter.getEpisodes('drama-1', 1);

    expect(episodes).toHaveLength(2);
    expect(episodes[0].episode_number).toBe(1);
    expect(episodes[0].url).toBe('http://ep1.mp4');
    expect(episodes[1].duration_seconds).toBe(3600);
  });

  it('should return empty array if no episodes', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ episodes: null })
    });

    const adapter = new DramaBoxAdapter();
    const episodes = await adapter.getEpisodes('drama-1', 1);

    expect(episodes).toEqual([]);
  });
});
