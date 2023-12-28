import { Context, State, useState } from "../../../src/core.js";

/**
 * 
 * @template T, R
 * @param { Context } ctx 
 * @param { () => Promise<T> } callback jsonを生成するコールバック
 * @param { (json: T) => R } transform jsonを状態変数として持つオブジェクトに変換をする関数
 * @returns { State<R | undefined> }
 */
function useSSRData(ctx, callback, transform = x => x) {
	const element = ctx.component?.element;
	/** @type { State<R | undefined> } */
	const state = useState(ctx, undefined);

	// 既に構築済みのノードに対して操作が行われる場合はデータの取り出しを試みる
	console.log(ctx.component, Node.ELEMENT_NODE)
	if (element?.nodeType === ctx.window.Node.ELEMENT_NODE) {
		const jsonElement = element.querySelector(':scope > .__USE_SSR_DATA__[type="application/json"]');
		if (jsonElement) {
			// ノードを取り出すことができたならばデータを取得してノードを除去する
			/** @type { T } */
			const json = JSON.parse(jsonElement.textContent);
			jsonElement.remove();
			state.org = transform(json);
			return state;
		}
	}

	// 取得済みのデータからデータの取得に失敗した場合はcallbackを実行してデータを取得する
	callback().then(json => state.value = transform(json));

	return state;
}

export { useSSRData };