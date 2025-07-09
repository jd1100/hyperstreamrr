// src/utils.js
export function getFileType(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'application/octet-stream';
  }
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    mkv: 'video/x-matroska',
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    pdf: 'application/pdf',
    zip: 'application/zip',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json'
  };
  return types[ext] || 'application/octet-stream';
}
