import { Context } from "../../src/core.js";
import { ForEach } from "../lib/ForEach.js";

/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function Main(ctx) {
	const stateList = ctx.useState([
		{ id: 0, val: 'item 1' },
		{ id: 1, val: 'item 2' },
		{ id: 2, val: 'item 3' },
		{ id: 3, val: 'item 4' }
	]);
	const inputVal = ctx.useState('');
	let nextID = stateList.value.length;

	return ctx.$('div', [
		ctx.$('input', { oninput: e => inputVal.value = e.target.value, value: inputVal }),
		ctx.$('button', { onclick: () => {
			const input = inputVal.value.trim();
			if (input.length === 0) {
				alert('空のアイテムは追加できません');
				return;
			}
			stateList.value = [...stateList.value, { id: nextID++, val: input }];
		} }, ['項目の追加']),
		ctx.$('button', { onclick: () => {
			// フィッシャー–イェーツのアルゴリズムでシャッフル
			const nextStateList = [...stateList.value];
			for (let i = stateList.value.length - 1; i >= 0 ; --i) {
				const j = Math.floor(Math.random() * (i + 1));
				[nextStateList[i], nextStateList[j]] = [nextStateList[j], nextStateList[i]];
			}
			stateList.value = nextStateList;
		} }, ['シャッフル']),

		// リスト要素をレンダリングする
		ctx.$('ul', [
			ctx.$(ForEach, { target: stateList, key: v => v.id }, (item, key, genkey) => [
				ctx.$('li', { onclick: () => stateList.value = stateList.value.filter(v => genkey(v) !== key) }, [item.val])
			]),
		])
	]);
}


export default Main;