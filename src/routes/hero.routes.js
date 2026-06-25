const express = require('express');
const router  = express.Router();
const { getAlbums, getAlbum, createAlbum, updateAlbum, deleteAlbum, addPhotos, deletePhoto, updatePhoto } =
  require('../controllers/hero.controller');
const { protect, isTeacher } = require('../middleware/auth.middleware');
const { uploadHero }         = require('../config/multer');

// Public
router.get('/',    getAlbums);
router.get('/:id', getAlbum);

// Teacher only
router.post('/',   protect, isTeacher, createAlbum);
router.put('/:id', protect, isTeacher, updateAlbum);
router.delete('/:id', protect, isTeacher, deleteAlbum);

// Photos
router.post('/:id/photos', protect, isTeacher, uploadHero.array('photos', 20), addPhotos);
router.patch('/:albumId/photos/:photoId', protect, isTeacher, updatePhoto);
router.delete('/:albumId/photos/:photoId', protect, isTeacher, deletePhoto);

module.exports = router;