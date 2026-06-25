const HeroAlbum  = require('../models/HeroAlbum');
const { cloudinary, uploadHero } = require('../config/multer');
const { success, created, notFound, error: apiError } = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/error.middleware');

// ── Helper: delete from Cloudinary ───────────────────────────────────────────
const destroyCloudinary = async (url) => {
  if (!url) return;
  try {
    const parts  = url.split('/');
    const file   = parts[parts.length - 1].split('.')[0];
    const folder = parts[parts.length - 2];
    await cloudinary.uploader.destroy(`${folder}/${file}`);
  } catch {}
};

// ── GET /api/heroes ── list albums ───────────────────────────────────────────
const getAlbums = asyncHandler(async (req, res) => {
  const albums = await HeroAlbum.find()
    .select('title description coverUrl order photos createdAt')
    .sort({ order: 1, createdAt: -1 }).lean();
  // Attach photo count
  albums.forEach(a => { a.photoCount = a.photos?.length || 0; });
  return success(res, { albums, total: albums.length });
});

// ── GET /api/heroes/:id ── single album with photos ──────────────────────────
const getAlbum = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.id).lean();
  if (!album) return notFound(res, 'الألبوم غير موجود');
  return success(res, { album });
});

// ── POST /api/heroes ── create album ─────────────────────────────────────────
const createAlbum = asyncHandler(async (req, res) => {
  const { title, description, order } = req.body;
  if (!title?.trim()) return apiError(res, 'اسم الألبوم مطلوب', 400);
  const album = await HeroAlbum.create({
    title: title.trim(),
    description: description?.trim() || null,
    order: order ? Number(order) : 0,
  });
  return created(res, { album }, 'تم إنشاء الألبوم بنجاح');
});

// ── PUT /api/heroes/:id ── update album info ──────────────────────────────────
const updateAlbum = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.id);
  if (!album) return notFound(res, 'الألبوم غير موجود');
  const { title, description, order } = req.body;
  if (title       !== undefined) album.title       = title.trim();
  if (description !== undefined) album.description = description?.trim() || null;
  if (order       !== undefined) album.order       = Number(order);
  await album.save();
  return success(res, { album }, 'تم تعديل الألبوم بنجاح');
});

// ── DELETE /api/heroes/:id ── delete album + all photos ──────────────────────
const deleteAlbum = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.id);
  if (!album) return notFound(res, 'الألبوم غير موجود');
  await Promise.allSettled([
    ...album.photos.map(p => destroyCloudinary(p.url)),
    destroyCloudinary(album.coverUrl),
  ]);
  await album.deleteOne();
  return success(res, {}, 'تم حذف الألبوم والصور بنجاح');
});

// ── POST /api/heroes/:id/photos ── upload multiple photos ────────────────────
const addPhotos = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.id);
  if (!album) return notFound(res, 'الألبوم غير موجود');
  if (!req.files?.length) return apiError(res, 'لم يتم رفع أي صور', 400);

  const captions = req.body.captions
    ? (Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions])
    : [];

  const newPhotos = req.files.map((f, i) => ({
    url:     f.path,
    caption: captions[i]?.trim() || null,
    order:   album.photos.length + i,
  }));

  album.photos.push(...newPhotos);
  // Set first photo as cover if no cover yet
  if (!album.coverUrl && newPhotos.length) album.coverUrl = newPhotos[0].url;
  await album.save();

  return success(res, { photos: newPhotos, album }, 'تم رفع الصور بنجاح');
});

// ── DELETE /api/heroes/:albumId/photos/:photoId ───────────────────────────────
const deletePhoto = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.albumId);
  if (!album) return notFound(res, 'الألبوم غير موجود');
  const photo = album.photos.id(req.params.photoId);
  if (!photo) return notFound(res, 'الصورة غير موجودة');

  await destroyCloudinary(photo.url);
  // If deleted photo was cover, reset cover to next photo
  if (album.coverUrl === photo.url) {
    const remaining = album.photos.filter(p => p._id.toString() !== req.params.photoId);
    album.coverUrl  = remaining[0]?.url || null;
  }
  photo.deleteOne();
  await album.save();
  return success(res, {}, 'تم حذف الصورة بنجاح');
});

// ── PATCH /api/heroes/:albumId/photos/:photoId ── update caption ──────────────
const updatePhoto = asyncHandler(async (req, res) => {
  const album = await HeroAlbum.findById(req.params.albumId);
  if (!album) return notFound(res, 'الألبوم غير موجود');
  const photo = album.photos.id(req.params.photoId);
  if (!photo) return notFound(res, 'الصورة غير موجودة');
  if (req.body.caption !== undefined) photo.caption = req.body.caption?.trim() || null;
  if (req.body.setAsCover) album.coverUrl = photo.url;
  await album.save();
  return success(res, { photo }, 'تم التعديل بنجاح');
});

module.exports = { getAlbums, getAlbum, createAlbum, updateAlbum, deleteAlbum, addPhotos, deletePhoto, updatePhoto };