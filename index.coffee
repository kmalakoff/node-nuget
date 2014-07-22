fs = require 'fs'
path = require 'path'
_ = require 'underscore'
Queue = require 'queue-async'
es = require 'event-stream'
et = require 'elementtree'
crypto = require 'crypto'
vinyl = require 'vinyl-fs'

require 'shelljs/global'
NUGET_EXE = path.resolve(path.join(__dirname, './bin/NuGet.exe'))

runCommand = (command, arg) ->
  args = [NUGET_EXE, command, arg]
  args.unshift('mono') unless process.platform is 'win32'
  exec args.join(' ')

debounceCallback = (callback) ->
  debounced_callback = -> return if debounced_callback.was_called; debounced_callback.was_called = true; callback.apply(null, Array.prototype.slice.call(arguments, 0))
  return debounced_callback

getFile = (file, callback) ->
  return callback(null, file) if file.pipe
  vinyl.src(file)
    .pipe es.writeArray (err, files) ->
      return callback(err) if err
      return callback(new Error "Expecting one file for #{file}. Found #{files.length}") if files.length is 0 or files.length > 1
      callback(null, files[0])

randomFilename = -> crypto.createHash('sha1').update(new Date().getTime().toString()+_.uniqueId()).digest('hex')

module.exports = class NodeNuget
  @setApiKey: (key, callback) ->
    return callback(new Error 'Failed to set API key') if runCommand('setApiKey', key).code isnt 0
    callback()

  @pack: (file, callback) ->
    getFile file, (err, file) ->
      return callback(err) if err

      file.pipe es.wait (err, data) ->
        return callback(err) if err

        package_desc = et.parse(data.toString())
        package_id = package_desc.findtext('./metadata/id')
        package_version = package_desc.findtext('./metadata/version')

        files = (path.join(path.dirname(file.path), item.attrib?.src) for item in package_desc.findall('./files/file'))
        if (missing_files = (item for item in file when not fs.existsSync(item))).length
          return callback(new Error "Nuget: cannot build #{file.path}. Missing files: #{missing_files}")

        return callback(new Error "Failed to pack file: #{file.path}") if runCommand('pack', file.path).code isnt 0

        package_path = path.resolve(path.join(process.cwd(), '.', "#{package_id}.#{package_version}.nupkg"))
        getFile package_path, (err, file) ->
          return callback(err) if err
          fs.unlink package_path, -> callback(err, file)

  @push: (file, callback) ->
    file_path = null; owned = false

    queue = new Queue(1)

    # ensure there is a file on disk
    queue.defer (callback) ->
      return callback(null, file_path = file) unless file.pipe
      return callback() if fs.existsSync(file_path = file.path) # use if exists on disk

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
      callback(err)
