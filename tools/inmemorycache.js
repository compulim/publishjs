!function (CacheProvider, path) {
    'use strict';

    function InMemoryCache(options) {
        CacheProvider.call(this);

        this.options = options;
        this.cache = {};
    }

    require('util').inherits(InMemoryCache, CacheProvider);

    InMemoryCache.prototype.load = function (name, callback) {
        var cache = this.cache[name];

        callback(null, (cache && cache.inputs) || {}, (cache && cache.outputs) || {});
    };

    InMemoryCache.prototype.save = function (name, inputs, outputs, callback) {
        this.cache[name] = { inputs: inputs, outputs: outputs };

        callback();
    };

    module.exports = InMemoryCache;
}(
    require('./cacheprovider'),
    require('path')
);