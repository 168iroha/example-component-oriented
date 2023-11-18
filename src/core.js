
/**
 * @typedef {{
 * 		label?: ICallerLabel | undefined;
 * 		caller: Function;
 * }} CallerType 状態変数における呼び出し元についての型
 */

/**
 * CallerTypeに対するラベルのインターフェース
 */
class ICallerLabel {
	/**
	 * 状態の更新の蓄積を行う
	 * @param { Function } caller 状態の参照先
	 */
	update(caller) { throw new Error('not implemented.'); }

	/**
	 * 蓄積した状態を処理する
	 */
	proc() { throw new Error('not implemented.'); }
}

/**
 * DOM更新のためのCallerTypeに対するラベルの型
 * @template { ComponentType<K> } K
 * @implements { ICallerLabel }
 */
class DomUpdateCallerLabel {
	/** @type { StateComponent<K> } 更新対象となるコンポーネント */
	#component;
	/** @type { Set<Function> } DOM更新のためのcallerの集合 */
	#domUpdateTaskSet = new Set();

	/**
	 * コンストラクタ
	 * @param { StateComponent<K> } component 更新対象とみることができるコンポーネント
	 */
	constructor(component) {
		this.#component = component;
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { Function } caller 状態の参照先
	 */
	update(caller) {
		// Context経由でDomUpdateControllerのメソッドを呼び出す
		this.#domUpdateTaskSet.add(caller);
		this.#component.ctx.updateStateDom(this);
	}

	/**
	 * 蓄積した状態を処理する
	 */
	proc() {
		const taskSet = this.#domUpdateTaskSet;
		this.#domUpdateTaskSet = new Set();
		// DOM更新の前後でupdateライフサイクルフックを発火しつつタスクを実行する
		this.#component.onBeforeUpdate();
		for (const task of taskSet) {
			createWrapperFunction(task, this.#component)();
		}
		this.#component.onAfterUpdate();
	}
}

/**
 * DomUpdateCallerLabelに関するコントローラ(queueMicrotask()呼び出しを1回に限定するためのもの)
 */
class DomUpdateController {
	/** @type { Set<ICallerLabel> } DOM更新のためのDomUpdateCallerLabelの集合 */
	#callerLabelSet = new Set();
	/** @type { boolean } DOMの更新のタスクが既にマイクロタスクキューに追加されているか */
	#domUpdateFlag = false;

	/**
	 * 状態の更新の蓄積を行う
	 * @param { ICallerLabel } callerLabelSet 更新情報
	 */
	update(callerLabelSet) {
		this.#callerLabelSet.add(callerLabelSet);

		// マイクロタスクに追加する
		if (!this.#domUpdateFlag) {
			this.#domUpdateFlag = true;
			queueMicrotask(() => {
				// タスクの実行と初期化
				const callerLabelSet = this.#callerLabelSet;
				this.#callerLabelSet = new Set();
				this.#domUpdateFlag = false;
				for (const callerLabel of callerLabelSet) {
					callerLabel.proc();
				}
			});
		}
	}
}

/**
 * Stateのインターフェース
 * @template T
 */
class IState {
	/**
	 * @returns { T }
	 */
	get value() { throw new Error('not implemented.'); }

	/**
	 * 単方向データの作成
	 * @param { Context } ctx 生成する単方向データが属するコンテキスト
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx) { throw new Error('not implemented.'); }

	/**
	 * 状態変数が属するコンテキストの取得
	 * @returns { Context | undefined }
	 */
	get ctx() { return undefined; }
}

/**
 * 状態変数と同様の振る舞いをする変数
 * @template T
 * @extends { IState<T> }
 */
class NotState extends IState {
	/** @type { T } 変数の本体 */
	#value;

	/**
	 * コンストラクタ
	 * @param { T } value 変数の値
	 */
	constructor(value) {
		super();
		this.#value = value;
	}

	/**
	 * @returns { T }
	 */
	get value() { return this.#value; }

	/**
	 * 単方向データの作成
	 * @param { Context } ctx 生成する単方向データが属するコンテキスト
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx) {
		return { state: this };
	}
}

/**
 * 状態変数
 * @template T
 * @extends { IState<T> }
 */
class State extends IState {
	/** @type { Context } 状態変数の扱っているコンテキスト */
	#ctx;
	/** @type { T } 状態変数の本体 */
	#value;
	/** @type { Set<CallerType> } 呼び出し元のハンドラのリスト */
	#callerList = new Set();
	/** @type { ((val: State<T>) => boolean) | undefined | boolean } 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントのハンドラ */
	#onreference = undefined;

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { T } value 状態変数の初期値
	 */
	constructor(ctx, value) {
		super();
		this.#ctx = ctx;
		this.#value = value;
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
	 * 単方向データの作成
	 * @param { Context } ctx 生成する単方向データが属するコンテキスト
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx) {
		const dest = ctx.useState(undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest) };
	}

	/**
	 * 監視を伴わない値の取得
	 */
	get org() { return this.#value; }

	/**
	 * 監視を伴わない値の設定
	 */
	set org(value) { this.#value = value; }

	/**
	 * 状態変数が属するコンテキストの取得
	 */
	get ctx() { return this.#ctx; }

	/**
	 * 明示的に呼び出し元情報を追加する
	 * @param { CallerType } caller 呼び出し元の関数
	 */
	add(caller) { this.#callerList.add(caller); }

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { CallerType } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#callerList.delete(caller); }

	/**
	 * 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントの設定
	 * @param { (val: State<T>) => unknown } callback イベントハンドラ
	 */
	set onreference(callback) {
		/**
		 * #onreferenceの形式の関数
		 * @param { State<T> } s
		 */
		const c = s => {
			s.#onreference = true;
			callback(s);
			return true;
		};
		if ((typeof this.#onreference === 'boolean') ? this.#onreference : (!this.#onreference && this.#callerList.size > 0) || (this.#onreference && this.#onreference(this))) {
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
	 * @param { CtxValueType<T> | () => T } prop 観測対象の変数
	 */
	observe(prop) {
		if (prop instanceof State || prop instanceof Computed || prop instanceof Function) {
			// onreferenceが発火しないように退避
			const temp = this.#onreference;
			this.#onreference = undefined;
			const caller = this.ctx.unidirectional(prop, this);
			this.#onreference = temp;
			// state.onreferenceなしでstateが1つ以上の参照をもつ(親への状態の伝播なしで状態の参照が存在する場合)
			// もしくはstate.onreferenceなしでstateが2つ以上の参照をもつ(親への状態の伝播ありで状態の参照が存在する場合)
			// もしくはonreference()の戻り値がtrue(親への状態の伝播ありで祖先で状態の参照が存在する場合)
			// の場合に状態変数は利用されている
			const flag = (typeof this.#onreference === 'boolean') ? this.#onreference : (!this.#onreference && this.#callerList.size > 0) || (this.#onreference && this.#onreference(this));
			caller.states.forEach(s => {
				// 1つの状態を複数の状態変数が観測できるようにする
				if (!s.#onreference) {
					s.#onreference = s2 => {
						s2.#onreference = flag;
						return flag;
					};
				}
			});
			// このタイミングで値が利用されていない際はchoose()などで後から利用される可能性があるため
			// 後から通知を行うことができるようにする
			if (!flag) {
				// 関連付けられた状態変数のonreferenceを連鎖的に呼び出す
				this.#onreference = s => {
					s.#onreference = true;
					caller.states.forEach(state => {
						if (state.#onreference instanceof Function) {
							state.#onreference(state);
						}
						state.#onreference = true;
					});
					return false;
				};
			}
			// 参照ありでonreferenceが呼び出し済みなら関連付けられた状態変数のonreferenceを連鎖的に呼び出す
			else {
				caller.states.forEach(state => {
					if (state.#onreference instanceof Function) {
						state.#onreference(state);
					}
					state.#onreference = true;
				});
			}
		}
		else if (prop instanceof IState) {
			this.value = prop.value;
		}
		else {
			this.value = prop;
		}
	}
}

/**
 * 算出プロパティ
 * @template T
 * @extends { IState<T> }
 */
class Computed extends IState {
	/** @type { State<T> } 状態変数 */
	#state;

	/**
	 * コンストラクタ
	 * @param { Context } ctx 状態変数を扱っているコンテキスト
	 * @param { () => T } f 算出プロパティを計算する関数
	 */
	constructor(ctx, f) {
		super();
		this.#state = ctx.useState(undefined);
		this.#state.observe(f);
	}

	get value() { return this.#state.value; }

	/**
	 * 単方向データの作成
	 * @param { Context } ctx 生成する単方向データが属するコンテキスト
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx) {
		const dest = ctx.useState(undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest) };
	}

	/**
	 * 状態変数が属するコンテキストの取得
	 */
	get ctx() { return this.#state.ctx; }

	/**
	 * 明示的に呼び出し元情報を追加する
	 * @param { CallerType } caller 呼び出し元の関数
	 */
	add(caller) { this.#state.add(caller); }

	/**
	 * 明示的に呼び出し元情報を削除する
	 * @param { CallerType } caller 呼び出し元の関数
	 * @returns 
	 */
	delete(caller) { return this.#state.delete(caller); }
}

/**
 * @template T
 * @typedef { T extends IState<infer U> ? U : T } ElementTypeOfState 状態変数の要素型を得る
 */

/**
 * @template { string } K
 * @typedef { K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement } CreatedElementType タグからノードの型を得る
 */

/**
 * @template { (ctx: Context, props: CompPropTypes<K> extends {} ? ({} | undefined) : CompPropTypes<K>, children: CompChildrenType<K> extends [] ? ([] | undefined) : CompChildrenType<K>) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } K
 * @typedef { (ctx: Context, props: CompPropTypes<K> extends {} ? ({} | undefined) : CompPropTypes<K>, children: CompChildrenType<K> extends [] ? ([] | undefined) : CompChildrenType<K>) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } ComponentType コンポーネントの型
 */

/**
 * @template { (a?: unknown, b?: unknown, c?: unknown[]) => unknown } T
 * @typedef { Parameters<T>[2] extends undefined ? [] : Parameters<T>[2] } CompChildrenType コンポーネントの子要素の型
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
 * @typedef { { [K in keyof T]: ElementTypeOfState<T[K]> } } ObservableComponentStatesImpl
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
	/** @protected @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) { throw new Error('not implemented.'); }

	/**
	 * 子孫要素を構築する
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	build(ctx) {
		const { calc, node } = this.#mountImpl(ctx ?? this.ctx);
		calc();
		return node;
	}

	/**
	 * DOMノードにマウントする
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @returns { { calc: () => void; node: StateNode } }
	 */
	#mountImpl(ctx, target) {
		/** @type { undefined | StateNode } */
		let resuleNode = undefined;

		// コンポーネントの下でノードが構築されるかの判定
		if (!(ctx.component || (this instanceof GenStateComponent))) {
			throw new Error('It must be built under the Component.');
		}

		const calc = this.#ctx.lazy(() => {
			/** @type { StateNode | undefined } */
			let _node = undefined;
			/** @type { GenStateNode | undefined } */
			let _gen = undefined;
			/** @type { { node: GetGenStateNode; ctx: Context }[] } */
			let _children = [];

			// コンポーネントの評価(ルートノードによってはコンポーネントではない場合もある)
			try {
				({ node: _node, gen: _gen, children: _children } = this.buildCurrent(ctx, target));
			}
			catch (e) {
				if (!ctx?.component) {
					// ctx.component配下の構築を破棄するためctx.componentで捕捉不可ならリスロー
					throw e;
				}
				ctx.component.onErrorCaptured(e, ctx.component);
				return;
			}
			resuleNode = _node;
			ctx = _node instanceof StateComponent ? _node.ctx : ctx;

			/** @type { StateComponent<unknown>[] } コンポーネントについてのonMountを発火するためのスタック */
			const stackComponent = _node instanceof StateComponent ? [_node] : [];

			try {
				// atomicなノードが出現するまで繰り返し構築する
				// コンポーネントの子がコンポーネントの場合などに繰り返される
				// _genがundefinedならatomic
				while (_gen) {
					const { node, gen, children } = _gen.buildCurrent(ctx, target);
					_node = node;
					_gen = gen;
					// 既に子要素が設定されている場合は無視する
					_children = _children.length > 0 ? _children : children;
					if (_node instanceof StateComponent) {
						ctx = _node.ctx;
						stackComponent.push(_node);
					}
				}
			}
			catch (e) {
				if (ctx.component !== _node) {
					_node.remove();
				}
				ctx.component.onErrorCaptured(e, ctx.component);
				return;
			}

			/** @type { { ctx: Context, node: StateNode; children: { node: GenStateNode; ctx: Context }[]; element: HTMLElement | Text | undefined }[] } コンポーネントについての幅優先探索に関するキュー */
			const queueComponent = [{ ctx, node: _node, children: _children, element: target }];
			
			while (queueComponent.length > 0) {
				/** @type { (typeof queueComponent)[number] } */
				const { ctx, node, children, element: localRoot } = queueComponent.shift();
				/** @type {{ node: StateNode; children: (typeof localTree | { node: GenStateNode; ctx: Context })[]; element: HTMLElement | Text | undefined }} コンポーネント内におけるStateNodeのツリー(コンポーネントはGenStateNodeで管理し、それ以外は最終的にatomicになる) */
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
						/** @type { { node: GenStateNode; ctx: Context } } */
						const { node: child, ctx: childCtx } = children[i];

						[_node, _gen, _children] = [undefined, child, []];
						// 原子的なノードでなければノードを構築する
						if (!child.isAtomic && !(child instanceof GenStateComponent)) {
							({ node: _node, gen: _gen, children: _children } = child.buildCurrent(childCtx, target));
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
								const { node } = _gen.buildCurrent(ctx);
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
								const { node, children: grandchildren } = _gen.buildCurrent(ctx, childNode);
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
						if (child instanceof GenStateComponent) {
							_gen = child;
							_children = [];
							let _ctx = ctx;
							try {
								// atomicなノードが出現するまで繰り返し構築する
								// コンポーネントの子がコンポーネントの場合などに繰り返される
								// _genがundefinedならatomic
								do {
									const { node, gen, children } = _gen.buildCurrent(_ctx, childNode);
									_node = node;
									_gen = gen;
									// 既に子要素が設定されている場合は無視する
									_children = _children.length > 0 ? _children : children;
									if (_node instanceof StateComponent) {
										_ctx = _node.ctx;
										stackComponent.push(_node);
									}
								} while (_gen);
								// 構築対象のコンポーネントのpush
								queueComponent.push({ ctx: _ctx, node: _node, children: _children, element: childNode });
							}
							catch (e) {
								if (_ctx.component !== _node) {
									_node.remove();
								}
								_ctx.component.onErrorCaptured(e, _ctx.component);
								// エラーが起きた箇所以外のコンポーネントは構築するようにする
							}
						}
						else {
							_node = child.node;
						}
						// elementに子要素が存在しない場合にのみ子を追加する
						if (!childNode) {
							node.element.appendChild(_node.element);
						}
						// GenStateComponentでない場合は次の探索のセットアップ
						if (!(child instanceof GenStateNode)) {
							queueNode.push(child);
						}
						childNode = childNode?.nextSibling;
					}
				}
			}

			// onMountの発火
			while (stackComponent.length > 0) {
				const component = stackComponent.pop();
				component.onMount();
			}
		});
		return { calc, node: resuleNode };
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement } target マウント対象のDOMノード
	 */
	mount(target) {
		this.#mountImpl(this.ctx, target).calc();
	}

	/**
	 * 後からマウント可能なDOMノードを構築する
	 * @param { HTMLElement | undefined } target 書き込み対象のDOMノード
	 * @returns { HTMLElement }
	 */
	write(target) {
		// 変更の伝播を破棄する
		return this.#mountImpl(this.ctx, target).node.element;
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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
		const ret = this.#gen.buildCurrent(ctx, target);
		this.#setter(ret.node);
		return ret;
	}
}

/**
 * ノードの集合
 */
class StateNodeSet {
	/** @protected @type { (StateNode | StateNodeSet)[] } 管理しているネストを許容したノードの集合 */
	nestedNodeSet = [];

	/**
	 * コンストラクタ
	 * @param { Context } ctx コンテキスト
	 * @param { (GenStateNode | GenStateNodeSet)[] } nestedNodeSet ネストを許容したノードの集合
	 * @param { { node: GetGenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 */
	constructor(ctx, nestedNodeSet, sibling) {
		for (const nestedNode of nestedNodeSet) {
			if (nestedNode instanceof GenStateNode) {
				// GenStateNodeの場合は後からノードをセットされるようにする
				this.nestedNodeSet.push(undefined);
				const i = this.nestedNodeSet.length - 1;
				sibling.push({ node: new GetGenStateNode(nestedNode, node => this.nestedNodeSet[i] = node), ctx });
			}
			else {
				// GenStateNodeSetの場合はそれを評価してノードをセットする
				const { set, sibling: sibling_ } = nestedNode.buildStateNodeSet();
				this.nestedNodeSet.push(set);
				sibling.push(...sibling_);
			}
		}
	}

	/**
	 * ノードの集合の内最初のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get first() {
		if (this.nestedNodeSet.length === 0) {
			return undefined;
		}
		const node = this.nestedNodeSet[0];
		return node instanceof StateNode ? node : node.first;
	}

	/**
	 * ノードの集合の内最後のノードを取得
	 * @returns { StateNode | undefined }
	 */
	get last() {
		if (this.nestedNodeSet.length === 0) {
			return undefined;
		}
		const node = this.nestedNodeSet[this.nestedNodeSet.length - 1];
		return node instanceof StateNode ? node : node.last;
	}

	/**
	 * StateNode全体を取得する
	 * @returns { Generator<StateNode, void, unknown> }
	 */
	*nodeSet() {
		for (const nestedNode of this.nestedNodeSet) {
			if (nestedNode instanceof StateNode) {
				yield nestedNode;
			}
			else {
				yield* nestedNode.node();
			}
		}
	}

	/**
	 * ノードの挿入
	 * @param { HTMLElement | Text | undefined } element 挿入を行う前の要素
	 * @param { HTMLElement } parent 挿入を行う親要素
	 */
	insertBefore(element, parent) {
		for (const node of this.nodeSet()) {
			const nodeElement = node.element;
			if (nodeElement === element) {
				do {
					element = element?.nextSibling;
				} while (element?.type === Node.COMMENT_NODE);
			}
			else {
				parent.insertBefore(nodeElement, element);
			}
		}
		return element;
	}

	/**
	 * ノードの削除
	 */
	remove() {
		for (const node of this.nodeSet()) {
			node.remove();
		}
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		for (const node of this.nodeSet()) {
			node?.element?.remove();
		}
	}
}

/**
 * ノードの集合を生成するためのノードの集合
 */
class GenStateNodeSet {
	/** @protected @type { (GenStateNode | GenStateNodeSet)[] } 管理しているネストを許容したノードの集合 */
	nestedNodeSet;

	/**
	 * コンストラクタ
	 * @param { (GenStateNode | GenStateNodeSet)[] } nestedNodeSet ネストを許容したノードの集合
	 */
	constructor(nestedNodeSet) {
		this.nestedNodeSet= nestedNodeSet;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; sibling: { node: GetGenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		/** @type { { node: GetGenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new StateNodeSet(ctx, this.nestedNodeSet, sibling);
		return { set, sibling };
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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
		const text = this.#text;
		const element = document.createTextNode('');
		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// 子にテキストの状態が渡された場合は変更を監視する
		const caller = this.ctx.setParam(text, val => {
			element.data = val;
		}, ctx.component.label);
		if (caller && caller.states.length > 0) callerList.push(caller);

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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
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
	/** @type { (GenStateNode | GenStateNodeSet)[] } 子要素 */
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
	 * @param { (GenStateNode | GenStateNodeSet)[] } children 子要素
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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
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

		// StateDomとDOM更新を対応付けるラベルの生成
		const label = ctx.component.label;

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
									val => element.style.setProperty(styleKey, val ?? ''),
									label
								);
								if (caller && caller.states.length > 0) callerList.push(caller);
							}
						}
						else {
							element.removeAttribute('style');
						}
					}
					// 属性が初期値を設定するものならば属性の設定を優先する
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
					// 関数を設定する場合はエラーハンドリングを行うようにする
					else if (val instanceof Function) {
						element[key] = createWrapperFunction(val, ctx.component);
					}
					// その他プロパティはそのまま設定する
					else {
						element[key] = val ?? '';
					}
				}, label);
				if (caller && caller.states.length > 0) callerList.push(caller);
			}
		}

		// 子要素の構築
		/** @type { GenStateNode[] } */
		const children = [];
		for (const child of  this.#children) {
			if (child instanceof GenStateNode) {
				children.push({ node: child, ctx });
			}
			else {
				children.push(...child.buildStateNodeSet(ctx).sibling);
			}
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates, element);
		}

		this.#genFlag = true;

		return { node: new StateDomNode(this.ctx, element, callerList), children };
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
	/** @type { StateComponent<unknown> | undefined } 親コンポーネント */
	#parent = undefined;
	/** @protected @type { GenStateNode } nodeを生成するノード */
	genStateNode;
	/** @protected @type { StateNode | undefined } コンポーネントを代表するノード */
	node = undefined;
	/** @type { LifeCycle } ライフサイクル */
	#lifecycle = {};
	/** @type { DomUpdateCallerLabel<K> | undefined } DOM更新の際に用いるラベル */
	#label = undefined;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 */
	constructor(ctx, parent) {
		super(ctx, []);
		this.#parent = parent;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | Text | undefined }
	 */
	get element() { return this.node?.element; }

	/**
	 * 親コンポーネントの取得
	 */
	get parent() { return this.#parent; }

	/**
	 * ラベルの取得
	 */
	get label() { return this.#label || (this.#label = new DomUpdateCallerLabel(this)); }

	/**
	 * コンポーネントを構築する
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return {{ gen: GenStateNode; children: GenStateNode[] }}
	 */
	build(component, props, children, observableStates) {
		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		// プロパティは単方向データに変換して渡すようにする
		for (const key in props) {
			const { state, caller } = props[key].unidirectional(this.ctx);
			if (caller && caller.states.length > 0) this.callerList.push(caller);
			compProps[key] = state;
		}

		// ノードの生成
		/** @type { ComponentExposeStates<K> | {} } コンポーネントが公開している状態 */
		let exposeStates = {};
		try {
			({ genStateNode: this.genStateNode, exposeStates, lifecycle: this.#lifecycle } = this.ctx.buildComponent(component, compProps, children));
		}
		catch (e) {
			// 状態変数の関連付けを破棄してから例外をリスロー
			this.callerList.forEach(caller => caller.states.forEach(state => state.delete(caller.caller)));
			throw e;
		}

		// 観測の評価
		if (observableStates) {
			for (const key in observableStates) {
				const state = observableStates[key];
				const exposeState = exposeStates[key];
				// 状態の観測の実施
				state.observe(exposeState);
			}
		}

		return this.buildRepComponent(this.genStateNode);
	}

	/**
	 * コンポーネントを代表するノードを構築する
	 * @protected
	 * @param { GenStateNode } genStateNode コンポーネント代表するノードを生成するノード
	 * @return {{ gen: GenStateNode; children: { node: GenStateNode; ctx: Context }[] }}
	 */
	buildRepComponent(genStateNode) {
		/** @type {{ gen?: GenStateNode; children?: { node: GenStateNode; ctx: Context }[] }} */
		const result = {};

		// nodeの設定
		if (!genStateNode.isAtomic && !(genStateNode instanceof GenStateComponent)) {
			try {
				({ node: this.node, gen: result.gen, children: result.children } = genStateNode.buildCurrent(genStateNode.ctx));
			}
			catch (e) {
				// コンポーネントの要素の構築をキャンセルし、現在の要素としてはダミーを設置
				// 復帰が可能でありかつ復帰を行う場合はthis.rebuildChild()などの各コンポーネントにより行う
				result.gen = new GetGenStateNode(new GenStateTextNode(this.ctx, ''), node => this.node = node);
				result.children = [];
				this.onErrorCaptured(e, this);
			}
		}
		else {
			result.gen = new GetGenStateNode(genStateNode, node => this.node = node);
			result.children = [];
		}

		return result;
	}

	/**
	 * コンポーネントを再構築する
	 */
	rebuildChild() {
		const element = this.element;
		this.node?.remove();
		this.node = this.genStateNode.build(this);
		// ノードの付け替えが可能な場合は付け替える
		const element2 = this.node.element;
		if (element && element2) {
			element2.replaceWith(element);
		}
	}

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.node?.remove();
		this.onUnmount();
	}

	onMount() {
		if (this.#lifecycle.onMount) {
			this.ctx.updateState(this.#lifecycle.onMount);
		}
	}

	onUnmount() {
		if (this.#lifecycle.onUnmount) {
			this.ctx.updateState(this.#lifecycle.onUnmount);
		}
	}

	onBeforeUpdate() {
		if (this.#lifecycle.onBeforeUpdate) {
			this.ctx.updateState(this.#lifecycle.onBeforeUpdate);
		}
	}

	onAfterUpdate() {
		if (this.#lifecycle.onAfterUpdate) {
			this.ctx.updateState(this.#lifecycle.onAfterUpdate);
		}
	}

	/**
	 * @param { unknown } error throwされた要素
	 * @param { StateComponent<unknown> } component throwが実行されたコンポーネント
	 * @param { number } handledTimes エラーがハンドルされた回数
	 */
	onErrorCaptured(error, component, handledTimes = 0) {
		/** @type { boolean }  */
		let prop = true;
		if (this.#lifecycle.onErrorCaptured) {
			prop = false;
			// 遅延評価せず即時に評価する
			for (const callback of this.#lifecycle.onErrorCaptured) {
				const val = callback(error, component);
				if (val !== false) {
					prop = true;
				}
			}
			handledTimes += this.#lifecycle.onErrorCaptured.length;
		}

		if (prop) {
			// 親コンポーネントにエラーを伝播する
			if (this.#parent) {
				this.#parent.onErrorCaptured(error, component, handledTimes);
			}
			// ハンドルされない場合は例外をリスロー
			else if (handledTimes <= 0) {
				throw error;
			}
		}
	}
}

/**
 * StateComponentを生成するためのノード
 * @template { ComponentType<K> } K
 */
class GenStateComponent extends GenStateNode {
	/** @protected @type { K } コンポーネントを示す関数 */
	component;
	/** @protected @type { CompPropTypes<K> } プロパティ */
	props;
	/** @protected @type { CompChildrenType<K> } 子要素 */
	children;
	/** @protected @type { ObservableStates<K> | undefined } 観測する対象 */
	observableStates = undefined;
	/** @type { boolean } ノードが生成されたことがあるかを示すフラグ */
	#genFlag = false;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 */
	constructor(ctx, component, props, children) {
		super(ctx);
		this.component = component;
		this.props = props;
		this.children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateComponent<K> }
	 */
	clone() {
		return new GenStateComponent(this.ctx, this.component, this.props, this.children);
	}

	/**
	 * 自要素を構築する
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.observableStates) {
			throw new Error('The buildCurrent in GenStateComponent must not be called more than twice.');
		}

		/** 生成するコンポーネントが属するコンテキストとそのコンポーネント */
		const node = ctx.generateContextForComponent(_ctx => new StateComponent(_ctx, ctx.component)).component;

		// コンポーネントを構築して返す
		const result = node.build(this.component, this.props, this.children, this.observableStates);
		this.#genFlag = true;

		return { node, ...result };
	}

	/**
	 * ノードの内部の状態を観測する
	 * @param { ObservableStates<K> } props 観測する対象
	 */
	observe(props) {
		// 既にobserve()が呼びだされたことがあるのならばノードを複製する
		const node = this.observableStates ? this.clone() : this;
		node.observableStates = props;
		node.#genFlag = false;
		return node;
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
 * @typedef { IState<T> | T } CtxValueType コンテキスト上での値の型
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: CtxValueType<T[K] | null | undefined> } } CtxPropTypesImpl コンテキスト上でのプロパティの型の連想配列を構成する部分
 */

/**
 * @template { string } T
 * @typedef { T extends `${infer T1}${infer T2}${infer T3}`
 * 		? T2 extends ('-' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9') ? `${Uncapitalize<T1>}${CamelToKebab<`${T2}${T3}`>}`
 * 		: T2 extends Capitalize<T2>
 * 			? `${Uncapitalize<T1>}-${CamelToKebab<`${Uncapitalize<T2>}${T3}`>}`
 * 			: `${Uncapitalize<T1>}${CamelToKebab<`${T2}${T3}`>}`
 * 		: T } CamelToKebab キャメルケースの文字列をケバブケースの文字列へ変換
 */

/**
 * @template { Record<T, unknown> } T
 * @typedef {{ [K in keyof T as CamelToKebab<string & K>]: T[K]; }} CamelToKebabObject オブジェクトのキーをキャメルケースからケバブケースへ変換
 */

/**
 * @template { HTMLElement } T
 * @typedef { CtxPropTypesImpl<
 * 		RemoveReadonlyProperty<RemoveFunction<T>> &
 * 		{ style: CtxPropTypesImpl<CamelToKebabObject<RemoveReadonlyProperty<RemoveFunction<CSSStyleDeclaration>>> & Record<string, string>> }
 * > } CtxDomPropTypes コンテキスト上でのDOMのプロパティの型
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K> } CtxPropTypes コンテキスト上でのプロパティの型
 */

/**
 * @template { Record<unknown, unknown> } T
 * @typedef {{ [K in keyof T as undefined extends T[K] ? never : K]: T[K] }} RequiredCtxPropTypes コンテキスト上での必須なプロパティの型
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { K extends string
 * 		? (GenStateNode | Text | CtxValueType<string> | GenStateNodeSet)[]
 * 		: Parameters<K>[2] extends undefined ? [] : TransformGenStateNodeToCtxChildType<Parameters<K>[2]>
 * } CtxChildType コンテキスト上での子要素の型
 */

/**
 * @template T
 * @typedef { T  extends unknown[] ? number extends T['length'] ? [] : T : T } RequiredCtxChildType コンテキスト上での必須な子要素の型
 */

/**
 * @template { unknown[] } T
 * @typedef {{
 * 		[K in keyof T]: T[K] extends GenStateTextNode ? (Text | CtxValueType<string>)
 * 		: T[K] extends GenStateNode ? (GenStateNode | Text | CtxValueType<string>) : T[K];
 * }} TransformGenStateNodeToCtxChildType GenStateNodeからコンテキスト上の子要素の型へ変換
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: CtxValueType<T['propTypes'][K]> } : {} } CtxCompPropTypes コンテキスト上でのコンポーネントのプロパティの型
 */

/**
 * @template T
 * @typedef { T extends { propTypes: Record<string, unknown> } ? { [K in keyof T['propTypes']]: IState<T['propTypes'][K]> } : {} } CompPropTypes コンポーネント上でのプロパティの型
 */

/**
 * @typedef {{
 * 		onMount?: CallerType[];
 * 		onUnmount?: CallerType[];
 * 		onBeforeUpdate?: CallerType[];
 * 		onAfterUpdate?: CallerType[];
 * 		onErrorCaptured?: ((error: unknown, component: StateComponent<unknown>) => boolean | undefined)[];
 * }} LifeCycle ライフサイクル
 */

/**
 * コンテキスト
 */
class Context {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { LifeCycle } コンポーネントに設置されたライフサイクル */
	#lifecycle = {};
	/** @type { StateComponent<unknown> | undefined } コンテキストが属するコンポーネント */
	#component = undefined;

	/** @type { DomUpdateController } DOMの更新のためのコントローラ */
	#domUpdateController;
	/** @type { Map<StateComponent<unknown> | undefined, Set<CallerType>>[] } 遅延評価対象の呼び出し元の集合についてのスタック */
	#lazyUpdateStack = [];

	/**
	 * コンストラクタ
	 * @param { DomUpdateController | undefined } domUpdateController DOMの更新のためのコントローラ
	 */
	constructor(domUpdateController = undefined) {
		this.#domUpdateController = domUpdateController ?? new DomUpdateController();
	}

	/**
	 * コンポーネントが属するコンテキストを生成する
	 * @param { (ctx: Context) => StateComponent<unknown> } gen コンポーネントを示すノードを生成する関数
	 * @returns { Context }
	 */
	generateContextForComponent(gen) {
		const ctx = new Context(this.#domUpdateController);
		ctx.#stack = this.#stack;
		ctx.#component = gen(ctx);
		ctx.#lazyUpdateStack = this.#lazyUpdateStack;
		return ctx;
	}

	get component() { return this.#component; }

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
			const map = this.#lazyUpdateStack[this.#lazyUpdateStack.length - 1];
			const set = map.has(this.#component) ? map.get(this.#component) : map.set(this.#component, new Set()).get(this.#component);
			for (const val of itr) {
				set.add(val);
			}
			return;
		}

		for (const val of itr) {
			if (val.label) {
				val.label.update(val.caller);
			}
			// 未定義の場合は同期的に即時評価
			else {
				if (this.#component) {
					// コンポーネントが有効な場合はエラーハンドリングを実施
					createWrapperFunction(val.caller, this.#component)();
				}
				else {
					val.caller();
				}
			}
		}
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { ICallerLabel } callerLabelSet 更新情報
	 */
	updateStateDom(callerLabelSet) {
		this.#domUpdateController.update(callerLabelSet);
	}

	/**
	 * callback内での状態変数の変更の伝播を遅延させるハンドラを生成する
	 * @param { Function } callback 状態変数の変更操作を含む関数
	 * @returns { () => void } 状態変数の変更の伝播を行う関数
	 */
	lazy(callback) {
		/** @type { Map<StateComponent<unknown> | undefined, Set<CallerType>> } */
		const map = new Map();
		this.#lazyUpdateStack.push(map);
		callback();
		this.#lazyUpdateStack.pop();
		return map.size === 0 ? () => {} : () => map.forEach((set, component) => (component?.ctx ?? this).updateState(set));
	}

	/**
	 * 状態変数のキャプチャの通知
	 * @template T
	 * @param { State<T> } state 通知対象の状態変数
	 */
	notify(state) {
		if (this.#stack.length > 0) {
			if (state.onreference instanceof Function) {
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
		return new State(this, value);
	}

	/**
	 * 算出プロパティの宣言
	 * @template T
	 * @param { () => T } f 算出プロパティを計算する関数
	 * @returns { Computed<T> }
	 */
	computed(f) {
		return new Computed(this, f);
	}

	/**
	 * 単方向データの作成
	 * @template T, U
	 * @param { IState<T> | () => T } src 作成元のデータ
	 * @param { State<U> } dest 作成対象のデータ
	 * @param { (from: T) => U } trans 変換関数
	 * @returns { { caller: CallerType; states: State<unknown>[] } } 呼び出し元情報
	 */
	unidirectional(src, dest, trans = x => x) {
		const ctx = src instanceof Function ? this : src.ctx;
		let circuit = false;
		if (src instanceof Function) {
			return ctx.call(() => {
				// srcの変更で必ず発火させつつ
				// destの変更およびsrc = destな操作で発火および循環させない
				if (!circuit) {
					circuit = true;
					dest.value = trans(src());
					circuit = false;
				}
			});
		}
		else {
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
			return val.ctx.call({ caller: () => setter(val.value), label });
		}
		else if (val instanceof IState) {
			setter(val.value);
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
		return callback(val instanceof IState ? val.value : val);
	}

	/**
	 * ノードリストを正規化する
	 * @template { string | ComponentType<K> } K
	 * @param { CtxChildType<K> } nodeList 対象のノード
	 * @returns { K extends string ? (GenStateNode | GenStateNodeSet)[] : CompChildrenType<K> }
	 */
	normalizeCtxChild(nodeList) {
		return Array.isArray(nodeList) ? nodeList.map(e => {
			// 子にテキストの状態が渡された場合は変更を監視する
			if (e instanceof IState) {
				return new GenStateTextNode(this, e);
			}
			else if (typeof e === 'string') {
				return new GenStateTextNode(this, e);
			}
			else if (e instanceof Text) {
				return new GenStateTextNode(this, e.data);
			}
			else {
				return e;
			}
		}) : nodeList;
	};

	/**
	 * プロパティを正規化する
	 * @template { ComponentType<K> } K
	 * @param { K } component コンポーネントを示す関数
	 * @param { CtxCompPropTypes<K> } props 変換対象のプロパティ
	 */
	normalizeCtxProps(component, props) {
		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		// IStateによる連想配列へ変換
		for (const key in component.propTypes ?? {}) {
			const val = props[key];
			if (val instanceof IState) {
				compProps[key] = val;
			}
			else {
				// 値が与えられなかった場合はデフォルト値から持ってきてIStateとなるように伝播
				compProps[key] = new NotState(val === undefined ? component.propTypes[key] : val);
			}
		}
		return compProps;
	}

	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { K } tag HTMLタグ
	 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxPropTypes<K> | undefined : CtxPropTypes<K> } props プロパティ
	 * @param { RequiredCtxChildType<CtxChildType<K>> extends [] ? CtxChildType<K> | undefined : CtxChildType<K> } children 子要素
	 * @returns { K extends string ? GenStateDomNode<K> : (true extends K['early'] ? ReturnType<K> : GenStateComponent<K>) }
	 */
	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? K : never } tag HTMLタグ
	 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxChildType<K> : never } props 子要素
	 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? undefined : never } children 略
	 * @returns { K extends string ? GenStateDomNode<K> : (true extends K['early'] ? ReturnType<K> : GenStateComponent<K>) }
	 */
	/**
	 * DOMノード/コンポーネントの生成
	 * @template { string | ComponentType<K> } K
	 * @param { K } tag HTMLタグ
	 * @param { CtxPropTypes<K> | CtxChildType<K> | undefined } props プロパティ
	 * @param { CtxChildType<K> | undefined } children 子要素
	 * @returns { K extends string ? GenStateDomNode<K> : (true extends K['early'] ? ReturnType<K> : GenStateComponent<K>) }
	 */
	$(tag, props = undefined, children = undefined) {
		const isProps = props?.constructor?.name === 'Object';
		const _props = isProps ? props : {};
		const _children = this.normalizeCtxChild((!isProps ? props : children) ?? []);
		// HTMLタグによるDOMノードの生成(Web Componentsも含む)
		if (typeof tag === 'string') {
			return new GenStateDomNode(this, tag, _props, _children);
		}
		// コンポーネントによるDOMノード生成
		else {
			const compProps = this.normalizeCtxProps(tag, _props);

			if (tag.early === true) {
				return tag(this, compProps, _children);
			}
			else {
				return new GenStateComponent(this, tag, compProps, _children);
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
				if (value instanceof IState) {
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
		return useStateFlag ? this.computed(f) : f();
	}

	/**
	 * HTMLElementを示すStateNodeの生成
	 * @param { HTMLElement } element StateNodeの生成対象
	 */
	html(element) {
		return new GenStateHTMLElement(this, element);
	}

	/**
	 * 自コンテキストで動作するコンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 * @returns {{ getStateNode: GenStateNode; exposeStates: ComponentExposeStates<K>; lifecycle: LifeCycle }}
	 */
	buildComponent(component, props, children) {
		const compResult = component(this, props, children);

		// 実行結果からコンポーネントが公開している状態等を分離
		/** @type { GenStateNode | undefined } */
		let genStateNode = undefined;
		/** @type { ComponentExposeStates<K> | {} } */
		let exposeStates = {};
		if (compResult instanceof GenStateNode) {
			genStateNode = compResult;
		}
		else {
			genStateNode = compResult.node;
			exposeStates = compResult.exposeStates ?? {};
		}
		return { genStateNode, exposeStates, lifecycle: this.#lifecycle };
	}

	/**
	 * ライフサイクルの設定
	 * @param { Exclude<LifeCycle[key], undefined>[number] } callback ライフサイクルで呼びだすコールバック
	 * @param { keyof LifeCycle } key 設定対象のライフサイクルを示すキー
	 */
	#onLifeCycle(callback, key) {
		if (!this.#component) {
			throw new Error('This function should not be called except to initialize a component.');
		}
		this.#lifecycle[key] = this.#lifecycle[key] || [];
		this.#lifecycle[key].push(callback);
	}

	/**
	 * onMount時のライフサイクルの設定
	 * @param { () => unknown } callback onMount時に呼びだすコールバック
	 */
	onMount(callback) {
		this.#onLifeCycle({ caller: callback }, 'onMount');
	}

	/**
	 * onUnmount時のライフサイクルの設定
	 * @param { () => unknown } callback onUnmount時に呼びだすコールバック
	 */
	onUnmount(callback) {
		this.#onLifeCycle({ caller: callback }, 'onUnmount');
	}

	/**
	 * onBeforeUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onBeforeUpdate時に呼びだすコールバック
	 */
	onBeforeUpdate(callback) {
		this.#onLifeCycle({ caller: callback }, 'onBeforeUpdate');
	}

	/**
	 * onAfterUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onAfterUpdate時に呼びだすコールバック
	 */
	onAfterUpdate(callback) {
		this.#onLifeCycle({ caller: callback }, 'onAfterUpdate');
	}

	/**
	 * onErrorCaptured時のライフサイクルの設定
	 * @param { (error: unknown, component: StateComponent<unknown>) => boolean | undefined } callback onErrorCaptured時に呼びだすコールバック
	 */
	onErrorCaptured(callback) {
		this.#onLifeCycle(callback, 'onErrorCaptured');
	}
}

/**
 * @template T
 * @overload
 * @param { IState<T> } state 監視を行う状態変数
 * @param { (prev: T, next: T) => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * @template T
 * @overload
 * @param { IState<unknown>[] } state 監視を行う状態変数のリスト
 * @param { () => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * ウォッチャーの宣言
 * @template T
 * @param { IState<unknown>[] | IState<T> } state 監視を行う状態変数
 * @param { (() => unknown) | ((prev: T, next: T) => unknown) } f ウォッチャー
 * @returns { CallerType | undefined }
 */
function watch(state, f) {
	if (state instanceof IState) {
		let prevState =  state.value;
		let nextState = state.value;
		const ctx = state.ctx;
		if (ctx === undefined) {
			return undefined;
		}
		const component = ctx.component;

		/** @type { CallerType } */
		const caller =
		// コンポーネントが有効な場合はエラーハンドリングを実施
		{ caller: component ? () => {
			prevState = nextState;
			nextState = state.value;
			createWrapperFunction(f, component)(prevState, nextState);
		} : () => {
			prevState = nextState;
			nextState = state.value;
			f(prevState, nextState);
		}};
		state.add(caller);
		return caller;
	}
	else {
		/** @type { Context[] } */
		const ctxList = state.filter(s => s.ctx).map(s => s.ctx);
		if (ctxList.length === 0) {
			return undefined;
		}
		// 一番最初に発見した有効なコンポーネントを通知先とする
		const component = ctxList.find(ctx => ctx.component)?.ctx?.component;
		/** @type { CallerType } */
		const caller = { caller: component ? createWrapperFunction(f, component) : f };
		state.forEach(s => s.add(caller));
		return caller;
	}
}

/**
 * エラーハンドリングを行うようにラップした関数を生成する
 * @template { Function } T
 * @template { ComponentType<K> } K
 * @param { T } f ラップ対象の関数
 * @param { StateComponent<K> } component エラーハンドリング対象のコンポーネント
 * @return { T }
 */
function createWrapperFunction(f, component) {
	/**
	 * @param { Parameters<T> } args
	 */
	return (...args) => {
		try {
			const ret = f(...args);
			if (ret instanceof Promise) {
				return ret.catch(reason => component.onErrorCaptured(reason, component));
			}
			return ret;
		}
		catch (e) {
			component.onErrorCaptured(e, component);
		}
	}
}

export {
	IState,
	State,
	StateNode,
	StateNodeSet,
	StateComponent,
	GenStateNode,
	GetGenStateNode,
	GenStateNodeSet,
	GenStateTextNode,
	GenStateComponent,
	Context,
	watch
};
