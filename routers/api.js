var express = require('express');
var router = express.Router();

router.get('/', function (req, res) {
    console.log('API landing reached. /api endpoint @ ' + new Date().toISOString())
    res.send('You have arrived at the /api endpoint. Timestamp : ' + new Date().toISOString());
    utils.login()
})

module.exports = router;