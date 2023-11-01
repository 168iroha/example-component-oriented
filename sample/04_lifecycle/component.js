import { GenStateNode, Context } from "../../src/core.js";
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
	ctx.onMount(() => {
		console.log('[mount] CountButton');
	});
	ctx.onUnmount(() => {
		console.log('[unmount] CountButton');
	});
	ctx.onBeforeUpdate(() => {
		console.log('[beforeUpdate] CountButton');
	});
	ctx.onAfterUpdate(() => {
		console.log('[afterUpdate] CountButton');
	});

	return ctx.$('button', { onclick: () => props.onclick.value() }, children);
}
CountButton.propTypes = {
	/** @type { () => unknown } クリックイベント */
	onclick: () => {}
};

/**
 * 現在のカウントを表示する
 * @param { Context } ctx
 * @param { CompPropTypes<typeof ShowCount> } props 
 * @returns 
 */
function ShowCount(ctx, props) {
	ctx.onMount(() => {
		console.log('[mount] ShowCount');
	});
	ctx.onUnmount(() => {
		console.log('[unmount] ShowCount');
	});
	ctx.onBeforeUpdate(() => {
		console.log('[beforeUpdate] ShowCount');
	});
	ctx.onAfterUpdate(() => {
		console.log('[afterUpdate] ShowCount');
	});

	return ctx.$('div', [ctx.t`Count is: ${props.cnt}`]);
}
ShowCount.propTypes = {
	/** @type { number } 現在のカウント */
	cnt: 0
};


/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Main> } props 
 * @returns 
 */
function Main(ctx, props) {
	// カウンタの初期値のため状態変数ではなく現時点の値として受け取る
	const cnt = ctx.useState(props.init.value);
	const input = ctx.useState('');

	ctx.onMount(() => {
		console.log('[mount] Main');
	});
	ctx.onUnmount(() => {
		console.log('[unmount] Main');
	});
	ctx.onBeforeUpdate(() => {
		console.log('[beforeUpdate] Main');
	});
	ctx.onAfterUpdate(() => {
		console.log('[afterUpdate] Main');
	});

	return ctx.$('div', [
		ctx.$(CountButton, { onclick: () => ++cnt.value }, [
			ctx.t`CountUp`
		]),
		ctx.$(When, { test: () => cnt.value % 5 !== 1 }, [
			ctx.$(ShowCount, { cnt })
		])
	]);
}
Main.propTypes = {
	/** @type { number | undefined } カウントの初期値 */
	init: 1
};

export default Main;
