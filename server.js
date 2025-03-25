
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Configuración de Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_super_seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (!req.session.experto) {
        return res.redirect('/login');
    }
    next();
}

// ================= RUTAS PÚBLICAS =================

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta de login (GET)
app.get('/login', (req, res) => {
    if (req.session.experto) {
        return res.redirect('/experto');
    }
    res.render('login', { error: null });
});

// Ruta de login (POST) - Versión corregida
app.post('/login', async (req, res) => {
    const { correo, password } = req.body;

    try {
        // 1. Primero verificar las credenciales en la tabla Usuarios
        const usuarioResult = await pool.query(
            'SELECT * FROM usuarios WHERE nombre_usuario = $1 AND tipo_usuario = $2',
            [correo, 'Experto']
        );

        if (usuarioResult.rows.length === 0) {
            return res.render('login', { 
                error: 'Credenciales incorrectas o no tienes permisos' 
            });
        }

        const usuario = usuarioResult.rows[0];
        const validPassword = await bcrypt.compare(password, usuario.contraseña_hash);

        if (!validPassword) {
            return res.render('login', { 
                error: 'Credenciales incorrectas' 
            });
        }

        // 2. Si las credenciales son válidas, obtener datos del experto
        const expertoResult = await pool.query(
            'SELECT * FROM expertos WHERE correo = $1', 
            [correo]
        );

        if (expertoResult.rows.length === 0) {
            return res.render('login', { 
                error: 'No se encontró el perfil de experto' 
            });
        }

        const experto = expertoResult.rows[0];

        // Crear sesión
        req.session.experto = {
            id: experto.id_experto,
            nombre: experto.nombre_completo,
            correo: experto.correo,
            tipo: 'Experto'
        };

        res.redirect('/experto');
    } catch (error) {
        console.error('Error en login:', error);
        res.render('login', { 
            error: 'Ocurrió un error al iniciar sesión' 
        });
    }
});

// Ruta de logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
        }
        res.redirect('/');
    });
});

// ================= RUTAS PROTEGIDAS =================

// Dashboard para expertos
app.get('/experto', requireAuth, async (req, res) => {
    try {
        const arboles = await pool.query(`
            SELECT a.id_arbol, e.nombre AS especie, 
                   z.alcaldia || ', ' || z.colonia AS ubicacion,
                   a.estado_follaje, a.ultima_inspeccion,
                   a.fotografia
            FROM Arboles a
            JOIN Especies e ON a.id_especie = e.id_especie
            JOIN Zonas z ON a.id_zona = z.id_zona
            WHERE a.id_experto = $1
            ORDER BY a.ultima_inspeccion DESC;
        `, [req.session.experto.id]);

        res.render('experto/dashboard', {
            experto: req.session.experto,
            arboles: arboles.rows
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error al cargar el dashboard');
    }
});

// Ruta para gestión de árboles
app.get('/arbol', requireAuth, async (req, res) => {
    try {
        const arboles = await pool.query(`
            SELECT a.id_arbol, e.nombre AS nombre_especie, 
                   z.alcaldia || ', ' || z.colonia AS ubicacion,
                   a.estado_follaje, a.ultima_inspeccion
            FROM Arboles a
            JOIN Especies e ON a.id_especie = e.id_especie
            JOIN Zonas z ON a.id_zona = z.id_zona
            ORDER BY a.id_arbol ASC;
        `);

        const especies = await pool.query('SELECT * FROM Especies ORDER BY nombre ASC');
        const subespecies = await pool.query('SELECT * FROM Subespecies ORDER BY nombre ASC');
        const zonas = await pool.query('SELECT * FROM Zonas ORDER BY alcaldia, colonia');
        const expertos = await pool.query('SELECT * FROM Expertos ORDER BY nombre_completo ASC');

        res.render('arbol', {
            experto: req.session.experto,
            arboles: arboles.rows,
            especies: especies.rows,
            subespecies: subespecies.rows,
            zonas: zonas.rows,
            expertos: expertos.rows
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error al obtener datos');
    }
});


// Ruta para eliminar árbol
app.post('/eliminar', requireAuth, async (req, res) => {
    const { id_arbol } = req.body;
    try {
        await pool.query('DELETE FROM Arboles WHERE id_arbol = $1', [id_arbol]);
        res.redirect('/arbol');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error al eliminar árbol');
    }
});

// Ruta para actualizar árbol
app.post('/actualizar', requireAuth, async (req, res) => {
    const { id_arbol, grosor_tronco, altura, angulo_inclinacion } = req.body;
    try {
        await pool.query(
            `UPDATE Arboles 
             SET grosor_tronco = $1, altura = $2, angulo_inclinacion = $3 
             WHERE id_arbol = $4`,
            [grosor_tronco, altura, angulo_inclinacion, id_arbol]
        );
        res.redirect('/arbol');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error al actualizar árbol');
    }
});

// ================= INICIAR SERVIDOR =================
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});