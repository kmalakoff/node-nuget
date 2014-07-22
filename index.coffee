fs = require 'fs'
path = require 'path'
Queue = require 'queue-async'
es = require 'event-stream'
et = require 'elementtree'
crypto = require 'crypto'

require 'shelljs/global'
NUGET_EXE = path.resolve(path.join(__dirname, './bin/NuGet.exe'))

runCommand = (command, arg) ->
  exec "/usr/bin/mono --runtime=v4.0 #{NUGET_EXE} #{command} #{arg}"

debounceCallback = (callback) ->
  debounced_callback = -> return if debounced_callback.was_called; debounced_callback.was_called = true; callback.apply(null, Array.prototype.slice.call(arguments, 0))
  return debounced_callback

getFile = (file, callback) ->
  return callback(null, file) if file.pipe
  vinyl.src(file, options)
    .pipe es.writeArray (err, files) ->
      return callback(err) if err
      return callback(new Error "Expecting one file for #{file}. Found #{files.length}") if files.length is 0 or files.length > 1
      callback(null, files[0])

randomFilename = -> crypto.createHash('sha1').update(new Date().getTime().toString()+_.uniqueId()).digest('hex')

module.exports = class NodeNuget
  @setApiKey: (key, callback) ->
    return callback(new Error 'Failed to set API key') if runCommand('setApiKey', options.key).code isnt 0
    callback()

  @pack: (file, callback) ->
    getFile file, (err, file) ->
      return callback(err) if err

      directory = path.dirname(file.path)

      package_desc = et.parse(data)
      package_id = package_desc.findtext('./metadata/id')
      package_version = package_desc.findtext('./metadata/version')
      package_path = path.resolve(path.join(directory, "#{package_id}.#{package_version}.nupkg"))

      files = (path.join(directory, item.attrib?.src) for item in package_desc.findall('./files/file'))
      if (missing_files = (item for item in file when not fs.existsSync(item))).length
        return callback(new Error "Nuget: cannot build #{file.path}. Missing files: #{missing_files}")

      return callback(new Error "Failed to pack file: #{file.path}") if runCommand('pack', file.path).code isnt 0
      getFile package_path, (err, file) ->
        return callback(err) if err
        fs.unlink package_path, -> callback(err, file)

  @push: (file, callback) ->
    file_path = null; owned = false

    queue = new Queue(1)

    # ensure there is a file on disk
    queue.defer (callback) ->
      return callback(null, file_path = file) unless file.pipe

      callback = debounceCallback(callback)
      file_path = randomFilename(); owned = true
      file
        .pipe(fs.createWriteStream(file_path))
        .on('finish', callback)
        .on('error', callback)

    # run push command
    queue.defer (callback) ->
      return callback(new Error "Failed to push file: #{file.path}") if runCommand('push', file_path).code isnt 0
      calback()

    # clean up temp file if needed
    queue.await (err) ->
      fs.unlinkSync(file_path) if file_path and owned and fs.existsSync(file_path)
      calback(err)
