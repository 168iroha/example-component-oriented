import { CommonLabel, IState, Context, State, useState, watch } from "../../src/core.js";

/** onMountを即時評価するためのラベル */
const onMountLabel = new CommonLabel();

/**
 * SSRで利用する状態変数の宣言
 * @template T, R
 * @param { Context } ctx 
 * @param { IState<unknown>[] | IState<unknown> } watchState callbackを再度呼びだすトリガーとなる状態変数
 * @param { () => Promise<T> } callback jsonを生成するコールバック
 * @param { R | undefined } init 状態変数の初期値
 * @param { (json: T) => R } transform jsonを状態変数として持つオブジェクトに変換をする関数
 */
function useSSRData(ctx, watchState, callback, init, transform = x => x) {
	const element = ctx.component?.element;
	const state = useState(ctx, init);

	const className = '__USE_SSR_DATA__';
	const type = 'application/json';

	const genStateNode = ctx.genStateNode;
	if (ctx.waitFlag === 'nowait') {
		const setState = () => callback().then(json => state.value = transform(json));
		// 既に構築済みのノードに対して操作が行われる場合はデータの取り出しを試みる
		if (element?.nodeType === ctx.window.Node.ELEMENT_NODE) {
			const jsonElement = element.querySelector(`:scope > .${className}[type="${type}"]`);
			if (jsonElement) {
				// ノードを取り出すことができたならばデータを取得してノードを除去する
				/** @type { T } */
				const json = JSON.parse(jsonElement.textContent);
				jsonElement.remove();
				state.org = transform(json);
				// watch
				watch(ctx, watchState, setState);
				return state;
			}
		}

		// 取得済みのデータからデータの取得に失敗した場合はcallbackを実行してデータを取得する
		setState();
		// watch
		watch(ctx, watchState, setState);
	}
	else {
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
				if (element) {
					const jsonElement = ctx.window.document.createElement('script');
					jsonElement.className = className;
					jsonElement.type = type;
					jsonElement.textContent = JSON.stringify(json);
					element.appendChild(jsonElement);
				}
			}, onMountLabel);
		}
	}

	return state;
}

export { useSSRData };