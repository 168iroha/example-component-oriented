import { useState, Context, $ } from "../../src/core.js";
import { ForEach } from "../lib/ForEach.js";

/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function Main(ctx) {
	const stateList = useState(ctx, [
		{ id: 0, val: 'item 1' },
		{ id: 1, val: 'item 2' },
		{ id: 2, val: 'item 3' },
		{ id: 3, val: 'item 4' }
	]);
	const inputVal = useState(ctx, '');
	let nextID = stateList.value.length;

	return $('div', [
		$('input', { oninput: e => inputVal.value = e.target.value, value: inputVal }),
		$('button', { onclick: () => {
			const input = inputVal.value.trim();
			if (input.length === 0) {
				alert('空のアイテムは追加できません');
				return;
			}
			stateList.value = [...stateList.value, { id: nextID++, val: input }];
		} }, ['項目の追加']),
		$('button', { onclick: () => {
			// フィッシャー–イェーツのアルゴリズムでシャッフル
			const nextStateList = [...stateList.value];
			for (let i = stateList.value.length - 1; i >= 0 ; --i) {
				const j = Math.floor(Math.random() * (i + 1));
				[nextStateList[i], nextStateList[j]] = [nextStateList[j], nextStateList[i]];
			}
			stateList.value = nextStateList;
		} }, ['シャッフル']),

		// リスト要素をレンダリングする
		$('ul', [
			$(ForEach, { target: stateList, key: v => v.id }, (item, key, genkey) => [
				$('li', { onclick: () => stateList.value = stateList.value.filter(v => genkey(v) !== key) }, [item.val])
			]),
		])
	]);
}


export default Main;
