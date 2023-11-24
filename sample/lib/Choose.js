import { State, StateNode, StateNodeSet, GenStateNode, GenStateNodeSet, GenStatePlaceholderNode, Context, watch } from "../../src/core.js";
import { SwitchingPage, SuspendGroup } from "../../src/async.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * StateNodeSetを選択するノード
 * @template T
 */
class ShowStateNodeSet extends StateNodeSet {
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
		const caller = watch(props.target, (prev, next) => {
			// DOMノードが構築されたことがあるかつ状態変数が有効な場合にのみ構築する
			const element = this.first?.element;
			if (element && next !== undefined) {
				// ノードの選択
				const flag = props.test.value === undefined || props.test.value(next);
				// 表示する要素が存在しないときは代わりにplaceholderを設置
				const { set, sibling } = (new GenStateNodeSet(ctx.normalizeCtxChild(flag ? gen(next) : [new GenStatePlaceholderNode(ctx)]))).buildStateNodeSet();
				this.nestedNodeSet = [set];
				for (const { node, ctx } of sibling) {
					node.build(ctx);
				}
				// ノードの切り替え
				switchingPage.switching(set, props.cancellable.value ?? true);
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
			const { set, sibling: sibling_ } = (new GenStateNodeSet(ctx.normalizeCtxChild(flag ? gen(val) : [new GenStatePlaceholderNode(ctx)]))).buildStateNodeSet(ctx);
			this.nestedNodeSet = [set];
			sibling.push(...sibling_);

			ctx.onMount(() =>{
				const parent = this.first.element.parentElement;
				const afterElement = this.last.element.nextElementSibling;
				const set = this.nestedNodeSet[0];
				// ノードの切り替え
				switchingPage.insertBefore(set, afterElement, parent, props.cancellable.value ?? true);
			});
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
	/** @type { Context } props.targetの扱っているコンテキスト */
	#ctx;
	/** @type { CompPropTypes<typeof When<T>> } プロパティ */
	#props;
	/** @type { (v: T) => (GenStateNode | GenStateNodeSet)[] } ノードを生成する関数 */
	#gen;

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { CompPropTypes<typeof When<T>> } props 
	 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(ctx, props, gen) {
		super([]);
		this.#ctx = ctx;
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
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: ShowStateNodeSet<T>; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new ShowStateNodeSet(this.#ctx, sibling, this.#props, this.#gen);
		return { set, sibling };
	}
}

/**
 * ノードの選択における条件式を設定する擬似コンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof When<T>> } props 
 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } children
 * @returns 
 */
function When(ctx, props, children) {
	return new GenShowStateNodeSet(ctx, props, children)
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
	/** @type { boolean } ノードの切り替え処理がキャンセル可能かの設定 */
	cancellable: true
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
		const caller = watch(this.#props.target, (prev, next) => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.first?.element;
			if (element) {
				// 表示するノードの選択
				const genStateNodeSet = this.#chooseNode(ctx, next, nestedNodeSet, switchingPage);

				// 選択対象もインデックスが変わらないときは遷移しない(Whent単体の場合は遷移する)
				if (genStateNodeSet) {
					// ノードを構築
					const { set, sibling } = genStateNodeSet.buildStateNodeSet(ctx);
					this.nestedNodeSet = [set];
					for (const { node, ctx } of sibling) {
						node.build(ctx);
					}
					// ノードの切り替え
					const whenCancellable = this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.cancellable.value : undefined;
					switchingPage.switching(set, whenCancellable ?? props.cancellable.value);
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

		ctx.onMount(() =>{
			const parent = this.first.element.parentElement;
			const afterElement = this.last.element.nextElementSibling;
			const set = this.nestedNodeSet[0];
			// ノードの切り替え
			const whenCancellable = this.#prevChooseIndex >= 0 ? nestedNodeSet[this.#prevChooseIndex].props.cancellable.value : undefined;
			switchingPage.insertBefore(set, afterElement, parent, whenCancellable ?? props.cancellable.value);
			switchingPage.afterSwitching = props.onAfterSwitching.value;
			switchingPage.beforeSwitching = props.onBeforeSwitching.value;
		});
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
				return new GenStateNodeSet([new GenStatePlaceholderNode(ctx)])
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
			return new GenStateNodeSet(ctx.normalizeCtxChild(nestedNodeSet[i].gen(val)));
		}
		return undefined;
	}
}

/**
 * WhenStateNodeSetを生成するためのノードの集合
 * @template T
 */
class GenWhenStateNodeSet extends GenStateNodeSet {
	/** @type { Context } props.targetの扱っているコンテキスト */
	#ctx;
	/** @type { CompPropTypes<typeof Choose<T>> } プロパティ */
	#props;

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { CompPropTypes<typeof Choose<T>> } props 
	 * @param { GenShowStateNodeSet[] } nestedNodeSet
	 */
	constructor(ctx, props, nestedNodeSet) {
		super(nestedNodeSet);
		this.#ctx = ctx;
		this.#props = props;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: WhenStateNodeSet<T>; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new WhenStateNodeSet(this.#ctx, sibling, this.#props, this.nestedNodeSet);
		return { set, sibling };
	}
}

/**
 * ノードの選択を行う擬似コンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Choose<T>> } props 
 * @param { GenShowStateNodeSet<T>[] } children
 * @returns 
 */
function Choose(ctx, props, children) {
	return new GenWhenStateNodeSet(ctx, props, children)
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
	cancellable: true
};
/** @type { true } */
Choose.early = true;

export { Choose, When };
