!function (async, crypto, fs, linq, path) {
    'use strict';

    function Processor(options, sessionID, name) {
        if (arguments.length !== 3) {
            throw new Error('Implementor of Processor must pass arguments on constructor');
        }

        this.options = options;
        this._name = name;
        this._sessionID = sessionID;
    }

    Processor.isPlainObject = function (obj) {
        return {}.toString.call(obj) === '[object Object]';
    };

    Processor.validFileEntry = function (fileEntry) {
        return (
            Processor.isPlainObject(fileEntry) &&
            Object.getOwnPropertyNames(fileEntry).sort().join(',') === 'buffer,md5' &&
            fileEntry.buffer instanceof Buffer &&
            typeof fileEntry.md5 === 'string'
        );
    };

    Processor.prototype._getCachePath = function () {
        return path.resolve(that.options.temp, that._sessionID);
    };

    Processor.prototype._loadCache = function (callback) {
        fs.readFile(this._getCachePath(), function (err, cache) {
            callback(err, err ? null : (cache.inputs || {}), err ? null : (cache.outputs || {}));
        });
    };

    Processor.prototype._saveCache = function (inputs, outputs, callback) {
        fs.writeFile(this._getCachePath(), { inputs: inputs, outputs: outputs }, callback);
    };

    Processor.prototype._getFiles = function (files, callback) {
        var that = this;

        if ({}.toString.call(files) !== '[object Object]') {
            return callback(new Error('files not a plain object'));
        } else if (!linq(files).all(Processor.validFileEntry).run()) {
            return callback(new Error('One or more entry in files is invalid'));
        }

        this._loadCache(function (err, inputCache, outputCache) {
            if (err) { return callback(err); }

            var anyFilesDeleted = linq(inputCache).any(function (_, filename) { return !files[filename]; }).run(),
                newOrChanged,
                existingOutputs;

            if (anyFilesDeleted) {
                // If there are any files deleted, we will need to mark all files as changed and re-run the whole processor

                newOrChanged = files;
                existingOutputs = {};
            } else {
                // If there are only new or changed files, we will re-use the outputs from cache
                // Processors will decide if they want to rerun on existing files

                newOrChanged = linq(files).where(function (entry, filename) {
                    var cached = inputCache[filename];

                    return !cached || cached.md5 !== entry.md5;
                }).run();

                existingOutputs = outputCache;
            }

            callback(null, {
                inputs: {
                    all: files,
                    newOrChanged: newOrChanged,
                    unchanged: linq(files).except(newOrChanged).run()
                },
                outputs: {
                    existing: existingOutputs
                }
            });
        });
    };

    Processor.prototype._flush = function (inputs, outputs, callback) {
        this._saveCache(inputs, outputs, callback);
    };

    Processor.prototype._run = function (inputs, args, callback) {
        var that = this;

        async.auto({
            files: function (callback) {
                that._getFiles(inputs, callback);
            },
            run: ['files', function (callback, results) {
                var files = results.files,
                    runArgs = [].slice.call(args || []);

                runArgs.splice(0, 0, files.inputs, linq(files.outputs.existing).select(function (output) {
                    return output.buffer;
                }).run());

                runArgs.push(callback);

                that.run.apply(that, runArgs);
            }],
            inputs: ['files', function (callback, results) {
                callback(null, linq(results.files.inputs.all).select(function (entry) {
                    return { md5: entry.md5 };
                }).run());
            }],
            outputs: ['run', function (callback, results) {
                var outputs = {},
                    err;

                if (!results.run) {
                    return callback(new Error('Processor#' + that._name + '.run must return output files or an empty map'));
                } else if (!Processor.isPlainObject(results.run)) {
                    return callback(new Error('Processor#' + that._name + '.run must return plain object as output'));
                }

                Object.getOwnPropertyNames(results.run).forEach(function (filename) {
                    var buffer = results.run[filename];

                    if (typeof buffer === 'string') {
                        buffer = new Buffer(buffer);
                    } else if (!(buffer instanceof Buffer)) {
                        err = new Error('Processor#' + that._name + ' output "' + filename + '" must be either string or Buffer');

                        return;
                    }

                    outputs[filename] = {
                        buffer: buffer,
                        md5: md5(buffer)
                    };
                });

                callback(err, err ? null : outputs);
            }],
            flush: ['inputs', 'outputs', function (callback, results) {
                that._flush(
                    results.inputs,
                    results.outputs,
                    callback
                );
            }]
        }, function (err, results) {
            callback(err, results.outputs);
        });
    };

    // run(inputs, outputs, arg0, arg1, ..., argN, callback)
    Processor.prototype.run = function () {
        var callback = arguments[arguments.length - 1];

        callback(new Error('"run" function must be implemented'));
    };

    function md5(bufferOrString) {
        var md5 = crypto.createHash('md5');

        md5.update(typeof bufferOrString === 'string' ? new Buffer(bufferOrString) : bufferOrString);

        return md5.digest('hex');
    }

    module.exports = Processor;
}(
    require('async'),
    require('crypto'),
    require('fs'),
    require('async-linq'),
    require('path')
);