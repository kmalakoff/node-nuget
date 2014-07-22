nuget
==================

Nuget library wrapper for Node.js using Vinyl files.

# Raw usage

```
nuget = require 'nuget'

nuget.pack 'package.nuspec', (err, file) ->
  throw err if err

  nuget.push file, (err) ->
    throw err if err

    console.log "Successfully pushed #{file.path}"
```

# Gulp usage

```
nugetGulp = es.map (file, callback) ->
  nuget.pack (err, file) ->
    return callback(err) if err
    nuget.push(callback)
```
