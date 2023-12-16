import { useState, Context, $, t } from "../../src/core.js";
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
	const stateList = useState(ctx, [
		{ id: 0, val: 'item 1' },
		{ id: 1, val: 'item 2' },
		{ id: 2, val: 'item 3' },
		{ id: 3, val: 'item 4' }
	]);
	const inputVal = useState(ctx, '');
	let nextID = stateList.value.length;

	return $('div', [
		$('h2', ['リスト要素の表示']),
		$('input', { oninput: e => inputVal.value = e.target.value, value: inputVal }),
		$('button', { onclick: () => {
			// リストの挿入位置
			const p = Math.floor(Math.random() * (stateList.value.length + 1));
			const input = inputVal.value.trim();
			if (input.length === 0) {
				alert('空のアイテムは追加できません');
				return;
			}
			stateList.value = [...stateList.value.slice(0, p), { id: nextID++, val: input }, ...stateList.value.slice(p)];
		} }, ['項目の追加']),
		$('button', { onclick: () => {
			// リストの挿入位置
			const p = Math.floor(Math.random() * stateList.value.length);
			stateList.value = [...stateList.value.slice(0, p), ...stateList.value.slice(p + 1)];
		} }, ['項目の削除']),
		$('button', { onclick: () => {
			// フィッシャー–イェーツのアルゴリズムでシャッフル
			const nextStateList = [...stateList.value];
			for (let i = stateList.value.length - 1; i >= 0 ; --i) {
				const j = Math.floor(Math.random() * (i + 1));
				[nextStateList[i], nextStateList[j]] = [nextStateList[j], nextStateList[i]];
			}
			stateList.value = nextStateList;
		} }, ['シャッフル']),

		// リスト要素をアニメーション付きでレンダリングする
		$('ul', [
			$(ForEach, {
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
			}, item => [$('li', [item.val])]),
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
	const cnt = useState(ctx, 0);

	return $('div', [
		$('h2', ['選択要素の表示']),
		$('button', { onclick: () => ++cnt.value }, ['Count up']),
		$(When, {
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
			$('span', { style: { display: 'inline-block' } }, [t`Cnt is ${cnt}.`])
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
	const pageNum = useState(ctx, 0);
	// ページを生成する関数(本来はちゃんとtextとmsをpropsとしたコンポーネントとして実装するべき)
	const createPage = (text, ms) => async ctx => {
		await sleep(ms);
		return $('div', {  style: { color: 'white', 'background-color': 'black' }}, [text]);
	}
	// ロード中に表示する要素の定義
	const loading = $('div', { style: {
		'display': 'flex',
		'align-items': 'center',
		'justify-content': 'center',
		'width': '100%',
		'height': '100%',
		'color': 'white',
		'background-color': 'rgba(0, 0, 0)',
	}}, ['loading...']);

	return $('div', [
		$('h2', ['非同期要素の表示']),
		$('nav', [
			$('hr'),
			$('button', { onclick: () => pageNum.value = 0 }, ['ページ1の表示']),
			$('button', { onclick: () => pageNum.value = 1 }, ['ページ2の表示']),
			$('button', { onclick: () => pageNum.value = 2 }, ['ページ3の表示']),
			$('hr')
		]),
		$(Suspense, {
			fallback: loading,
			onAfterSwitching: node => node.element.animate?.([
				{ opacity: '0.4' }, { opacity: '1' }
			], { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished,
			onBeforeSwitching: node => node.element.animate?.([
				{ opacity: '1' }, { opacity: '0.4' }
			], { duration: 300, easing: 'ease-out', fill: 'forwards' }).finished
		}, [
			$('section', [
				$(Choose, { target: pageNum, fallthrough: true, cache: true }, [
					$(When, { test: pageNum => pageNum === 0 }, () =>  [$(createPage('page1', 2000))]),
					$(When, { test: pageNum => pageNum === 1 }, () =>  [$(createPage('page2', 1000))]),
					$(When, { test: pageNum => pageNum === 2 }, () =>  [$(createPage('page3', 1000))])
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
	return $('div', [
		$(ListAnimation),
		$(WhenAnimation),
		$(AsyncAnimation)
	]);
}


export default Main;
