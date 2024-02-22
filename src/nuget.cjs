const fs = require('fs');
const path = require('path');
const _ = require('underscore');
const Queue = require('queue-async');
const es = require('event-stream');
const et = require('elementtree');
const crypto = require('crypto');
const vinyl = require('vinyl-fs');
const spawn = require('cross-spawn-cb');

require('shelljs/global');
const NUGET_EXE = path.resolve(path.join(__dirname, './bin/NuGet.exe'));

const runCommand = (command, args, callback) => {
  args = [command].concat(args);
  if (process.platform !== 'win32') args.unshift('mono');
  spawn(NUGET_EXE, args, {}, callback);
};

const getFile = (file, callback) => {
  if (file.pipe) return callback(null, file);

  vinyl.src(file).pipe(
    es.writeArray((err, files) => {
      if (err) return callback(err);
      if (files.length === 0 || files.length > 1) {
        return callback(new Error(`Expecting one file for ${file}. Found ${files.length}`));
      }
      return callback(null, files[0]);
    })
  );
};

const randomFilename = () =>
  `${crypto
    .createHash('sha1')
    .update(new Date().getTime().toString() + _.uniqueId())
    .digest('hex')}.nupkg`;

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
class NodeNuget {
  static setApiKey(key, callback) {
    runCommand('setApiKey', [key], callback);
  }

  static pack(file, callback) {
    getFile(file, (err, file) => {
      if (err) return callback(err);

      file.pipe(
        es.wait((err, data) => {
          if (err) return callback(err);

          const packageDesc = et.parse(data.toString());
          const packageId = packageDesc.findtext('./metadata/id');
          const packageVersion = packageDesc.findtext('./metadata/version');

          const files = packageDesc.findall('./files/file').map((x) => path.join(path.dirname(file.path), x.attrib ? x.attrib.src : undefined));
          const missingFiles = files.filter((x) => !fs.existsSync(x));
          if (missingFiles.length) return callback(new Error(`Nuget: cannot build ${file.path}. Missing files: ${missingFiles}`));

          runCommand('pack', [file.path], (err) => {
            if (err) return callback(err);

            const packagePath = path.resolve(path.join(process.cwd(), '.', `${packageId}.${packageVersion}.nupkg`));
            getFile(packagePath, (err, file) => {
              if (err) return callback(err);
              fs.unlink(packagePath, () => callback(err, file));
            });
          });
        })
      );
    });
  }

  static push(file, callback) {
    let filePath = null;
    let owned = false;

    const queue = new Queue(1);

    // ensure there is a file on disk
    queue.defer((callback) => {
      if (!file.pipe) return callback(null, file);
      filePath = file.path;
      if (fs.existsSync(filePath)) return callback(); // use if exists on disk
      callback = _.once(callback);
      filePath = randomFilename();
      owned = true;
      file.pipe(fs.createWriteStream(filePath)).on('finish', callback).on('error', callback);
    });

    // run push command
    queue.defer(runCommand.bind(null, 'push', [filePath, '-Source', 'nuget.org', '-NonInteractive']));

    // clean up temp file if needed
    return queue.await((err) => {
      if (filePath && owned && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return callback(err);
    });
  }
}
module.exports = NodeNuget;
