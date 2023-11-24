import { Context } from "../../src/core.js";
import { ForEach } from "../lib/ForEach.js";
import { When } from "../lib/Choose.js";

/**
 * リストについてのアニメーションを扱うコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function ListAnimation(ctx) {
	// リスト要素
	const stateList = ctx.useState([
		{ id: 0, val: 'item 1' },
		{ id: 1, val: 'item 2' },
		{ id: 2, val: 'item 3' },
		{ id: 3, val: 'item 4' }
	]);
	const inputVal = ctx.useState('');
	let nextID = stateList.value.length;

	return ctx.$('div', [
		ctx.$('h2', ['リスト要素の表示']),
		ctx.$('input', { oninput: e => inputVal.value = e.target.value, value: inputVal }),
		ctx.$('button', { onclick: () => {
			// リストの挿入位置
			const p = Math.floor(Math.random() * (stateList.value.length + 1));
			const input = inputVal.value.trim();
			if (input.length === 0) {
				alert('空のアイテムは追加できません');
				return;
			}
			stateList.value = [...stateList.value.slice(0, p), { id: nextID++, val: input }, ...stateList.value.slice(p)];
		} }, ['項目の追加']),
		ctx.$('button', { onclick: () => {
			// リストの挿入位置
			const p = Math.floor(Math.random() * stateList.value.length);
			stateList.value = [...stateList.value.slice(0, p), ...stateList.value.slice(p + 1)];
		} }, ['項目の削除']),
		ctx.$('button', { onclick: () => {
			// フィッシャー–イェーツのアルゴリズムでシャッフル
			const nextStateList = [...stateList.value];
			for (let i = stateList.value.length - 1; i >= 0 ; --i) {
				const j = Math.floor(Math.random() * (i + 1));
				[nextStateList[i], nextStateList[j]] = [nextStateList[j], nextStateList[i]];
			}
			stateList.value = nextStateList;
		} }, ['シャッフル']),

		// リスト要素をアニメーション付きでレンダリングする
		ctx.$('ul', [
			ctx.$(ForEach, {
				target: stateList,
				key: v => v.id,
				onAfterSwitching: node => node.element.animate([
					{ transform: 'translateX(30px)', opacity: '0' },
					{ transform: 'translateX(0)', opacity: '1' }
				], { duration: 300, easing: 'ease-out' }).finished,
				onBeforeSwitching: node => {
					// 削除する要素はレイアウトから浮かせる
					node.element.style.position = 'absolute';
					return node.element.animate([
						{ transform: 'translateX(0)', opacity: '1' },
						{ transform: 'translateX(-30px)', opacity: '0' }
					], { duration: 300, easing: 'ease-out' }).finished
				},
				move: { duration: 300, easing: 'ease-out' }
			}, (item, key, genkey) => [
				ctx.$('li', { onclick: () => stateList.value = stateList.value.filter(v => genkey(v) !== key) }, [item.val])
			]),
		])
	]);
}

/**
 * 選択要素についてのアニメーションを扱うコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function WhenAnimation(ctx) {
	// カウンタ
	const cnt = ctx.useState(0);

	return ctx.$('div', [
		ctx.$('h2', ['選択要素の表示']),
		ctx.$('button', { onclick: () => ++cnt.value }, ['Count up']),
		ctx.$(When, {
			target: cnt,
			onAfterSwitching: node => node.element.animate([
				{ transform: 'translateY(10px)', opacity: '0' },
				{ transform: 'translateY(0)', opacity: '1' }
			], { duration: 150, easing: 'ease-out' }).finished,
			onBeforeSwitching: node => node.element.animate([
				{ transform: 'translateY(0)', opacity: '1' },
				{ transform: 'translateY(-10px)', opacity: '0' }
			], { duration: 150, easing: 'ease-out' }).finished
		}, cnt => [
			ctx.$('span', { style: { display: 'inline-block' } }, [ctx.t`Cnt is ${cnt}.`])
		])
	]);
}

/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function Main(ctx) {
	return ctx.$('div', [
		ctx.$(ListAnimation),
		ctx.$(WhenAnimation),
	]);
}


export default Main;
