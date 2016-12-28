var fs = require('fs')
var path = require('path')

var flavors = process.env.FLAVORS
flavors = flavors ? flavors.split(',') : []

function resolveImport(source, file, opts) {
  var dirpath = path.dirname(file)

  // opts passed through .babelrc as second argument
  //
  // .babelrc
  // "plugins": [["tipsi-flavors", {"FLAVORS": ["custom", "tipsi"]}]]
  flavors = !flavors.length && opts.FLAVORS && opts.FLAVORS.length ? opts.FLAVORS : flavors

  if (!flavors.length) {
    return source
  }

  var expectedPath
  for (var i = 0; i < flavors.length; i++) {
    var suffix = flavors[i]
    var correctSuffix = suffix ? '.' + suffix : ''
    var parsedSourceName = path.parse(source)
    var pathname = path.resolve(
      dirpath,
      parsedSourceName.dir,
      parsedSourceName.name + correctSuffix + '.js'
    )
    var isExist = fs.existsSync(pathname)

    if (isExist) {
      expectedPath = [path.dirname(source), path.basename(pathname)].join('/')

      // We care about file extensions
      // If source code doesn't contain '.js' extension,
      // we will not pass it through transpiled code
      if (!source.endsWith('.js')) {
        expectedPath = expectedPath.slice(0, expectedPath.length - 3)
      }

      break
    }
  }

  // If we will not return undefined while expectedPath === source
  // babel will infinitely visit updated paths
  // and transform them again and again
  return expectedPath !== source ? expectedPath : undefined
}

module.exports = function(babel) {
  var t = babel.types

  function checkRequire(path) {
    var callee = path.node.callee
    var isId = t.isIdentifier
    var isMember = t.isMemberExpression
    var obj = { name: 'require' }
    return !isId(callee, obj) && !(isMember(callee) && isId(callee.object, obj))
  }

  function transform(path, state, isRequireCall) {
    if (isRequireCall && checkRequire(path)) {
      return
    }

    var source = isRequireCall ? path.node.arguments[0] : path.node.source
    if (source && source.type === 'StringLiteral') {
      var modulePath = resolveImport(source.value, state.file.opts.filename, state.opts)
      if (modulePath) {
        var specifiersValue = isRequireCall ? path.node.callee : path.node.specifiers
        var pathValue = t.stringLiteral(modulePath)
        path.replaceWith(
          t[isRequireCall ? 'callExpression' : 'importDeclaration'](
              specifiersValue,
              isRequireCall ? [pathValue] : pathValue
          )
        )
      }
    }
  }

  return {
    visitor: {
      CallExpression: {
        exit: function(path, state) {
          return transform(path, state, true)
        },
      },
      ImportDeclaration: {
        exit: function(path, state) {
          return transform(path, state)
        },
      },
    },
  }
}