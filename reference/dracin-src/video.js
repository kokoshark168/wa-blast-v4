import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { getEpisodes } from './api.js';

const PARALLEL = 16;
const TMP = '/tmp/dracin-video';

/**
 * Check if a URL is an HLS (M3U8) playlist by Content-Type header
 */
function isM3U8(url) {
  try {
    const { headers } = require('http').request(url, { method: 'HEAD' });
    return false;
  } catch {
    // Fallback: head request via curl
    try {
      const r = execSync(`curl -sI "${url}"`, { timeout: 5000 }).toString();
      return r.toLowerCase().includes('mpegurl') || r.toLowerCase().includes('x-mpegurl');
    } catch {
      // Fallback 2: URL suffix
      return url.toLowerCase().includes('.m3u8');
    }
  }
}

/**
 * Download a single episode video and merge HLS if needed.
 * Returns { stream: ReadStream (for single ep), path: filepath (for full merge) }
 */
export async function streamEpisode(dramaId, episodeIndex, platform = "dramabox") {
  // Get episode video URL from API
  const { getEpisodes, getDramaDetail } = await import('./api.js');
  const detail = await getDramaDetail(dramaId, platform);
  const episodes = await getEpisodes(dramaId, platform);
  if (!episodes || episodeIndex >= episodes.length) throw new Error('Episode not found');
  
  const ep = episodes[episodeIndex];
  const videoUrl = ep.videoUrl || ep.playVoucher || ep.mediaUrl;
  const title = (detail?.bookName || detail?.title || 'Drama').replace(/[/\\?%*:|"<>]/g, '_') + `_Ep${episodeIndex + 1}`;
  
  if (!videoUrl) throw new Error('No video URL for this episode');
  
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

  // Check if HLS
  let isHls = false;
  try {
    const head = await axios.head(videoUrl, { timeout: 5000, maxRedirects: 5 });
    const ct = (head.headers['content-type'] || '').toLowerCase();
    isHls = ct.includes('mpegurl') || ct.includes('x-mpegurl');
  } catch {
    isHls = videoUrl.endsWith('.m3u8');
  }

  if (!isHls) {
    // Direct MP4 — stream from URL
    return {
      stream: videoUrl,
      title: `${title}_Ep${episodeIndex + 1}.mp4`,
      fileSize: 0,
      totalEpisodes: episodes.length,
    };
  }

  // HLS: download playlist + segments → ffmpeg merge → stream from disk
  const { data: m3u8 } = await axios.get(videoUrl, {
    responseType: 'text',
    timeout: 30000,
  });
  const segments = m3u8.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(l => l.trim());

  if (!segments.length) throw new Error('No TS segments');

  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const tmpDir = path.join(TMP, `${episodeIndex}_${Date.now()}`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const files = [];
  for (let i = 0; i < segments.length; i++) {
    const segPath = path.join(tmpDir, `seg_${String(i).padStart(5, '0')}.ts`);
    if (!fs.existsSync(segPath)) {
      const resp = await axios.get(segments[i], {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      fs.writeFileSync(segPath, Buffer.from(resp.data));
    }
    files.push(segPath);
  }

  const outName = `${title}_Ep${episodeIndex + 1}.mp4`.replace(/[/\\?%*:|"<>]/g, '_');
  const outPath = path.join(TMP, outName);
  const listPath = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(listPath, files.map(f => `file '${f}'`).join('\n'));
  execSync(`ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -bsf:v h264_metadata=sample_aspect_ratio=1/1 -y "${outPath}" 2>/dev/null`, {
    timeout: 120000,
  });
  try { fs.unlinkSync(listPath); } catch {}
  for (const f of files) try { fs.unlinkSync(f); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}

  return {
    stream: fs.createReadStream(outPath),
    title: outName,
    fileSize: fs.statSync(outPath).size,
    tmpPath: outPath,
    totalEpisodes: episodes.length,
  };
}

/**
 * Download ALL episodes for a drama, merge into 1 MP4, split into 3 parts.
 * Uses replyWithDocument (2GB limit), so 3-part ~200MB each works fine.
 */
export async function mergeAllEpisodes(bookId, onProgress, platform = 'dramabox') {
  const episodes = await getEpisodes(bookId, platform);
  if (!episodes || !episodes.length) throw new Error('No episodes found');

  // Get drama info for title
  const { getDramaDetail } = await import('./api.js');
  const detail = await getDramaDetail(bookId, platform);
  const title = (detail?.bookName || detail?.title || 'Drama').replace(/[/\\?%*:|"<>]/g, '_');

  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const tmpDir = path.join(TMP, `full_${bookId}`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // Phase 1: Download all episodes in parallel (skip cached valid files)
  const total = episodes.length;
  let completed = 0;
  const files = new Array(total);

  const dlOne = async (i) => {
    try {
      const ep = episodes[i];
      const epPath = path.join(tmpDir, `ep_${String(i).padStart(3, '0')}.mp4`);
      if (fs.existsSync(epPath) && fs.statSync(epPath).size > 100000) { files[i] = epPath; completed++; return; }
      if (fs.existsSync(epPath)) try { fs.unlinkSync(epPath); } catch {}

      const videoUrl = ep.videoUrl || ep.playVoucher || ep.mediaUrl;
      if (!videoUrl) { completed++; return; }

      const tmpEpPath = path.join(tmpDir, `ep_${String(i).padStart(3, '0')}.tmp.mp4`);

      // Download HLS playlist → TS segments → ffmpeg merge (all DramaBox content is HLS)
      try {
        const { data: m3u8 } = await axios.get(videoUrl, { responseType: 'text', timeout: 30000 });
        const segs = m3u8.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.trim());
        if (segs.length) {
          const segDir = path.join(tmpDir, `hls_${i}`);
          if (!fs.existsSync(segDir)) fs.mkdirSync(segDir, { recursive: true });
          const segPaths = [];
          for (let s = 0; s < segs.length; s++) {
            const sp = path.join(segDir, `s${String(s).padStart(3, '0')}.ts`);
            if (!fs.existsSync(sp)) {
              try {
                const resp = await axios.get(segs[s], { responseType: 'arraybuffer', timeout: 30000 });
                fs.writeFileSync(sp, Buffer.from(resp.data));
              } catch { /* skip broken TS segment */ }
            }
            if (fs.existsSync(sp) && fs.statSync(sp).size > 0) segPaths.push(sp);
          }
          if (segPaths.length) {
            const listPath = path.join(segDir, 'list.txt');
            fs.writeFileSync(listPath, segPaths.map(f => `file '${f}'`).join('\n'));
            execSync(`ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -y "${tmpEpPath}" 2>/dev/null`, { timeout: 60000 });
            try { fs.unlinkSync(listPath); } catch {}
          }
          for (const f of segPaths) try { fs.unlinkSync(f); } catch {}
          try { fs.rmdirSync(segDir); } catch {}
        }
      } catch { /* HLS episode failed, skip */ }

      if (fs.existsSync(tmpEpPath) && fs.statSync(tmpEpPath).size > 100000) {
        fs.renameSync(tmpEpPath, epPath);
        files[i] = epPath;
      } else {
        try { fs.unlinkSync(tmpEpPath); } catch {}
      }
    } catch { /* Skip failed episode */ }
    finally { completed++; }
  };

  // Parallel download in batches
  if (onProgress) onProgress('download', 0, total);
  for (let batch = 0; batch < Math.ceil(total / PARALLEL); batch++) {
    const start = batch * PARALLEL;
    const end = Math.min(start + PARALLEL, total);
    await Promise.all(episodes.slice(start, end).map((_, j) => dlOne(start + j)));
    if (onProgress) onProgress('download', Math.min(end, total), total);
  }

  const validFiles = files.filter(Boolean).filter(f => {
    try { return fs.statSync(f).size > 100000; } catch { return false; }
  });
  if (!validFiles.length) throw new Error('No valid episodes downloaded');

  // Phase 2: Concat all episodes with ffmpeg
  if (onProgress) onProgress('merge', 0, total);
  const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
  const rawPath = path.join(TMP, `${safeTitle}_FULL_raw.mp4`);
  const listPath = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(listPath, validFiles.map(f => `file '${f}'`).join('\n'));
  // Force square pixels (SAR 1:1) so the muxed file always reports the true 9:16
  // display ratio. Episodes occasionally carry stale/anamorphic SAR metadata which,
  // copied through concat, makes some players stretch the video. h264_metadata is a
  // bitstream filter, so this stays a lossless copy (no re-encode).
  execSync(`ffmpeg -f concat -safe 0 -i "${listPath}" -c copy -bsf:v h264_metadata=sample_aspect_ratio=1/1 -y "${rawPath}" 2>/dev/null`, {
    timeout: 120000,
  });
  try { fs.unlinkSync(listPath); } catch {}

  // Phase 3: IDShortBot-style — always 3 parts, re-encode to fit 50MB
  const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${rawPath}"`, { timeout: 15000 })
      .toString().trim()
  ) || 1;
  const numParts = 3; // IDShortBot: always 3 parts
  const partSec = Math.ceil(duration / numParts);
  const BOT_LIMIT = 49 * 1024 * 1024; // 49MB (safe under 50MB)

  // Bitrate: target 48MB per part
  const targetBitrate = Math.floor((48 * 8 * 1024) / partSec) - 128; // kbps, minus audio
  const safeBr = Math.max(300, targetBitrate); // floor at 300kbps

  if (onProgress) onProgress('encode', 0, numParts);

  const results = [];
  for (let p = 0; p < numParts; p++) {
    const ss = p * partSec;
    const partPath = path.join(TMP, `${safeTitle}_Part${p + 1}.mp4`);

    try {
      execSync(
        `ffmpeg -fflags +discardcorrupt -err_detect ignore_err -ss ${ss} -i "${rawPath}" -t ${partSec} ` +
        `-vf "setsar=1" -c:v libx264 -b:v ${safeBr}k -maxrate ${safeBr + 100}k ` +
        `-bufsize ${safeBr * 2}k -preset ultrafast -c:a aac -b:a 96k ` +
        `-movflags +faststart -y "${partPath}" 2>/dev/null`,
        { timeout: 300000 }
      );
    } catch { /* validate below */ }

    const size = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;

    if (size > 100000) {
      results.push({
        path: partPath,
        title: `${title} — Part ${p + 1}/${numParts}`,
        fileSize: Math.min(size, BOT_LIMIT),
      });
    }

    if (onProgress) onProgress('encode', p + 1, numParts);
  }

  if (!results.length) throw new Error('All parts failed to encode');

  // Cleanup
  // Cleanup individual episode files, keep raw for download link
  for (const f of validFiles) try { fs.unlinkSync(f); } catch {}
  try { fs.rmdirSync(tmpDir); } catch {}

  return { parts: results, rawFile: rawPath };
}
