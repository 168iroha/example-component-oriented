const path = require('path');

/** @type { import('webpack').Configuration } サーバサイドスクリプト生成のための設定 */
const serverConfig = {
    mode: 'development',
    target: 'node',
    entry: {
        ssg: './ssg.js',
    },
    output: {
        filename: '[name].cjs',
        path: __dirname
    }
};

module.exports = [serverConfig];
