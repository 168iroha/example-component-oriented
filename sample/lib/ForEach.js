import { State, StateNode, StateNodeSet, GenStateNode, GenStateNodeSet, GenStatePlaceholderNode, Context, watch } from "../../src/core.js";
import { SwitchingPage, SuspendGroup } from "./Suspense.js";

/**
 * @template T
 * @typedef { import("../../src/core.js").CompPropTypes<T> } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @typedef {{
 * 		set: StateNodeSet;
 * 		switching: SwitchingPage;
 * 		callerList: { caller: CallerType; states: State<unknown>[] }[];
 * 		index: number
 * }} KeyTypeOfVariableStateNodeSet ForEachについてのキーの型
 */

/**
 * ノードを選択するノード
 * @template T
 */
class VariableStateNodeSet extends StateNodeSet {
	/** @type { CompPropTypes<typeof ForEach<T>> } プロパティ */
	#props;
	/** @type { Map<unknown, KeyTypeOfVariableStateNodeSet> } 現在のノードの集合のキーのリスト */
	#keyList = new Map();
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList = [];

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { { node: GenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 * @param { CompPropTypes<typeof ForEach<T>> } props 
	 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(ctx, sibling, props, gen) {
		super(ctx, [], sibling);
		this.#props = props;

		// 表示対象の更新時にその捕捉を行う
		const caller = watch(props.target, (prev, next) => {
			// DOMノードが構築されている場合にのみ構築する(this.first.element自体はplaceholderにより(外部から操作しない限り)存在が保証される)
			const element = this.first?.element;
			if (element && !(prev.length === 0 && next.length === 0)) {
				/** @type { Map<unknown, { set: StateNodeSet, switching: SwitchingPage; index: number }> } 変更後のノードの集合のキーのリスト */
				const keyList = new Map();

				/** @type { StateNodeSet[] } 挿入をするノードの全体 */
				const nodeSetList = [];
				// 挿入を行うノードの全体の構築
				for (let i = 0; i < next.length; ++i) {
					const e = next[i];
					const key = props.key.value(e);
					if (this.#keyList.has(key)) {
						// 現在表示している対象の表示の場合はノードを移動させる
						const val = this.#keyList.get(key);
						keyList.set(key, { set: val.set, switching: val.switching, callerList: val.callerList, index: i });
						nodeSetList.push(val.set);
						this.#keyList.delete(key);
					}
					else {
						if (keyList.has(key)) {
							// キーが重複している場合はエラー
							throw new Error(`Key ${key} is duplicated.`);
						}
						// 現在表示していない対象を表示する場合は構築する
						const { set, sibling } = (new GenStateNodeSet(ctx.normalizeCtxChild(gen(e, key, props.key.value)))).buildStateNodeSet(ctx);
						const suspendGroup = new SuspendGroup();
						const switchingPage = new SwitchingPage(suspendGroup);
						// 各種イベントのインスタンスの単方向関連付け
						const callerList= [
							ctx.call(() => {
								switchingPage.afterSwitching = props.onAfterSwitching.value;
							}),
							ctx.call(() => {
								switchingPage.beforeSwitching = props.onBeforeSwitching.value;
							})
						];
						keyList.set(key, { set, switching: switchingPage, callerList, index: i });
						nodeSetList.push(set);
						for (const { node, ctx } of sibling) {
							node.build(ctx);
						}
					}
				}
				// 表示する要素が存在しないときは代わりにplaceholderを設置
				if (nodeSetList.length === 0) {
					const { set, sibling } = (new GenStateNodeSet([new GenStatePlaceholderNode(ctx)])).buildStateNodeSet(ctx);
					for (const { node, ctx } of sibling) {
						node.build(ctx);
					}
					nodeSetList.push(set);
				}
				const deleteNodeSet = [...this.#keyList.values()];
				this.#keyList = keyList;
				const prevNodeSetList = this.nestedNodeSet;
				const endNode = this.last.element.nextSibling;
				this.nestedNodeSet = nodeSetList;

				// 親が有効ならばノードの付け替えを実施する
				if (element.parentElement) {
					if (props.move.value && this.first.element.nodeType === Node.ELEMENT_NODE && element.nodeType === Node.ELEMENT_NODE) {
						// FLIPによるアニメーションの実施
						/** @type { HTMLElement[] } */
						const elementList = [];
						for (const nodeSet of prevNodeSetList) {
							for (const node of nodeSet.nodeSet()) {
								elementList.push(node.element);
							}
						}
						// First
						const firstStateList = elementList.map(e => e.getBoundingClientRect());
						this.#setupNodeList(element, endNode, deleteNodeSet);
						// Last
						const lastStateList = elementList.map(e => e.getBoundingClientRect());
						// Invert&Play
						elementList.forEach((e, idx) => {
							const moveX = firstStateList[idx].left - lastStateList[idx].left;
							const moveY = firstStateList[idx].top - lastStateList[idx].top;
							if (moveX !== 0 || moveY !== 0) {
								e.animate([
									{ transform: `translate(${moveX}px, ${moveY}px)` },
									{ transform: 'translate(0, 0)' }
								], props.move.value);
							}
						});
					}
					else {
						this.#setupNodeList(element, endNode, deleteNodeSet);
					}
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		// 初期状態の構築
		for (const e of props.target.value) {
			const key = props.key.value(e);
			const { set, sibling: sibling_ } = (new GenStateNodeSet(ctx.normalizeCtxChild(gen(e, key, props.key.value)))).buildStateNodeSet(ctx);
			const suspendGroup = new SuspendGroup();
			const switchingPage = new SwitchingPage(suspendGroup);
			// 各種イベントのインスタンスの単方向関連付け
			const callerList= [
				ctx.call(() => {
					switchingPage.afterSwitching = props.onAfterSwitching.value;
				}),
				ctx.call(() => {
					switchingPage.beforeSwitching = props.onBeforeSwitching.value;
				})
			];
			// ノードの設定
			this.#keyList.set(key, { set, switching: switchingPage, callerList, index: this.#keyList.size });
			this.nestedNodeSet.push(set);
			sibling.push(...sibling_);
		}

		ctx.updateState([{ caller: () => {
			// ノードの切り替え
			const cancellable = props.cancellable.value;
			for (const { set, switching } of this.#keyList.values()) {
				const parent = set.first.element.parentElement;
				const afterElement = set.last.element.nextElementSibling;
				switching.afterSwitching = props.initSwitching.value ? switching.afterSwitching : undefined;
				switching.insertBefore(set, afterElement, parent, cancellable);
				switching.afterSwitching = props.onAfterSwitching.value;
			}
		}}]);
	}

	/**
	 * ノードリストのセットアップを行う
	 * @param { HTMLElement | Text } afterElement 前回のノードリストにおける一番最初のノード(parentは存在する前提とする)
	 * @param { Node | undefined } endNode 前回のノードリストにおける一番最後のノードの次のノード
	 * @param { Iterable<KeyTypeOfVariableStateNodeSet> } deleteNodeSet 削除対象のノード
	 */
	#setupNodeList(afterElement, endNode, deleteNodeSet) {
		const parent = afterElement.parentElement;
		/** @type { StateNodeSet[] } */
		const nodeSetList = [];
		const cancellable = this.#props.cancellable.value ?? true;
		// 残存するノードの並べ替え
		for (const { set, switching } of this.#keyList.values()) {
			if (switching.node) {
				afterElement = set.insertBefore(afterElement, parent);
				nodeSetList.push(set);
			}
		}
		// ノードの新規挿入
		for (const { set, switching, index } of this.#keyList.values()) {
			if (!switching.node) {
				/** @type { HTMLElement | Text | undefined } */
				const _afterElement = index >= nodeSetList.length ? afterElement : nodeSetList[index].first.element;
				switching.insertBefore(set, _afterElement, parent, cancellable);
				nodeSetList.push(set);
			}
		}
		// 削除対象のノードの並べ替え
		for (const { set, index } of deleteNodeSet) {
			const afterElement = index >= nodeSetList.length ? endNode : nodeSetList[index].first.element;
			set.insertBefore(afterElement, parent);
		}
		// ノードの削除
		for (const { switching } of deleteNodeSet) {
			const node = switching.node;
			switching.detach(cancellable).then(() => node.remove());
		}
		// 要素が存在しないときはplaceholderを設置
		if (nodeSetList.length === 0) {
			this.nestedNodeSet[0].insertBefore(endNode, parent);
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
	/** @type { CompPropTypes<typeof ForEach<T>> } プロパティ */
	#props;
	/** @type { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } ノードを生成する関数 */
	#gen;

	/**
	 * コンストラクタ
	 * @param { CompPropTypes<typeof ForEach<T>> } props 
	 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } gen
	 */
	constructor(props, gen) {
		super([]);
		this.#props = props;
		this.#gen = gen;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @protected
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: VariableStateNodeSet; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSetImpl(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new VariableStateNodeSet(ctx, sibling, this.#props, this.#gen);
		return { set, sibling };
	}
}

/**
 * 可変なノードを扱う擬似コンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof ForEach<T>> } props 
 * @param { (v: T, key?: unknown, genkey?: (typeof ForEach['propTypes']['key'])) => (GenStateNode | GenStateNodeSet)[] } children
 * @returns 
 */
function ForEach(ctx, props, children) {
	return new GenVariableStateNodeSet(props, children);
}
/**
 * @template T
 */
ForEach.propTypes = {
	/** @type { T[] } 表示対象を切り替える基準となる変数 */
	target: [],
	/** @type { (val: T) => unknown } 表示対象を切り替える基準となる変数 */
	key: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード削除前に実行されるイベント */
	onBeforeSwitching: undefined,
	/** @type { ((node: StateNode) => Promise | undefined) | undefined } ノード挿入後に実行されるイベント */
	onAfterSwitching: undefined,
	/** @type { KeyframeAnimationOptions | undefined } リスト要素が移動するときのオプションの定義 */
	move: undefined,
	/** @type { boolean } ノードの切り替え処理がキャンセル可能かの設定 */
	cancellable: true,
	/** @type { boolean } 初期表示でonAfterSwitchingが実行されるか */
	initSwitching: false
};
/** @type { true } */
ForEach.early = true;

export { ForEach };
