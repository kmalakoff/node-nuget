nuget
==================

Nuget library wrapper for Node.js using Vinyl files.

```
nuget = require 'nuget'

nuget.pack 'package.nuspec', (err, file) ->
  throw err if err

  nuget.push file, (err) ->
    throw err if err

    console.log "Successfully pushed #{file.path}"
```
