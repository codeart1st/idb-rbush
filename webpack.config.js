const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')
const nameCache = require(path.resolve(__dirname, 'mangle-cache.json'))

module.exports = {
  entry: path.resolve(__dirname, 'src', 'index.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'rbush.js',
    libraryTarget: 'umd'
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          nameCache,
          mangle: {
            properties: {
              regex: /_$/
            }
          }
        }
      })
    ]
  }
}