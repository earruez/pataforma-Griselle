import multer from 'multer';

/**
 * Upload Middleware
 * Configura multer para manejo de uploads de archivos
 */

// Usar memoria para almacenar archivos temporalmente en RAM
// Luego se uploadean a S3 desde FileStorageService
const storage = multer.memoryStorage();

// Configurar filtro de archivos
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Extensiones permitidas
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
  const filename = file.originalname.toLowerCase();
  const ext = filename.substring(filename.lastIndexOf('.'));

  if (!allowedExtensions.includes(ext)) {
    cb(new Error('Invalid file type. Allowed: jpg, jpeg, png, gif, pdf'));
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
});
