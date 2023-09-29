
/**
 * @typedef {{
 * 		label?: number | string | symbol | undefined;
 * 		caller: Function;
 * }} CallerType 状態変数における呼び出し元についての型
 */

/**
 * 状態変数
 * @template T
 */
class State {
	/** @type { T } 状態変数の本体 */
	#value;
	/** @type { Set<CallerType> } 呼び出し元のハンドラのリスト */
	#callerList = new Set();
	/** @type { Context } 状態変数の扱っているコンテキスト */
	#ctx;
	/** @type { ((val: State<T>) => boolean) | undefined | false } 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントのハンドラ */
	#onreference = undefined;

	/**
	 * コンストラクタ
	 * @param { T } value 状態変数の初期値
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 */
	constructor(value, ctx) {
		this.#value = value;
		this.#ctx = ctx;
	}

	get value() {
		// 呼び出し元が有効なら追加する
		if (this.#ctx.current && !this.#callerList.has(this.#ctx.current)) {
			this.#ctx.notify(this);
			this.#callerList.add(this.#ctx.current);
		}
		return this.#value;
	}

	set value(value) {
		if (value !== this.#value) {
			this.#value = value;
			this.#ctx.updateState(this.#callerList);
		}
	}

	/**
	 * 監視を伴わない値の取得
	 */
	get org() { return this.#value; }

	/**
	 * 監視を伴わない値の設定
	 */
	set org(value) { this.#value = value; }

	get ctx() { return this.#ctx; }

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { CallerType } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#callerList.delete(caller); }

	/**
	 * 状態変数の参照カウントを得る
	 */
	get count() { return this.#callerList.size; }

	/**
	 * 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントの設定
	 * @param { (val: State<T>) => unknown } callback イベントハンドラ
	 */
	set onreference(callback) {
		/**
		 * #onreference2の形式の関数
		 * @param { State<T> } s
		 */
		const c = s => {
			s.#onreference = false;
			callback(s);
			return true;
		};
		if ((!this.#onreference && this.count > 0) || (this.#onreference && this.#onreference(this))) {
			c(this);
		}
		else {
			this.#onreference = c;
		}
	}

	/**
	 * 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントハンドラの取得
	 */
	get onreference() {
		return this.#onreference;
	}

	/**
	 * propの観測(onreferenceの連鎖的な追跡も実施する)
	 * @param { CtxValueType<T> } prop 観測対象の変数
	 */
	observe(prop) {
		// 複数対象を観測等してはならない
		if (this.#onreference !== undefined) {
			throw new Error('State variables are already used for observation.');
		}

		if (prop instanceof State || prop instanceof Computed) {
			this.ctx.unuseReferenceCheck(() => {
				const caller = this.ctx.unidirectional(prop, this);
				// state.onreferenceなしでstateが1つ以上の参照をもつ(親への状態の伝播なしで状態の参照が存在する場合)
				// もしくはstate.onreferenceなしでstateが2つ以上の参照をもつ(親への状態の伝播ありで状態の参照が存在する場合)
				// もしくはonreference()の戻り値がtrue(親への状態の伝播ありで祖先で状態の参照が存在する場合)
				// の場合に状態変数は利用されている
				const flag = (!this.#onreference && this.count > 0) || (this.#onreference && this.#onreference(this));
				try {
					caller.states.forEach(s => {
						if (s.#onreference !== undefined) {
							throw new Error('State variables are already used for observation.');
						}
						s.#onreference = s2 => {
							s2.#onreference = false;
							return flag;
						};
					});
				}
				catch (e) {
					// 状態変数の関連付けを解除してリスロー
					caller.states.forEach(s => s.delete(caller.caller));
					throw e;
				}
				// このタイミングで値が利用されていない際はchoose()などで後から利用される可能性があるため
				// 後から通知を行うことができるようにする
				if (!flag) {
					// 関連付けられた状態変数のonreferenceを連鎖的に呼び出す
					this.#onreference = s => {
						s.#onreference = false;
						caller.states.forEach(state => state.#onreference?.(state));
						return false;
					};
				}
			});
		}
		else {
			this.value = prop;
		}
	}
}

/**
 * 算出プロパティ
 * @template T
 */
class Computed {
	/** @type { () => T } 算出プロパティを計算する関数 */
	#f;

	/**
	 * コンストラクタ
	 * @param { () => T } f 算出プロパティを計算する関数
	 */
	constructor(f) {
		this.#f = f;
	}

	get value() { return this.#f(); }
}

/**
 * @template { string } K
 * @typedef { K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement } CreatedElementType タグからノードの型を得る
 */

/**
 * @template { (ctx: Context, props: CompPropTypes<K>, children: CompChildType) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } K
 * @typedef { (ctx: Context, props: CompPropTypes<K>, children: CompChildType) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } ComponentType コンポーネントの型
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLElement ? {
 * 		clientHeight: HTMLElement['clientHeight'];
 * 		clientWidth: HTMLElement['clientWidth'];
 * } : {} } ObservableHTMLElementState 観測可能なHTMLElement固有の要素の状態
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLInputElement ? {
 * 		value: HTMLInputElement['value'];
 * 		valueAsDate: HTMLInputElement['valueAsDate'];
 * 		valueAsNumber: HTMLInputElement['valueAsNumber'];
 * 		checked: HTMLInputElement['checked'];
 * } : {} } ObservableHTMLInputElementState 観測可能なHTMLInputElement固有の要素の状態
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLSelectElement ? {
 * 		value: HTMLSelectElement['value'];
 * 		selectedOptions: HTMLSelectElement['selectedOptions'];
 * } : {} } ObservableHTMLSelectElement 観測可能なHTMLSelectElement固有の要素(changeイベントリスナで変更を監視する)
 */

/**
 * @template { HTMLElement } T
 * @typedef { T extends HTMLTextAreaElement ? {
 * 		value: HTMLTextAreaElement['value'];
 * } : {} } ObservableHTMLTextAreaElement 観測可能なHTMLTextAreaElement固有の要素(inputイベントリスナで変更を監視する)
 */

/**
 * @template { string } K
 * @typedef { K extends keyof HTMLElementTagNameMap ? 
 * 		ObservableHTMLElementState<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLInputElementState<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLSelectElement<HTMLElementTagNameMap[K]> &
 * 		ObservableHTMLTextAreaElement<HTMLElementTagNameMap[K]>
 * : {} } ObservableDomNodeStates 観測可能なHTML要素の状態
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { ReturnType<K> extends StateNode ? {}
 * 		: 'exposeStates' extends keyof ReturnType<K> ? ReturnType<K>['exposeStates'] extends undefined ? {} : ReturnType<K>['exposeStates']
 * 		: {}
 * } ComponentExposeStates 公開しているコンポーネントの状態
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: T[K] extends State<infer U1> ? U1 : T[K] extends Computed<infer U2> ? U2 : T[K] } } ObservableComponentStatesImpl
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { ObservableComponentStatesImpl<ComponentExposeStates<K>> } ObservableComponentStates 観測可能なコンポーネントの状態
 */

/**
 * @template T
 * @typedef { Partial<{
* 		[K in keyof T]-?: State<T[K]>;
* }> } ObservableStateImpl 観測可能な状態の型の構築のための共通の変換
*/

/**
 * @template { string | ComponentType<K> } K
 * @typedef { ObservableStateImpl<K extends string ? ObservableDomNodeStates<K> : ObservableComponentStates<K>> } ObservableStates 観測可能な状態
 */

/**
 * 状態を持ったノード
 */
class StateNode {
	/** @type { Context } ノードを扱っているコンテキスト */
	#ctx;
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList;

	/**
	 * コンストラクタ
	 * @param { Context } ctx ノードを扱っているコンテキスト
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, callerList) {
		this.#ctx = ctx;
		this.callerList = callerList;
	}

	get ctx() { return this.#ctx; }

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { throw new Error('not implemented.'); }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
	}
}

/**
 * StateNodeを生成するためのノード
 */
class GenStateNode {
	/** @type { Context } StateNodeを生成するコンテキスト */
	#ctx;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 */
	constructor(ctx) {
		this.#ctx = ctx;
	}

	/**
	 * StateNodeを生成するコンテキストの取得
	 */
	get ctx() { return this.#ctx; }

	/**
	 * atomicなGetStateNodeであるかの判定
	 */
	get isAtomic() { return false; }

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateNode }
	 */
	clone() { throw new Error('not implemented.'); }

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) { throw new Error('not implemented.'); }

	/**
	 * 子孫要素を構築する
	 */
	build() {
		const { calc, node } = this.#moutnImpl();
		calc();
		return node;
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @returns { { calc: () => void; node: StateNode } }
	 */
	#moutnImpl(target) {
		/** @type { undefined | StateNode } */
		let stateNode = undefined;

		const calc = this.#ctx.lazy(() => {
			/** @type { StateNode | undefined } */
			let _node = undefined;
			/** @type { GenStateNode | undefined } */
			let _gen = undefined;
			/** @type { GenStateNode[] } */
			let _children = [];

			// コンポーネントの評価(ルートノードによってはコンポーネントではない場合もある)
			// よく考えたらこれはバグでは？（ルートがコンポーネントかつ代表する要素がコンポーネントの場合にバグる）
			// 他にもchooseの中にcomponentがある場合の動作などが怪しい
			({ node: _node, gen: _gen, children: _children } = this.buildCurrent(target));
			stateNode = _node;
			// _genがundefinedならatomic
			while (_gen) {
				const { node, gen, children } = _gen.buildCurrent(target);
				_gen = gen;
				// 既に子要素が設定されている場合は無視する
				_children = _children.length > 0 ? _children : children;
			}

			/** @type { { node: StateNode; children: GenStateNode[]; element: HTMLElement | Text | undefined }[] } コンポーネントについての幅優先探索に関するキュー */
			const queueComponent = [{ node: _node, children: _children, element: target }];

			while (queueComponent.length > 0) {
				/** @type { (typeof queueComponent)[number] } */
				const { node, children, element: localRoot } = queueComponent.shift();
				/** @type {{ node: StateNode; children: (typeof localTree | GenStateNode)[]; element: HTMLElement | Text | undefined }} コンポーネント内におけるStateNodeのツリー(コンポーネントはGenStateNodeで管理し、それ以外は最終的にatomicになる) */
				const localTree = { node, children, element: localRoot };
				/** @type { (typeof localTree)[] } ノードについての幅優先探索に関するキュー */
				const queueNode = [localTree];

				//  コンポーネント内のノード生成に関するループ
				while (queueNode.length > 0) {
					/** @type { (typeof queueNode)[number] } */
					const { node, children, element } = queueNode.shift();
					// 子要素の評価と取り出し
					const childNodes = element?.childNodes ?? [];
					if (children.length > 0) {
						// nodeに子が設定されているときはElementノード以外を削除
						for (const childNode of childNodes) {
							if (childNode.nodeType !== Node.ELEMENT_NODE) {
								childNode.remove();
							}
						}
					}
					const useChildNodes = childNodes.length > 0;
					let cnt = 0;
					// 子要素の評価
					for (let i = 0; i < children.length; ++i) {
						/** @type { GenStateNode } */
						const child = children[i];

						[_node, _gen, _children] = [undefined, child, []];
						// 原子的なノードでなければノードを構築する
						if (!child.isAtomic && !(child instanceof GenStateComponent)) {
							({ node: _node, gen: _gen, children: _children } = child.buildCurrent(target));
						}
						const childNode = cnt < childNodes.length ? childNodes[cnt++] : undefined;
						// ノードの比較を実施(_genはundefinedにはならない)
						if (!_gen.isAtomic) {
							// _genがatomicならコンポーネント
							if (useChildNodes && !childNode) {
								throw new Error('The number of nodes is insufficient.');
							}
							// 子要素をコンポーネントを生成するノードで置き換え
							children[i] = _gen;
						}
						else {
							if (_gen instanceof GenStateTextNode) {
								const { node } = _gen.buildCurrent();
								// 子要素をStateNodeで置き換え
								children[i] = { node, children: [], element: node.element };
								// テキストノードであれば挿入して補完する
								if (useChildNodes) {
									element.insertBefore(node.element, childNode);
									++cnt;
								}
							}
							else {
								if (useChildNodes && !childNode) {
									throw new Error('The number of nodes is insufficient.');
								}
								const { node, children: grandchildren } = _gen.buildCurrent(childNode);
								// 既に子要素が設定されている場合は無視する
								_children = _children.length > 0 ? _children : grandchildren;
								// localTreeの構築
								children[i] = { node, children: _children, element: childNode };
								queueNode.push(children[i]);
							}
						}
					}
					// 子要素が多すぎたかの評価
					if (useChildNodes && cnt < childNodes.length) {
						throw new Error('The number of nodes is excessive.');
					}
				}

				// DOMノードの親子関係の決定
				queueNode.push(localTree);
				while (queueNode.length > 0) {
					/** @type { (typeof queueNode)[number] } */
					const { node, children, element } = queueNode.shift();
					let childNode = element?.firstChild;
					for (let i = 0; i < children.length; ++i) {
						const child = children[i];
						// GenStateComponentの場合はカレントノードを構築する
						if (child instanceof GenStateNode) {
							({ node: _node, gen: _gen, children: _children } = child.buildCurrent(childNode));
							// _genがundefinedならatomic
							while (_gen) {
								const { node, gen, children } = _gen.buildCurrent(childNode);
								_gen = gen;
								// 既に子要素が設定されている場合は無視する
								_children = _children.length > 0 ? _children : children;
							}
							// 構築対象のコンポーネントのpush
							queueComponent.push({ node: _node, children: _children, element: childNode });
						}
						else {
							_node = child.node;
						}
						// elementに子要素が存在しない場合にのみ子を追加する
						if (!childNode) {
							node.element.appendChild(_node.element);
						}
						// GenStateComponent出ない場合は次の探索のセットアップ
						if (!(child instanceof GenStateNode)) {
							queueNode.push(child);
						}
						childNode = childNode?.nextSibling;
					}
				}
			}
		});
		return { calc, node: stateNode };
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement } target マウント対象のDOMノード
	 */
	mount(target) {
		this.#moutnImpl(target).calc();
	}

	/**
	 * 後からマウント可能なDOMノードを構築する
	 * @param { HTMLElement | undefined } target 書き込み対象のDOMノード
	 * @returns { HTMLElement }
	 */
	write(target) {
		// 変更の伝播を破棄する
		return this.#moutnImpl(target).node.element;
	}
}

/**
 * GenStateNodeで生成したStateNodeを取得するためのノード
 * GenStateNodeとStateNodeを一意に対応付けるために利用するものであり、build時に使い捨てるオブジェクトを生成する
 * (通常はGenStateNode:StateNode = 1:N)
 */
class GetGenStateNode extends GenStateNode {
	/** @type { GenStateNode } 管理するGenStateNode */
	#gen;
	/** @type { (node: StateNode) => unknown } 取得したノードを伝播する関数 */
	#setter;

	/**
	 * コンストラクタ
	 * @param { GenStateNode } gen 管理するGenStateNode
	 * @param { (node: StateNode) => unknown } setter 取得したノードを伝播する関数
	 */
	constructor(gen, setter) {
		super(gen.ctx);
		this.#gen = gen;
		this.#setter = setter;
	}

	/**
	 * atomicなGetStateNodeであるかの判定
	 */
	get isAtomic() { return this.#gen.isAtomic; }

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成(呼びだされてはならない)
	 * @returns { GenStateNode }
	 */
	clone() { throw new Error('This call is invalid.'); }

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		const ret = this.#gen.buildCurrent(target);
		this.#setter(ret.node);
		return ret;
	}
}

/**
 * 状態を持ったTextノード
 */
class StateTextNode extends StateNode {
	/** @type { Text } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Context } ctx ノードを扱っているコンテキスト
	 * @param { Text } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, element, callerList) {
		super(ctx, callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { Text }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element.remove();
	}
}

/**
 * StateTextNodeを生成するためのノード
 */
class GenStateTextNode extends GenStateNode {
	/** @type { CtxValueType<string> } テキスト要素 */
	#text;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { CtxValueType<string> } text テキスト
	 */
	constructor(ctx, text) {
		super(ctx);
		this.#text = text;
	}

	/**
	 * atomicなGetStateNodeであるかの判定
	 */
	get isAtomic() { return true; }

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateTextNode }
	 */
	clone() {
		return new GenStateTextNode(this.ctx, this.#text);
	}

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateTextNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		const text = this.#text;
		const element = this.ctx.useParam(text, val => document.createTextNode(val));
		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// 子にテキストの状態が渡された場合は変更を監視する
		if (text instanceof State || text instanceof Computed) {
			callerList.push(this.ctx.call(() => element.data = text.value));
		}

		return { node: new StateTextNode(this.ctx, element, callerList), children: [] };
	}
}

/**
 * 状態を持ったHTMLElementノード
 */
class StateHTMLElement extends StateNode {
	/** @type { HTMLElement } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Context } ctx ノードを扱っているコンテキスト
	 * @param { HTMLElement } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, element, callerList) {
		super(ctx, callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element.remove();
	}
}

/**
 * StateHTMLElementを生成するためのノード
 */
class GenStateHTMLElement extends GenStateNode {
	/** @type { HTMLElement } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { HTMLElement } element DOMノード
	 */
	constructor(ctx, element) {
		super(ctx);
		this.#element = element;
	}

	/**
	 * atomicなGetStateNodeであるかの判定
	 */
	get isAtomic() { return true; }

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateHTMLElement }
	 */
	clone() {
		return new GenStateHTMLElement(this.ctx, this.#element);
	}

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateHTMLElement; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		// ノードのチェック
		if (target) {
			if (target instanceof Text) {
				throw new Error('\'target\' must be an HTMLElement.');
			}
			else if (target.tagName.toLowerCase() !== this.#element.tagName.toLowerCase()) {
				throw new Error(`'${target.tagName}' and '${this.#element.tagName}' cannot build a node because they have different tag names.`)
			}
		}

		const element = this.#element.cloneNode(true);

		if (target) {
			// 属性を移動
			for (const attribute of target.attributes) {
				if (!element.hasAttribute(attribute.name)) {
					element.setAttribute(attribute.name, attribute.value);
				}
			}
			// 親ノードが存在すれば置換
			if (target.parentNode) {
				target.parentNode.replaceChild(element, target);
			}
		}

		return { node: new StateHTMLElement(this.ctx, element, []), children: [] };
	}
}

/**
 * 状態を持ったDOMノード
 * @template { string } K
 */
class StateDomNode extends StateNode {
	/** @type { CreatedElementType<K> } DOMノード */
	#element = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx ノードを扱っているコンテキスト
	 * @param { HTMLElement } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, element, callerList) {
		super(ctx, callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element.remove();
	}
}

/**
 * StateDomNodeを生成するためのノード
 * @template { string } K
 */
class GenStateDomNode extends GenStateNode {
	/** @type { K } HTMLタグ */
	#tag;
	/** @type { CtxDomPropTypes<CreatedElementType<K>> } プロパティ */
	#props;
	/** @type { GenStateNode[] } 子要素 */
	#children;
	/** @type { ObservableStates<K> | undefined } 観測する対象 */
	#observableStates = undefined;
	/** @type { boolean } ノードが生成されたことがあるかを示すフラグ */
	#genFlag = false;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { K } tag HTMLタグ
	 * @param { CtxDomPropTypes<CreatedElementType<K>> } props プロパティ
	 * @param { GenStateNode[] } children 子要素を生成する関数
	 */
	constructor(ctx, tag, props, children) {
		super(ctx);
		this.#tag = tag;
		this.#props = props;
		this.#children = children;
	}

	/**
	 * atomicなGetStateNodeであるかの判定
	 */
	get isAtomic() { return true; }

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateDomNode<K> }
	 */
	clone() {
		return new GenStateDomNode(this.ctx, this.#tag, this.#props, this.#children);
	}

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateDomNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.#observableStates) {
			throw new Error('The buildCurrent in GenStateDomNode must not be called more than twice.');
		}

		// ノードのチェック
		if (target) {
			if (target instanceof Text) {
				throw new Error('\'target\' must be an HTMLElement.');
			}
			else if (target.tagName.toLowerCase() !== this.#tag.toLowerCase()) {
				throw new Error(`'${target.tagName}' and '${this.#tag}' cannot build a node because they have different tag names.`)
			}
		}

		// DOMノードの生成
		const element = target ?? document.createElement(this.#tag);

		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// プロパティの設定
		for (const key in this.#props) {
			const val = this.#props[key];
			if (val !== undefined && val !== null && val !== false) {
				const caller = this.ctx.setParam(val, val => {
					// 属性とプロパティで動作に差異のある対象の設定
					const lowerTag = this.#tag.toLowerCase();
					// styleはオブジェクト型による設定を許容するため処理を特殊化
					if (key === 'style') {
						if (val !== undefined && val !== null && val !== false) {
							for (const styleKey in val) {
								const caller = this.ctx.setParam(
									val[styleKey],
									val => element.style[styleKey] = val ?? '',
									Context.DOM_UPDATE
								);
								if (caller && caller.states.length > 0) callerList.push(caller);
							}
						}
						else {
							element.removeAttribute('style');
						}
					}
					else if (
						lowerTag === 'input' && key === 'value' ||
						lowerTag === 'input' && key === 'checked' ||
						lowerTag === 'option' && key === 'selected'
					) {
						if (element.hasAttribute(key)) {
							element[key] = val;
						}
						else {
							// 初期値の設定
							element.setAttribute(key, val);
						}
					}
					// その他プロパティはそのまま設定する
					else {
						element[key] = val ?? '';
					}
				}, Context.DOM_UPDATE);
				if (caller && caller.states.length > 0) callerList.push(caller);
			}
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates, element);
			this.#observableStates = undefined;
		}

		this.#genFlag = true;

		return { node: new StateDomNode(this.ctx, element, callerList), children: [...this.#children] };
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// Web Componentは対象外
		if (customElements.get(this.#tag.toLowerCase())) {
			throw new Error('Observation of Web Component in StateDomNode is not supported.');
		}

		// 既にobserve()が呼びだされたことがあるのならばノードを複製する
		const node = this.#observableStates ? this.clone() : this;
		node.#observableStates = props;
		node.#genFlag = false;
		return node;
	}

	/**
	 * ノードの内部の状態の観測の実装部
	 * @param { ObservableStates<K> } props 観測する対象
	 * @param { HTMLElement } element 観測する対象をもつ要素
	 */
	#observeImpl(props, element) {
		/**
		 * 状態の伝播に関する参照情報の設定
		 * @param { ObservableStates<K> } props 観測する対象
		 * @param { string } targets 監視対象のパラメータ
		 * @param { (key: string) => (state: State<unknown>) => void } callback onreferenceに設定するコールバック
		 */
		const setReference = (props, targets, callback) => {
			for (const name of targets) {
				/** @type { State<unknown> | undefined } */
				const state = props[name];
				if (state) {
					state.onreference = callback(name);
				}
			}
		};

		/**
		 * オブザーバによる状態の伝播に関する参照情報の設定
		 * @param { (setter: (element: HTMLElement) => void) => void } observer イベントリスナのタイプ
		 * @param { ObservableStates<K> } props 観測する対象
		 * @param { string[] } targets 監視対象のパラメータ
		 */
		const setReferenceToObserver = (observer, props, targets) => {
			let callbackEventListenerFlag = true;
			/**
			 * イベントの構築
			 * @param { string } key
			 * @returns { (state: State<unknown>) => void }
			 */
			const callbackEventListener = key => state => {
				// 初回呼び出し時にのみイベントを設置する
				if (callbackEventListenerFlag) {
					callbackEventListenerFlag = !callbackEventListenerFlag;
					observer(element => {
						// 各種状態の設定
						for (const name of targets) {
							/** @type { State<unknown> | undefined } */
							const state = props[name];
							const value = element[name];
							if (state && state.org !== value) {
								state.value = value;
							}
						}
					});
				}
				// 初期値の伝播
				state.value = element[key];
			};

			// 状態の監視の設定
			setReference(props, targets, callbackEventListener);
		};

		/**
		 * イベントリスナのオブザーバによる状態の伝播に関する参照情報の設定
		 * @template { HTMLElementEventMap } L
		 * @param { L } type イベントリスナのタイプ
		 * @param { ObservableStates<K> } props 観測する対象
		 * @param { string[] } targets 監視対象のパラメータ
		 */
		const setReferenceToEventListenerObserver = (type, props, targets) => {
			setReferenceToObserver(setter => {
				element.addEventListener(type, e => setter(e.target));
			}, props, targets);
		};

		//
		// ObservableHTMLElementStateに関する項目の検証
		//
		{
			setReferenceToObserver(setter => {
				const resizeObserver = new ResizeObserver(entries => {
					// entriesが複数存在することも加味して状態変数の変化の伝播を遅延する
					this.ctx.lazy(() => {
						for (const entry of entries) {
							setter(element);
						}
					})();
				});
				resizeObserver.observe(element);
			}, props, ['clientHeigth', 'clientWidth']);
			let callbackResizeObserverFlag = true;
		}

		//
		// ObservableHTMLInputElementStateに関する項目の検証
		//
		if (element instanceof HTMLInputElement) {
			setReferenceToEventListenerObserver('input', props, ['value', 'valueAsDate', 'valueAsNumber']);
			setReferenceToEventListenerObserver('change', props, ['checked']);
		}

		//
		// ObservableHTMLSelectElementに関する項目の検証
		//
		if (element instanceof HTMLSelectElement) {
			setReferenceToEventListenerObserver('change', props, ['value', 'selectedOptions']);
		}

		//
		// ObservableHTMLTextAreaElementに関する項目の検証
		//
		if (element instanceof HTMLTextAreaElement) {
			setReferenceToEventListenerObserver('input', props, ['value']);
		}
	}
}

/**
 * コンポーネント
 * @template { ComponentType<K> } K
 */
class StateComponent extends StateNode {
	/** @type { StateNode | undefined } コンポーネントを代表するノード */
	#element = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { CtxCompPropTypes<K> } props プロパティ
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 * @param { GenStateNode } genStateNode コンポーネントを示すノード
	 * @param { { gen?: GenStateNode; children?: GenStateNode[] } } result ノードの生成結果を示すオブジェクト
	 */
	constructor(ctx, callerList, genStateNode, result) {
		super(ctx, callerList);

		if (!genStateNode.isAtomic && !(genStateNode instanceof GenStateComponent)) {
			({ node: this.#element, gen: result.gen, children: result.children } = genStateNode.buildCurrent());
		}
		else {
			result.gen = new GetGenStateNode(genStateNode, node => this.#element = node);
			result.children = [];
		}
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.#element?.element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element?.remove();
	}
}

/**
 * StateComponentを生成するためのノード
 * @template { ComponentType<K> } K
 */
class GenStateComponent extends GenStateNode {
	/** @type { K } コンポーネントを示す関数 */
	#component;
	/** @type { CtxCompPropTypes<K> } プロパティ */
	#props;
	/** @type { GenStateNode[] } 子要素 */
	#children;
	/** @type { ObservableStates<K> | undefined } 観測する対象 */
	#observableStates = undefined;
	/** @type { boolean } ノードが生成されたことがあるかを示すフラグ */
	#genFlag = false;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { K } component コンポーネントを示す関数
	 * @param { CtxCompPropTypes<K> } props プロパティ
	 * @param { CtxChildType } children 子要素を生成する関数
	 */
	constructor(ctx, component, props, children) {
		super(ctx);
		this.#component = component;
		this.#props = props;
		this.#children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateComponent<K> }
	 */
	clone() {
		return new GenStateComponent(this.ctx, this.#component, this.#props, this.#children);
	}

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateComponent; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.#observableStates) {
			throw new Error('The buildCurrent in GenStateComponent must not be called more than twice.');
		}

		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		for (const key in this.#component.propTypes ?? {}) {
			const val = this.#props[key];
			// 渡されたプロパティが状態変数なら単方向データに変換して渡すようにする
			if (val instanceof State || val instanceof Computed) {
				const s = new State(val.value, val instanceof State ? val.ctx : this.ctx);
				const caller = this.ctx.unidirectional(val, s);
				if (caller && caller.states.length > 0) callerList.push(caller);
				compProps[key] = s;
			}
			else {
				// 値が与えられなかった場合はデフォルト値から持ってくる
				const val2 = val === undefined || val === null || val === false ? this.#component.propTypes[key] : val;
				if (val2 !== undefined && val2 !== null && val2 !== false) {
					compProps[key] = new State(val2, this.ctx);
				}
			}
		}

		// ノードの生成
		const compResult = this.#component(this.ctx, compProps, this.#children);
		/** @type { GenStateNode | undefined } */
		let genStateNode = undefined;
		/** @type { ComponentExposeStates<K> | {} } コンポーネントが公開している状態 */
		let exposeStates = {};
		if (compResult instanceof GenStateNode) {
			genStateNode = compResult;
		}
		else {
			genStateNode = compResult.node;
			exposeStates = compResult.exposeStates ?? {};
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates, exposeStates);
			this.#observableStates = undefined;
		}

		/** @type { { gen?: GenStateNode; children?: GenStateNode[] } } */
		const result = {};
		// atomicでないノードを生成してresultの情報を返す
		const node = new StateComponent(this.ctx, callerList, genStateNode, result);

		this.#genFlag = true;

		return { node, gen: result.gen, children: result.children };
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// 既にobserve()が呼びだされたことがあるのならばノードを複製する
		const node = this.#observableStates ? this.clone() : this;
		node.#observableStates = props;
		node.#genFlag = false;
		return node;
	}

	/**
	 * ノードの内部の状態の観測の実装部
	 * @param { ObservableStates<K> } props 観測する対象
	 * @param { ComponentExposeStates<K> } exposeStates 観測可能な対象
	 */
	#observeImpl(props, exposeStates) {
		for (const key in props) {
			const state = props[key];
			const exposeState = exposeStates[key];
			// 状態の観測の実施
			state.observe(exposeState);
		}
	}
}

/**
 * @template T
 * @typedef { (val: T extends State<infer U1> ? U1 : T extends Computed<infer U2> ? U2 : T) => (StateNode | HTMLElement | Text | CtxValueType<string> | false | null | undefined) } CallbackStateChooseNode StateChooseNodeで用いるコールバック
 */

/**
 * ノードを選択するノード
 * @template T
 */
class StateChooseNode extends StateNode {
	/** @type { {} } chooseについてのプロパティ(現在はなし) */
	#props;
	/** @type { { caller: CallerType; states: State<unknown>[] } | undefined } 表示の切り替えに関する呼び出し元 */
	#caller = undefined;
	/** @type { StateNode | undefined } 現在表示しているノード */
	#currentNode = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { CallbackStateChooseNode<T> } callback valからDOMノードを選択する関数
	 * @param { { gen?: GenStateNode; children?: GenStateNode[] } } result ノードの生成結果を示すオブジェクト
	 */
	constructor(ctx, props, val, callback, result) {
		super(ctx, []);
		this.#props = props;
		const caller = ctx.setParam(val, val => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.element;
			if (element) {
				const parent = element.parentElement;
				const nextSibling = element.nextElementSibling;
				this.#currentNode?.remove();
				const nodeList = this.ctx.normalizeCtxChild([callback(val)]);
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				const genStateNode = nodeList.length > 0 ? nodeList[0] : new GenStateTextNode(this.ctx, '');

				// ノードを構築
				this.#currentNode = genStateNode.build();
				parent.insertBefore(this.element, nextSibling);
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		// 初期表示の設定
		const nodeList = this.ctx.normalizeCtxChild([callback(this.ctx.useParam(val))]);
		// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
		const genStateNode = nodeList.length > 0 ? nodeList[0] : new GenStateTextNode(this.ctx, '');

		if (!genStateNode.isAtomic && !(genStateNode instanceof GenStateComponent)) {
			({ gen: result.gen, children: result.children } = genStateNode.buildCurrent());
		}
		else {
			result.gen = new GetGenStateNode(genStateNode, node => this.#currentNode = node);
			result.children = [];
		}
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.#currentNode?.element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#currentNode?.remove();
		this.#caller?.states?.forEach(state => state.delete(this.#caller.caller));
	}
}

/**
 * StateChooseNodeを生成するためのノード
 * @template T
 */
class GenStateChooseNode extends GenStateNode {
	/** @type { {} } chooseについてのプロパティ(現在はなし) */
	#props;
	/** @type { T } 表示対象を切り替える基準となる変数 */
	#val;
	/** @type { CallbackStateChooseNode<T> } valからDOMノードを選択する関数 */
	#callback;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { CallbackStateChooseNode<T> } callback valからDOMノードを選択する関数
	 */
	constructor(ctx, props, val, callback) {
		super(ctx);
		this.#props = props;
		this.#val = val;
		this.#callback = callback;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateChooseNode }
	 */
	clone() {
		return new GenStateChooseNode(this.ctx, this.#props, this.#val, this.#callback);
	}

	/**
	 * 自要素を構築する
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateChooseNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(target) {
		/** @type { { gen?: GenStateNode; children?: GenStateNode[] } } */
		const result = {};
		// atomicでないノードを生成してresultの情報を返す
		const node = new StateChooseNode(this.ctx, { ...this.#props }, this.#val, this.#callback, result);
		return { node, gen: result.gen, children: result.children };
	}
}

/**
 * @template T1, T2
 * @typedef { (<T>() => (T extends T1 ? 1 : 2)) extends (<T>() => (T extends T2 ? 1 : 2)) ? true : false } IsSame 同じ型であることの判定
 */

/**
 * @template T
 * @typedef { Pick<T, {
 * 		[K in keyof T]-?: IsSame<{ [K2 in K]: T[K2] }, { -readonly [K2 in K]: T[K2] }> extends true ? K : never;
 * }[keyof T]> } RemoveReadonlyProperty 型からreadonlyなプロパティの除去
 */

/**
 * @template T
 * @typedef { Pick<T, {
 * 		[K in keyof T]-?: T[K] extends Function ? never : K;
 * }[keyof T]> } RemoveFunction 型から関数の除去(propertyとprototypeは区別不可)
 */

/**
 * @template T
 * @typedef { State<T> | Computed<T> | T } CtxValueType コンテキスト上での値の型
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: CtxValueType<T[K] | null | undefined> } } CtxPropTypes コンテキスト上でのプロパティの型
 */

/**
 * @template { HTMLElement } T
 * @typedef { CtxPropTypes<
 * 		RemoveReadonlyProperty<RemoveFunction<T>> &
 * 		{ style: CtxPropTypes<RemoveReadonlyProperty<RemoveFunction<CSSStyleDeclaration>>> }
 * > } CtxDomPropTypes コンテキスト上でのDOMのプロパティの型
 */

/**
 * @typedef { (GenStateNode | HTMLElement | Text | CtxValueType<string> | false | null | undefined)[] } CtxChildType コンテキスト上での子要素の型
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: CtxValueType<T['propTypes'][K]> } : {} } CtxCompPropTypes コンテキスト上でのコンポーネントのプロパティの型
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: State<T['propTypes'][K]> } : {} } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @typedef { GenStateNode[] } CompChildType コンポーネント上での子要素の型
 */

/**
 * コンテキスト
 */
class Context {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { boolean[] } 参照のチェックを行う(Stateのonreferenceを呼び出す)かのフラグ */	
	#checkReference = [true];

	/** 状態変数を参照している呼び出し元がDOMの更新であることを示すsymbol */
	static DOM_UPDATE = Symbol('DOM_UPDATE');
	/** @type { Set<Function> } DOMを更新するタスクの集合 */
	#domUpdateTask = new Set();
	/** @type { boolean } DOMの更新のタスクが既にマイクロタスクキューに追加されているか */
	#domUpdateFlag = false;
	/** @type { Set<CallerType>[] } 遅延評価対象の呼び出し元の集合についてのスタック */
	#lazyUpdateStack = [];

	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1].caller; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は基本的に禁止)
	 * @param { Function | CallerType } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: CallerType; states: State<unknown>[] } }
	 */
	call(caller) {
		const caller2 = caller instanceof Function ? { caller } : caller;
		this.#stack.push({ caller: caller2, states: [] });
		caller2.caller();
		return this.#stack.pop();
	}

	/**
	 * 状態の更新の通知を行う
	 * @param { Iterable<CallerType> } itr 状態の参照先のハンドラ
	 */
	updateState(itr) {
		// 状態の遅延評価を行う場合は遅延評価を行う対象の集合に記憶する
		if (this.#lazyUpdateStack.length > 0) {
			const set = this.#lazyUpdateStack[this.#lazyUpdateStack.length - 1];
			for (const val of itr) {
				set.add(val);
			}
			return;
		}

		for (const val of itr) {
			// DOMを更新する関数の場合
			if (val.label === Context.DOM_UPDATE) {
				this.#domUpdateTask.add(val.caller);
				// マイクロタスクに追加する
				if (!this.#domUpdateFlag) {
					this.#domUpdateFlag = true;
					queueMicrotask(() => {
						// タスクの実行と初期化
						const task = this.#domUpdateTask;
						this.#domUpdateTask = new Set();
						this.#domUpdateFlag = false;
						task.forEach(t => t());
					});
				}
			}
			// 未定義の場合は同期的に即時評価
			else {
				val.caller();
			}
		}
	}

	/**
	 * callback内での状態変数の変更の伝播を遅延させるハンドラを生成する
	 * @param { Function } callback 状態変数の変更操作を含む関数
	 * @returns { () => void } 状態変数の変更の伝播を行う関数
	 */
	lazy(callback) {
		const set = new Set();
		this.#lazyUpdateStack.push(set);
		callback();
		this.#lazyUpdateStack.pop();
		return set.size === 0 ? () => {} : () => this.updateState(set);
	}

	/**
	 * 参照のチェックを利用するコンテキストで関数を実行する
	 * @param { () => unknown } callback 参照チェックを利用するコンテキストで実行するコールバック
	 */
	useReferenceCheck(callback) {
		this.#checkReference.push(true);
		callback();
		this.#checkReference.pop();
	}

	/**
	 * 参照のチェックを利用しないコンテキストで関数を実行する
	 * @param { () => unknown } callback 参照チェックを利用するコンテキストで実行するコールバック
	 */
	unuseReferenceCheck(callback) {
		this.#checkReference.push(false);
		callback();
		this.#checkReference.pop();
	}

	/**
	 * 状態変数のキャプチャの通知
	 * @template T
	 * @param { State<T> } state 通知対象の状態変数
	 */
	notify(state) {
		if (this.#stack.length > 0) {
			if (this.#checkReference[this.#checkReference.length - 1] && state.onreference) {
				// 参照追加に関するイベントの発火
				state.onreference(state);
			}
			this.#stack[this.#stack.length - 1].states.push(state);
		}
	}

	/**
	 * 状態変数の宣言
	 * @template T
	 * @param { T } value 状態変数の初期値
	 * @returns { State<T> }
	 */
	useState(value) {
		return new State(value, this);
	}

	/**
	 * 単方向データの作成
	 * @template T, U
	 * @param { State<T> | Computed<T> } src 作成元のデータ
	 * @param { State<U> } dest 作成対象のデータ
	 * @param { (from: T) => U } trans 変換関数
	 * @returns { { caller: CallerType; states: State<unknown>[] } } 呼び出し元情報
	 */
	unidirectional(src, dest, trans = x => x) {
		const ctx = src instanceof State ? src.ctx : this;
		let circuit = false;
		return ctx.call(() => {
			// srcの変更で必ず発火させつつ
			// destの変更およびsrc = destな操作で発火および循環させない
			if (!circuit) {
				circuit = true;
				dest.value = trans(src.value);
				circuit = false;
			}
		});
	}

	/**
	 * 双方向データの作成
	 * @template T
	 * @param { State<T> } src 作成元のデータ
	 * @param { State<T> } dest 作成対象のデータ
	 * @returns { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元情報
	 */
	bidirectional(src, dest) {
		return [this.unidirectional(src, dest), this.unidirectional(dest, src)];
	}

	/**
	 * パラメータの設定
	 * @template Val
	 * @param { CtxValueType<Val> } val パラメータの値
	 * @param { (val: Val) => unknown } setter パラメータの設定のルール
	 * @param { CallerType['label'] } label setterに付加するラベル
	 */
	setParam(val, setter, label = undefined) {
		// 状態変数の場合は変更を監視
		if (val instanceof State || val instanceof Computed) {
			const ctx = val instanceof State ? val.ctx : this;
			return ctx.call({ caller: () => setter(val.value), label });
		}
		// 状態変数でない場合はそのまま設定
		else {
			setter(val);
		}
	}

	/**
	 * パラメータを取り出してコールバック関数を呼び出す
	 * @template Val, R
	 * @param { CtxValueType<Val> } val 取り出す対象のパラメータ
	 * @param { (val: Val) => R } callback パラメータを用いるコールバック関数
	 * @returns { R }
	 */
	useParam(val, callback = x => x) {
		return callback(val instanceof State || val instanceof Computed ? val.value : val);
	}

	/**
	 * ノードリストを正規化する
	 * @param { CtxChildType } nodeList 対象のノード
	 * @return { GenStateNode[] }
	 */
	normalizeCtxChild(nodeList) {
		const result = [];
		nodeList.forEach(e => {
			if (e) {
				// 子にテキストの状態が渡された場合は変更を監視する
				if (e instanceof State || e instanceof Computed) {
					result.push(new GenStateTextNode(this, e));
				}
				else if (typeof e === 'string') {
					result.push(new GenStateTextNode(this, e));
				}
				else if (e instanceof Text) {
					result.push(new GenStateTextNode(this, e.data));
				}
				else if (e instanceof HTMLElement) {
					result.push(new GenStateHTMLElement(this, e, []));
				}
				else {
					result.push(e);
				}
			}
		});
		return result;
	};

	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { K } tag HTMLタグ
	 * @param { K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K> } props プロパティ
	 * @param { CtxChildType } children 子要素
	 * @returns { K extends string ? GenStateDomNode<K> : GenStateComponent<K> }
	 */
	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { K } tag HTMLタグ
	 * @param { CtxChildType } props 子要素
	 * @param { [] } children 略
	 * @returns { K extends string ? GenStateDomNode<K> : GenStateComponent<K> }
	 */
	/**
	 * DOMノードの生成
	 * @template { string | ComponentType<K> } K
	 * @param { K } tag HTMLタグ
	 * @param { (K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K>) | CtxChildType } props プロパティ
	 * @param { CtxChildType | undefined } children 子要素
	 * @returns { K extends string ? GenStateDomNode<K> : GenStateComponent<K> }
	 */
	$(tag, props = {}, children = []) {
		const _props = Array.isArray(props) ? {} : props;
		const _children = this.normalizeCtxChild(Array.isArray(props) ? props : children);
		// HTMLタグによるDOMノードの生成(Web Componentsも含む)
		if (typeof tag === 'string') {
			return new GenStateDomNode(this, tag, _props, _children);
		}
		// コンポーネントによるDOMノード生成
		else {
			return new GenStateComponent(this, tag, _props, _children);
		}
	}

	/**
	 * テキスト要素の構成
	 * @param { TemplateStringsArray } strs タグ付きテンプレートの文字列部
	 * @param  { ...(CtxValueType<string | number> | () => (string | number)) } values タグ付きテンプレートの変数
	 * @return { string | Computed<string> }
	 */
	t(strs, ...values) {
		// テンプレートに状態が含まれるかの判定
		let useStateFlag = false;
		for (const value of values) {
			if (value instanceof State || value instanceof Computed || value instanceof Function) {
				useStateFlag = true;
				break;
			}
		}
		// 結果の文字列を計算する関数
		const f = () => {
			let result = '';
			values.forEach((value, idx) => {
				result += strs[idx];
				if (value instanceof State || value instanceof Computed) {
					result += `${value.value}`;
				}
				else if (value instanceof Function) {
					result += `${value()}`;
				}
				else {
					result += `${value}`;
				}
			});
			return result + strs[strs.length - 1];
		};
		return useStateFlag ? computed(f) : f();
	}

	/**
	 * HTMLElementを示すStateNodeの生成
	 * @param { HTMLElement } element StateNodeの生成対象
	 */
	html(element) {
		return new GenStateHTMLElement(this, element);
	}

	/**
	 * ノードを選択するノードの生成
	 * @template T
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { CallbackStateChooseNode<T> } callback valからDOMノードを選択する関数
	 * @returns { StateChooseNode<T> }
	 */
	choose(props, val, callback) {
		return new GenStateChooseNode(this, props, val, callback);
	}
}

/**
 * 算出プロパティの宣言
 * @template T
 * @param { () => T } f 算出プロパティを計算する関数
 * @returns { Computed<T> }
 */
function computed(f) {
	return new Computed(f);
}

/**
 * @template T
 * @overload
 * @param { State<T> } state 監視を行う状態変数
 * @param { (prev: T, next: T) => unknown } f ウォッチャー
 * @param { Context | undefined } ctx ウォッチャーの呼び出しを行うコンテキスト
 * @returns { () => void } ウォッチャーを削除する関数
 */
/**
 * @template T
 * @overload
 * @param { State<unknown>[] } state 監視を行う状態変数のリスト
 * @param { Function } f ウォッチャー
 * @param { Context | undefined } ctx ウォッチャーの呼び出しを行うコンテキスト
 * @returns { () => void } ウォッチャーを削除する関数
 */
/**
 * ウォッチャーの宣言
 * @template T
 * @param { State<unknown>[] | State<T> } state 監視を行う状態変数
 * @param { Function } f ウォッチャー
 * @param { Context | undefined } ctx ウォッチャーの呼び出しを行うコンテキスト
 * @returns { () => void } ウォッチャーを削除する関数
 */
function watch(state, f, ctx = undefined) {
	const ctx2 = ctx || new Context();
	const trigger = new State(-1, ctx2);
	const caller = () => { trigger.value = trigger.value % 2 + 1; };

	if (state instanceof State) {
		let prevState =  state.value;
		let nextState = state.value;
		const ctxCaller = state.ctx.call(() => {
			prevState = nextState;
			nextState = state.value;
			caller();
		});

		const ctx2Caller = ctx2.call(() => {
			// 初回には実行されないようにする
			if (trigger.value !== 0) {
				f(prevState, nextState);
			}
		});

		// ウォッチャーを削除する関数を返す
		return () => {
			ctxCaller.states.forEach(s => s.delete(ctxCaller.caller));
			ctx2Caller.states.forEach(s => s.delete(ctx2Caller.caller));
		};
	}
	else {
		const ctxCallers = state.map(s => s.ctx.call(() => { s.value; caller(); }));

		const ctx2Caller = ctx2.call(() => {
			// 初回には実行されないようにする
			if (trigger.value !== 0) {
				f();
			}
		});

		// ウォッチャーを削除する関数を返す
		return () => {
			ctxCallers.forEach(ctxCaller => ctxCaller.states.forEach(s => s.delete(ctxCaller.caller)));
			ctx2Caller.states.forEach(s => s.delete(ctx2Caller.caller));
		};
	}
}

export { State, Context, computed, watch };
