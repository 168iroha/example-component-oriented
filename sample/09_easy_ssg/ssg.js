import { Context, $ } from "../../src/core.js";
import { App } from "./app.js";
import { JSDOM } from 'jsdom';
import fs from "fs";

/**
 * ページ情報
 * @param { Context } ctx 
 */
function Page(ctx) {
	return $('html', [
		$('head', [
			$('meta', { charset: 'utf-8' }),
			$('script', { src: './main.js', type: 'module' })
		]),
		$('body', [
			$('div', { id: 'app' })
		])
	]);
}

// Node.jsではdoumentが利用できないためJSDOMで代替
const dom = new JSDOM(``, { contentType: 'text/html'});
const document = dom.window.document;

// 明示的にJSDOMのwindowインターフェースを指定
const ctx = new Context(dom.window);

// HTMLドキュメントの生成(Node.jsではデフォルトはUTF-8)
const doctypeNode = document.implementation.createDocumentType('html', '', '');
const htmlNode = $(Page).build(ctx);
const documentNode = document.implementation.createDocument('', '', null);
documentNode.appendChild(doctypeNode);
documentNode.appendChild(htmlNode.element);

// アプリケーションノードの書き込み
await $(App).write(documentNode.getElementById('app'), ctx);

// 構築結果をファイル出力
fs.writeFile('index.html', new dom.window.XMLSerializer().serializeToString(documentNode), (err, data) => {
	if(err) console.log(err);
	else console.log('write end');
});
