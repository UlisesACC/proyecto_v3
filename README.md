# Documentacion del codigo
En esta parte se documentara el codigo de la implementacion del proyecto consta del siguiente indice:

## Índice

1. [Introducción](#introducción)  
2. [Requisitos](#requisitos)  
3. [Instalación](#instalación)  
4. [Codigo](#codigo)
    1. [Server](#server)
    2. [Variables de entorno](#variables_de_entorno)
5. [inicializar servidor](#inicio_servidor)
### instalación
Se nesecita tener instalado node donde se tienen que inicializar los documentos, esto se hace con:
```bash
    npm init -y
    npm install express pg dotenv ejs body-parser
    npm install multer
    npm install express-session bcryptjs
```
Donde:
1. Express: sirve para el servidor web
2. pg: Lo conecta con la base de datos
3. dotenv: maneja las variables de entorno
4. ejs: Para generar un html dinamico
5. body-parser: Maneja el formulario
6. multer: para subr archivos
### codigo
#### server

```js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
```
En la primera parte del codigo se cargaan las variables de entorno de un archivo .env
```js
import 'dotenv/config';
```
Posteriormente se importa Express
```js
const express = require('express');
```
Importamos pg que permite conectarse a la base de datos de PostgresQL, se coloca el pool para mantener las conexiones abiertas y no tener que cerrarlas constantemente:
hay dos formas en las que se puede conectar a una base de datos:
- Client: Donde se crea una conexion cada ves
- Pool: permite reutilizar las conexiones y se liberan cuando no se usan
```js
const { Pool } = require('pg');
```
Minetras que bodyparser da un cuerpo de solicitudes en formato JSON
```js
const bodyParser = require('body-parser');
```
Y multer permite subir archivos al servidor
```js
const multer = require('multer');
```
Continuando con el codigo:
```js
const app = express();
const port = 3000;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});
```
Primero se crea una aplicacion de Express donde es un objeto de manejo de solicitudes http, ruatas,... y se define el puerto en el que se va inicializar, en este caso es el 3000
```js
const app = express();
const port = 3000;
```
Posteriormente se configura las conexiones,
* Se crea una instancia de un pool de conexiones esto con `new Pool({})`
* Las credenciales de acceso estan almacenadas atraves del `process.env`
```js
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});
```
Posteriormente se implemento la forma en como se crea la configuracion del almacenamiento de los archivos
```js
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });
```
para esto primero se llama a `multer`, que tiene como porpiedad `destination` y es el destino de donde se guardan los archivos de subida

Para más información sobre cómo usar `multer`, puedes consultar la [documentación oficial en español](https://github.com/expressjs/multer/blob/master/doc/README-es.md).
#### variables_de_entorno
```dotenv
DB_HOST=localhost
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=arbolescdmx
DB_PORT=5432
```
### inicio_servidor
```bash
    node server.js  
```