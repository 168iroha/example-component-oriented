import { Context, $ } from "../../../src/core.js";
import { useSSRData } from "@lib/useSSRData.js";
import { ForEach } from "@lib/ForEach.js";

/** sleep関数 */
const sleep = t => new Promise(resolve => setTimeout(resolve, t));

/**
 * サーバからデータを取得する関数のモック
 */
async function getListData() {
	await sleep(10);
	return [
		{ id: 0, val: 'item 1' },
		{ id: 1, val: 'item 2' },
		{ id: 2, val: 'item 3' },
		{ id: 3, val: 'item 4' }
	];
}

/**
 * アプリケーションのエントリポイント
 * @param { Context } ctx
 */
function App(ctx) {
	const stateList = useSSRData(ctx, getListData);

	return $('div', [
		$('ul', [
			$(ForEach, { target: stateList, key: v => v.id }, item => [
				$('li', [item.val])
			]),
		])
	]);
}

export { App };
