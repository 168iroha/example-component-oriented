const path = require('path');

/** @type { import('webpack').Configuration } サーバサイドスクリプト生成のための設定 */
const serverConfig = {
    mode: 'development',
    target: 'node',
    resolve: {
        alias: {
            '@lib': [path.resolve(__dirname, '../lib/server'), path.resolve(__dirname, '../lib')]
        }
    },
    entry: {
        ssg: './src/ssg.js',
    },
    output: {
        filename: '[name].cjs',
        path: __dirname
    }
};

/** @type { import('webpack').Configuration } clientサイドスクリプト生成のための設定 */
const clientConfig = {
    mode: 'development',
    target: 'web',
    resolve: {
        alias: {
            '@lib': [path.resolve(__dirname, '../lib/client'), path.resolve(__dirname, '../lib')]
        }
    },
    entry: {
        main: './src/index.js'
    },
    output: {
        filename: '[name].js',
        path: __dirname
    }
};

module.exports = [serverConfig, clientConfig];
