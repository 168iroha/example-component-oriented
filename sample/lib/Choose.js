import { State, StateNode, StateNodeSet, GenStateNode, GenStateNodeSet, GenStatePlaceholderNode, Context, watch, StateAsyncComponent, normalizeCtxChild, normalizeCtxProps } from "../../src/core.js";
import { SwitchingPage, SuspendGroup, LocalSuspenseContextForCapture } from "./Suspense.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @template T
 * @typedef { import("../../src/core.js").CtxPropTypes<T> } CtxPropTypes コンテキスト上でのプロパティの型
 */

/**
 * StateNodeSetを選択するノード
 * @template T
 */
class ShowStateNodeSet extends StateNodeSet {
	/** @type { StateNodeSet | undefined } 表示対象についてのキャッシュ */
	#cache = undefined;
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList = [];

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { { node: GenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { CompPropTypes<typeof When<T>> } props 
	 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(ctx, sibling, props, gen) {
		super(ctx, [], sibling);
		const suspendGroup = new SuspendGroup();
		const switchingPage = new SwitchingPage(suspendGroup);

		// 表示対象の更新時にその捕捉を行う
		const caller = watch(ctx, props.target, (prev, next) => {
			// DOMノードが構築されたことがあるかつ状態変数が有効な場合にのみ構築する
			const element = this.first?.element;
			if (element && next !== undefined) {
				// ノードの選択
				const flag = props.test.value === undefined || props.test.value(next);
				// キャッシュヒットの検査
				const cache = props.cache.value ?? false;
				const genStateNodeSet = (() => {
					const set = cache ? this.#cache : undefined;
					if (set) {
						return set;
					}
					else {
						const genList = normalizeCtxChild(normalizeCtxChild(flag ? gen(next) : [new GenStatePlaceholderNode()]));
						return new GenStateNodeSet(genList.length === 0 ? [new GenStatePlaceholderNode()] : genList);
					}
				})();
				let callback = undefined;
				ctx.component?.onBeforeUpdate?.();
				const locked = ctx.state.locked(ctx.sideEffectLabel);
				if (!locked) {
					ctx.state.lock([ctx.sideEffectLabel]);
				}
				let promise = undefined;
				if (genStateNodeSet instanceof GenStateNodeSet) {
					// ノードは削除されるためリソースを開放しておく
					switchingPage.node.free();

					// 表示する要素が存在しないときは代わりにplaceholderを設置
					const { set, sibling } = genStateNodeSet.buildStateNodeSet(ctx);
					this.nestedNodeSet = [set];
					if (cache) {
						// 結果をキャッシュする
						this.#cache = set;
					}
					// 一時的にSuspenseの状態をスイッチして非同期処理のキャプチャを行う
					const localSuspenseCtx = new LocalSuspenseContextForCapture();
					ctx.suspense.switch(() => {
						for (const { node, ctx } of sibling) {
							node.build(ctx);
						}
					}, localSuspenseCtx);
					if (localSuspenseCtx.exists) {
						callback = () => switchingPage.switching(async () => { await localSuspenseCtx.call(); return set; }, props.cancellable.value ?? true).finally(() => localSuspenseCtx.resolve());
					}
					else {
						callback = () => switchingPage.switching(set, props.cancellable.value ?? true);
					}
				}
				else {
					this.nestedNodeSet = [genStateNodeSet];
					callback = () => switchingPage.switching(genStateNodeSet, props.cancellable.value ?? true);
				}
				// 全てのページ生成の解決後にキャプチャした非同期処理の解決をする
				if (props.fallthrough.value ?? false) {
					promise = ctx.capture(callback, cancellable);
				}
				else {
					promise = callback();
				}
				promise.then(() => {
					if (!locked) {
						// DOMツリー構築に関する非同期処理解決まで処理を遅延する
						ctx.state.unlock([ctx.sideEffectLabel])();
					}
					ctx.component?.onAfterUpdate?.();
				});
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}
		// 各種イベントのインスタンスの単方向関連付け
		ctx.call(() => {
			switchingPage.afterSwitching = props.onAfterSwitching.value;
		});
		ctx.call(() => {
			switchingPage.beforeSwitching = props.onBeforeSwitching.value;
		});

		// 初期表示の設定
		{
			const val = props.target.value;
			const flag = val !== undefined && (props.test.value === undefined || props.test.value(val));
			// 表示する要素が存在しないときは代わりにplaceholderを設置
			const genList = normalizeCtxChild(normalizeCtxChild(flag ? gen(val) : [new GenStatePlaceholderNode()]));
			const { set, sibling: sibling_ } = (new GenStateNodeSet(genList.length === 0 ? [new GenStatePlaceholderNode()] : genList)).buildStateNodeSet(ctx);
			this.nestedNodeSet = [set];
			sibling.push(...sibling_);
			if (flag && (props.cache.value ?? false)) {
				this.#cache = set;
			}

			ctx.state.update([{ caller: () => {
				const parent = this.first.element.parentElement;
				const afterElement = this.last.element.nextElementSibling;
				const set = this.nestedNodeSet[0];
				const page = this.first instanceof StateAsyncComponent ? async () => { await this.first.finished; return set; } : set;
				switchingPage.afterSwitching = props.initSwitching.value ?? false ? switchingPage.afterSwitching : undefined;
				// ノードの切り替え
				if (props.fallthrough.value ?? false) {
					ctx.capture(() => switchingPage.insertBefore(page, afterElement, parent, props.cancellable.value ?? true), cancellable);
				}
				else {
					switchingPage.insertBefore(page, afterElement, parent, props.cancellable.value ?? true);
				}
				switchingPage.afterSwitching = props.onAfterSwitching.value;
			}, label: ctx.sideEffectLabel }]);
		}
	}

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.callerList.forEach(caller => caller.states.forEach(state => state.delete(caller.caller)));
	}
}

/**
 * ShowStateNodeSetを生成するためのノードの集合
 * @template T
 */
class GenShowStateNodeSet extends GenStateNodeSet {
	/** @type { CompPropTypes<typeof When<T>> } プロパティ */
	#props;
	/** @type { (v: T) => (GenStateNode | GenStateNodeSet)[] } ノードを生成する関数 */
	#gen;

	/**
	 * コンストラクタ
	 * @param { CompPropTypes<typeof When<T>> } props 
	 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(props, gen) {
		super([]);
		this.#props = props;
		this.#gen = gen;
	}

	/**
	 * プロパティの取得
	 */
	get props() {
		return this.#props;
	}

	/**
	 * ノードを生成する関数の取得
	 */
	get gen() {
		return this.#gen;
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
		const set = new ShowStateNodeSet(ctx, sibling, this.#props, this.#gen);
		return { set, ctx, sibling };
	}
}

/**
 * ノードの選択における条件式を設定する擬似コンポーネント
 * @template T
 * @param { CtxPropTypes<typeof When<T>> } props 
 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } children
 * @returns 
 */
function When(props, children) {
	return new GenShowStateNodeSet(normalizeCtxProps(When, props), children)
}
/**
 * @template T
 */
When.propTypes = {
	/** @type { T | undefined } 表示対象を切り替える基準となる変数 */
	target: undefined,
	/** @type { ((val: T) => boolean) | undefined } 表示判定を行うテスト関数 */
	test: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード削除前に実行されるイベント */
	onBeforeSwitching: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード挿入後に実行されるイベント */
	onAfterSwitching: undefined,
	/** @type { boolean | undefined } ノードの切り替え処理がキャンセル可能かの設定(undefinedでtrueの場合と同等) */
	cancellable: undefined,
	/** @type { boolean | undefined } 初期表示でonAfterSwitchingが実行されるか(undefinedでfalseの場合と同等) */
	initSwitching: undefined,
	/** @type { boolean | undefined } ノードの切り替えで生じる非同期処理を親へ伝播するか(undefinedでfalseの場合と同等) */
	fallthrough: undefined,
	/** @type { boolean | undefined } 表示した結果をキャッシュするか(undefinedでfalseの場合と同等) */
	cache: undefined
};
/** @type { true } */
When.early = true;

/**
 * ShowStateNodeSetを選択するノード
 * @template T
 */
class WhenStateNodeSet extends StateNodeSet {
	/** @type { number } 前回選択した要素のインデックス */
	#prevChooseIndex = -2;
	/** @type { CompPropTypes<typeof Choose<T>> } プロパティ */
	#props;
	/** @type { (StateNodeSet | undefined)[] } 表示対象についてのキャッシュ */
	#cacheTable = [];
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList = [];

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { { node: GenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { CompPropTypes<typeof Choose<T>> } props 
	 * @param { GenShowStateNodeSet<T>[] } nestedNodeSet
	 */
	constructor(ctx, sibling, props, nestedNodeSet) {
		super(ctx, [], sibling);
		this.#props = props;
		const suspendGroup = new SuspendGroup();
		const switchingPage = new SwitchingPage(suspendGroup);

		// 表示対象の更新時にその捕捉を行う
		const caller = watch(ctx, this.#props.target, (prev, next) => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.first?.element;
			if (element) {
				// 遷移元のノードがキャッシュされているか
				const cache = this.#prevChooseIndex >= 0 ? (nestedNodeSet[this.#prevChooseIndex].props.cache.value ?? this.#props.cache.value) : false;
				// 表示するノードの選択
				const genStateNodeSet = this.#chooseNode(ctx, next, nestedNodeSet, switchingPage);

				// 選択対象もインデックスが変わらないときは遷移しない(Whent単体の場合は遷移する)
				if (genStateNodeSet) {
					// ノードは削除されるためリソースを開放しておく
					switchingPage.node.free();

					const cancellable = (this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.cancellable.value : undefined) ?? props.cancellable.value;
					let callback = undefined;
					ctx.component?.onBeforeUpdate?.();
					const locked = ctx.state.locked(ctx.sideEffectLabel);
					if (!locked) {
						ctx.state.lock([ctx.sideEffectLabel]);
					}
					if (genStateNodeSet instanceof GenStateNodeSet) {
						// ノードを構築
						const { set, sibling } = genStateNodeSet.buildStateNodeSet(ctx);
						this.nestedNodeSet = [set];
						// 一時的にSuspenseの状態をスイッチして非同期処理のキャプチャを行う
						const localSuspenseCtx = new LocalSuspenseContextForCapture();
						ctx.suspense.switch(() => {
							for (const { node, ctx } of sibling) {
								node.build(ctx);
							}
						}, localSuspenseCtx);
						if (localSuspenseCtx.exists) {
							callback = () => switchingPage.switching(async () => { await localSuspenseCtx.call(); return set; }, cancellable).finally(() => localSuspenseCtx.resolve());
						}
						else {
							callback = () => switchingPage.switching(set, cancellable);
						}
					}
					else {
						this.nestedNodeSet = [genStateNodeSet];
						callback = () => switchingPage.switching(genStateNodeSet, cancellable);
					}
					// 全てのページ生成の解決後にキャプチャした非同期処理の解決をする
					const fallthrough = (this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.fallthrough.value : undefined) ?? props.fallthrough.value;
					(fallthrough ? ctx.capture(callback, cancellable) : callback()).then(() => {
						if (!locked) {
							// DOMツリー構築に関する非同期処理解決まで処理を遅延する
							ctx.state.unlock([ctx.sideEffectLabel])();
						}
						ctx.component?.onAfterUpdate?.();
					});
					switchingPage.afterSwitching = props.onAfterSwitching.value;
					switchingPage.beforeSwitching = props.onBeforeSwitching.value;
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}
		// 各種イベントのインスタンスの単方向関連付け
		ctx.call(() => {
			switchingPage.afterSwitching = props.onAfterSwitching.value;
		});
		ctx.call(() => {
			switchingPage.beforeSwitching = props.onBeforeSwitching.value;
		});

		/** @type { GenStateNodeSet } 初期表示の設定 */
		const genStateNode = this.#chooseNode(ctx, props.target.value, nestedNodeSet, switchingPage);
		const { set, sibling: sibling_ } = genStateNode.buildStateNodeSet(ctx);
		this.nestedNodeSet = [set];
		sibling.push(...sibling_);

		ctx.state.update([{ caller: () => {
			const parent = this.first.element.parentElement;
			const afterElement = this.last.element.nextElementSibling;
			const set = this.nestedNodeSet[0];
			const page = this.first instanceof StateAsyncComponent ? async () => { await this.first.finished; return set; } : set;
			const initSwitching = (this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.initSwitching.value : undefined) ?? props.initSwitching.value;
			switchingPage.afterSwitching = initSwitching ? switchingPage.afterSwitching : undefined;
			// ノードの切り替え
			const cancellable = (this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.cancellable.value : undefined) ?? props.cancellable.value;
			const fallthrough = (this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.fallthrough.value : undefined) ?? props.fallthrough.value;
			if (fallthrough) {
				ctx.capture(() => switchingPage.insertBefore(page, afterElement, parent, cancellable), cancellable);
			}
			else {
				switchingPage.insertBefore(page, afterElement, parent, cancellable);
			}
			switchingPage.afterSwitching = props.onAfterSwitching.value;
			switchingPage.beforeSwitching = props.onBeforeSwitching.value;
		}, label: ctx.sideEffectLabel }]);
	}

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.callerList.forEach(caller => caller.states.forEach(state => state.delete(caller.caller)));
	}

	/**
	 * nestedNodeSetからノードを選択する
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { GenShowStateNodeSet<T>[] } nestedNodeSet valからDOMノードを選択するオブジェクトの配列
	 * @param { SwitchingPage } switchingPage ノードの表示切替についてのインスタンス
	 */
	#chooseNode(ctx, val, nestedNodeSet, switchingPage) {
		let i = 0;
		for (; i < nestedNodeSet.length; ++i) {
			const child = nestedNodeSet[i];
			// 条件式が設定されていないもしくは条件式が真の場合
			if (child.props.test.value === undefined || child.props.test.value(val)) {
				break;
			}
		}
		// ノードが選択されなかった場合はインデックスを-1に統一
		if (i === nestedNodeSet.length) {
			i = -1;
		}

		// 選択したノードに変化がある場合は新規ノードを生成
		if (i !== this.#prevChooseIndex) {
			this.#prevChooseIndex = i;
			if (i === -1) {
				// 表示する要素が存在しないときは代わりにplaceholderを設置
				return new GenStateNodeSet([new GenStatePlaceholderNode()])
			}

			// Whenのイベントの反映
			if (this.#prevChooseIndex >= 0) {
				const onAfterSwitching = nestedNodeSet[this.#prevChooseIndex].props.onAfterSwitching.value;
				if (onAfterSwitching) {
					switchingPage.afterSwitching = onAfterSwitching;
				}
				const onBeforeSwitching = nestedNodeSet[this.#prevChooseIndex].props.onBeforeSwitching.value;
				if (onBeforeSwitching) {
					switchingPage.beforeSwitching = onBeforeSwitching;
				}
			}
			// キャッシュヒットの検査
			const cache = nestedNodeSet[i].props.cache.value ?? this.#props.cache.value;
			const set = this.#cacheTable[i];
			if (cache) {
				// キャッシュが存在すればそのまま返す/存在しなければ結果をキャッシュする
				if (set) {
					return set;
				}
				else {
					const genList = normalizeCtxChild(nestedNodeSet[i].gen(val));
					return (new GenStateNodeSet(genList.length === 0 ? [new GenStatePlaceholderNode()] : genList)).getStateNodeSet(s => this.#cacheTable[i] = s)
				}
			}
			else {
				if (set) {
					this.#cacheTable[i] = undefined;
				}
				const genList = normalizeCtxChild(nestedNodeSet[i].gen(val));
				return new GenStateNodeSet(genList.length === 0 ? [new GenStatePlaceholderNode()] : genList);
			}
		}
		return undefined;
	}
}

/**
 * WhenStateNodeSetを生成するためのノードの集合
 * @template T
 */
class GenWhenStateNodeSet extends GenStateNodeSet {
	/** @type { CompPropTypes<typeof Choose<T>> } プロパティ */
	#props;

	/**
	 * コンストラクタ
	 * @param { CompPropTypes<typeof Choose<T>> } props 
	 * @param { GenShowStateNodeSet[] } nestedNodeSet
	 */
	constructor(props, nestedNodeSet) {
		super(nestedNodeSet);
		this.#props = props;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @protected
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: WhenStateNodeSet<T>; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSetImpl(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new WhenStateNodeSet(ctx, sibling, this.#props, this.nestedNodeSet);
		return { set, ctx, sibling };
	}
}

/**
 * ノードの選択を行う擬似コンポーネント
 * @template T
 * @param { CtxPropTypes<typeof Choose<T>> } props 
 * @param { GenShowStateNodeSet<T>[] } children
 * @returns 
 */
function Choose(props, children) {
	return new GenWhenStateNodeSet(normalizeCtxProps(Choose, props), children)
}
/**
 * @template T
 */
Choose.propTypes = {
	/** @type { T } 表示対象を切り替える基準となる変数 */
	target: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード削除前に実行されるイベント */
	onBeforeSwitching: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード挿入後に実行されるイベント */
	onAfterSwitching: undefined,
	/** @type { boolean } ノードの切り替え処理がキャンセル可能かの設定 */
	cancellable: true,
	/** @type { boolean } 初期表示でonAfterSwitchingが実行されるか */
	initSwitching: false,
	/** @type { boolean } ノードの切り替えで生じる非同期処理を親へ伝播するか */
	fallthrough: false,
	/** @type { boolean } 表示した結果をキャッシュするか */
	cache: false
};
/** @type { true } */
Choose.early = true;

export { Choose, When };
