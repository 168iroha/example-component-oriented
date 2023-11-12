import { State, StateNodeSet, GenStateNode, GenStateNodeSet, GenStateTextNode, GetGenStateNode, Context, watch } from "../../src/core.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * ノードを選択するノード
 * @template T
 */
class VariableStateNodeSet extends StateNodeSet {
	/** @type { CompPropTypes<typeof ForEach<T>> } プロパティ */
	#props;
	/** @type { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } ノードを生成する関数 */
	#gen;
	/** @type { Map<unknown, StateNodeSet> } 現在のノードの集合のキーのリスト */
	#keyList = new Map();
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList = [];

	/**
	 * コンストラクタ
	 * @param { GenStateNode[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { CompPropTypes<typeof ForEach<T>> } props 
	 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(sibling, ctx, props, gen) {
		super([], sibling);
		this.#props = props;
		this.#gen = gen;
		// 表示対象の更新時にその捕捉を行う
		const caller = watch(this.#props.target, (prev, next) => {
			// DOMノードが構築されている場合にのみ構築する(this.first.element自体はplaceholderにより(外部から操作しない限り)存在が保証される)
			const element = this.first?.element;
			if (element && !(prev.length === 0 && prev.length === next.length)) {
				const parent = element?.parentElement;
				/** @type { Map<Object, StateNodeSet> } 変更後のノードの集合のキーのリスト */
				const keyList = new Map();

				/** @type { StateNodeSet[] } 挿入をするノードの全体 */
				const nodeSetList = [];
				// 挿入を行うノードの全体の構築
				for (let i = 0; i < next.length; ++i) {
					const e = next[i];
					const key = this.#props.key.value(e);
					if (this.#keyList.has(key)) {
						// 現在表示している対象の表示の場合はノードを移動させる
						const set = this.#keyList.get(key);
						keyList.set(key, set);
						nodeSetList.push(set);
						this.#keyList.delete(key);
					}
					else {
						if (keyList.has(key)) {
							// キーが重複している場合はエラー
							throw new Error(`Key ${key} is duplicated.`);
						}
						// 現在表示していない対象を表示する場合は構築する
						const { set, sibling } = (new GenStateNodeSet(ctx.normalizeCtxChild(this.#gen(e, key, this.#props.key.value)))).buildStateNodeSet();
						keyList.set(key, set);
						nodeSetList.push(set);
						for (const s of sibling) {
							s.build(ctx.component);
						}
					}
				}
				// 要素が存在しないときはプレースホルダを設置
				if (nodeSetList.length === 0) {
					nodeSetList.push(new GenStateNodeSet([new GenStateTextNode(ctx, '')]));
				}
				const deleteNodeSet = [...this.#keyList.values()];
				this.#keyList = keyList;
				this.nestedNodeSet = nodeSetList;

				if (parent) {
					/** @type { HTMLElement | Text | undefined } 挿入位置 */
					let afterElement = this.first?.element;
					// DOMノードの更新
					ctx.component.label.update(() => {
						// ノードの挿入
						for (const set of nodeSetList) {
							afterElement = set.insertBefore(afterElement, parent);
						}
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

		// 初期状態の構築
		for (const e of this.#props.target.value) {
			const key = this.#props.key.value(e);
			const { set, sibling: sibling_ } = (new GenStateNodeSet(ctx.normalizeCtxChild(this.#gen(e, key, this.#props.key.value)))).buildStateNodeSet();
			this.#keyList.set(key, set);
			this.nestedNodeSet.push(set);
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
 * VariableStateNodeSetを生成するためのノードの集合
 * @template T
 */
class GenVariableStateNodeSet extends GenStateNodeSet {
	/** @type { Context } props.targetの扱っているコンテキスト */
	#ctx;
	/** @type { CompPropTypes<typeof ForEach<T>> } プロパティ */
	#props;
	/** @type { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } ノードを生成する関数 */
	#gen;

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { CompPropTypes<typeof ForEach<T>> } props 
	 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(ctx, props, gen) {
		super([]);
		this.#ctx = ctx;
		this.#props = props;
		this.#gen = gen;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @returns { { set: VariableStateNodeSet; sibling: GetGenStateNode[] } }
	 */
	buildStateNodeSet() {
		/** @type { GetGenStateNode[] } */
		const sibling = [];
		const set = new VariableStateNodeSet(sibling, this.#ctx, this.#props, this.#gen);
		return { set, sibling };
	}
}

/**
 * 可変なノードを扱うコンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof ForEach<T>> } props 
 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } children
 * @returns 
 */
function ForEach(ctx, props, children) {
	return new GenVariableStateNodeSet(ctx, props, children);
}
/**
 * @template T
 */
ForEach.propTypes = {
	/** @type { T[] } 表示対象を切り替える基準となる変数 */
	target: [],
	/** @type { (val: T) => unknown } 表示対象を切り替える基準となる変数 */
	key: undefined,
};
ForEach.early = true;

export { ForEach };
