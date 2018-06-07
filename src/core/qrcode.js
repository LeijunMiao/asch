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


private.qrcodeCache = {};
private.loaded = false;
// Private methods
private.attachApi = function () {
    var router = new Router();

    router.use(function (req, res, next) {
        if (modules) return next();
        res.status(500).send({
            success: false,
            error: "Blockchain is loading"
        });
    });

    router.map(shared, {
        "get /": "getQRcode"
    });

    if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
        router.get('/getAllQRcodes', function (req, res) {
            return res.json({
                success: true,
                accounts: private.accounts
            });
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
            if (!report.isValid) return res.json({
                success: false,
                error: report.issues
            });
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
                    return res.json({
                        success: false,
                        error: err.toString()
                    });
                }
                // var qrcodes = raw.map(function (fullQRcode) {
                //     return {
                //         _id: fullQRcode._id,
                //         off: fullQRcode.off
                //     }
                // });

                res.json({
                    success: true,
                    qrcodes: raw
                });
            })
        })
    });

    router.get('/count', function (req, res) {
        library.dbLite.query('select count(*) from qrcode', {
            'count': Number
        }, function (err, rows) {
            if (err || !rows) {
                return res.status(500).send({
                    success: false,
                    error: 'Database error'
                })
            }
            return res.json({
                success: true,
                count: rows[0].count
            });
        })
    });
    router.post('/set', function (req, res) {
        self.setQRcodeAndGet(req.body, function (err, doc) {
            if (err || !doc) {
                return res.status(500).send({
                    success: false,
                    error: 'Database error'
                })
            }
            console.log('setQRcodeAndGet');
            library.bus.message('newQRcode', doc, true);
            return res.json({
                success: true,
                qrcode: doc
            });
        })
    });

    router.use(function (req, res, next) {
        res.status(500).send({
            success: false,
            error: "API endpoint was not found"
        });
    });

    library.network.app.use('/api/qrcodes', router);
    library.network.app.use(function (err, req, res, next) {
        if (!err) return next();
        library.logger.error(req.url, err.toString());
        res.status(500).send({
            success: false,
            error: err.toString()
        });
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
    data.blockId =  modules.blocks.getLastBlock;
    console.log(data);
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

    private.loaded = true;
}

QRcodes.prototype.onReceiveQRcode = function (qrcode, votes) {
    console.log('onReceiveQRcode');
    console.log(modules.loader.syncing(),private.loaded,private.qrcodeCache[qrcode._id]);

    if (modules.loader.syncing() || !private.loaded) {
        return;
    }

    if (private.qrcodeCache[qrcode._id]) {
        return;
    }
    private.qrcodeCache[qrcode._id] = true;

    self.processQRcode(qrcode, true);
}



QRcodes.prototype.processQRcode = function (qrcode, broadcast) {
    console.log('processQRcode');
    try {
        qrcode = library.base.qrcode.objectNormalize(qrcode);
    } catch (e) {
        return setImmediate(cb, "Failed to normalize qrcode : " + e.toString());
    }
    console.log(qrcode);
    self.getQRcode({
        _id: qrcode._id
    }, function (err, row) {
        console.log(row);
        if (err) {
            return setImmediate(cb, "Failed to query qrcodes from db: " + err);
        }
        var qrId = row && row._id;
        if (qrId) {
            return setImmediate(cb, "QRcode already exists: " + qrcode._id);
        }
        self.applyQRcode(qrcode, broadcast);
    });
}

QRcodes.prototype.applyQRcode = function (qrcode, broadcast) {
    console.log('applyQRcode');
    private.isActive = true;
    library.dbLite.query('SAVEPOINT applyqrcode');
    library.base.qrcode.dbSave(qrcode, function (err) {
        if (err) {
            library.logger.error("Failed to save qrcode: " + err);
            process.exit(1);
            return;
        }
        private.qrcodeCache = {};
        library.logger.debug("save qrcode ok");
    });
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

            cb(null, {
                qrcode: qrcode,
                version: modules.peer.getVersion()
            });
        });
    });
}

// Export
module.exports = QRcodes;