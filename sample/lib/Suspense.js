import { StateNode, StateNodeSet, GenStateNode, GenStateNodeSet, Context, ILocalSuspenseContext, SuspenseContext } from "../../src/core.js";
import { SwitchingPage, SuspendGroup } from "../../src/async.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @template T
 * @typedef { import("../../src/core.js").ComponentType<T> } ComponentType コンポーネントの型
 */

/**
 * @template T
 * @typedef { import("../../src/core.js").AsyncComponentType<T> } AsyncComponentType 非同期コンポーネントの型
 */

/**
 * @typedef { import("../../src/async.js").SuspendGroupCallbackType } SuspendGroupCallbackType SuspendGroupでキャプチャするコールバックの型
 */

/**
 * キャプチャ対象の非同期関数のキャプチャのためのILocalSuspenseContext
 * @implements { ILocalSuspenseContext }
 */
class LocalSuspenseContextForCapture {
	/** @type { SuspendGroup } switchingPageのためのグループ */
	#suspendGroup = new SuspendGroup();
	/** @type { SuspendGroupCallbackType[] } キャプチャしたコールバックを受け取る関数 */
	#callbackList = [];
	/** @type { ((v: unknown) => void)[] } キャプチャしたコールバックを受け取る関数 */
	#resolveList = [];

	/**
	 * 遅延評価を行うためにPromiseをキャプチャする
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { SuspendGroupCallbackType } callback キャプチャを実施する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(ctx, callback, cancellable = true) {
		await new Promise(resolve => {
			this.#suspendGroup.reset();
			// 呼び出し情報を記録する
			this.#callbackList.push(this.#suspendGroup.capture(callback, false));
			this.#resolveList.push(resolve);
		});
	}

	/**
	 * 蓄積したキャプチャ対象のコールバックのPromiseを解決する
	 */
	async call() {
		const callbackList = this.#callbackList;
		this.#callbackList = [];
		await Promise.all(callbackList);
	}

	/**
	 * 蓄積したキャプチャを解決する
	 */
	resolve() {
		const resolveList = this.#resolveList;
		this.#resolveList = [];
		resolveList.forEach(resolve => resolve());
	}

	/**
	 * 蓄積したキャプチャが存在するか
	 */
	get exists() {
		return this.#callbackList.length !== 0;
	}
}

/**
 * StateNodeの更新のためのILocalSuspenseContext
 * @implements { ILocalSuspenseContext }
 */
class LocalSuspenseContextOnStateNode {
	/** @type { StateNode | undefined } ロード画面を示すノード */
	alternativePage;
	/** @type { SuspendGroup } switchingPageのためのグループ */
	#suspendGroup = new SuspendGroup();
	/** @type { SwitchingPage } ロード画面に関する遷移の実施 */
	#switchingPage = new SwitchingPage(new SuspendGroup());
	/** @type { StateNode } 切り替え対象の画面を示すノード */
	page;

	/**
	 * 内部で用いるSuspendGroupの取得
	 */
	get suspendGroup() {
		return this.#suspendGroup;
	}

	/**
	 * ページ切り替えのためのオブジェクトの取得
	 */
	get switchingPage() {
		return this.#switchingPage;
	}

	/**
	 * 遅延評価を行うためにPromiseをキャプチャする
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { SuspendGroupCallbackType } callback キャプチャを実施する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(ctx, callback, cancellable) {
		if (this.alternativePage) {
			const this_ = this;
			const alternativePage = this.alternativePage;
			const page = this.page;

			await this.#suspendGroup.capture(function* () {
				this_.#switchingPage.node = page;
				yield this_.#switchingPage.switching(alternativePage, cancellable);
				yield this_.#switchingPage.suspendGroup.capture(callback, cancellable);
				yield this_.#switchingPage.switching(page, cancellable);
			}, cancellable);
		}
		else {
			// 自ページから自ページへの遷移により自ページのみに対するアニメーションなどを実現
			this.#switchingPage.node = this.page;
			await this.#switchingPage.switching(async () => {
				await this.#suspendGroup.capture(callback, cancellable);
				return this.page;
			}, cancellable);
		}
	}
}

/**
 * SuspenseのためのStateNodeSetを生成するためのノードの集合
 */
class GenSuspenseStateNodeSet extends GenStateNodeSet {
	/** @type { CompPropTypes<typeof Suspense> } プロパティ */
	#props;

	/**
	 * コンストラクタ
	 * @param { CompPropTypes<typeof Suspense> } props 
	 * @param { [GenStateNode] } nestedNodeSet
	 */
	constructor(props, nestedNodeSet) {
		super(nestedNodeSet);
		this.#props = props;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];

		const suspendGroup = new LocalSuspenseContextOnStateNode();
		const ctx2 = ctx.generateContextForSuspense(new SuspenseContext(suspendGroup));
		// 各種LocalSuspenseContextOnStateNodeのインスタンスの単方向関連付け
		ctx2.call(() => {
			suspendGroup.switchingPage.afterSwitching = this.#props.onAfterSwitching.value;
		});
		ctx2.call(() => {
			suspendGroup.switchingPage.beforeSwitching = this.#props.onBeforeSwitching.value;
		});
		ctx2.call(() => {
			if (this.#props.fallback.value) {
				suspendGroup.alternativePage = this.#props.fallback.value.build(ctx2);
			}
		});
		this.nestedNodeSet[0].getStateNode(node => suspendGroup.page = node);
		const set = new StateNodeSet(ctx2, this.nestedNodeSet, sibling);
		return { set, sibling };
	}
}

/**
 * 非同期処理をキャッチして代替するノードを表示する擬似コンポーネント
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Suspense> } props 
 * @param { [GenStateNode] } children
 * @returns 
 */
function Suspense(ctx, props, children) {
	return new GenSuspenseStateNodeSet(props, children);
}
Suspense.propTypes = {
	/** @type { GenStateNode | undefined } 非同期処理中に表示をするノード(非同期ノードの設定は非推奨) */
	fallback: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード削除前に実行されるイベント */
	onBeforeSwitching: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード挿入後に実行されるイベント */
	onAfterSwitching: undefined
};
/** @type { true } */
Suspense.early = true;

/**
 * コンポーネントの遅延読み込みを行う
 * @template { ComponentType<K> } K
 * @param { () => Promise<K | AsyncComponentType<K>> } callback 関数によるコンポーネントを生成する関数
 */
function load(callback) {
	/** @type { ReturnType<typeof callback> | undefined } callbackの評価結果 */
	let promise = undefined;
	/** @type { K | AsyncComponentType<K> | undefined } promiseの解決結果 */
	let inst = undefined;

	return {
		get component() {
			if (inst) {
				// callbackが評価済みの場合は同期コンポーネントとして得る
				return inst;
			}
			// はじめての評価では非同期コンポーネントとして得る
			/**
			 * @param { Parameters<K> } args
			 */
			return async (...args) => {
				inst = inst ?? await (promise ?? (promise = callback()));
				return inst(...args);
			}
		}
	};
}

export { LocalSuspenseContextForCapture, Suspense, load };
