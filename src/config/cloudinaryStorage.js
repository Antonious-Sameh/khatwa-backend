// src/config/cloudinaryStorage.js
// Custom Multer storage engine for Cloudinary v2.
// Replaces multer-storage-cloudinary (which only supports v1).
// Streams file buffer directly to Cloudinary — no disk write, no temp files.

const { Readable } = require('stream');
const cloudinary   = require('cloudinary').v2;
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = require('./env');

// ── Init Cloudinary once ──────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key:    CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ── Helper: buffer → readable stream ─────────────────────────────────────────
const bufferToStream = (buffer) => {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
};

// ── CloudinaryStorageEngine factory ──────────────────────────────────────────
// params: { folder, allowed_formats, resource_type, transformation }
// params can also be a function (req, file) => options
function CloudinaryStorageEngine(options = {}) {
  this._options = options;
}

CloudinaryStorageEngine.prototype._handleFile = function (req, file, cb) {
  // Resolve params — support static object or function
  const params =
    typeof this._options.params === 'function'
      ? this._options.params(req, file)
      : this._options.params || {};

  const uploadOptions = {
    folder:          params.folder          || 'khatwa-plus/uploads',
    resource_type:   params.resource_type   || 'auto',
    allowed_formats: params.allowed_formats || undefined,
    transformation:  params.transformation  || undefined,
    use_filename:    false,
    unique_filename: true,
  };

  // Remove undefined keys so Cloudinary doesn't complain
  Object.keys(uploadOptions).forEach(k => {
    if (uploadOptions[k] === undefined) delete uploadOptions[k];
  });

  // Stream file directly from multer memory buffer to Cloudinary
  const uploadStream = cloudinary.uploader.upload_stream(
    uploadOptions,
    (error, result) => {
      if (error) return cb(error);
      cb(null, {
        fieldname:    file.fieldname,
        originalname: file.originalname,
        encoding:     file.encoding,
        mimetype:     file.mimetype,
        path:         result.secure_url,   // used as file.path (standard multer field)
        size:         result.bytes,
        filename:     result.public_id,
        cloudinary:   result,              // full Cloudinary response
      });
    }
  );

  // Pipe incoming file stream → Cloudinary upload stream
  file.stream.pipe(uploadStream);
};

CloudinaryStorageEngine.prototype._removeFile = function (req, file, cb) {
  if (file.filename) {
    cloudinary.uploader.destroy(file.filename, (err) => cb(err));
  } else {
    cb(null);
  }
};

module.exports = { CloudinaryStorageEngine, cloudinary };