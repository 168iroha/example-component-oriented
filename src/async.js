import { StateNode, StatePlaceholderNode, StateNodeSet } from "./core.js";

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
	 * ノードの削除
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	remove(cancellable = true) {
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

			// 要素を削除する
			this_.node.remove();
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
					// ノードの削除
					this_.node.remove();
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

export {
	SuspendGroup,
	SwitchingPage,
};
