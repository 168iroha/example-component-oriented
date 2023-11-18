import { State, StateNodeSet, GenStateNode, GenStateNodeSet, GenStateTextNode, GetGenStateNode, Context, watch } from "../../src/core.js";

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
	 * @param { { node: GetGenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { CompPropTypes<typeof When<T>> } props 
	 * @param { (v: T) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(ctx, sibling, props, gen) {
		super(ctx, [], sibling);
		// 表示対象の更新時にその捕捉を行う
		const caller = watch(props.target, (prev, next) => {
			// DOMノードが構築されたことがあるかつ状態変数が有効な場合にのみ構築する
			const element = this.first?.element;
			if (element && next !== undefined) {
				const parent = element.parentElement;
				const deleteNodeSet = this.nestedNodeSet;
				// ノードの選択
				const flag = props.test.value === undefined || props.test.value(next);
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				const { set, sibling } = (new GenStateNodeSet(ctx.normalizeCtxChild(flag ? gen(next) : [new GenStateTextNode(ctx, '')]))).buildStateNodeSet();
				/** @type { HTMLElement | Text | undefined } 挿入位置 */
				const afterElement = this.first?.element;
				this.nestedNodeSet = [set];
				for (const { node, ctx } of sibling) {
					node.build(ctx);
				}
				if (parent) {
					ctx.component.label.update(() => {
						// ノードの挿入
						set.insertBefore(afterElement, parent);
						// ノードの削除
						for (const set of deleteNodeSet) {
							set.remove();
						}
					});
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		// 初期表示の設定
		{
			const val = props.target.value;
			const flag = val !== undefined && (props.test.value === undefined || props.test.value(val));
			// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
			const { set, sibling: sibling_ } = (new GenStateNodeSet(ctx.normalizeCtxChild(flag ? gen(next) : [new GenStateTextNode(ctx, '')]))).buildStateNodeSet(ctx);
			this.nestedNodeSet = [set];
			sibling.push(...sibling_);
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
	 * 表示判定を行うテスト関数の取得
	 */
	get test() {
		return this.#props.test;
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
	 * @returns { { set: ShowStateNodeSet<T>; sibling: { node: GetGenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GetGenStateNode; ctx: Context }[] } */
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
	test: undefined
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
	 * @param { { node: GetGenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { CompPropTypes<typeof Choose<T>> } props 
	 * @param { GenShowStateNodeSet<T>[] } nestedNodeSet
	 */
	constructor(ctx, sibling, props, nestedNodeSet) {
		super(ctx, [], sibling);
		this.#props = props;
		// 表示対象の更新時にその捕捉を行う
		const caller = watch(this.#props.target, (prev, next) => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.first?.element;
			if (element) {
				const parent = element.parentElement;
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				const genStateNodeSet = this.#chooseNode(ctx, next, nestedNodeSet);

				if (genStateNodeSet) {
					// ノードを構築
					const { set, sibling } = genStateNodeSet.buildStateNodeSet(ctx);
					const deleteNodeSet = this.nestedNodeSet;
					/** @type { HTMLElement | Text | undefined } 挿入位置 */
					const afterElement = this.first?.element;
					this.nestedNodeSet = [set];
					for (const { node, ctx } of sibling) {
						node.build(ctx);
					}
					if (parent) {
						ctx.component.label.update(() => {
							// ノードの挿入
							set.insertBefore(afterElement, parent);
							// ノードの削除
							for (const set of deleteNodeSet) {
								set.remove();
							}
						});
					}
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		/** @type { GenStateNodeSet } 初期表示の設定 */
		const genStateNode = this.#chooseNode(ctx, props.target.value, nestedNodeSet);
		const { set, sibling: sibling_ } = genStateNode.buildStateNodeSet(ctx);
		this.nestedNodeSet = [set];
		sibling.push(...sibling_);
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
	 * @param { GenShowStateNodeSet<T>[] } nestedNodeSet valからDOMノードを選択するオブジェクト
	 */
	#chooseNode(ctx, val, nestedNodeSet) {
		let i = 0;
		for (; i < nestedNodeSet.length; ++i) {
			const child = nestedNodeSet[i];
			// 条件式が設定されていないもしくは条件式が真の場合
			if (child.test.value === undefined || child.test.value(val)) {
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
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				return new GenStateNodeSet([new GenStateTextNode(ctx, '')]);
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
	 * @returns { { set: WhenStateNodeSet<T>; sibling: { node: GetGenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GetGenStateNode; ctx: Context }[] } */
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
	target: undefined
};
/** @type { true } */
Choose.early = true;

export { Choose, When };
