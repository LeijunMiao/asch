var Router = require('../utils/router.js');
var sandboxHelper = require('../utils/sandbox.js');
// Private fields
var modules, library, self, private = {},
    shared = {};

// Constructor
function QRcodes(cb, scope) {
    library = scope;
    self = this;
    self.__private = private;
    private.attachApi();

    //library.base.transaction.attachAssetType(TransactionTypes.VOTE, new Vote());

    setImmediate(cb, null, self);
}
// Private methods
private.attachApi = function () {
    var router = new Router();
  
    router.use(function (req, res, next) {
      if (modules) return next();
      res.status(500).send({ success: false, error: "Blockchain is loading" });
    });
  
    router.map(shared, {
      "get /": "getQRcode"
    });
  
    if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
      router.get('/getAllQRcodes', function (req, res) {
        return res.json({ success: true, accounts: private.accounts });
      });
    }
  
    router.get('/top', function (req, res, next) {
      req.sanitize(req.query, {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          offset: {
            type: "integer",
            minimum: 0
          }
        }
      }, function (err, report, query) {
        if (err) return next(err);
        if (!report.isValid) return res.json({ success: false, error: report.issues });
        if (!query.limit) {
          query.limit = 100;
        }
        self.getQRcodes({
          sort: {
            _id: -1
          },
          offset: query.offset,
          limit: query.limit
        }, function (err, raw) {
          if (err) {
            return res.json({ success: false, error: err.toString() });
          }
          var qrcodes = raw.map(function (fullQRcode) {
            return {
                _id: fullAccount._id,
                off: fullAccount.off
            }
          });
  
          res.json({ success: true, qrcodes: qrcodes });
        })
      })
    });
  
    router.get('/count', function (req, res) {
      library.dbLite.query('select count(*) from qrcode', { 'count': Number }, function (err, rows) {
        if (err || !rows) {
          return res.status(500).send({success: false, error: 'Database error'})
        }
        return res.json({ success: true, count: rows[0].count });
      })
    });
  
    router.use(function (req, res, next) {
      res.status(500).send({ success: false, error: "API endpoint was not found" });
    });
  
    library.network.app.use('/api/qrcodes', router);
    library.network.app.use(function (err, req, res, next) {
      if (!err) return next();
      library.logger.error(req.url, err.toString());
      res.status(500).send({ success: false, error: err.toString() });
    });
  }
  
QRcodes.prototype.getQRcode = function (filter, fields, cb) {
    library.logger.trace('QRcodes.prototype.getQRcode ', filter)
    if (typeof fields === 'function') {
        cb = fields
    }
    //var publicKey = filter.publicKey

    // if (filter.address && !addressHelper.isAddress(filter.address)) {
    //     return cb('Invalid address getQRcode');
    // }

    // if (filter.publicKey) {
    //   filter.address = self.generateAddressByPublicKey2(filter.publicKey);
    //   delete filter.publicKey;
    // }
    //library.logger.trace('QRcodes.prototype.getQRcode=========1', publicKey)

    function done(err, qrcode) {
        library.logger.trace('QRcodes.prototype.getQRcode=========2' + err, qrcode)
        //   if (!err && qrcode && !qrcode.publicKey) {
        //     qrcode.publicKey = publicKey
        //   }
        cb(err, qrcode)
    }

    if (typeof fields === 'function') {
        library.base.qrcode.get(filter, done);
    } else {
        library.base.qrcode.get(filter, fields, done);
    }
}

QRcodes.prototype.getQRcodes = function (filter, fields, cb) {
    library.base.qrcode.getAll(filter, fields, cb);
}

QRcodes.prototype.setQRcodeAndGet = function (data, cb) {
    library.logger.debug('setQRcodeAndGet data is:', data)
    var _id = data._id || null;
    if (!_id) {
        return cb("Lost _id");
    }
    library.base.qrcode.set(_id, data, function (err) {
        if (err) {
            return cb(err);
        }
        library.base.qrcode.get({
            _id: _id
        }, cb);
    });
}

QRcodes.prototype.sandboxApi = function (call, args, cb) {
    sandboxHelper.callMethod(shared, call, args, cb);
}

// Events
QRcodes.prototype.onBind = function (scope) {
    modules = scope;
}

shared.getQRcode = function (req, cb) {
    var query = req.body;
    library.scheme.validate(query, {
        type: "object",
        properties: {
            _id: {
                type: "string",
                minLength: 24
            }
        },
        required: ["_id"]
    }, function (err) {
        if (err) {
            return cb(err[0].message);
        }

        self.getQRcode({
            _id: query._id
        }, function (err, qrcode) {
            if (err) {
                return cb(err.toString());
            }
            if (!qrcode) {
                qrcode = {
                    _id: query._id,
                    off: query.off
                }
            }

            cb(null, {
                qrcode: {
                    _id: query._id,
                    off: query.off
                },
                version: modules.peer.getVersion()
            });
        });
    });
}

// Export
module.exports = QRcodes;