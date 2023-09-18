
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
	/** @type { ((val: State<T>) => unknown) | undefined } 参照の追加時に発火されるイベントハンドラ */
	onreference = undefined;

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
 * @template { (ctx: Context, props: CompPropTypes<K>, children: CompChildType) => StateNode | { node: StateNode; exposeStates?: Record<string, unknown> } } K
 * @typedef { (ctx: Context, props: CompPropTypes<K>, children: CompChildType) => StateNode | { node: StateNode; exposeStates?: Record<string, unknown> } } ComponentType コンポーネントの型
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
	 * このノードを代表するノードの取得
	 * @returns { StateNode | undefined }
	 */
	get node() { return this; }

	/**
	 * このノードを構成する最小単位のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get atomicNode() { return this; }

	/**
	 * 子要素となるノードの取得
	 * @returns { StateNode[] }
	 */
	get children() { return []; }

	/**
	 * ノードの削除
	 */
	remove() {
		this.callerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
	}

	/**
	 * 子要素を構築する(孫要素以降は構築しない)
	 * @returns { StateNode[] }
	 */
	buildChild() { throw new Error('not implemented.'); }

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 */
	buildCurrent(target) { throw new Error('not implemented.'); }

	/**
	 * 子孫要素を構築する
	 */
	build() {
		this.#moutnImpl()();
		return this;
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 */
	#moutnImpl(target) {
		return this.#ctx.lazy(() => {
			/** @type { [StateNode, HTMLElement | Text | undefined][] } コンポーネントについての幅優先探索に関するキュー */
			const queueComponent = [[this, target]];

			// コンポーネントの評価(ルートノードによってはコンポーネントではない場合もある)
			if (this.atomicNode !== this) {
				this.buildCurrent();
			}
			this.atomicNode.buildCurrent(target);

			// コンポーネント生成に関するループ
			while (queueComponent.length > 0) {
				/** @type { [StateNode, HTMLElement | Text | undefined] } */
				const [component, localRoot] = queueComponent.shift();
				/** @type { [StateNode, HTMLElement | Text | undefined][] } ノードについての幅優先探索に関するキュー */
				const queueNode = [[component.atomicNode, localRoot]];
				/** @type { StateNode[] } コンポーネント内のスコープにあるコンポーネントについての幅優先探索に関するキュー */
				const queueLocalComponent = [];
				//  コンポーネント内のノード生成に関するループ
				while (queueNode.length > 0) {
					/** @type { [StateNode, HTMLElement | Text | undefined] } */
					const [node, element] = queueNode.shift();
					// 子要素の評価と取り出し
					const childNodes = element?.childNodes ?? [];
					const children = node.buildChild();
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
					for (const child of children) {
						// 原子的なノードでなければノードを構築する
						if (child.atomicNode !== child && !(child instanceof StateComponent)) {
							child.buildCurrent();
						}
						const childNode = cnt < childNodes.length ? childNodes[cnt++] : undefined;
						// ノードの比較を実施
						if (child.node instanceof StateComponent) {
							if (useChildNodes && !childNode) {
								throw new Error('The number of nodes is insufficient.');
							}
							queueLocalComponent.push([child.node, childNode]);
						}
						else {
							const atomicNode = child.atomicNode;
							if (atomicNode instanceof StateTextNode) {
								atomicNode.buildCurrent();
								// テキストノードであれば挿入して補完する
								if (useChildNodes) {
									element.insertBefore(atomicNode.element, childNode);
									++cnt;
								}
							}
							else {
								if (useChildNodes && !childNode) {
									throw new Error('The number of nodes is insufficient.');
								}
								atomicNode.buildCurrent(childNode);
								queueNode.push([child.atomicNode, childNode]);
							}
						}
					}
					// 子要素が多すぎたかの評価
					if (useChildNodes && cnt < childNodes.length) {
						throw new Error('The number of nodes is excessive.');
					}
				}
				queueComponent.push(...queueLocalComponent);
				// コンポーネント内のコンポーネントの代表するDOMノードの生成
				queueLocalComponent.forEach(([c, e]) => {
					c.buildCurrent();
					c.atomicNode.buildCurrent(e);
				});

				// DOMノードの親子関係の決定
				queueNode.push([component, localRoot]);
				while (queueNode.length > 0) {
					/** @type { [StateNode, HTMLElement | Text | undefined] } */
					const [node, element] = queueNode.shift();
					let childNode = element?.firstChild;
					for (const child of node.children) {
						// elementに子要素が存在しない場合にのみ子を追加する
						if (!childNode) {
							node.element.appendChild(child.element);
						}
						if (!(child.node instanceof StateComponent)) {
							queueNode.push([child, childNode]);
						}
						childNode = childNode?.nextSibling;
					}
				}
			}
		});
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement } target マウント対象のDOMノード
	 */
	mount(target) {
		this.#moutnImpl(target)();
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

	/**
	 * 子要素を構築する(孫要素以降は構築しない)
	 * @returns { [] }
	 */
	buildChild() { return []; }

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 */
	buildCurrent(target) {}
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

	/**
	 * 子要素を構築する(孫要素以降は構築しない)
	 * @returns { [] }
	 */
	buildChild() { return []; }

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
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

			// 属性を移動
			for (const attribute of target.attributes) {
				if (!this.#element.hasAttribute(attribute.name)) {
					this.#element.setAttribute(attribute.name, attribute.value);
				}
			}
			// 親ノードが存在すれば置換
			if (target.parentNode) {
				target.parentNode.replaceChild(this.#element, target);
			}
		}
	}
}

/**
 * 状態を持ったDOMノード
 * @template { string } K
 */
class StateDomNode extends StateNode {
	/** @type { K } HTMLタグ */
	#tag;
	/** @type { CtxDomPropTypes<CreatedElementType<K>> } プロパティ */
	#props;
	/** @type { CtxChildType } 子要素を生成する関数 */
	#genChildren;
	/** @type { CreatedElementType<K> | undefined } DOMノード */
	#element = undefined;
	/** @type { (HTMLElement | StateNode)[] } 子要素 */
	#children = [];
	/** @type { ObservableStates<K> | undefined } 観測する対象 */
	#observableStates = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx ノードを扱っているコンテキスト
	 * @param { K } tag HTMLタグ
	 * @param { CtxDomPropTypes<CreatedElementType<K>> } props プロパティ
	 * @param { CtxChildType } genChildren 子要素を生成する関数
	 */
	constructor(ctx, tag, props, genChildren) {
		super(ctx, []);
		this.#tag = tag;
		this.#props = props;
		this.#genChildren = genChildren;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * 子要素となるノードの取得
	 * @returns { StateNode[] }
	 */
	get children() { return this.#children; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element?.remove();
	}

	/**
	 * 子要素となるノードの取得
	 * @returns { StateNode[] }
	 */
	buildChild() {
		// 現在存在する子要素の破棄
		this.#children.forEach(child => child.remove());

		// 子要素の生成
		this.#children = this.ctx.normalizeCtxChild(this.#genChildren());
		return [...this.#children];
	}

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 */
	buildCurrent(target) {
		// ノードのチェック
		if (target) {
			if (target instanceof Text) {
				throw new Error('\'target\' must be an HTMLElement.');
			}
			else if (target.tagName.toLowerCase() !== this.#tag.toLowerCase()) {
				throw new Error(`'${target.tagName}' and '${this.#tag}' cannot build a node because they have different tag names.`)
			}
		}

		// 現在存在するノードの削除
		this.remove();

		// DOMノードの生成
		this.#element = target ?? document.createElement(this.#tag);

		// プロパティの設定
		for (const key in this.#props) {
			const val = this.#props[key];
			if (val !== undefined && val !== null && val !== false) {
				const caller = this.ctx.setParam(val, val => {
					// styleはオブジェクト型による設定を許容するため処理を特殊化
					if (key === 'style') {
						if (val !== undefined && val !== null && val !== false) {
							for (const styleKey in val) {
								const caller = this.ctx.setParam(
									val[styleKey],
									val => this.#element.style[styleKey] = val ?? '',
									Context.DOM_UPDATE
								);
								if (caller && caller.states.length > 0) this.callerList.push(caller);
							}
						}
						else {
							this.#element.removeAttribute('style');
						}
					}
					// その他プロパティはそのまま設定する
					else {
						this.#element[key] = val ?? '';
					}
				}, Context.DOM_UPDATE);
				if (caller && caller.states.length > 0) this.callerList.push(caller);
			}
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates);
			this.#observableStates = undefined;
		}
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		this.#observableStates = props;
		return this;
	}

	/**
	 * ノードの内部の状態の観測の実装部
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	#observeImpl(props) {
		// Web Componentは対象外
		if (customElements.get(this.#element.tagName.toLowerCase())) {
			throw new Error('Observation of Web Component in StateDomNode is not supported.');
		}

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
					const c = callback(name);
					if ((!state.onreference && state.count > 0) || (state.onreference && state.onreference(state))) {
						c(state);
					}
					else {
						state.onreference = c;
					}
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
			 * inputイベントの構築
			 * @param { string } key
			 * @returns { (state: State<unknown>) => void }
			 */
			const callbackEventListener = key => state => {
				state.onreference = undefined;
				
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
				state.value = this.#element[key];
				return true;
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
				this.#element.addEventListener(type, e => setter(e.target));
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
							setter(this.#element);
						}
					})();
				});
				resizeObserver.observe(this.#element);
			}, props, ['clientHeigth', 'clientWidth']);
			let callbackResizeObserverFlag = true;
		}

		//
		// ObservableHTMLInputElementStateに関する項目の検証
		//
		if (this.#element instanceof HTMLInputElement) {
			setReferenceToEventListenerObserver('input', props, ['value', 'valueAsDate', 'valueAsNumber']);
			setReferenceToEventListenerObserver('change', props, ['checked']);
		}

		//
		// ObservableHTMLSelectElementに関する項目の検証
		//
		if (this.#element instanceof HTMLSelectElement) {
			setReferenceToEventListenerObserver('change', props, ['value', 'selectedOptions']);
		}

		//
		// ObservableHTMLTextAreaElementに関する項目の検証
		//
		if (this.#element instanceof HTMLTextAreaElement) {
			setReferenceToEventListenerObserver('input', props, ['value']);
		}
	}
}

/**
 * コンポーネント
 * @template { ComponentType<K> } K
 */
class StateComponent extends StateNode {
	/** @type { K } コンポーネントを示す関数 */
	#component;
	/** @type { CtxCompPropTypes<K> } プロパティ */
	#props;
	/** @type { CtxChildType } 子要素を生成する関数 */
	#genChildren;
	/** @type { StateNode | undefined } コンポーネントを代表するノード */
	#element;
	/** @type { ComponentExposeStates<K> } コンポーネントが公開している状態 */
	#exposeStates;
	/** @type { ObservableStates<K> | undefined } 観測する対象 */
	#observableStates = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { K } component コンポーネントを示す関数
	 * @param { CtxCompPropTypes<K> } props プロパティ
	 * @param { CtxChildType } genChildren 子要素を生成する関数
	 */
	constructor(ctx, component, props, genChildren) {
		super(ctx, []);
		this.#component = component;
		this.#props = props;
		this.#genChildren = genChildren;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.#element?.element; }

	/**
	 * このノードを構成する最小単位のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get atomicNode() { return this.#element?.atomicNode; }

	/**
	 * 子要素となるノードの取得
	 * @returns { StateNode[] }
	 */
	get children() { return this.#element?.children ?? []; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element?.remove();
	}

	/**
	 * 子要素を構築する(孫要素以降は構築しない)
	 * @returns { StateNode[] }
	 */
	buildChild() {
		return this.#element?.buildChild?.() ?? [];
	}

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 */
	buildCurrent(target) {
		// 現在存在するノードの削除
		this.remove();

		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		for (const key in this.#component.propTypes ?? {}) {
			const val = this.#props[key];
			// 渡されたプロパティが状態変数なら単方向データに変換して渡すようにする
			if (val instanceof State || val instanceof Computed) {
				const s = new State(val.value, val instanceof State ? val.ctx : this.ctx);
				const caller = this.ctx.unidirectional(val, s);
				if (caller && caller.states.length > 0) this.callerList.push(caller);
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
		/** @type { CompChildType } コンポーネントに渡す子要素 */
		const compChild = () => {
			return this.ctx.normalizeCtxChild(this.#genChildren());
		};

		// ノードの生成
		const element = this.#component(this.ctx, compProps, compChild);
		if (element instanceof StateNode) {
			this.#element = element;
		}
		else {
			this.#element = element.node;
			this.#exposeStates = element.exposeStates ?? {};
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates);
			this.#observableStates = undefined;
		}

		// コンポーネントのルートノードの評価
		if (this.#element.atomicNode !== this.#element && !(this.#element instanceof StateComponent)) {
			this.#element.buildCurrent();
		}
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		this.#observableStates = props;
		return this;
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	#observeImpl(props) {
		for (const key in props) {
			const state = props[key];
			const exposeState = this.#exposeStates[key];
			// 状態変数の場合は単方向の関連付けを実施
			if (exposeState instanceof State || exposeState instanceof Computed) {
				this.ctx.unuseReferenceCheck(() => {
					const callerList = this.ctx.unidirectional(exposeState, state);
					// state.onreferenceなしでstateが1つ以上の参照をもつ(親への状態の伝播なしで状態の参照が存在する場合)
					// もしくはstate.onreferenceなしでstateが2つ以上の参照をもつ(親への状態の伝播ありで状態の参照が存在する場合)
					// もしくはonreference()の戻り値がtrue(親への状態の伝播ありで祖先で状態の参照が存在する場合)
					// の場合に状態変数は利用されている
					const flag = (!state.onreference && state.count > 0) || (state.onreference && state.onreference(state));
					callerList.states.forEach(s => {
						s.onreference = s2 => {
							s2.onreference = undefined;
							return flag;
						};
					});
					// このタイミングで値が利用されていない際はchoose()などで後から利用される可能性があるため
					// 後から通知を行うことができるようにする
					if (!flag) {
						// 関連付けられた状態変数のonreferenceを連鎖的に呼び出す
						state.onreference = s => {
							s.onreference = undefined;
							callerList.states.forEach(state => state.onreference?.(state));
							return false;
						};
					}
				});
			}
			// 状態変数でない場合はそのまま設定
			else {
				state.value = exposeState;
			}
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
	/** @type { T } 表示対象を切り替える基準となる変数 */
	#val;
	/** @type { CallbackStateChooseNode<T> } valからDOMノードを選択する関数 */
	#callback;
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
	 */
	constructor(ctx, props, val, callback) {
		super(ctx, []);
		this.#props = props;
		this.#val = val;
		this.#callback = callback;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.#currentNode?.element; }

	/**
	 * このノードを代表するノードの取得
	 * @returns { StateNode | undefined }
	 */
	get node() { return this.#currentNode?.node; }

	/**
	 * このノードを構成する最小単位のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get atomicNode() { return this.#currentNode?.atomicNode; }
	
	/**
	 * 子要素となるノードの取得
	 * @returns { StateNode[] }
	 */
	get children() { return this.#currentNode?.children ?? []; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#currentNode?.remove();
		this.#caller?.states?.forEach(state => state.delete(this.#caller.caller));
	}

	/**
	 * 子要素を構築する(孫要素以降は構築しない)
	 * @returns { StateNode[] }
	 */
	buildChild() {
		return this.#currentNode?.buildChild?.() ?? [];
	}

	/**
	 * 自要素を構築する(子要素は構築しない)
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 */
	buildCurrent(target) {
		// 現在存在するノードの削除
		this.remove();

		this.#caller = this.ctx.setParam(this.#val, val => {
			const element = this.element;
			const parent = element?.parentElement;
			const nextSibling = element?.nextElementSibling;
			this.#currentNode?.remove();
			const nodeList = this.ctx.normalizeCtxChild([this.#callback(val)]);
			// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
			this.#currentNode = nodeList.length > 0 ? nodeList[0] : new StateTextNode(this.ctx, document.createTextNode(''), []);
			// 子要素が構築されたことある場合は構築する
			if (parent) {
				this.#currentNode.build();
				parent.insertBefore(this.element, nextSibling);
			}
			else if (this.#currentNode.atomicNode !== this.#currentNode && !(this.#currentNode instanceof StateComponent)) {
				this.#currentNode.buildCurrent();
			}
		});
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
 * @typedef { () => (StateNode | HTMLElement | Text | CtxValueType<string> | false | null | undefined)[] } CtxChildType コンテキスト上での子要素の型
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
 * @typedef { () => StateNode[] } CompChildType コンポーネント上での子要素の型
 */

/**
 * コンテキスト
 */
class Context {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { boolean[] } 参照のチェックを行う(Stateのonreferenceを呼び出す)かのフラグ */	
	#checkReference = [true];
	/** @type { Map<ComponentType<K>, string> } コンポーネントから定義されたWeb Component */
	#componentMap = new Map();

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
	useParam(val, callback) {
		return callback(val instanceof State || val instanceof Computed ? val.value : val);
	}

	/**
	 * ノードリストを正規化する
	 * @param { ReturnType<CtxChildType> } nodeList 対象のノード
	 * @return { StateNode[] }
	 */
	normalizeCtxChild(nodeList) {
		const result = [];
		nodeList.forEach(e => {
			const node = this.useParam(e, val => typeof val === 'string' ? document.createTextNode(val) : val);
			if (node) {
				// 子にテキストの状態が渡された場合は変更を監視する
				if (e instanceof State || e instanceof Computed) {
					result.push(new StateTextNode(this, node, [this.call(() => node.data = e.value)]));
				}
				else if (node instanceof Text) {
					result.push(new StateTextNode(this, node, []));
				}
				else if (node instanceof HTMLElement) {
					result.push(new StateHTMLElement(this, node, []));
				}
				else {
					result.push(node);
				}
			}
		});
		return result;
	};

	/**
	 * DOMノードの生成
	 * @template { string | ComponentType<K> } K
	 * @param { K } tag HTMLタグ
	 * @param { K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K> } props プロパティ
	 * @param { CtxChildType } children 子要素
	 * @returns { K extends string ? StateDomNode<K> : StateComponent<K> }
	 */
	$(tag, props = {}, children = () => []) {
		// HTMLタグによるDOMノードの生成(Web Componentsも含む)
		if (typeof tag === 'string') {
			return new StateDomNode(this, tag, props, children);
		}
		// コンポーネントによるDOMノード生成
		else {
			return new StateComponent(this, tag, props, children);
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
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	html(element, callerList = []) {
		return new StateHTMLElement(this, element, callerList);
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
		return new StateChooseNode(this, props, val, callback);
	}

	/**
	 * コンポーネントをWeb Componentとして定義する
	 * @template { ComponentType<K> } K
	 * @param { string } name タグ名
	 * @param { K } component 登録するコンポーネント
	 * @param { boolean } shadow シャドウツリーを構成するか
	 * @param { ElementDefinitionOptions | undefined } options Web Componentの定義の際のオプション
	 */
	defineWebComponent(name, component, shadow = true, options = undefined) {
		// 定義済みの場合は異常
		if (customElements.get(name.toLowerCase())) {
			throw new Error(`Already defined a Web Component called '${name}'.`);
		}

		const thisCtx = this;
		const compConstructor = options?.extends !== undefined
			? document.createElement(options.extends).constructor : HTMLElement;
		/**
		 * Web Componentを示すクラス
		 * @extends HTMLElement
		 */
		class WebComponent extends compConstructor {
			/** @type { ComponentExposeStates<K> } コンポーネントが公開している状態 */
			#exposeState;
			/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
			#compProps = {};
			/** @type { { caller: Function; states: State<unknown>[] }[] } compPropsについての関連付けの呼び出し元のリスト */
			#callerListCompProps = [];
			/** @type { State<CtxChildType> } コンポーネントに渡す子要素 */
			#children;
			/** @type { { caller: Function; states: State<unknown>[] } | undefined } childrenについての関連付けの呼び出し元 */
			#callerChildren = undefined;

			constructor() {
				super();

				// デフォルト構築時のプロパティの設定
				for (const key in component.propTypes ?? {}) {
					// 値が与えられなくてもセットする
					this.#compProps[key] = new State(component.propTypes[key], thisCtx);
				}

				// デフォルト構築時の子要素の設定
				this.#children = new State(() => new State([], thisCtx), thisCtx);
				const compChild = () => {
					const stateNodeList = new State([], thisCtx);
					// this.#children変更時に再設定されるようにする
					thisCtx.call(() => {
						const nodeList = this.#children.value();
						if (nodeList instanceof State || nodeList instanceof Computed) {
							// 単方向の関連付けの実施
							this.#callerChildren = thisCtx.unidirectional(this.#children.value(), stateNodeList, v => thisCtx.normalizeCtxChild(v));
						}
						else {
							stateNodeList.value = thisCtx.normalizeCtxChild(nodeList);
						}
					});
					return stateNodeList;
				};

				// デフォルト構築でのコンポーネントの生成
				const element = component(thisCtx, this.#compProps, compChild);
				let rootNode = undefined;
				if (element instanceof StateNode) {
					this.#exposeState = {};
					rootNode = element.build().element;
				}
				else {
					this.#exposeState = element.exposeStates ?? {};
					rootNode = element.node.build().element;
				}

				if (shadow) {
					const shadowRoot = this.attachShadow({ mode: 'open' });
					shadowRoot.appendChild(rootNode);
					// styleが与えられて入れば追加する
					if (component?.webComponent?.style) {
						const styleNode = document.createElement('style');
						styleNode.innerText = component.webComponent.style;
						shadowRoot.appendChild(styleNode);
					}
				}
				else {
					this.appendChild(rootNode);
				}
			}

			/**
			 * ノードの削除
			 */
			remove() {
				// 関連付けの破棄
				this.#callerListCompProps.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
				this.#callerListCompProps = [];
				if (this.#callerChildren) {
					this.#callerChildren.states.forEach(s => s.delete(this.#callerChildren.caller));
					this.#callerChildren = undefined;
				}
				super.remove();
			}

			/**
			 * プロパティの設定
			 * @param { CompPropTypes<K> } props 
			 */
			#setProps(props) {
				// 単方向の関連付けの破棄
				this.#callerListCompProps.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
				this.#callerListCompProps = [];
				// 単方向の関連付けの実施
				for (const key in component.propTypes ?? {}) {
					const val = props[key];
					if (val instanceof State || val instanceof Computed) {
						const caller = thisCtx.unidirectional(val, this.#compProps[key]);
						if (caller && caller.states.length > 0) this.#callerListCompProps.push(caller);
					}
					else if (val) {
						this.#compProps[key].value = val;
					}
				}
			}

			/**
			 * 子の設定
			 * @param { CtxChildType } children 
			 */
			#setChildren(children) {
				// 単方向の関連付けの破棄
				if (this.#callerChildren) {
					this.#callerChildren.states.forEach(s => s.delete(this.#callerChildren.caller));
					this.#callerChildren = undefined;
				}
				this.#children.value = children;
			}

			/**
			 * StateComponentの生成
			 * @param { CompPropTypes<K> } props 
			 * @param { CtxChildType } children 
			 */
			createStateComponent(props, children) {
				this.#setProps(props);
				this.#setChildren(children);
				return new StateComponent(thisCtx, this, this.#exposeState, []);
			}
		}

		// Web Componentの定義
		customElements.define(name, WebComponent, options);
		this.#componentMap.set(component, name);
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
 * @param { State<unknown>[] | State<T> } state 監視を行う状態変数のリスト
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
