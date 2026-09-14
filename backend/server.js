const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // permite conectar con el frontend(react)
app.use(express.json());

// Configuración de multer para guardar archivos en una carpeta específica
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta donde se guardarán los archivos
  },
  filename: (req, file, cb) => {
    // Renombramos el archivo con la fecha actual para evitar que se sobrescriban
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Nombre único para cada archivo
  }
});

const upload = multer({ storage: storage });

// ruta post para recibir el documento desde react
app.post('/api/upload', upload.single('documento'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }
        console.log("Archivo subido:", req.file.filename);
        // Aqui harias el insert a tu base de datos postqresql
        res.status(200).json({
            mensaje: 'Archivo subido correctamente.',
            file: req.file.filename
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar el archivo.'});
    }
});

// iniciar servidor en el puerto 5000
app.listen(5000, () => {
    console.log('Servidor iniciado en http://localhost:5000');
});
