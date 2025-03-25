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

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Configuración de almacenamiento para imágenes con Multer
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
    secret: process.env.SESSION_SECRET || 'tu_secreto_super_seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // En producción debería ser true con HTTPS
}));

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/login');
    }
    next();
}

// 🔹 Ruta para login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { nombre_usuario, contraseña } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM Usuarios WHERE nombre_usuario = $1', 
            [nombre_usuario]
        );

        if (result.rows.length === 0) {
            return res.render('login', { 
                error: 'Usuario o contraseña incorrectos' 
            });
        }

        const usuario = result.rows[0];
        const validPassword = await bcrypt.compare(contraseña, usuario.contraseña_hash);

        if (!validPassword) {
            return res.render('login', { 
                error: 'Usuario o contraseña incorrectos' 
            });
        }

        req.session.usuario = {
            id: usuario.id_usuario,
            nombre: usuario.nombre_usuario,
            tipo: usuario.tipo_usuario
        };

        switch(usuario.tipo_usuario) {
            case 'Administrador':
                res.redirect('/admin');
                break;
            case 'Brigada':
                res.redirect('/brigada');
                break;
            case 'Experto':
                res.redirect('/experto');
                break;
            case 'Ciudadano':
                res.redirect('/ciudadano');
                break;
            default:
                res.redirect('/');
        }
    } catch (error) {
        console.error('Error en login:', error);
        res.render('login', { 
            error: 'Ocurrió un error al iniciar sesión' 
        });
    }
});

// 🔹 Ruta para logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
        }
        res.redirect('/login');
    });
});

// 🔹 Ruta principal (protegida)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔹 Ruta para árboles (protegida)
app.get('/arbol', requireAuth, async (req, res) => {
    try {
        const arboles = await pool.query(`
            SELECT a.id_arbol, e.nombre AS nombre_especie, s.nombre AS nombre_subespecie, 
                   z.alcaldia || ', ' || z.colonia AS nombre_zona, 
                   a.grosor_tronco, a.altura, a.angulo_inclinacion,
                   a.estado_raices, a.estado_follaje, a.ultima_inspeccion,
                   a.fotografia, a.observaciones, 
                   COALESCE(ex.nombre_completo, 'No asignado') AS nombre_experto
            FROM Arboles a
            JOIN Especies e ON a.id_especie = e.id_especie
            JOIN Subespecies s ON a.id_subespecie = s.id_subespecie
            JOIN Zonas z ON a.id_zona = z.id_zona
            LEFT JOIN Expertos ex ON a.id_experto = ex.id_experto
            ORDER BY a.id_arbol ASC;
        `);

        const especies = await pool.query('SELECT * FROM Especies ORDER BY nombre ASC');
        const subespecies = await pool.query('SELECT * FROM Subespecies ORDER BY nombre ASC');
        const zonas = await pool.query('SELECT * FROM Zonas ORDER BY alcaldia, colonia');
        const expertos = await pool.query('SELECT * FROM Expertos ORDER BY nombre_completo ASC');

        res.render('arbol', {
            arboles: arboles.rows,
            especies: especies.rows,
            subespecies: subespecies.rows,
            zonas: zonas.rows,
            expertos: expertos.rows
        });
    } catch (error) {
        console.error('Error obteniendo datos:', error);
        res.status(500).send('Error al obtener los datos');
    }
});

// 🔹 Ruta para agregar un árbol (protegida)
app.post('/agregar', requireAuth, upload.single('fotografia'), async (req, res) => {
    const {
        id_especie, id_subespecie, id_zona, grosor_tronco, altura, angulo_inclinacion,
        estado_raices, estado_follaje, ultima_inspeccion, observaciones, id_experto
    } = req.body;

    const fotografia = req.file ? `/uploads/${req.file.filename}` : null;

    if (grosor_tronco < 0 || altura < 0 || angulo_inclinacion < 0) {
        return res.status(400).send('Error: No se permiten valores negativos.');
    }

    try {
        await pool.query(
            `INSERT INTO Arboles (
                id_especie, id_subespecie, id_zona, grosor_tronco, altura, angulo_inclinacion,
                estado_raices, estado_follaje, ultima_inspeccion, fotografia, observaciones, id_experto
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [id_especie, id_subespecie, id_zona, grosor_tronco, altura, angulo_inclinacion,
            estado_raices, estado_follaje, ultima_inspeccion, fotografia, observaciones, id_experto]
        );
        res.redirect('/arbol');
    } catch (error) {
        console.error('Error agregando árbol:', error);
        res.status(500).send('Error al agregar árbol');
    }
});

// 🔹 Ruta para eliminar un árbol (protegida)
app.post('/eliminar', requireAuth, async (req, res) => {
    const { id_arbol } = req.body;
    try {
        await pool.query('DELETE FROM Arboles WHERE id_arbol = $1', [id_arbol]);
        res.redirect('/arbol');
    } catch (error) {
        console.error('Error eliminando árbol:', error);
        res.status(500).send('Error al eliminar árbol');
    }
});

// 🔹 Ruta para actualizar un árbol (protegida)
app.post('/actualizar', requireAuth, async (req, res) => {
    const { id_arbol, grosor_tronco, altura, angulo_inclinacion } = req.body;

    if (grosor_tronco < 0 || altura < 0 || angulo_inclinacion < 0) {
        return res.status(400).send('Error: No se permiten valores negativos.');
    }

    try {
        await pool.query(
            `UPDATE Arboles 
             SET grosor_tronco = $1, altura = $2, angulo_inclinacion = $3 
             WHERE id_arbol = $4`,
            [grosor_tronco, altura, angulo_inclinacion, id_arbol]
        );
        res.redirect('/arbol');
    } catch (error) {
        console.error('Error actualizando árbol:', error);
        res.status(500).send('Error al actualizar árbol');
    }
});

// 🔹 Ruta para reporte de plagas (protegida)
app.get('/plaga', requireAuth, async (req, res) => {
    try {
        const arboles = await pool.query(`
            SELECT a.id_arbol, e.nombre AS nombre_especie, 
                   z.alcaldia || ', ' || z.colonia AS nombre_zona
            FROM Arboles a
            JOIN Especies e ON a.id_especie = e.id_especie
            JOIN Zonas z ON a.id_zona = z.id_zona
            ORDER BY a.id_arbol ASC;
        `);

        const plagas = await pool.query('SELECT * FROM Plagas ORDER BY nombre ASC');
        const ciudadanos = await pool.query('SELECT * FROM Ciudadanos ORDER BY nombre_completo ASC');
        
        const reportesPlagas = await pool.query(`
            SELECT ap.id_registro, ap.id_arbol, e.nombre AS nombre_especie, 
                   p.nombre AS nombre_plaga, ap.fecha_detectada,
                   c.nombre_completo AS nombre_ciudadano
            FROM ArbolesPlagas ap
            JOIN Plagas p ON ap.id_plaga = p.id_plaga
            JOIN Arboles a ON ap.id_arbol = a.id_arbol
            JOIN Especies e ON a.id_especie = e.id_especie
            LEFT JOIN Tramites t ON t.id_arbol = ap.id_arbol AND t.tipo = 'Reporte de plaga'
            LEFT JOIN Ciudadanos c ON t.id_ciudadano = c.id_ciudadano
            ORDER BY ap.fecha_detectada DESC;
        `);

        res.render('plaga', {
            arboles: arboles.rows,
            plagas: plagas.rows,
            ciudadanos: ciudadanos.rows,
            reportesPlagas: reportesPlagas.rows
        });
    } catch (error) {
        console.error('Error obteniendo datos de plagas:', error);
        res.status(500).send('Error al obtener los datos de plagas');
    }
});

// 🔹 Ruta para reportar una plaga (protegida)
app.post('/reportar-plaga', requireAuth, upload.single('evidencia_fotografica'), async (req, res) => {
    const {
        id_arbol,
        id_plaga,
        fecha_detectada,
        gravedad,
        sintomas,
        id_ciudadano,
        observaciones
    } = req.body;

    const evidencia_fotografica = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        await pool.query('BEGIN');

        const plagaResult = await pool.query(
            `INSERT INTO ArbolesPlagas (id_arbol, id_plaga, fecha_detectada)
             VALUES ($1, $2, $3)
             RETURNING id_registro`,
            [id_arbol, id_plaga, fecha_detectada]
        );

        await pool.query(
            `INSERT INTO Tramites (
                id_ciudadano, id_arbol, tipo, fecha_solicitud, 
                estatus, evidencia, observaciones
             ) VALUES ($1, $2, $3, CURRENT_DATE, 'Pendiente', $4, $5)`,
            [
                id_ciudadano,
                id_arbol,
                'Reporte de plaga',
                evidencia_fotografica,
                `Síntomas: ${sintomas}\nGravedad: ${gravedad}\n${observaciones || ''}`
            ]
        );

        if (observaciones) {
            await pool.query(
                `UPDATE Arboles 
                 SET observaciones = COALESCE(observaciones, '') || '\n' || $1
                 WHERE id_arbol = $2`,
                [`[PLAGA-${new Date().toISOString().split('T')[0]}] ${observaciones}`, id_arbol]
            );
        }

        await pool.query('COMMIT');
        res.redirect('/plaga?success=1');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error reportando plaga:', error);
        res.status(500).send('Error al reportar la plaga');
    }
});

// 🔹 Ruta para eliminar un reporte de plaga (protegida)
app.post('/eliminar-reporte-plaga', requireAuth, async (req, res) => {
    const { id_registro } = req.body;

    try {
        await pool.query('BEGIN');

        const reporte = await pool.query(
            'SELECT id_arbol FROM ArbolesPlagas WHERE id_registro = $1',
            [id_registro]
        );

        if (reporte.rows.length === 0) {
            return res.status(404).send('Reporte no encontrado');
        }

        const id_arbol = reporte.rows[0].id_arbol;

        await pool.query(
            'DELETE FROM ArbolesPlagas WHERE id_registro = $1',
            [id_registro]
        );

        await pool.query(
            `UPDATE Tramites 
             SET estatus = 'Rechazado' 
             WHERE id_arbol = $1 AND tipo = 'Reporte de plaga'`,
            [id_arbol]
        );

        await pool.query('COMMIT');
        res.redirect('/plaga?deleted=1');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error eliminando reporte de plaga:', error);
        res.status(500).send('Error al eliminar el reporte de plaga');
    }
});

// 🔹 Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});