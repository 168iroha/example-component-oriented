import { StateNode, StatePlaceholderNode, StateNodeSet, GenStateNode, GenStateNodeSet, Context, ILocalSuspenseContext, SuspenseContext, normalizeCtxProps } from "../../src/core.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @template T
 * @typedef { import("../../src/core.js").CtxPropTypes<T> } CtxPropTypes コンテキスト上でのプロパティの型
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
 * @typedef { () => Promise<unknown> | undefined | Generator<Promise<unknown> | undefined, Promise<unknown> | undefined> } SuspendGroupCallbackType SuspendGroupでキャプチャするコールバックの型
 */

/**
 * @typedef { () => Generator<Promise<unknown> | undefined, Promise<unknown> | undefined> } SuspendGroupGeneratorFunctionType SuspendGroupでキャプチャするジェネレータ関数の型
 */

/**
 * アニメーションの一時停止をグループ単位で実現するためのクラス
 */
class SuspendGroup {
	/** @type { [] | undefined } capture呼び出しの記憶 */
	#inst = [];

	/**
	 * ジェネレータ関数であることの判定
	 * @param { SuspendGroupCallbackType } f 
	 * @returns { f is SuspendGroupGeneratorFunctionType }
	 */
	static #isGeneratorFunction(f) {
		return f.constructor?.name === 'GeneratorFunction';
	}

	/**
	 * 遅延評価を行うためにPromiseをキャプチャする
	 * @param { SuspendGroupCallbackType } callback キャプチャを実施する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(callback, cancellable = true) {
		if (!this.#inst) {
			// キャンセル不可のPromise評価中のときは即時終了
			return;
		}

		/** 関数呼び出しの判定のためのインスタンス */
		const inst = [];
		if (cancellable) {
			// capture呼び出しの記憶
			this.#inst = inst;
		}
		else {
			this.#inst = undefined;
		}

		if (SuspendGroup.#isGeneratorFunction(callback)) {
			// resolve呼び出しを捕捉する
			const generator = callback();
			while (true) {
				// 他からcaptureが発生したかの判定
				if (cancellable && this.#inst !== inst) {
					break;
				}

				// Promiseのキャプチャ部
				const { done, value } = generator.next();

				if (done) {
					this.#inst = [];
					break;
				}
				// Promiseが与えられていれば解決まで待機
				if (value instanceof Promise) {
					await value;
				}
			}
		}
		else {
			const value = callback();
			// Promiseが与えられていれば解決まで待機
			if (value instanceof Promise) {
				await value;
			}
			this.#inst = [];
		}
	}

	/**
	 * captureの呼び出しの補足情報をリセットする(キャンセル可なら次のチェック契機で終了、キャンセル不可なら後続のcaptureが実施可能となる)
	 */
	reset() {
		this.#inst = [];
	}
}

/**
 * @typedef { (() => StateNode | StateNodeSet | Promise<StateNode | StateNodeSet>) | StateNode | StateNodeSet | Promise<StateNode | StateNodeSet> } GenPageType ページやそれを生成する関数
 */

/**
 * ノードの表示切替を行うクラス
 */
class SwitchingPage {
	/** @type { SuspendGroup } アニメーション制御のためのグループ */
	#suspendGroup;
	/** @type { StateNode | StateNodeSet | undefined } ページの切り替え対象 */
	node = undefined;
	/** @type { boolean } 現在のページが有効であるかを示すフラグ */
	#enable = false;
	/** @type { ((node : StateNode) => Promise | undefined) | undefined } ページ切り替え前に発火するイベント */
	beforeSwitching = undefined;
	/** @type { ((node : StateNode) => Promise | undefined) | undefined } ページ切り替え後に発火するイベント */
	afterSwitching = undefined;
	/** @type { Promise | undefined } 現在実行中のキャンセル不可のPromise */
	#currentPromise = undefined;

	/**
	 * コンストラクタ
	 * @param { SuspendGroup } suspendGroup アニメーション制御のためのグループ
	 */
	constructor(suspendGroup) {
		this.#suspendGroup = suspendGroup;
	}

	/**
	 * 内部で用いるSuspendGroupの取得
	 */
	get suspendGroup() {
		return this.#suspendGroup;
	}

	/**
	 * ノードに対してイベントを適用して存在するならばPromiseを返す
	 * @param { StateNodeSet | StateNode } node イベント発火対象のノード
	 * @param { (node : StateNode) => Promise | undefined } callback イベントを示すコールバック
	 */
	static #callEvent(node, callback) {
		/** @type { Promise | undefined } */
		let result = undefined;
		if (node instanceof StateNodeSet) {
			// StateNodeSetのときは各々のStateNodeを取り出して評価する
			/** @type { Promise[] } */
			const resultSet = [];
			for (const e of node.nodeSet()) {
				const temp = callback(e);
				if (temp instanceof Promise) {
					resultSet.push(temp);
				}
			}
			if (resultSet.length > 0) {
				result = Promise.all(resultSet);
			}
		}
		else {
			// StateNodeの場合はそのまま評価する
			const temp =  callback(node);
			if (temp instanceof Promise) {
				result = temp;
			}
		}

		return result;
	}

	/**
	 * ノードの挿入
	 * @param { GenPageType } page ページやそれを生成する関数
	 * @param { HTMLElement | Text | undefined } afterNode 挿入先の次のノード(存在しない場合はundefined)
	 * @param { HTMLElement } parentNode 挿入先の親ノード
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	insertBefore(page, afterNode, parentNode, cancellable = true) {
		// 画面の遷移先の構築を行うPromise/StateNode/StateNodeSetの作成
		const promiseNextNode = page instanceof Function ? page() : page;
		const this_ = this;
		const afterSwitching = this.afterSwitching;

		return this.#suspendGroup.capture(function* () {
			// 次のノードの生成
			let nextNode = promiseNextNode;
			if (promiseNextNode instanceof Promise) {
				yield promiseNextNode.then(v => nextNode = v);
			}
			// 要素を挿入する
			this_.#enable = !(nextNode instanceof StatePlaceholderNode);
			this_.node = nextNode;
			if (this_.node instanceof StateNodeSet) {
				this_.node.insertBefore(afterNode, parentNode);
			}
			else {
				parentNode.insertBefore(this_.node.element, afterNode);
			}
			// #nodeが有効な場合にafterSwitchingを発火
			if (this_.#enable && afterSwitching) {
				const promise = SwitchingPage.#callEvent(this_.node, afterSwitching);
				if (promise) {
					yield (this_.#currentPromise = promise).then(() => this_.#currentPromise = undefined);
				}
			}
		}, cancellable);
	}

	/**
	 * ノードの取り外し
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	detach(cancellable = true) {
		const this_ = this;
		const beforeSwitching = this.beforeSwitching;

		return this.#suspendGroup.capture(function* () {
			// 評価中のPromiseが存在すれば評価をしてから後続処理を実施
			if (this_.#currentPromise) {
				yield this_.#currentPromise;
			}
			// #nodeが有効な場合にbeforeSwitchingを発火
			if (this_.#enable && beforeSwitching) {
				this_.#enable = false;
				const promise = SwitchingPage.#callEvent(this_.node, beforeSwitching);
				if (promise) {
					yield (this_.#currentPromise = promise).then(() => this_.#currentPromise = undefined);
				}
			}

			// ノードの取り外し
			this_.node.detach();
			this_.#enable = false;
			this_.node = undefined;
		}, cancellable);
	}

	/**
	 * ページの切り替え
	 * @param { GenPageType } page ページやそれを生成する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	switching(page, cancellable = true) {
		// 画面の遷移先の構築を行うPromise/StateNode/StateNodeSetの作成
		const promiseNextNode = page instanceof Function ? page() : page;
		const afterNode = this.node instanceof StateNodeSet ? this.node.first.element : this.node.element;
		const this_ = this;
		const beforeSwitching = this.beforeSwitching;
		const afterSwitching = this.afterSwitching;

		return this.#suspendGroup.capture(function* () {
			// 親が存在しない場合はノードの設定のみを行い終了する
			if (!afterNode.parentElement) {
				let nextNode = promiseNextNode;
				if (promiseNextNode instanceof Promise) {
					yield promiseNextNode.then(v => nextNode = v);
				}
				this_.#enable = !(nextNode instanceof StatePlaceholderNode);
				this_.node = nextNode;
				return;
			}
			// 評価中のPromiseが存在すれば評価をしてから後続処理を実施
			if (this_.#currentPromise) {
				yield this_.#currentPromise;
			}
			// #nodeが有効な場合にbeforeSwitchingを発火
			if (this_.#enable && beforeSwitching) {
				this_.#enable = false;
				const promise = SwitchingPage.#callEvent(this_.node, beforeSwitching);
				if (promise) {
					yield (this_.#currentPromise = promise).then(() => this_.#currentPromise = undefined);
				}
			}
			// 次のノードの生成
			let nextNode = promiseNextNode;
			if (promiseNextNode instanceof Promise) {
				yield promiseNextNode.then(v => nextNode = v);
			}
			// 要素を付け替える
			this_.#enable = !(nextNode instanceof StatePlaceholderNode);
			/** @type { StateNode | StateNodeSet } */
			const switchingNode = nextNode;
			if (afterNode.parentElement) {
				const parentNode = afterNode.parentElement;
				if (switchingNode !== this_.node) {
					// ノードの挿入
					if (switchingNode instanceof StateNodeSet) {
						switchingNode.insertBefore(afterNode, parentNode);
					}
					else {
						parentNode.insertBefore(switchingNode.element, afterNode);
					}
					// ノードの取り外し
					this_.node.detach();
					this_.node = switchingNode;
				}
			}
			else {
				// 親が存在しない場合はノードの設定のみを行い終了する
				this_.node = switchingNode;
				return;
			}
			// #nodeが有効な場合にafterSwitchingを発火
			if (this_.#enable && afterSwitching) {
				const promise = SwitchingPage.#callEvent(this_.node, afterSwitching);
				if (promise) {
					yield (this_.#currentPromise = promise).then(() => this_.#currentPromise = undefined);
				}
			}
		}, cancellable);
	}
}

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
	 * @protected
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; ctx: Context; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSetImpl(ctx) {
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
		ctx2.call({ caller: () => {
			if (this.#props.fallback.value) {
				suspendGroup.alternativePage = this.#props.fallback.value.build(ctx2);
			}
		}, label: ctx2.sideEffectLabel });
		this.nestedNodeSet[0].getStateNode(node => suspendGroup.page = node);
		const set = new StateNodeSet(ctx2, this.nestedNodeSet, sibling);
		return { set, ctx: ctx2, sibling };
	}
}

/**
 * 非同期処理をキャッチして代替するノードを表示する擬似コンポーネント
 * @param { CtxPropTypes<typeof Suspense> } props 
 * @param { [GenStateNode] } children
 * @returns 
 */
function Suspense(props, children) {
	return new GenSuspenseStateNodeSet(normalizeCtxProps(Suspense, props), children);
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

export {
	SwitchingPage,
	SuspendGroup,
	LocalSuspenseContextForCapture,
	Suspense,
	load
};
