// Creative media moves to Vercel Blob (private store). The row keeps the blob
// key and type; image_data stays only for older rows and local development.
export default `
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS media_key text;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS media_type text;
UPDATE creatives SET media_type = substring(image_data FROM 6 FOR position(';' IN image_data) - 6)
  WHERE image_data LIKE 'data:%;base64,%' AND media_type IS NULL;
`;
