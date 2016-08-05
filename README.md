Description
===========

SSH into your [node.js](http://nodejs.org/) process and access a REPL.

Requirements
============

* [node.js](http://nodejs.org/) -- v4.0.0 or newer


Install
=======

    npm install ssh-repl


Example
=======

```javascript
const fs = require('fs');

const sshrepl = require('ssh-repl');

const repl = sshrepl({
  server: {
    hostKeys: [ fs.readFileSync('host.key') ]
  },
  users: {
    foo: {
      publicKey: fs.readFileSync('foo-key.pub'),
      repl: { prompt: 'foo> ' }
    },
    bar: {
      password: 'baz',
      repl: { prompt: 'bar> ' }
    }
  },
  port: 2244
}, function() {
  console.log('SSH REPL listening');
});

// Call `repl.close()` to stop listening
```

API
===

`require('ssh-repl')` returns a function that creates and starts an SSH REPL. It has the signature:

* (< _object_ >config[, < _function_ >callback]) - _object_ - Creates and starts an SSH REPL. The object returned contains a `.close()` method to stop the server. It accepts an optional callback that is called when the server is closed. `config` can contain:

    * **server** - _object_ - The configuration for the SSH server. See the [`ssh2`](https://github.com/mscdex/ssh2#server-methods) documentation for a list of supported properties.

    * **port** - _integer_ - Port number to listen on.

    * **users** - _mixed_ - The user configuration. This is used to both authenticate users and to optionally pass settings to [`repl.start()`](https://nodejs.org/docs/latest/api/repl.html#repl_repl_start_options). If `users` is a _function_, it is passed two arguments: (< _string_ >username, < _function_ >callback), where `callback` has the signature (< _Error_ >err, < _object_ >userConfig). If `users` is an object, it should be keyed on username, with the value being the user configuration. Allowed user configuration properties:

        * One of two authentication methods is required:

            * **password** - _string_ - The password for the user.

            * **publicKey** - _mixed_ - The public key for the user. This value can be a _Buffer_ instance or a _string_.

        * **repl** - _object_ - If supplied, the properties on this object are passed on to [`repl.start()`](https://nodejs.org/docs/latest/api/repl.html#repl_repl_start_options).

    If `callback` is supplied, it is called once the SSH REPL is listening for incoming connections. It has the signature (< _Error_ >err, < _number_ >boundPort). The `boundPort` argument is useful when binding on port 0.
