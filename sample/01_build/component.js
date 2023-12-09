import { useState, GenStateNode, Context } from "../../src/core.js";
import { Choose, When } from "../lib/Choose.js";

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
	return ctx.$('div', [
		ctx.$('button', { onclick: () => props.onclick.value() }, children),
		ctx.$('button', { onclick: () => props.onclick.value() }, children),
		ctx.$('button', { onclick: () => props.onclick.value() }, children),
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
		node: ctx.$('div', [
			ctx.$('input', { value: '初期値1' }).observe({ value: input1 }),
			ctx.$('input', { value: '初期値2' }).observe({ value: input2 }),
		]),
		// 外部に公開する状態の定義
		exposeStates: {
			value: ctx.t`${input1}+${input2}`
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
	const input = useState(ctx, '');

	return ctx.$('div', [
		ctx.$(CountButton, { onclick: () => ++cnt.value }, [
			ctx.t`Count is: ${cnt}`
		]),
		ctx.$('hr'),
		ctx.$('div', [
			ctx.t`Count×2 is: ${() => cnt.value * 2}`,
			ctx.$('div', { style: { color: 'red' } }, [
				ctx.$(Choose, { target: cnt }, [
					ctx.$(When, { test: cnt => cnt % 2 === 0 },() =>  [ctx.t`Cnt is even.`]),
					ctx.$(When, () => [ctx.t`Cnt is odd.`])
				])
			])
		]),
		ctx.$('div', [
			ctx.$(DualInput).observe({ value: input }),
			ctx.t`Input Text is: ${input}`
		])
	]);
}
Main.propTypes = {
	/** @type { number | undefined } カウントの初期値 */
	init: 1
};

export default Main;
