import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import cloudinary from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cloudinary configuration
const cloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
if (!cloudinaryConfigured) {
  console.warn('[Config] WARNING: Cloudinary credentials not found in .env. Uploads will fail.');
  console.warn('[Config] Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'missing',
  api_key: process.env.CLOUDINARY_API_KEY || 'missing',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'missing',
});

// Multer + Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary.v2,
  params: {
    folder: 'livestream',
    resource_type: 'auto',
  },
});
const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// --- Stream Management ---
// Track multiple streams: Map<streamKey, { process, videoURL, status, startedAt, stoppedAt, exitCode }>
const activeStreams = new Map();

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidStreamKey(str) {
  return /^[a-zA-Z0-9\-_]{8,100}$/.test(str);
}

// --- Stream Cleanup ---
// Remove streams that exited more than 10 minutes ago
function cleanupOldStreams() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, stream] of activeStreams) {
    if (stream.status !== 'running' && stream.stoppedAt && stream.stoppedAt.getTime() < tenMinutesAgo) {
      activeStreams.delete(key);
    }
  }
}
setInterval(cleanupOldStreams, 5 * 60 * 1000);

// --- API Routes ---

app.post('/api/stream/start', (req, res) => {
  const { videoURL, StreamKey, AppStreamKey, loop } = req.body;

  // Validate AppStreamKey
  if (AppStreamKey !== process.env.AppStreamKey) {
    return res.status(400).json({ error: 'Invalid App Stream Key' });
  }

  // Validate videoURL
  if (!videoURL || !isValidUrl(videoURL)) {
    return res.status(400).json({ error: 'Invalid video URL. Must be a valid http/https URL.' });
  }

  // Validate StreamKey
  if (!StreamKey || !isValidStreamKey(StreamKey)) {
    return res.status(400).json({ error: 'Invalid Stream Key. Must be 8-100 characters (alphanumeric, hyphens, underscores).' });
  }

  // Check if this stream key is already active
  if (activeStreams.has(StreamKey)) {
    return res.status(400).json({ error: 'A stream with this key is already running. Stop it first.' });
  }

  // Build FFmpeg command
  const command = [
    '-re',
    '-stream_loop',
    loop === 'yes' ? -1 : 0,
    '-i',
    videoURL,
    '-f',
    'flv',
    `rtmp://a.rtmp.youtube.com/live2/${StreamKey}`,
  ];

  console.log(`[Stream] Starting stream for key: ${StreamKey}`);
  console.log(`[Stream] Loop: ${loop === 'yes' ? 'enabled' : 'disabled'}`);
  console.log(`[Stream] Video URL: ${videoURL}`);

  const ffmpegProcess = spawn('ffmpeg', command);

  let stderrOutput = '';

  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`[Stream ${StreamKey}] stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    stderrOutput += data.toString();
    console.error(`[Stream ${StreamKey}] stderr: ${data}`);
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[Stream ${StreamKey}] FFmpeg error: ${err.message}`);
    const stream = activeStreams.get(StreamKey);
    if (stream && stream.status === 'running') {
      stream.status = 'error';
      stream.stoppedAt = new Date();
      stream.errorMessage = err.message;
    }
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`[Stream ${StreamKey}] FFmpeg exited with code ${code}`);
    const stream = activeStreams.get(StreamKey);
    if (stream && stream.status === 'running') {
      stream.status = code === 0 ? 'finished' : 'error';
      stream.stoppedAt = new Date();
      stream.exitCode = code;
    }
  });

  activeStreams.set(StreamKey, {
    process: ffmpegProcess,
    videoURL,
    status: 'running',
    startedAt: new Date(),
    stoppedAt: null,
    exitCode: null,
    errorMessage: null,
  });

  res.redirect('/pages/stream');
});

app.post('/api/stream/stop', (req, res) => {
  const { AppStreamKey, StreamKey } = req.body;

  // Validate AppStreamKey
  if (AppStreamKey !== process.env.AppStreamKey) {
    return res.status(400).json({ error: 'Invalid App Stream Key' });
  }

  // If StreamKey is provided, stop specific stream
  if (StreamKey) {
    const stream = activeStreams.get(StreamKey);
    if (!stream || stream.status !== 'running') {
      return res.status(400).json({ error: `No active stream found with key: ${StreamKey}` });
    }
    stream.process.kill('SIGTERM');
    stream.status = 'stopped';
    stream.stoppedAt = new Date();
    console.log(`[Stream] Stopped stream: ${StreamKey}`);
    return res.redirect('/pages/stream');
  }

  // Stop all streams
  const runningStreams = [...activeStreams.entries()].filter(([, s]) => s.status === 'running');
  if (runningStreams.length === 0) {
    return res.status(400).json({ error: 'No active streams to stop.' });
  }

  for (const [key, stream] of runningStreams) {
    stream.process.kill('SIGTERM');
    stream.status = 'stopped';
    stream.stoppedAt = new Date();
    console.log(`[Stream] Stopped stream: ${key}`);
  }

  res.redirect('/pages/stream');
});

// Remove a stopped/finished stream from the list
app.post('/api/stream/remove', (req, res) => {
  const { AppStreamKey, StreamKey } = req.body;

  if (AppStreamKey !== process.env.AppStreamKey) {
    return res.status(400).json({ error: 'Invalid App Stream Key' });
  }

  if (!StreamKey || !activeStreams.has(StreamKey)) {
    return res.status(400).json({ error: 'Stream not found.' });
  }

  activeStreams.delete(StreamKey);
  console.log(`[Stream] Removed stream from list: ${StreamKey}`);
  res.redirect('/pages/stream');
});

// --- Pages ---

app.get('/', (_, res) => {
  res.send('LiveStream Server is running');
});

app.get('/pages/upload', (_, res) => {
  res.render('Upload');
});

app.get('/pages/stream', (_, res) => {
  cleanupOldStreams();
  const streams = [];
  for (const [key, stream] of activeStreams) {
    streams.push({
      key,
      videoURL: stream.videoURL,
      status: stream.status,
      startedAt: stream.startedAt,
      stoppedAt: stream.stoppedAt,
      exitCode: stream.exitCode,
      errorMessage: stream.errorMessage,
    });
  }
  const runningCount = streams.filter(s => s.status === 'running').length;
  res.render('Home', { streams, runningCount, totalCount: streams.length });
});

// --- Video Metadata Persistence ---
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');

function loadVideos() {
  try {
    if (!fs.existsSync(VIDEOS_FILE)) {
      fs.writeFileSync(VIDEOS_FILE, '[]', 'utf-8');
    }
    const raw = fs.readFileSync(VIDEOS_FILE, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupted JSON, reset file
      fs.writeFileSync(VIDEOS_FILE, '[]', 'utf-8');
      return [];
    }
  } catch {
    return [];
  }
}

function saveVideos(videos) {
  fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videos, null, 2), 'utf-8');
}

// --- Upload API (Cloudinary) ---

app.get('/api/videos', (_, res) => {
  const videos = loadVideos();
  res.json(videos);
});

app.post('/api/upload', (req, res, next) => {
  if (!cloudinaryConfigured) {
    return res.status(500).json({ error: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.' });
  }

  upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'thumbnailFile', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      console.error('[Upload] Error:', err.message);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(500).json({ error: err.message || 'Upload failed' });
    }

    const { videoTitle } = req.body;

    if (!videoTitle || videoTitle.trim().length === 0) {
      return res.status(400).json({ error: 'Video title is required.' });
    }

    if (!req.files || !req.files.videoFile) {
      return res.status(400).json({ error: 'Video file is required.' });
    }

    try {
      const videoURL = req.files.videoFile[0].path;
      const thumbnailURL = req.files.thumbnailFile && req.files.thumbnailFile[0]
        ? req.files.thumbnailFile[0].path
        : null;

      const videoData = {
        title: videoTitle.trim(),
        videoURL,
        thumbnailURL,
        createdAt: new Date().toISOString(),
      };

      const videos = loadVideos();
      videos.push(videoData);
      saveVideos(videos);

      res.json({
        success: true,
        message: 'Upload successful',
        data: videoData,
      });
    } catch (err) {
      console.error('[Upload] Processing error:', err.message);
      return res.status(500).json({ error: 'Failed to process upload: ' + err.message });
    }
  });
});

// --- Global Error Handling ---

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
