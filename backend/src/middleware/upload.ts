/**
 * File Upload Middleware
 *
 * Multer configuration for handling file uploads.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure temp upload directory exists
const tempDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// Allowed file types
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  // Text files
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  // Other common formats
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
];

// Audio file types (for voice notes and transcription)
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
];

// File filter
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Allowed: PDF, images, Word, Excel, CSV, TXT, MD, ZIP`));
  }
};

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // Max 10 files per request
  },
});

// Single file upload
export const uploadSingle = upload.single('file');

// Multiple files upload (up to 10)
export const uploadMultiple = upload.array('files', 10);

// Fields for different document types
export const uploadFields = upload.fields([
  { name: 'contract', maxCount: 5 },
  { name: 'photo', maxCount: 20 },
  { name: 'inspection', maxCount: 5 },
  { name: 'appraisal', maxCount: 5 },
  { name: 'disclosure', maxCount: 5 },
  { name: 'other', maxCount: 10 },
]);

// Audio file filter
const audioFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check both by mimetype and file extension
  const isAudioMime = ALLOWED_AUDIO_TYPES.includes(file.mimetype);
  const isAudioExt = file.originalname.match(/\.(webm|mp3|mp4|m4a|wav|ogg|flac|aac)$/i);

  if (isAudioMime || isAudioExt) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed for audio. Allowed: webm, mp3, mp4, m4a, wav, ogg, flac, aac`));
  }
};

// Max audio file size: 25MB (Whisper limit)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

// Audio upload instance
export const audioUpload = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: MAX_AUDIO_SIZE,
    files: 1,
  },
});

// Single audio file upload
export const uploadAudio = audioUpload.single('audio');

export default upload;
