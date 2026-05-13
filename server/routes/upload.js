const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Allowed MIME types
const ALLOWED_TYPES = {
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/midi', 'audio/x-midi', 'audio/x-mod'],
  video: ['video/mp4', 'video/webm', 'video/mpeg'],
};

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'midi', 'mid',
  'mod', 'xm', 's3m', 'it',
  'mp4', 'webm', 'mpeg',
]);

const MAX_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '100', 10);
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// Upload directory
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const safe = `${uuidv4()}.${ext}`;
    cb(null, safe);
  },
});

// File filter
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase().slice(1);

  // Extension check
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File type .${ext} not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
  }

  // MIME check
  const isAudio = ALLOWED_TYPES.audio.includes(file.mimetype);
  const isVideo = ALLOWED_TYPES.video.includes(file.mimetype);

  // For extensions we trust more
  const extAudio = ['mp3', 'wav', 'ogg', 'midi', 'mid', 'mod', 'xm', 's3m', 'it'];
  const extVideo = ['mp4', 'webm', 'mpeg'];

  if (extAudio.includes(ext)) {
    return cb(null, true);
  }
  if (extVideo.includes(ext)) {
    return cb(null, true);
  }

  if (!isAudio && !isVideo) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

// POST /api/upload
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase().slice(1);

  const audioExts = ['mp3', 'wav', 'ogg', 'midi', 'mid', 'mod', 'xm', 's3m', 'it'];
  const videoExts = ['mp4', 'webm', 'mpeg'];

  const mediaType = audioExts.includes(ext) ? 'audio' : 'video';

  // Serve URL (in production this would be behind a CDN)
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const url = `${baseUrl}/uploads/${file.filename}`;

  res.json({
    url,
    filename: file.originalname,
    format: ext.toUpperCase(),
    mediaType,
    size: file.size,
    path: file.path,
  });
});

// Error handling middleware for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max size is ${MAX_SIZE_MB}MB.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
