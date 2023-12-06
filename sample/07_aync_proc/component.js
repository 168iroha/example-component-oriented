import { Context } from "../../src/core.js";
import { ForEach } from "../lib/ForEach.js";
import { Choose, When } from "../lib/Choose.js";
import { Suspense } from "../lib/Suspense.js";

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
			}, item => [ctx.$('li', [item.val])]),
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
 * 選択要素についてのアニメーションを扱うコンポーネント
 * @param { Context } ctx
 * @returns 
 */
function AsyncAnimation(ctx) {
	// sleep関数
	const sleep = t => new Promise(resolve => setTimeout(resolve, t));
	// ページ番号
	const pageNum = ctx.useState(0);
	// ページを生成する関数(本来はちゃんとtextとmsをpropsとしたコンポーネントとして実装するべき)
	const createPage = (text, ms) => async ctx => {
		await sleep(ms);
		return ctx.$('div', {  style: { color: 'white', 'background-color': 'black' }}, [text]);
	}
	// ロード中に表示する要素の定義
	const loading = ctx.$('div', {
		'display': 'flex',
		'align-items': 'center',
		'justify-content': 'center',
		'width': '100%',
		'height': '100%',
		'color': 'white',
		'background-color': 'rgba(0, 0, 0, 0.5)',
	}, ['loading...']);

	return ctx.$('div', [
		ctx.$('h2', ['非同期要素の表示']),
		ctx.$('nav', [
			ctx.$('hr'),
			ctx.$('button', { onclick: () => pageNum.value = 0 }, ['ページ1の表示']),
			ctx.$('button', { onclick: () => pageNum.value = 1 }, ['ページ2の表示']),
			ctx.$('button', { onclick: () => pageNum.value = 2 }, ['ページ3の表示']),
			ctx.$('hr')
		]),
		ctx.$(Suspense, {
			fallback: loading,
			onAfterSwitching: node => node.element.animate?.([
				{ opacity: '0.4' }, { opacity: '1' }
			], { duration: 150, fill: 'forwards' }).finished,
			onBeforeSwitching: node => node.element.animate?.([
				{ opacity: '1' }, { opacity: '0.4' }
			], { duration: 150, fill: 'forwards' }).finished
		}, [
			ctx.$('section', [
				ctx.$(Choose, { target: pageNum, fallthrough: true }, [
					ctx.$(When, { test: pageNum => pageNum === 0 }, () =>  [ctx.$(createPage('page1', 2000))]),
					ctx.$(When, { test: pageNum => pageNum === 1 }, () =>  [ctx.$(createPage('page2', 1000))]),
					ctx.$(When, { test: pageNum => pageNum === 2 }, () =>  [ctx.$(createPage('page3', 1000))])
				])
			])
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
		ctx.$(AsyncAnimation)
	]);
}


export default Main;
