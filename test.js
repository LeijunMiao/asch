var express = require("express");
var app = express();
// app.use(express.urlencoded());
// app.use(express.json());
// app.use(express.compress());
// app.use(express.methodOverride());

// var swig = require('swig');
// var cons = require('consolidate');
// swig.setDefaults({
//     varControls: ['{=', '=}']
//   });
//   app.engine('html', cons.swig);
//   app.engine('ejs', cons.ejs);
//   app.set('views', __dirname + '/src/views');
//   app.set('view engine', 'html');



var server = app.listen(8605);
console.info('console server started on port ' + 8605);

app.get('/qrcode', function (req, res) {
    console.log('1213');
    res.sendFile(__dirname + '/public/src/qrcode.html');
});

app.use(express.static(__dirname+ '/public/src'));

