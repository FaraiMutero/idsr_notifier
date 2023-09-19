const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const multer = require('multer');
const cookieParser = require('cookie-parser')
const upload = multer()

const path = require('path');
const bot = require('./bot/app')
const server = require('./bot/server')
const api = require('./routers/api');
const labResults = require('./routers/lab-results');
const priorityconditions = require('./routers/priority-conditions');
const rootDir = require('./utils/path.js')

app.set('bot', bot)

app.use(cookieParser());
app.use(bodyParser.json()); // for parsing application/json
app.set('view engine', 'pug'); //Set view engine to pug
app.use(bodyParser.urlencoded({ extended: true })); /// for parsing application/xwww-form-urlencoded
app.use(upload.array()); // for parsing multipart/form-data

app.use(express.static(path.join(rootDir, 'public')));

app.use('/css', express.static(path.join(rootDir, 'node_modules', 'bootstrap', 'dist', 'css')));
app.use('/js', express.static(path.join(rootDir, 'node_modules', 'bootstrap', 'dist', 'js')));

app.use('/zambia_idsr/api', api);
app.use('/zambia_idsr/api/webhook/lab-results', labResults);
app.use('/zambia_idsr/api/webhook/priority-conditions', priorityconditions);

app.get('/', function (req, res) {
  //res.status(200).sendFile(path.join(rootDir, 'public', 'index.html'))
  res.render('home', {
    title: server.env.bot.name
  })
});

app.listen(7000, function () {
  console.log('Example app listening on port 7000!');
  bot.initialize();
});
