import { State, StateNode, StateComponent, GenStateNode, GenStateTextNode, GetGenStateNode, GenStateComponent, Context, watch } from "../../src/core.js";

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
 * @typedef { import("../../src/core.js").ElementTypeOfState<T> } ElementTypeOfState 状態変数の要素型を得る
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { import("../../src/core.js").ObservableStates<T> } ObservableStates 観測可能な状態
 */

/**
 * @template T
 * @typedef { ([((val: ElementTypeOfState<T>) => boolean) | (() => boolean) | undefined, ((val: ElementTypeOfState<T>) => GenStateNode) | GenStateNode])[] } StateChooseNodeChildType StateChooseNodeで用いる子要素の型
 */

/**
 * ノードを状態変化により表示・非表示にするノード
 * @template T
 * @extends { StateComponent<typeof When<T>> }
 */
class StateWhenNode extends StateComponent {
	/** @type { StateNode | undefined } プレースホルダとして表示する要素 */
	#placeholder = undefined;
	/** @type { StateNode | undefined } 表示・非表示の切り替え対象となる要素 */
	#content = undefined;

	/**
	 * コンポーネントを構築する
	 * @param { typeof When<T> } component コンポーネントを示す関数
	 * @param { CompPropTypes<typeof When<T>> } props プロパティ
	 * @param { GenStateWhenNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return {{ gen: GenStateNode; children: GenStateNode[] }}
	 */
	build(component, props, children, observableStates) {
		const placeholder = new GenStateTextNode(this.ctx, '');
		const computed = this.ctx.computed(() => props.test.value?.() === true);
		// 表示対象の切り替えを行う
		const caller = watch(computed, (prev, next) => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.element;
			const parent = element?.parentElement;
			if (element) {
				const nextSibling = element.nextElementSibling;
				const prevNode = this.node;
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				this.genStateNode = computed.value ? children[0] instanceof Function ? children[0]() : children[0] : placeholder;

				// ノードの再構築が生じないように付け替えるだけにする
				const stateComponent = this.parent ?? this;
				if (next) {
					this.#placeholder = prevNode;
					this.node = this.#content ?? this.genStateNode.build(stateComponent);
				}
				else {
					this.#content = prevNode;
					this.node = this.#placeholder ?? this.genStateNode.build(stateComponent);
				}
				if (parent) {
					// 初期表示以降はDOMの更新する関数を通して構築する
					const insertElement = this.element;
					stateComponent.label.update(() => {
						prevNode?.element?.remove();
						parent.insertBefore(insertElement, nextSibling);
					});
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		/** @type { GenStateNode } 初期表示の設定 */
		this.genStateNode = computed.value ? children[0] instanceof Function ? children[0]() : children[0] : placeholder;

		return this.buildRepComponent(this.genStateNode);
	}
}

/**
 * StateChooseNodeを生成するためのノード
 * @template T
 * @extends { GenStateComponent<typeof When<T>> }
 */
class GenStateWhenNode extends GenStateComponent {
	/**
	 * 表示判定を行うテスト関数の取得
	 */
	get test() {
		return this.props.test;
	}

	/**
	 * 表示を行うノードの取得
	 */
	get child() {
		return this.children[0];
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateWhenNode<T> }
	 */
	clone() {
		return new GenStateWhenNode(this.ctx, this.component, this.props, this.children);
	}

	/**
	 * コンポーネントが属するコンテキストを生成し、それをもつコンポーネントを返す
	 * @protected
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 * @returns { StateWhenNode<T> }
	 */
	buildContext(stateComponent) {
		if (stateComponent) {
			// 親コンポーネントが存在すればコンテキストを継承する
			const ctx = stateComponent.ctx;
			return new StateWhenNode(ctx, stateComponent);
		}
		else {
			// StateComponentと同一の生成規則を適用
			const ctx = new Context(stateComponent.ctx ? stateComponent.ctx : this.ctx, ctx => new StateWhenNode(ctx, stateComponent));
			return ctx.component;
		}
	}
}

/**
 * ノードの選択における条件式を設定するコンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof When<T>> } props 
 * @param { [(StateChooseNodeChildType<T>[number][1])] } children
 * @returns 
 */
function When(ctx, props, children) {
	return new GenStateWhenNode(ctx, When, props, children);
}
/**
 * @template T
 */
When.propTypes = {
	/** @type { ((val: T) => boolean) | undefined } 表示判定を行うテスト関数 */
	test: undefined
};
When.early = true;

/**
 * ノードを選択するノード
 * @template T
 * @extends { StateComponent<typeof Choose<T>> }
 */
class StateChooseNode extends StateComponent {
	/** @type { number } 前回選択した要素のインデックス */
	#prevChooseIndex = -1;

	/**
	 * コンポーネントを構築する
	 * @param { typeof Choose<T> } component コンポーネントを示す関数
	 * @param { CompPropTypes<typeof Choose<T>> } props プロパティ
	 * @param { GenStateWhenNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return {{ gen: GenStateNode; children: GenStateNode[] }}
	 */
	build(component, props, children, observableStates) {
		// When(children)を評価する
		const whenList = children.map(genWhen => [genWhen.test, genWhen.child]);
		// 表示対象の切り替えを行う
		const caller = watch(props.target, (prev, next) => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.element;
			if (element) {
				const parent = element.parentElement;
				const nextSibling = element.nextElementSibling;
				const prevNode = this.node;
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				this.genStateNode = this.#chooseNode(next, whenList);

				if (this.genStateNode) {
					const stateComponent = this.parent ?? this;
					// ノードを構築
					this.node = this.genStateNode.build(stateComponent);
					if (parent) {
						// 初期表示以降はDOMの更新する関数を通して構築する
						const insertElement = this.element;
						stateComponent.label.update(() => {
							prevNode?.remove();
							parent.insertBefore(insertElement, nextSibling);
						});
					}
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		/** @type { GenStateNode } 初期表示の設定 */
		this.genStateNode = this.#chooseNode(props.target.value, whenList);

		return this.buildRepComponent(this.genStateNode);
	}

	/**
	 * childrenからノードを選択する
	 * @param { ElementTypeOfState<T> } val 表示対象を切り替える基準となる変数
	 * @param { StateChooseNodeChildType<T> } children valからDOMノードを選択するオブジェクト
	 */
	#chooseNode(val, children) {
		/** @type { [] | [GenStateNode] } */
		let nodeList = [];
		let i = 0;
		let genStateNodeFlag = false;
		for (; i < children.length; ++i) {
			const child = children[i];
			// 条件式が設定されていないもしくは条件式が真の場合
			if (child[0] === undefined || child[0].value(val)) {
				const c = child[1];
				genStateNodeFlag = c instanceof GenStateNode;
				nodeList = this.ctx.normalizeCtxChild([genStateNodeFlag ? c : c(val)]);
				break;
			}
		}
		// ノードが選択されなかった場合はインデックスを-1に統一
		if (nodeList.length === 0) {
			i = -1;
		}

		// 選択したノードに変化があるもしくは関数により生成された場合は新規ノードを生成
		if (i !== this.#prevChooseIndex || !genStateNodeFlag) {
			this.#prevChooseIndex = i;
			if (i === -1) {
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				return new GenStateTextNode(this.ctx, '');
			}
			return nodeList[0];
		}
		else if (!this.node) {
			// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
			return new GenStateTextNode(this.ctx, '');
		}
		return undefined;
	}
}

/**
 * StateChooseNodeを生成するためのノード
 * @template T
 * @extends { GenStateComponent<typeof Choose<T>> }
 */
class GenStateChooseNode extends GenStateComponent {

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateChooseNode<T> }
	 */
	clone() {
		return new GenStateChooseNode(this.ctx, this.component, this.props, this.children);
	}

	/**
	 * コンポーネントが属するコンテキストを生成し、それをもつコンポーネントを返す
	 * @protected
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 * @returns { StateChooseNode<T> }
	 */
	buildContext(stateComponent) {
		if (stateComponent) {
			// 親コンポーネントが存在すればコンテキストを継承する
			const ctx = stateComponent.ctx;
			return new StateChooseNode(ctx, stateComponent);
		}
		else {
			// StateComponentと同一の生成規則を適用
			const ctx = new Context(stateComponent.ctx ? stateComponent.ctx : this.ctx, ctx => new StateChooseNode(ctx, stateComponent));
			return ctx.component;
		}
	}
}

/**
 * ノードの選択を行うコンポーネント
 * @template T
 * @param { Context } ctx
 * @param { CompPropTypes<typeof Choose<T>> } props 
 * @param { GenStateWhenNode[] } children
 * @returns 
 */
function Choose(ctx, props, children) {
	return new GenStateChooseNode(ctx, Choose, props, children);
}
/**
 * @template T
 */
Choose.propTypes = {
	/** @type { T } 表示対象を切り替える基準となる変数 */
	target: undefined
};
Choose.early = true;

export { Choose, When };
