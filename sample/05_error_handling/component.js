import { useState, GenStateNode, Context } from "../../src/core.js";

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
	let cnt = 0;
	return ctx.$('button', { onclick: () => {
		cnt = (cnt + 1) % 5;
		// カウントが5の倍数のときは例外を送信
		if (cnt === 0) {
			throw new Error('Error onclick() in CountButton');
		}
		props.onclick.value();
	} }, children);
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
	ctx.onBeforeUpdate(() => {
		throw new Error('Error onBeforeUpdate() in ShowCount');
	});
	ctx.onErrorCaptured(error => {
		console.log('[errorCaptured] ShowCount', error.message);
		// カウントが3の倍数のときはエラーを親に伝播しない
		if (props.cnt.value % 3 === 0) {
			return false;
		}
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
	const cnt = useState(ctx, props.init.value);
	const input = useState(ctx, '');

	ctx.onMount(() => {
		// マウント前に例外を送信
		throw new Error('Error onMount() in Main');
		console.log('[mount] Main');
	});
	ctx.onErrorCaptured(error => {
		console.log('[errorCaptured] Main', error.message);
	});

	return ctx.$('div', [
		ctx.$(CountButton, { onclick: () => ++cnt.value }, [
			ctx.t`CountUp`
		]),
		ctx.$(ShowCount, { cnt })
	]);
}
Main.propTypes = {
	/** @type { number | undefined } カウントの初期値 */
	init: 1
};

export default Main;
