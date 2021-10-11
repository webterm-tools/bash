//TODO God willing: directly build node_modules/bash or index.js
//Specifically we can try to replace bashUtils stuff into one pack or each into their own chunk and save with same name, God willing.

//that makes sense, so each package.json dependency becomes an entry point / outputs to same name, God willing.
// they can share chunks and everything, God willing, from that point on.
// the files we want to be suckless, we output directly and make sure to save the node_modules relative to it, God willing.
// can't imagine right now some being suckless and some not, which require each other locally.
// So basically, anything local can be suckless or none, God willing, unless it's easy to get around that, God willing (imagine saving some chunks relative and not in node-modules but still sharing same, God willing)
//  so when the local non-suckless file is saved, it's requirable by the suckless module, God willing.
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const ContextElementDependency = require(path.resolve(
  __dirname,
  "./node_modules/webpack/lib/dependencies/ContextElementDependency.js"
));

const cashVorpalCommandsContext = new webpack.ContextReplacementPlugin(
  /^\.$/,
  (context) => {
    if (!context.regExp || context.regExp.source !== /^vorpal\-.*$/.source)
      return;

    context.resolveDependencies = (fs, options, callback) => {
      callback(null, [
        new ContextElementDependency(
          require.resolve("vorpal-grep") +
            options.resourceQuery +
            options.resourceFragment,
          "vorpal-grep",
          options.category,
          options.referencedExports
        ),
        new ContextElementDependency(
          require.resolve("vorpal-less") +
            options.resourceQuery +
            options.resourceFragment,
          "vorpal-less",
          options.category,
          options.referencedExports
        ),
      ]);
    };
  }
);

//TODO God willing: move all dependencies to their own bundles and God willing, move shared chunks
const entries = Object.keys(require("bash-js/package.json").dependencies).reduce((entries, currentDep) => {
  entries[currentDep] = {
    import: currentDep,
    filename: "node_modules/" + currentDep + ".js"
  }

  return entries
}, {});

module.exports = [{
  entry: entries,
  mode: "development",
  target: "web",
  output: {
    library: {
      type: 'commonjs2'
    }
  },
  optimization: {
    //TODO God willing: move common/shared libraries here, God willing
    nodeEnv: false
  },
  externals: {
    //This feels good being able to separate the two scripts dependencies, God bless.
    fs: "fs",
    path: "path",
    net: "net",
    http: "http",
    https: "https",
    tls: "tls",
    crypto: "crypto",
    util: "util",
    stream: "stream",
    buffer: "buffer",
    os: "os",
    assert: "assert",
    url: "url",
    zlib: "zlib",
    querystring: "querystring",
    tty: "tty",
    child_process: "child_process",
    dns: "dns",
    constants: "constants",
    readline: "readline",
    console: "console",
    process: "process",

    "graceful-fs": "graceful-fs",
    //"graceful-fs": "globalThis['graceful-fs']", //Not necessary when commonjs2
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: require.resolve("process"),
      console: require.resolve("console"),
    }),
    cashVorpalCommandsContext,
    new CopyPlugin({
      patterns: [
        { from: require.resolve("bash-js/index.js"), to: "index.js" },
        { from: path.join(require.resolve("bash-js"), "../src"), to: "src/" },
      ],
    }),
  ],
}]