import { Context } from "../../src/core.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @typedef { import("../../src/core.js").CompChildType } CompChildType コンポーネント上での子要素の型
 */

/**
 * 雑にカウントを行うボタン
 * @param { Context } ctx
 * @param { CompPropTypes<typeof CountButton> } props 
 * @param { CompChildType } children
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
 * @param { CompPropTypes<typeof SohwCount> } props 
 * @param { CompChildType } children
 * @returns 
 */
function SohwCount(ctx, props, children) {
	ctx.onMount(() => {
		console.log('[mount] SohwCount');
	});
	ctx.onUnmount(() => {
		console.log('[unmount] SohwCount');
	});
	ctx.onBeforeUpdate(() => {
		console.log('[beforeUpdate] SohwCount');
	});
	ctx.onAfterUpdate(() => {
		console.log('[afterUpdate] SohwCount');
	});

	return ctx.$('div', [ctx.t`Count is: ${props.cnt}`]);
}
SohwCount.propTypes = {
	/** @type { number } 現在のカウント */
	cnt: 0
};


/**
 * メインとなるコンポーネント
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Main> } props 
 * @param { CompChildType } children
 * @returns 
 */
function Main(ctx, props, children) {
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
		ctx.choose({}, cnt, [
			[cnt => cnt % 5 !== 1, ctx.$(SohwCount, { cnt })]
		])
	]);
}
Main.propTypes = {
	/** @type { number | undefined } カウントの初期値 */
	init: 1
};

export default Main;
