"use strict";
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
var fs = require("fs");
var path = require("path");
var _ = require("underscore");
var Queue = require("queue-async");
var es = require("event-stream");
var et = require("elementtree");
var crypto = require("crypto");
var vinyl = require("vinyl-fs");
var spawn = require("cross-spawn-cb");
require("shelljs/global");
var NUGET_EXE = path.resolve(path.join(__dirname, "./bin/NuGet.exe"));
var runCommand = function(command, args, callback) {
    args = [
        command
    ].concat(args);
    if (process.platform !== "win32") args.unshift("mono");
    spawn(NUGET_EXE, args, {}, callback);
};
var getFile = function(file, callback) {
    if (file.pipe) return callback(null, file);
    vinyl.src(file).pipe(es.writeArray(function(err, files) {
        if (err) return callback(err);
        if (files.length === 0 || files.length > 1) {
            return callback(new Error("Expecting one file for ".concat(file, ". Found ").concat(files.length)));
        }
        return callback(null, files[0]);
    }));
};
var randomFilename = function() {
    return "".concat(crypto.createHash("sha1").update(new Date().getTime().toString() + _.uniqueId()).digest("hex"), ".nupkg");
};
// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
var NodeNuget = /*#__PURE__*/ function() {
    "use strict";
    function NodeNuget() {
        _class_call_check(this, NodeNuget);
    }
    _create_class(NodeNuget, null, [
        {
            key: "setApiKey",
            value: function setApiKey(key, callback) {
                runCommand("setApiKey", [
                    key
                ], callback);
            }
        },
        {
            key: "pack",
            value: function pack(file, callback) {
                getFile(file, function(err, file) {
                    if (err) return callback(err);
                    file.pipe(es.wait(function(err, data) {
                        if (err) return callback(err);
                        var packageDesc = et.parse(data.toString());
                        var packageId = packageDesc.findtext("./metadata/id");
                        var packageVersion = packageDesc.findtext("./metadata/version");
                        var files = packageDesc.findall("./files/file").map(function(x) {
                            return path.join(path.dirname(file.path), x.attrib ? x.attrib.src : undefined);
                        });
                        var missingFiles = files.filter(function(x) {
                            return !fs.existsSync(x);
                        });
                        if (missingFiles.length) return callback(new Error("Nuget: cannot build ".concat(file.path, ". Missing files: ").concat(missingFiles)));
                        runCommand("pack", [
                            file.path
                        ], function(err) {
                            if (err) return callback(err);
                            var packagePath = path.resolve(path.join(process.cwd(), ".", "".concat(packageId, ".").concat(packageVersion, ".nupkg")));
                            getFile(packagePath, function(err, file) {
                                if (err) return callback(err);
                                fs.unlink(packagePath, function() {
                                    return callback(err, file);
                                });
                            });
                        });
                    }));
                });
            }
        },
        {
            key: "push",
            value: function push(file, callback) {
                var filePath = null;
                var owned = false;
                var queue = new Queue(1);
                // ensure there is a file on disk
                queue.defer(function(callback) {
                    if (!file.pipe) return callback(null, file);
                    filePath = file.path;
                    if (fs.existsSync(filePath)) return callback(); // use if exists on disk
                    callback = _.once(callback);
                    filePath = randomFilename();
                    owned = true;
                    file.pipe(fs.createWriteStream(filePath)).on("finish", callback).on("error", callback);
                });
                // run push command
                queue.defer(runCommand.bind(null, "push", [
                    filePath,
                    "-Source",
                    "nuget.org",
                    "-NonInteractive"
                ]));
                // clean up temp file if needed
                return queue.await(function(err) {
                    if (filePath && owned && fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    return callback(err);
                });
            }
        }
    ]);
    return NodeNuget;
}();
module.exports = NodeNuget;
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }