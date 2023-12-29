import { Context, $, useState } from "../../../src/core.js";
import { useSSRData } from "@lib/useSSRData.js";
import { ForEach } from "@lib/ForEach.js";

/** sleep関数 */
const sleep = t => new Promise(resolve => setTimeout(resolve, t));

const listData = [
	{ id: 0, val: 'item 1' },
	{ id: 1, val: 'item 2' },
	{ id: 2, val: 'item 3' },
	{ id: 3, val: 'item 4' }
];
let nextID = listData.length;

/**
 * サーバからデータを取得する関数のモック
 */
async function getListData() {
	console.log('call getListData');
	await sleep(1000);
	return [...listData];
}

/**
 * アプリケーションのエントリポイント
 * @param { Context } ctx
 */
function App(ctx) {
	const trigger = useState(ctx, true);
	const stateList = useSSRData(ctx, trigger, getListData);

	return $('div', [
		$('button', { onclick: () => {
			// 擬似的に次に取得するデータを変更するための処置
			listData.push({ id: ++nextID, val: `item ${nextID}` });
			trigger.value = !trigger.value;
		} }, ['データの再取得']),
		$('ul', [
			$(ForEach, { target: stateList, key: v => v.id }, item => [
				$('li', [item.val])
			]),
		])
	]);
}

export { App };
