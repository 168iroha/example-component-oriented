import { CommonLabel, IState, Context, State, useState } from "../../../src/core.js";

/** onMountを即時評価するためのラベル */
const onMountLabel = new CommonLabel();

/**
 * 
 * @template T, R
 * @param { Context } ctx 
 * @param { IState<unknown>[] | IState<unknown> } watchState callbackを再度呼びだすトリガーとなる状態変数
 * @param { () => Promise<T> } callback jsonを生成するコールバック
 * @param { (json: T) => R } transform jsonを状態変数として持つオブジェクトに変換をする関数
 * @returns { State<R | undefined> }
 */
function useSSRData(ctx, watchState, callback, transform = x => x) {
	/** @type { State<R | undefined> } */
	const state = useState(ctx, undefined);

	const genStateNode = ctx.genStateNode;
	if (genStateNode) {
		/** @type { T | undefined } */
		let json = undefined;
		// 評価を行うPromiseの登録
		genStateNode.addGenPromise(async () => {
			json = await callback();
			state.value = transform(json);
		});
		ctx.onMount(() => {
			// DOMツリーにデータを書きだす
			const element = ctx.component?.element;
			if (element) {
				const jsonElement = ctx.window.document.createElement('script');
				jsonElement.className = '__USE_SSR_DATA__';
				jsonElement.type = 'application/json';
				jsonElement.textContent = JSON.stringify(json);
				element.appendChild(jsonElement);
			}
		}, onMountLabel);
	}

	return state;
}

export { useSSRData };