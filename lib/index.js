const repl = require('repl');
const crypto = require('crypto');
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const inspect = require('util').inspect;

const ssh2 = require('ssh2');
const Server = ssh2.Server;
const genPublicKey = ssh2.utils.genPublicKey;
const parseKey = ssh2.utils.parseKey;

module.exports = function createServer(cfg, cb) {
  if (typeof cfg !== 'object' || cfg === null)
    throw new Error('Missing/Invalid configuration');
  const srv = new Server(cfg.server);
  if (typeof cfg.port !== 'number')
    throw new Error('Missing/Invalid port');
  if (typeof cfg.users !== 'object' && typeof cfg.users !== 'function')
    throw new Error('Missing/Invalid users configuration');
  if ('context' in cfg && typeof cfg.context !== 'object')
    throw new Error('Invalid context');

  const users_ = cfg.users;
  var users;
  if (typeof users_ === 'function')
    users = users_;
  else {
    users = function usersWrapper(user, callback) {
      const userCfg = users_[user];
      if (userCfg === undefined)
        process.nextTick(callback, true);
      else
        process.nextTick(callback, null, userCfg);
    };
  }

  srv.on('connection', function onConnection(client, info) {
    var inSession = false;
    var replCfg;
    client.on('authentication', function onAuthentication(ctx) {
      users(ctx.username, function usersCallback(err, userCfg) {
        if (typeof userCfg === 'object' && userCfg !== null) {
          if (ctx.method === 'password'
              && typeof userCfg.password === 'string') {
            return bufferEquals(new Buffer(ctx.password),
                                new Buffer('' + userCfg.password),
                                function(err, equal) {
              if (err || !equal)
                return ctx.reject();
              replCfg = userCfg.repl;
              ctx.accept();
            });
          } else if (ctx.method === 'publickey'
                     && (Buffer.isBuffer(userCfg.publicKey)
                         || typeof userCfg.publicKey === 'string')) {
            // TODO: cache parsed/generated result?
            const pubKey = genPublicKey(parseKey(userCfg.publicKey));
            if (ctx.key.algo === pubKey.fulltype) {
              return bufferEquals(ctx.key.data,
                                  pubKey.public,
                                  function(err, equal) {
                if (err || !equal)
                  return ctx.reject();
                if (ctx.signature) {
                  const verifier = crypto.createVerify(ctx.sigAlgo);
                  verifier.update(ctx.blob);
                  if (verifier.verify(pubKey.publicOrig, ctx.signature)) {
                    replCfg = userCfg.repl;
                    ctx.accept();
                  } else {
                    ctx.reject();
                  }
                } else {
                  // if no signature present, that means the client is just
                  // checking the validity of the given public key
                  ctx.accept();
                }
              });
            }
          }
        }
        ctx.reject();
      });
    });
    client.once('ready', function onClientReady() {
      client.on('session', function(accept, reject) {
        if (inSession)
          return reject();
        inSession = true;
        const session = accept();
        var columns = 0;
        session.once('pty', function(accept, reject, info) {
          columns = info.cols;
          accept();
        });
        session.once('shell', function(accept, reject) {
          const stream = accept();

          // XXX: Using a newline converter is a hack until modern versions of
          // node output `\r\n` instead of `\n` for REPL-specific output and
          // `util.inspect()` output
          const convertStream = new NLConverter();
          convertStream.pipe(stream);
          if (columns > 0)
            convertStream.columns = columns; //stream.columns = columns;
          stream.on('setWindow', function(rows, cols, height, width) {
            convertStream.columns = cols; //stream.columns = cols;
          });

          const options = {
            input: stream,
            output: convertStream, //stream,
            terminal: (columns > 0),
          };

          if (typeof replCfg === 'object' && replCfg !== null) {
            const keys = Object.keys(replCfg);
            for (var i = 0; i < keys.length; ++i) {
              const key = keys[i];
              if (key === 'input' || key === 'output')
                continue;
              options[key] = replCfg[key];
            }
          }

          const replServer = repl.start(options);

          if ('context' in cfg)
            Object.assign(replServer.context, cfg.context);

          replServer.once('exit', function () {
            stream.close();
          });
          stream.once('close', function() {
            client.end();
          });
        });
        session.once('close', function() {
          inSession = false;
        });
      });
    });
    client.on('error', function onClientError(err) { });
  });


  if (typeof cb === 'function') {
    srv.on('error', function onServerError(err) {
      cb(err);
    });
  }
  srv.listen(cfg.port, function onListening() {
    typeof cb === 'function' && cb(null, srv.address().port);
  });

  return {
    close: function() {
      srv.close();
    }
  };
};

function bufferEquals(a, b, cb) {
  crypto.randomBytes(32, function(err, key) {
    if (err)
      return cb(err);
    const ah = crypto.createHmac('sha256', key).update(a).digest();
    const bh = crypto.createHmac('sha256', key).update(b).digest();
    cb(null, ah.equals(bh));
  });
}

// Converts `\n` to `\r\n`
const CR = Buffer.from('\r');
function NLConverter() {
  Transform.call(this);
}
inherits(NLConverter, Transform);
NLConverter.prototype._transform = function(chunk, enc, cb) {
  var i = 0;
  var last = 0;
  while ((i = chunk.indexOf(10, i)) !== -1) {
    if (i === 0) {
      this.push(CR);
    } else if (chunk[i - 1] !== 13) {
      this.push(chunk.slice(last, i));
      this.push(CR);
      last = i;
    }
    ++i;
  }
  if (last === 0)
    this.push(chunk);
  else
    this.push(chunk.slice(last));
  cb();
};
