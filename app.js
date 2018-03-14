"use strict";
var assert = require('assert');
var crypto = require('crypto');
var program = require('commander'); //用户命令行输入和参数解析 模块
var path = require('path');
var fs = require('fs');
var async = require('async');
var Logger = require('./src/logger');  //logo 暂时不研究
var init = require('./src/init');

function verifyGenesisBlock(scope, block) {
  try {
    var payloadHash = crypto.createHash('sha256');
    var payloadLength = 0;

    for (var i = 0; i < block.transactions.length; ++i) {
      var trs = block.transactions[i];
      var bytes = scope.base.transaction.getBytes(trs);
      payloadLength += bytes.length;
      payloadHash.update(bytes);
    }
    var id = scope.base.block.getId(block);
    assert.equal(payloadLength, block.payloadLength, 'Unexpected payloadLength');
    assert.equal(payloadHash.digest().toString('hex'), block.payloadHash, 'Unexpected payloadHash');
    assert.equal(id, block.id, 'Unexpected block id');
    // assert.equal(id, '11839820784468442760', 'Block id is incorrect');
  } catch (e) {
    assert(false, 'Failed to verify genesis block: ' + e);
  }
}

function main() {
  process.stdin.resume(); //输入流恢复

  var version = '1.3.6';
  program
    .version(version)
    .option('-c, --config <path>', 'Config file path')
    .option('-p, --port <port>', 'Listening port number')
    .option('-a, --address <ip>', 'Listening host name or ip')
    .option('-b, --blockchain <path>', 'Blockchain db path')
    .option('-g, --genesisblock <path>', 'Genesisblock path')
    .option('-x, --peers [peers...]', 'Peers list') //资源共享者列表
    .option('-l, --log <level>', 'Log level')
    .option('-d, --daemon', 'Run asch node as daemon')
    .option('-e, --execute <path>', 'exe')
    .option('--dapps <dir>', 'DApps directory')
    .option('--base <dir>', 'Base directory')
    .parse(process.argv);

  var baseDir = program.base || './';  //获取代码所在地址

  var pidFile = path.join(baseDir, 'asch.pid');  //服务启动后会加asch.pid这个文件，存在就表示服务已启动，反之则程序已关闭
  if (fs.existsSync(pidFile)) {
    console.log('Failed: asch server already started');
    return;
  }

  var appConfigFile = path.join(baseDir, 'config.json'); //获取配置文件，启动定义了则在定义文件里找，否则就在默认目录里找
  if (program.config) {  
    appConfigFile = path.resolve(process.cwd(), program.config);
  }
  var appConfig = JSON.parse(fs.readFileSync(appConfigFile, 'utf8')); //json文件转配置对象

  if (!appConfig.dapp.masterpassword) { //主密码，暂时还不知道用途
    var randomstring = require("randomstring");
    appConfig.dapp.masterpassword = randomstring.generate({  //生成12位可读（字符数字）字符串
      length: 12,
      readable: true,
      charset: 'alphanumeric'
    });
    fs.writeFileSync(appConfigFile, JSON.stringify(appConfig, null, 2), "utf8"); //写会配置文件
  }

  appConfig.version = version;
  appConfig.baseDir = baseDir;
  appConfig.buildVersion = 'development';
  appConfig.netVersion = process.env.NET_VERSION || 'localnet';
  appConfig.publicDir = path.join(baseDir, 'public', 'dist');
  appConfig.dappsDir = program.dapps || path.join(baseDir, 'dapps')

  global.Config = appConfig; //保存为全局配置

  var genesisblockFile = path.join(baseDir, 'genesisBlock.json'); //第一个区块文件
  if (program.genesisblock) {
    genesisblockFile = path.resolve(process.cwd(), program.genesisblock);
  }
  var genesisblock = JSON.parse(fs.readFileSync(genesisblockFile, 'utf8'));  //json文件转区块对象

  if (program.port) {
    appConfig.port = program.port;
  }

  if (program.address) {
    appConfig.address = program.address;
  }

  if (program.peers) {  //共享者字符串转对象列表
    if (typeof program.peers === 'string') {
      appConfig.peers.list = program.peers.split(',').map(function (peer) {
        peer = peer.split(":");
        return {
          ip: peer.shift(),
          port: peer.shift() || appConfig.port
        };
      });
    } else {
      appConfig.peers.list = [];
    }
  }

  if (appConfig.netVersion === 'mainnet') { //如果是正式网络则加入这些默认共享者
    var seeds = [ //数字型ip列表
      757137132,
      1815983436,
      759980934,
      759980683,
      1807690192,
      1758431015,
      1760474482,
      1760474149,
      759110497,
      757134616
    ];
    var ip = require('ip');
    for (var i = 0; i < seeds.length; ++i) {
      appConfig.peers.list.push({ ip: ip.fromLong(seeds[i]), port: 80 }); 
    }
  }

  if (program.log) {
    appConfig.logLevel = program.log;
  }

  var protoFile = path.join(baseDir, 'proto', 'index.proto'); //获取区块数据结构文件 protobuf类型
  if (!fs.existsSync(protoFile)) {
    console.log('Failed: proto file not exists!');
    return;
  }

  if (program.daemon) { //守护进程
    console.log('Asch server started as daemon ...');
    require('daemon')({cwd: process.cwd()});
    fs.writeFileSync(pidFile, process.pid, 'utf8');
  }

  var logger = new Logger({
    filename: path.join(baseDir, 'logs', 'debug.log'),
    echo: program.deamon ? null : appConfig.logLevel, //如果是进程启动则不打log
    errorLevel: appConfig.logLevel
  });

  var options = {
    dbFile: program.blockchain || path.join(baseDir, 'blockchain.db'), //二进制数据库文件地址
    appConfig: appConfig, 
    genesisblock: genesisblock,
    logger: logger,
    protoFile: protoFile
  };

  if (program.reindex) {
    appConfig.loading.verifyOnLoading = true;
  }

  global.featureSwitch = {}
  global.state = {}

  init(options, function (err, scope) {
    if (err) {
      scope.logger.fatal(err);
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile); //初始化发生错误删除进程控制文件
      }
      process.exit(1);
      return;
    }
    verifyGenesisBlock(scope, scope.genesisblock.block); //用sha256验证区块

    if (program.execute) {
      // only for debug use
      // require(path.resolve(program.execute))(scope);
    }

    scope.bus.message('bind', scope.modules);
    global.modules = scope.modules

    scope.logger.info('Modules ready and launched');
    if (!scope.config.publicIp) {
      scope.logger.warn('Failed to get public ip, block forging MAY not work!');
    }

    process.once('cleanup', function () {
      scope.logger.info('Cleaning up...');
      async.eachSeries(scope.modules, function (module, cb) { //模块顺序清理
        if (typeof (module.cleanup) == 'function') {
          module.cleanup(cb);
        } else {
          setImmediate(cb);
        }
      }, function (err) {
        if (err) {
          scope.logger.error('Error while cleaning up', err);
        } else {
          scope.logger.info('Cleaned up successfully');
        }
        scope.dbLite.close();  //关闭数据库
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile); 
        }
        process.exit(1);
      });
    });

    process.once('SIGTERM', function () { //结束进程执行清理
      process.emit('cleanup');
    })

    process.once('exit', function () {
      scope.logger.info('process exited');
    });

    process.once('SIGINT', function () { //结束进程执行清理
      process.emit('cleanup');
    });

    process.on('uncaughtException', function (err) { //报错执行清理
      // handle the error safely
      scope.logger.fatal('uncaughtException', { message: err.message, stack: err.stack });
      process.emit('cleanup');
    });

    if (typeof gc !== 'undefined') {
      setInterval(function () {
        gc();
      }, 60000);
    }
  });
}

main();
