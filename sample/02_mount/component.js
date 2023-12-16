import { useState, useComputed, GenStateNode, Context, $, t } from "../../src/core.js";
import { When } from "../lib/Choose.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * 雑にカウントを行うボタン
 * @param { Context } ctx
 * @param { CompPropTypes<typeof CountButton> } props 
 * @param { [GenStateNode] } children
 * @returns 
 */
function CountButton(ctx, props, children) {
	// 雑に同じボタンを3つ設置する
	return $('div', [
		$('button', { onclick: () => props.onclick.value() }, children),
		$('button', { onclick: () => props.onclick.value() }, children),
		$('button', { onclick: () => props.onclick.value() }, children),
	]);
}
CountButton.propTypes = {
	/** @type { () => unknown } クリックイベント */
	onclick: () => {}
};

/**
 * 2つのinputを連結しただけの入力
 * @param { Context } ctx
 * @returns 
 */
function DualInput(ctx) {
	const input1 = useState(ctx, '');
	const input2 = useState(ctx, '');

	return {
		// ノードの定義
		node: $('div', [
			$('input', { value: '初期値1' }).observe({ value: input1 }),
			$('input', { value: '初期値2' }).observe({ value: input2 }),
		]),
		// 外部に公開する状態の定義
		exposeStates: {
			value: t`${input1}+${input2}`
		}
	};
}

/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Main> } props 
 * @returns 
 */
function Main(ctx, props) {
	// カウンタの初期値のため状態変数ではなく現時点の値として受け取る
	const cnt = useState(ctx, props.init.value);
	const cnt2 = useComputed(ctx, () => cnt.value * 2);
	const input = useState(ctx, '');

	return $('div', [
		$(CountButton, { onclick: () => ++cnt.value }, [
			t`Count is: ${cnt}`
		]),
		$('hr'),
		$('div', [
			t`Count×2 is: ${cnt2}`,
			$(When, { target: cnt, test: cnt => cnt % 2 === 0 }, () => [
				$('div', { style: { color: 'red' } }, [t`Cnt is even.`])
			])
		]),
		$('div', [
			$(DualInput).observe({ value: input }),
			t`Input Text is: ${input}`
		])
	]);
}
Main.propTypes = {
	/** @type { number | undefined } カウントの初期値 */
	init: 1
};

export default Main;
