
/**
 * 状態変数
 * @template T
 */
class State {
	/** @type { T } 状態変数の本体 */
	#value;
	/** @type { Set<Function> } 呼び出し元のハンドラのリスト */
	#callerList;
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
		this.#callerList = new Set();
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
			this.update();
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
	 * 全ての呼び出し元を呼びだす
	 */
	update() { this.#callerList.forEach(val => val()); }

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { Function } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#callerList.delete(caller); }
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
	/** @type { { caller: Function; states: State<unknown>[] }[] } 呼び出し元のリスト */
	callerList;

	/**
	 * コンストラクタ
	 * @param { { caller: Function; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(callerList) {
		this.callerList = callerList;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text }
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
 * 状態を持ったTextノード
 */
class StateTextNode extends StateNode {
	/** @type { Text } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { HTMLElement | Text } element DOMノード
	 * @param { { caller: Function; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
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
 * 状態を持ったDOMノード
 * @template { string } K
 */
class StateDomNode extends StateNode {
	/** @type { CreatedElementType<K> } DOMノード */
	#element;
	/** @type { (HTMLElement | Text | StateNode)[] } 子要素 */
	#children = [];
	/** @type { { caller: Function; states: State<unknown>[] }[] } 子要素に対する呼び出し元のリスト */
	#childrenCallerList;

	/**
	 * コンストラクタ
	 * @param { CreatedElementType<K> } element DOMノード
	 * @param { { caller: Function; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
		this.#element = element;
		this.#childrenCallerList = [];
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
		this.#childrenCallerList.forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));
		this.#element.remove();
	}

	/**
	 * 子要素を引数のノードで置き換える
	 * @param  { (HTMLElement | Text | StateNode)[] } nodes 
	 */
	replace(nodes) {
		/** 削除対象の差分 */
		const removeList = this.#children.filter(e => !nodes.includes(e));
		/** @type { { caller: Function; states: State<unknown>[] }[] } 管理を移譲する呼び出し元のリスト */
		const callerList = [];

		// 追加の実施
		for (const node of nodes) {
			if (node instanceof StateNode) {
				this.#element.appendChild(node.element);
				// StateDomNodeとStateTextNodeは破棄してもいいように呼び出し元を移譲する
				if (node instanceof StateDomNode) {
					callerList.push(...node.callerList, ...node.#childrenCallerList);
				}
				else if (node instanceof StateTextNode) {
					callerList.push(...node.callerList);
				}
			}
			else {
				this.#element.appendChild(node);
			}
		}

		// 差分の削除
		removeList.forEach(e => e.remove());
		this.#childrenCallerList.filter(e => !callerList.includes(e)).forEach(caller => caller.states.forEach(s => s.delete(caller.caller)));

		// 子要素のセット
		this.#children = nodes;
		this.#childrenCallerList = callerList;
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// Web Componentは対象外
		if (customElements.get(this.#element.tagName.toLowerCase())) {
			throw new Error('Observation of Web Component in StateDomNode is not supported.');
		}

		//
		// ObservableHTMLElementStateに関する項目の検証
		//
		{
			let callbackResizeObserverFlag = true;
			/**
			 * ResizeObserverの構築
			 * @param { State<number> } state 
			 */
			const callbackResizeObserver= state => {
				state.onreference = undefined;
				
				// 初回呼び出し時にのみイベントを設置する
				if (callbackResizeObserverFlag) {
					callbackResizeObserverFlag = !callbackResizeObserverFlag;
					const resizeObserver = new ResizeObserver(entries => {
						for (const entry of entries) {
							// clientHeigthの監視
							if (props?.clientHeigth !== undefined && props.clientHeigth.org !== this.#element.clientHeight) {
								props.clientHeight.value = this.#element.clientHeight;
							}
							// clientWidthの監視
							if (props?.clientWidth !== undefined && props.clientWidth.org !== this.#element.clientWidth) {
								props.clientWidth.value = this.#element.clientWidth;
							}
						}
					});
					resizeObserver.observe(this.#element);
				}
			};
			if (props?.clientHeigth !== undefined) {
				props.clientHeigth.onreference = callbackResizeObserver;
				props.clientHeight.org = this.#element.clientHeight;
			}
			if (props?.clientWidth !== undefined) {
				props.clientWidth.onreference = callbackResizeObserver;
				props.clientWidth.org = this.#element.clientWidth;
			}
		}

		//
		// ObservableHTMLInputElementStateに関する項目の検証
		//
		if (this.#element instanceof HTMLInputElement) {
			let callbackInputEventListenerFlag = true;
			/**
			 * ResizeObserverの構築
			 * @param { State<number> } state 
			 */
			const callbackInputEventListener= state => {
				state.onreference = undefined;
				
				// 初回呼び出し時にのみイベントを設置する
				if (callbackInputEventListenerFlag) {
					callbackInputEventListenerFlag = !callbackInputEventListenerFlag;

					this.#element.addEventListener('input', e => {
						// valueの監視
						if (props?.value !== undefined && props.value.org !== e.target.value) {
							props.value.value = e.target.value;
						}
						// valueAsDateの監視
						if (props?.valueAsDate !== undefined && props.valueAsDate.org !== e.target.valueAsDate) {
							props.valueAsDate.value = e.target.valueAsDate;
						}
						// valueAsNumberの監視
						if (props?.valueAsNumber !== undefined && props.valueAsNumber.org !== e.target.valueAsNumber) {
							props.valueAsNumber.value = e.target.valueAsNumber;
						}
					});
				}
			};
			if (props?.value !== undefined) {
				props.value.onreference = callbackInputEventListener;
				props.value.org = this.#element.value;
			}
			if (props?.valueAsDate !== undefined) {
				props.valueAsDate.onreference = callbackInputEventListener;
				props.valueAsDate.org = this.#element.valueAsDate;
			}
			if (props?.valueAsNumber !== undefined) {
				props.valueAsNumber.onreference = callbackInputEventListener;
				props.valueAsNumber.org = this.#element.valueAsNumber;
			}
			if (props?.checked !== undefined) {
				props.checked.onreference = state => {
					state.onreference = undefined;
					this.#element.addEventListener('change', e => {
						// checkedの監視
						if (props.checked.org !== e.target.checked) {
							props.checked.value = e.target.checked;
						}
					});
				};
				props.checked.org = this.#element.checked;
			}
		}

		//
		// ObservableHTMLSelectElementに関する項目の検証
		//
		if (this.#element instanceof HTMLSelectElement) {
			let callbackChangeEventListenerFlag = true;
			/**
			 * ResizeObserverの構築
			 * @param { State<number> } state 
			 */
			const callbackChangeEventListener= state => {
				state.onreference = undefined;
				
				// 初回呼び出し時にのみイベントを設置する
				if (callbackChangeEventListenerFlag) {
					callbackChangeEventListenerFlag = !callbackChangeEventListenerFlag;

					this.#element.addEventListener('change', e => {
						// valueの監視
						if (props?.value !== undefined && props.value.org !== e.target.value) {
							props.value.value = e.target.value;
						}
						// selectedOptionsの監視
						if (props?.selectedOptions !== undefined && props.selectedOptions.org !== e.target.selectedOptions) {
							props.selectedOptions.value = e.target.selectedOptions;
						}
					});
				}
			};
			if (props?.value !== undefined) {
				props.value.onreference = callbackChangeEventListener;
				props.value.org = this.#element.value;
			}
			if (props?.selectedOptions !== undefined) {
				props.selectedOptions.onreference = callbackChangeEventListener;
				props.selectedOptions.org = this.#element.selectedOptions;
			}
		}

		//
		// ObservableHTMLTextAreaElementに関する項目の検証
		//
		if (this.#element instanceof HTMLTextAreaElement) {
			if (props?.value !== undefined) {
				props.value.onreference = state => {
					state.onreference = undefined;
					this.#element.addEventListener('input', e => {
						// valueの監視
						if (props?.value !== undefined && props.value.org !== e.target.value) {
							props.value.value = e.target.value;
						}
					});
				};
				props.value.org = this.#element.value;
			}
		}

		return this;
	}
}

/**
 * コンポーネント
 * @template { ComponentType<K> } K
 */
class StateComponent extends StateNode {
	/** @type { Context } コンポーネントを扱っているコンテキスト */
	#ctx;
	/** @type { HTMLElement | Text | StateNode } コンポーネントを代表するノード */
	#element;
	/** @type { ComponentExposeStates<K> } コンポーネントが公開している状態 */
	#exposeStates;

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { HTMLElement | StateNode } element コンポーネントを代表するノード
	 * @param { ComponentExposeStates<K> } exposeStates コンポーネントが公開している状態
	 * @param { { caller: Function; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, element, exposeStates, callerList) {
		super(callerList);
		this.#ctx = ctx;
		this.#element = element;
		this.#exposeStates = exposeStates;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text }
	 */
	get element() { return this.#element instanceof StateNode ? this.#element.element : this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element.remove();
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		for (const key in props) {
			const state = props[key];
			const exposeState = this.#exposeStates[key];
			// 状態変数の場合は単方向の関連付けを実施
			if (exposeState instanceof State || exposeState instanceof Computed) {
				const callerList = this.#ctx.unidirectional(exposeState, state);
				// 関連付けられた状態変数のonreferenceを連鎖的に呼び出す
				state.onreference = s => {
					s.onreference = undefined;
					callerList.states.forEach(state => state?.onreference(state));
				};
			}
			// 状態変数でない場合はそのまま設定
			else {
				state.value = exposeState;
			}
		}
		return this;
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
	/** @type { { caller: Function; states: State<unknown>[] } | undefined } 表示の切り替えに関する呼び出し元 */
	#caller;
	/** @type { StateNode | HTMLElement | Text } 現在表示しているノード */
	#currentNode = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { CallbackStateChooseNode<T> } callback valからDOMノードを選択する関数
	 */
	constructor(ctx, props, val, callback) {
		super([]);
		this.#caller = ctx.setParam(val, val => {
			const parent = this.element?.parentElement;
			const nextSibling = this.element?.nextElementSibling;
			this.#currentNode?.remove();
			const nodeList = ctx.normalizeCtxChild([callback(val)]);
			// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
			this.#currentNode = nodeList.length > 0 ? nodeList[0] : document.createTextNode('');
			// 親が存在するならノードを挿入する
			if (parent) {
				parent.insertBefore(this.element, nextSibling);
			}
		});
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text }
	 */
	get element() { return this.#currentNode instanceof StateNode ? this.#currentNode.element : this.#currentNode; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#currentNode?.remove();
		this.#caller?.states.forEach(state => state.delete(this.#caller.caller));
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
 * @typedef { () => CtxValueType<(StateNode | HTMLElement | Text | CtxValueType<string> | false | null | undefined)[]> } CtxChildType コンテキスト上での子要素の型
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
 * @typedef { () => State<(StateNode | HTMLElement | Text)[]> } CompChildType コンポーネント上での子要素の型
 */

/**
 * コンテキスト
 */
class Context {
	/** @type { { caller: Function; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { boolean[] } 参照のチェックを行う(Stateのonreferenceを呼び出す)かのフラグ */	
	#checkReference = [true];
	/** @type { Map<ComponentType<K>, string> } コンポーネントから定義されたWeb Component */
	#componentMap = new Map();

	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1].caller; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は禁止)
	 * @param { Function } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: Function; states: State<unknown>[] } }
	 */
	call(caller) {
		this.#stack.push({ caller, states: [] });
		caller();
		return this.#stack.pop();
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
	 * @returns { { caller: Function; states: State<unknown>[] } } 呼び出し元情報
	 */
	unidirectional(src, dest, trans = x => x) {
		const ctx = src instanceof State ? src.ctx : this;
		let circuit = false;
		// 単方向データの作成時は参照のチェックを無効化する
		this.#checkReference.push(false);
		const result = ctx.call(() => {
			// srcの変更で必ず発火させつつ
			// destの変更およびsrc = destな操作で発火および循環させない
			if (!circuit) {
				circuit = true;
				dest.value = trans(src.value);
				circuit = false;
			}
		});
		this.#checkReference.pop();
		return result;
	}

	/**
	 * 双方向データの作成
	 * @template T
	 * @param { State<T> } src 作成元のデータ
	 * @param { State<T> } dest 作成対象のデータ
	 * @returns { { caller: Function; states: State<unknown>[] }[] } 呼び出し元情報
	 */
	bidirectional(src, dest) {
		return [this.unidirectional(src, dest), this.unidirectional(dest, src)];
	}

	/**
	 * パラメータの設定
	 * @template Val
	 * @param { CtxValueType<Val> } val パラメータの値
	 * @param { (val: Val) => unknown } setter パラメータの設定のルール
	 */
	setParam(val, setter) {
		// 状態変数の場合は変更を監視
		if (val instanceof State || val instanceof Computed) {
			const ctx = val instanceof State ? val.ctx : this;
			return ctx.call(() => setter(val.value));
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
	 * @return { (StateNode | HTMLElement | Text)[] }
	 */
	normalizeCtxChild(nodeList) {
		return this.useParam(nodeList, n => {
			const result = [];
			n.forEach(e => {
				const node = this.useParam(e, val => typeof val === 'string' ? document.createTextNode(val) : val);
				if (node) {
					// 子にテキストの状態が渡された場合は変更を監視する
					if (e instanceof State || e instanceof Computed) {
						result.push(new StateTextNode(node, [this.call(() => node.data = e.value)]))
					}
					else {
						result.push(node);
					}
				}
			});
			return result;
		});
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
		/** @type { { caller: Function; states: State<unknown>[] }[] } このDOMノード内での外部からの状態変数の呼び出し元情報のリスト */
		const callerList = [];

		// HTMLタグによるDOMノードの生成(Web Componentsも含む)
		if (typeof tag === 'string') {
			const element = document.createElement(tag);
			const stateElement = new StateDomNode(element, callerList);

			// プロパティの設定
			for (const key in props) {
				const val = props[key];
				if (val !== undefined && val !== null && val !== false) {
					const caller = this.setParam(val, val => {
						// styleはオブジェクト型による設定を許容するため処理を特殊化
						if (key === 'style') {
							if (val !== undefined && val !== null && val !== false) {
								for (const styleKey in val) {
									const caller = this.setParam(val[styleKey], val => element.style[styleKey] = val ?? '');
									if (caller && caller.states.length > 0) callerList.push(caller);
								}
							}
							else {
								element.removeAttribute('style');
							}
						}
						// その他プロパティはそのまま設定する
						else {
							element[key] = val ?? '';
						}
					});
					if (caller && caller.states.length > 0) callerList.push(caller);
				}
			}

			const caller2 = this.setParam(children(), val => {
				const nodeList = this.normalizeCtxChild(val);
				stateElement.replace(nodeList);
			});
			if (caller2 && caller2.states.length > 0) callerList.push(caller2);

			return stateElement;
		}
		// コンポーネントによるDOMノード生成
		else {
			// WebComponentプロパティの検査
			if (tag?.webComponent?.name && !this.#componentMap.has(tag)) {
				this.defineWebComponent(tag.webComponent.name, tag, tag.webComponent?.shadow ?? false, tag.webComponent?.options);
			}

			// コンポーネントから定義されたWeb ComponentによるDOMノードの生成
			if (this.#componentMap.has(tag)) {
				const element = document.createElement(this.#componentMap.get(tag));
				return element.createStateComponent(props, children);
			}
			// 通常のDOMノードの生成
			else {
				/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
				const compProps = {};
				for (const key in tag.propTypes ?? {}) {
					const val = props[key];
					// 渡されたプロパティが状態変数なら単方向データに変換して渡すようにする
					if (val instanceof State || val instanceof Computed) {
						const s = new State(val.value, val instanceof State ? val.ctx : this);
						const caller = this.unidirectional(val, s);
						if (caller && caller.states.length > 0) callerList.push(caller);
						compProps[key] = s;
					}
					else {
						// 値が与えられなかった場合はデフォルト値から持ってくる
						const val2 = val === undefined || val === null || val === false ? tag.propTypes[key] : val;
						if (val2 !== undefined && val2 !== null && val2 !== false) {
							compProps[key] = new State(val2, this);
						}
					}
				}
				/** @type { CompChildType } コンポーネントに渡す子要素 */
				const compChild = () => {
					const nodeList = children();
					const stateNodeList = new State([], nodeList instanceof State ? nodeList.ctx : this);
					if (nodeList instanceof State || nodeList instanceof Computed) {
						// 呼び出し元情報の取得は不要
						this.unidirectional(nodeList, stateNodeList, v => this.normalizeCtxChild(v));
						if (caller && caller.states.length > 0) callerList.push(caller);
					}
					else {
						stateNodeList.org = this.normalizeCtxChild(nodeList);
					}
					return stateNodeList;
				};

				const element = tag(this, compProps, compChild);
				if (element instanceof StateNode) {
					return new StateComponent(this, element, {}, callerList);
				}
				else {
					const exposeStates = element.exposeStates ?? {};
					return new StateComponent(this, element.node, exposeStates, callerList);
				}
			}
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
					rootNode = element.element;
				}
				else {
					this.#exposeState = element.exposeStates ?? {};
					rootNode = element.node.element;
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
	const trigger = new State(0, ctx2);
	const caller = () => { trigger.value = trigger.value === 0 ? 1 : 2; };

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
			if (trigger.value === 2) {
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
			if (trigger.value === 2) {
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
