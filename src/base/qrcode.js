var async = require('async');
var jsonSql = require('json-sql')();
var genesisBlock = null;

function QRcode(scope, cb) {
    this.scope = scope;
    genesisBlock = this.scope.genesisblock.block;

    this.table = "qrcode";
    this.model = [{
            name: "_id",
            type: "String",
            length: 24,
            filter: {
                type: "string",
                case: "lower",
                maxLength: 24,
                minLength: 24
            },
            conv: String,
            constante: true
        }, {
            name: "off",
            type: "BigInt",
            filter: {
                type: "boolean"
            },
            conv: Boolean,
            default: 0
        },
        {
            name: "blockId",
            type: "String",
            length: 64,
            filter: {
                type: "string",
                minLength: 1,
                maxLength: 64
            },
            conv: String,
            default: genesisBlock.id
        },
        {
            name: "batch",
            type: "String",
            length: 128,
            filter: {
                type: "string",
            },
            conv: String
        },
        {
            name: "goods",
            type: "String",
            length: 128,
            filter: {
                type: "string"
            },
            conv: String
        }
    ];

    this.fields = this.model.map(function (field) {
        var _tmp = {};
        if (field.type == "Binary") {
            _tmp.expression = ['lower', 'hex'];
        }

        if (field.expression) {
            _tmp.expression = field.expression;
        } else {
            if (field.mod) {
                _tmp.expression = field.mod;
            }
            _tmp.field = field.name;
        }
        if (_tmp.expression || field.alias) {
            _tmp.alias = field.alias || field.name;
        }

        return _tmp;
    });

    this.binary = [];
    this.model.forEach(function (field) {
        if (field.type == "Binary") {
            this.binary.push(field.name);
        }
    }.bind(this));

    this.filter = {};
    this.model.forEach(function (field) {
        this.filter[field.name] = field.filter;
    }.bind(this));

    this.conv = {};
    this.model.forEach(function (field) {
        this.conv[field.name] = field.conv;
    }.bind(this));

    this.editable = [];
    this.model.forEach(function (field) {
        if (!field.constante && !field.readonly) {
            this.editable.push(field.name);
        }
    }.bind(this));

    setImmediate(cb, null, this);
    cb && setImmediate(cb, null, this);
}

QRcode.prototype.createTables = function (cb) {
    var scope = this.scope;
    var sqles = [];

    var sql = jsonSql.build({
        type: 'create',
        table: this.table,
        tableFields: this.model
    });
    sqles.push(sql.query);
    async.eachSeries(sqles, function (command, cb) {
        scope.dbLite.query(command, function (err, data) {
            cb(err, data);
        });
    }.bind(this), function (err) {
        setImmediate(cb, err, this);
    }.bind(this));
}

QRcode.prototype.removeTables = function (cb) {
    var scope = this.scope;
    var sqles = [];

    [this.table].forEach(function (table) {
        sql = jsonSql.build({
            type: "remove",
            table: table
        });
        sqles.push(sql.query);
    });

    async.eachSeries(sqles, function (command, cb) {
        scope.dbLite.query(command, function (err, data) {
            cb(err, data);
        });
    }.bind(this), function (err) {
        setImmediate(cb, err, this);
    }.bind(this));
}

QRcode.prototype.get = function (filter, fields, cb) {
    library.logger.trace('enter QRcode.prototype.get....')
    if (typeof (fields) == 'function') {
        cb = fields;
        fields = this.fields.map(function (field) {
            return field.alias || field.field;
        });
    }

    this.getAll(filter, fields, function (err, data) {
        library.logger.trace('enter QRcode.prototype.get.... callback' + err, data)
        cb(err, data && data.length ? data[0] : null)
    })
}

QRcode.prototype.getAll = function (filter, fields, cb) {
    if (typeof (fields) == 'function') {
        cb = fields;
        fields = this.fields.map(function (field) {
            return field.alias || field.field;
        });
    }

    var realFields = this.fields.filter(function (field) {
        return fields.indexOf(field.alias || field.field) != -1;
    });

    var realConv = {};
    Object.keys(this.conv).forEach(function (key) {
        if (fields.indexOf(key) != -1) {
            realConv[key] = this.conv[key];
        }
    }.bind(this));

    var limit, offset, sort;

    if (filter.limit > 0) {
        limit = filter.limit;
    }
    delete filter.limit;
    if (filter.offset > 0) {
        offset = filter.offset;
    }
    delete filter.offset;
    if (filter.sort) {
        sort = filter.sort;
    }
    delete filter.sort;

    var sql = jsonSql.build({
        type: 'select',
        table: this.table,
        limit: limit,
        offset: offset,
        sort: sort,
        alias: 'a',
        condition: filter,
        fields: realFields
    });

    this.scope.dbLite.query(sql.query, sql.values, realConv, function (err, data) {
        if (err) {
            return cb(err);
        }

        cb(null, data || []);
    }.bind(this));
}

QRcode.prototype.set = function (_id, fields, cb) {
    var self = this;

    fields._id = _id;
    var qrcode = fields;
    var sqles = []
    // console.log('genesisBlock',genesisBlock);
    qrcode.blockId = genesisBlock.id;
    var sql = jsonSql.build({
        type: 'insert',
        or: "ignore",
        table: this.table,
        values: qrcode
    });

    sqles.push(sql);

    var sql = jsonSql.build({
        type: 'update',
        table: this.table,
        modifier: qrcode,
        condition: {
            _id: _id
        }
    });

    sqles.push(sql);

    async.eachSeries(sqles, function (sql, cb) {
        self.scope.dbLite.query(sql.query, sql.values, function (err, data) {
            if (err) {
                console.error('qrcode set sql error:', err, sql);
            }
            cb(err, data);
        });
    }, cb);
}

QRcode.prototype.remove = function (_id, cb) {
    var sql = jsonSql.build({
        type: 'remove',
        table: this.table,
        condition: {
            _id: _id
        }
    });
    this.scope.dbLite.query(sql.query, sql.values, function (err, data) {
        cb(err, _id);
    });
}

QRcode.prototype.objectNormalize = function (qrcode) {
    for (var i in qrcode) {
        if (qrcode[i] == null || typeof qrcode[i] === 'undefined') {
            delete qrcode[i];
        }
    }

    var report = this.scope.scheme.validate(qrcode, {
        type: "object",
        properties: {
            _id: {
                type: "string"
            },
            off: {
                type: "integer"
            },
            blockId: {
                type: "string"
            },
            batch: {
                type: "string"
            },
            goods: {
                type: "string"
            }
        },
        required: ['_id']
    });

    if (!report) {
        throw Error(this.scope.scheme.getLastError());
    }

    return qrcode;
}

QRcode.prototype.dbSave = function (qrcode, cb) {

    this.scope.dbLite.query("INSERT INTO qrcode(_id, off, blockId, batch, goods) VALUES($_id, $off, $blockId, $batch, $goods)", {
        _id: qrcode._id,
        off: qrcode.off || false,
        blockId: qrcode.blockId || null,
        batch: qrcode.batch || '',
        goods: qrcode.goods || ''
    }, cb);
}

module.exports = QRcode;