
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
}

/**
 * DOM更新のためのCallerTypeに対するラベルの型
 * @extends { ICallerLabel }
 */
class DomUpdateCallerLabel {
	/** @type { StateNode } 更新対象となるStateNode(コンポーネント) */
	#node;

	/**
	 * コンストラクタ
	 * @param { StateNode } node 更新対象とみることができるStateNode
	 */
	constructor(node) {
		this.#node = node;
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { Function } caller 状態の参照先
	 */
	update(caller) {
		// Context経由でDomUpdateControllerのメソッドを呼び出す
		this.#node.ctx.updateStateDom(caller, this.#node);
	}
}

/**
 * DomUpdateCallerLabelに関するコントローラ
 */
class DomUpdateController {
	/** @type { Set<Function> } DOM更新のためのcallerの集合 */
	#domUpdateTask = new Set();
	/** @type { Set<StateComponent> } 更新対象とみることができるStateComponent */
	#nodeList = new Set();
	/** @type { boolean } DOMの更新のタスクが既にマイクロタスクキューに追加されているか */
	#domUpdateFlag = false;

	/**
	 * 状態の更新の蓄積を行う
	 * @param { Function } caller 状態の参照先
	 * @param { StateNode } node 更新対象のノード
	 */
	update(caller, node) {
		// ライフサイクルの発火対象なら蓄積する
		if (node instanceof StateComponent) {
			this.#nodeList.add(node);
		}

		this.#domUpdateTask.add(caller);
		// マイクロタスクに追加する
		if (!this.#domUpdateFlag) {
			this.#domUpdateFlag = true;
			queueMicrotask(() => {
				// タスクの実行と初期化
				const task = this.#domUpdateTask;
				const nodeList = this.#nodeList;
				this.#domUpdateTask = new Set();
				this.#nodeList = new Set();
				this.#domUpdateFlag = false;
				// onBeforeUpdate()の発火
				nodeList.forEach(node => node.onBeforeUpdate());
				task.forEach(t => t());
				// onAfterUpdate()の発火
				nodeList.forEach(node => node.onAfterUpdate());
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
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional() { throw new Error('not implemented.'); }
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
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional() {
		return this;
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
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional() {
		const dest = this.ctx.useState(undefined);
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
		 * #onreferenceの形式の関数
		 * @param { State<T> } s
		 */
		const c = s => {
			s.#onreference = true;
			callback(s);
			return true;
		};
		if ((typeof this.#onreference === 'boolean') ? this.#onreference : (!this.#onreference && this.count > 0) || (this.#onreference && this.#onreference(this))) {
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
			const flag = (typeof this.#onreference === 'boolean') ? this.#onreference : (!this.#onreference && this.count > 0) || (this.#onreference && this.#onreference(this));
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
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional() {
		const dest = this.ctx.useState(undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest) };
	}

	get ctx() { return this.#state.ctx; }
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
 * @template { (ctx: Context, props: CompPropTypes<K> extends {} ? ({} | undefined) : CompPropTypes<K>, children: GenStateNode[] | undefined) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } K
 * @typedef { (ctx: Context, props: CompPropTypes<K> extends {} ? ({} | undefined) : CompPropTypes<K>, children: GenStateNode[] | undefined) => GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> } } ComponentType コンポーネントの型
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) { throw new Error('not implemented.'); }

	/**
	 * 子孫要素を構築する
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 */
	build(stateComponent) {
		const { calc, node } = this.#mountImpl(stateComponent);
		calc();
		return node;
	}

	/**
	 * DOMノードにマウントする
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 * @param { HTMLElement | undefined } target マウント対象のDOMノード
	 * @returns { { calc: () => void; node: StateNode } }
	 */
	#mountImpl(stateComponent, target) {
		/** @type { undefined | StateNode } */
		let resuleNode = undefined;

		// コンポーネントの下でノードが構築されるかの判定
		if (!(stateComponent || (this instanceof GenStateComponent))) {
			throw new Error('It must be built under the Component.');
		}

		const calc = this.#ctx.lazy(() => {
			/** @type { StateNode | undefined } */
			let _node = undefined;
			/** @type { GenStateNode | undefined } */
			let _gen = undefined;
			/** @type { GenStateNode[] } */
			let _children = [];

			// コンポーネントの評価(ルートノードによってはコンポーネントではない場合もある)
			try {
				({ node: _node, gen: _gen, children: _children } = this.buildCurrent(stateComponent, target));
			}
			catch (e) {
				if (!stateComponent) {
					// stateComponent配下の構築を破棄するためstateComponentで捕捉不可ならリスロー
					throw e;
				}
				stateComponent.onErrorCaptured(e, stateComponent);
				return;
			}
			resuleNode = _node;
			let component = _node instanceof StateComponent ? _node : stateComponent;

			/** @type { StateComponent<unknown>[] } コンポーネントについてのonMountを発火するためのスタック */
			const stackComponent = _node instanceof StateComponent ? [_node] : [];

			try {
				// atomicなノードが出現するまで繰り返し構築する
				// コンポーネントの子がコンポーネントの場合などに繰り返される
				// _genがundefinedならatomic
				while (_gen) {
					const { node, gen, children } = _gen.buildCurrent(component, target);
					_node = node;
					_gen = gen;
					// 既に子要素が設定されている場合は無視する
					_children = _children.length > 0 ? _children : children;
					if (_node instanceof StateComponent) {
						component = _node;
						stackComponent.push(_node);
					}
				}
			}
			catch (e) {
				if (component !== _node) {
					_node.remove();
				}
				component.onErrorCaptured(e, component);
				return;
			}

			/** @type { { component: StateComponent<unknown>, node: StateNode; children: GenStateNode[]; element: HTMLElement | Text | undefined }[] } コンポーネントについての幅優先探索に関するキュー */
			const queueComponent = [{ component, node: _node, children: _children, element: target }];
			
			while (queueComponent.length > 0) {
				/** @type { (typeof queueComponent)[number] } */
				const { component, node, children, element: localRoot } = queueComponent.shift();
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
							({ node: _node, gen: _gen, children: _children } = child.buildCurrent(component, target));
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
								const { node } = _gen.buildCurrent(component);
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
								const { node, children: grandchildren } = _gen.buildCurrent(component, childNode);
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
							let _component = component;
							try {
								// atomicなノードが出現するまで繰り返し構築する
								// コンポーネントの子がコンポーネントの場合などに繰り返される
								// _genがundefinedならatomic
								do {
									const { node, gen, children } = _gen.buildCurrent(_component, childNode);
									_node = node;
									_gen = gen;
									// 既に子要素が設定されている場合は無視する
									_children = _children.length > 0 ? _children : children;
									if (_node instanceof StateComponent) {
										_component = _node;
										stackComponent.push(_node);
									}
								} while (_gen);
								// 構築対象のコンポーネントのpush
								queueComponent.push({ component: _component, node: _node, children: _children, element: childNode });
							}
							catch (e) {
								if (_component !== _node) {
									_node.remove();
								}
								_component.onErrorCaptured(e, _component);
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
						// GenStateComponent出ない場合は次の探索のセットアップ
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
		this.#mountImpl(undefined, target).calc();
	}

	/**
	 * 後からマウント可能なDOMノードを構築する
	 * @param { HTMLElement | undefined } target 書き込み対象のDOMノード
	 * @returns { HTMLElement }
	 */
	write(target) {
		// 変更の伝播を破棄する
		return this.#mountImpl(undefined, target).node.element;
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
		const ret = this.#gen.buildCurrent(stateComponent, target);
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateTextNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
		const text = this.#text;
		const element = document.createTextNode('');
		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// 子にテキストの状態が渡された場合は変更を監視する
		const caller = this.ctx.setParam(text, val => {
			element.data = val;
		}, stateComponent.label);
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateHTMLElement; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
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
	 * @param { GenStateNode[] } children 子要素
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateDomNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
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
		const label = stateComponent.label;

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
				}, label);
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
	/** @type { StateComponent<unknown> | undefined } 親コンポーネント */
	#parent = undefined;
	/** @type { GenStateNode } #elementを生成するノード */
	#genStateNode;
	/** @type { StateNode | undefined } コンポーネントを代表するノード */
	#element = undefined;
	/** @type { LifeCycle } ライフサイクル */
	#lifecycle;
	/** @type { DomUpdateCallerLabel | undefined } DOM更新の際に用いるラベル */
	#label = undefined;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 * @param { LifeCycle } lifecycle ライフサイクル
	 * @param { CtxCompPropTypes<K> } props プロパティ
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 * @param { GenStateNode } genStateNode コンポーネントを示すノード
	 * @param { { gen?: GenStateNode; children?: GenStateNode[] } } result ノードの生成結果を示すオブジェクト
	 */
	constructor(ctx, parent, lifecycle, callerList, genStateNode, result) {
		super(ctx, callerList);

		this.#parent = parent;
		this.#genStateNode = genStateNode;
		this.#lifecycle = lifecycle;

		if (!genStateNode.isAtomic && !(genStateNode instanceof GenStateComponent)) {
			try {
				({ node: this.#element, gen: result.gen, children: result.children } = genStateNode.buildCurrent());
			}
			catch (e) {
				// コンポーネントの要素の構築をキャンセルし、現在の要素としてはダミーを設置
				// 復帰が可能でありかつ復帰を行う場合はthis.rebuild()により行う
				result.gen = new GetGenStateNode(new GenStateTextNode(this.ctx, ''), node => this.#element = node);
				result.children = [];
				this.onErrorCaptured(e, this);
			}
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
	 * ラベルの取得
	 */
	get label() { return this.#label || (this.#label = new DomUpdateCallerLabel(this)); }

	/**
	 * コンポーネントを再構築する
	 */
	rebuild() {
		const element = this.element;
		this.#element?.remove();
		this.#element = this.#genStateNode.build(this);
		// ノードの付け替えが可能な場合は付け替える
		const element2 = this.#element.element;
		if (element && element2) {
			element2.replaceWith(element);
		}
	}

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element?.remove();
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
	 * @param { CtxChildType<K> } children 子要素
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
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> | undefined } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateComponent; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
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
			if (val instanceof IState) {
				const { state, caller } = val.unidirectional();
				if (caller && caller.states.length > 0) callerList.push(caller);
				compProps[key] = state;
			}
			else {
				// 値が与えられなかった場合はデフォルト値から持ってくる
				const val2 = val === undefined || val === null || val === false ? this.#component.propTypes[key] : val;
				if (val2 !== undefined && val2 !== null && val2 !== false) {
					// IStateとなるように伝播
					compProps[key] = new NotState(val2);
				}
			}
		}

		// ノードの生成
		/** @type { GenStateNode | undefined } */
		let genStateNode = undefined;
		/** @type { ComponentExposeStates<K> | {} } コンポーネントが公開している状態 */
		let exposeStates = {};
		/** @type { LifeCycle } */
		let _lifecycle = {};
		try {
			const { compResult, lifecycle } = this.ctx.buildComponent(this.#component, compProps, this.#children);
			if (compResult instanceof GenStateNode) {
				genStateNode = compResult;
			}
			else {
				genStateNode = compResult.node;
				exposeStates = compResult.exposeStates ?? {};
			}
			_lifecycle = lifecycle;
		}
		catch (e) {
			// 状態変数の関連付けを破棄してから例外をリスロー
			callerList.forEach(caller => caller.states.forEach(state => state.delete(caller.caller)));
			throw e;
		}

		// 観測の評価
		if (this.#observableStates) {
			this.#observeImpl(this.#observableStates, exposeStates);
			this.#observableStates = undefined;
		}

		/** @type { { gen?: GenStateNode; children?: GenStateNode[] } } */
		const result = {};
		// atomicでないノードを生成してresultの情報を返す
		const node = new StateComponent(this.ctx, stateComponent, _lifecycle, callerList, genStateNode, result);

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
 * @typedef { ([(val: ElementTypeOfState<T>) => boolean, GenStateNode | (val: ElementTypeOfState<T>) => GenStateNode] | [GenStateNode | (val: ElementTypeOfState<T>) => GenStateNode])[] } StateChooseNodeChildType StateChooseNodeで用いる子要素の型
 */

/**
 * ノードを選択するノード
 * @template T
 */
class StateChooseNode extends StateNode {
	/** @type { StateComponent<unknown> } ノードを生成する場所 */
	#stateComponent;
	/** @type { {} } chooseについてのプロパティ(現在はなし) */
	#props;
	/** @type { { caller: CallerType; states: State<unknown>[] } | undefined } 表示の切り替えに関する呼び出し元 */
	#caller = undefined;
	/** @type { StateNode | undefined } 現在表示しているノード */
	#currentNode = undefined;
	/** @type { number } 前回選択した要素のインデックス */
	#prevChooseIndex = -1;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K> } K
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { StateChooseNodeChildType<T> } children valからDOMノードを選択するオブジェクト
	 * @param { { gen?: GenStateNode; children?: GenStateNode[] } } result ノードの生成結果を示すオブジェクト
	 */
	constructor(ctx, stateComponent, props, val, children, result) {
		super(ctx, []);
		this.#stateComponent = stateComponent;
		this.#props = props;
		const caller = ctx.setParam(val, val => {
			// DOMノードが構築されたことがある場合にのみ構築する
			const element = this.element;
			if (element) {
				const parent = element.parentElement;
				const nextSibling = element.nextElementSibling;
				const prevNode = this.#currentNode;
				// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
				const genStateNode = this.#chooseNode(val, children);

				if (genStateNode) {
					// ノードを構築
					this.#currentNode = genStateNode.build(this.#stateComponent);
					// 初期表示以降はDOMの更新する関数を通して構築する
					const insertElement = this.element;
					this.ctx.updateStateDom(() => {
						prevNode?.remove();
						parent.insertBefore(insertElement, nextSibling);
					}, this.#stateComponent);
				}
			}
		});
		if (caller) {
			this.callerList.push(caller);
		}

		// 初期表示の設定(初期表示はgenStateNodeはundefined)
		const genStateNode = this.#chooseNode(this.ctx.useParam(val), children);

		if (!genStateNode.isAtomic && !(genStateNode instanceof GenStateComponent)) {
			try {
				({ gen: result.gen, children: result.children } = genStateNode.buildCurrent(this.#stateComponent));
			}
			catch (e) {
				// コンポーネントの要素の構築をキャンセルし、現在の要素としてはダミーを設置
				// 復帰が可能でありかつ復帰を行う場合はthis.#chooseNode()により行う
				result.gen = new GetGenStateNode(new GenStateTextNode(this.ctx, ''), node => this.#currentNode = node);
				result.children = [];
				this.#stateComponent.onErrorCaptured(e, this);
			}
		}
		else {
			result.gen = new GetGenStateNode(genStateNode, node => this.#currentNode = node);
			result.children = [];
		}
	}

	/**
	 * childrenからノードを選択する
	 * @param { ElementTypeOfState<T> } val 表示対象を切り替える基準となる変数
	 * @param { StateChooseNodeChildType<T> } children valからDOMノードを選択するオブジェクト
	 */
	#chooseNode(val, children) {
		/** @type { [] | [GenStateNode] } */
		let nodeList = [];
		let i = 0
		let genStateNodeFlag = false;
		for (; i < children.length; ++i) {
			const child = children[i];
			// 条件式が設定されていない場合
			if (child.length === 1) {
				const c = child[0];
				genStateNodeFlag = c instanceof GenStateNode;
				nodeList = this.ctx.normalizeCtxChild([genStateNodeFlag ? c : c()]);
				break;
			}
			// 条件式が設定されている場合
			if (child[0](val)) {
				const c = child[1];
				genStateNodeFlag = c instanceof GenStateNode;
				nodeList = this.ctx.normalizeCtxChild([genStateNodeFlag ? c : c()]);
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
		else if (!this.#currentNode) {
			// 表示する要素が存在しないときは代わりにプレースホルダとして空のTextを表示
			return new GenStateTextNode(this.ctx, '');
		}
		return undefined;
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
	/** @type { StateChooseNodeChildType<T> } valからDOMノードを選択するオブジェクト */
	#children;

	/**
	 * コンストラクタ
	 * @param { Context } ctx StateNodeを生成するコンテキスト
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { StateChooseNodeChildType<T> } children valからDOMノードを選択するオブジェクト
	 */
	constructor(ctx, props, val, children) {
		super(ctx);
		this.#props = props;
		this.#val = val;
		this.#children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateChooseNode }
	 */
	clone() {
		return new GenStateChooseNode(this.ctx, this.#props, this.#val, this.#children);
	}

	/**
	 * 自要素を構築する
	 * @template { ComponentType<K> } K
	 * @param { StateComponent<K> } stateComponent ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateChooseNode; gen?: GenStateNode; children: GenStateNode[] } }
	 */
	buildCurrent(stateComponent, target) {
		/** @type { { gen?: GenStateNode; children?: GenStateNode[] } } */
		const result = {};
		// atomicでないノードを生成してresultの情報を返す
		const node = new StateChooseNode(this.ctx, stateComponent, { ...this.#props }, this.#val, this.#children, result);
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
 * @typedef { IState<T> | T } CtxValueType コンテキスト上での値の型
 */

/**
 * @template T
 * @typedef { { [K in keyof T]: CtxValueType<T[K] | null | undefined> } } CtxPropTypes コンテキスト上でのプロパティの型
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
 * @typedef { CtxPropTypes<
 * 		RemoveReadonlyProperty<RemoveFunction<T>> &
 * 		{ style: CtxPropTypes<CamelToKebabObject<RemoveReadonlyProperty<RemoveFunction<CSSStyleDeclaration>>> & Record<string, string>> }
 * > } CtxDomPropTypes コンテキスト上でのDOMのプロパティの型
 */

/**
 * @template { string | ComponentType<K> } K
 * @typedef { K extends string
 * 		? (GenStateNode | Text | CtxValueType<string>)[]
 * 		: Parameters<K>[2] extends undefined ? [] : TransformGenStateNodeToCtxChildType<Parameters<K>[2]>
 * } CtxChildType コンテキスト上での子要素の型
 */

/**
 * @template { unknown[] } T
 * @typedef {{
 * 		[K in keyof T]: GenStateNode extends T[K] ? (GenStateNode | Text | CtxValueType<string>)
 * 		: GenStateTextNode extends T[K] ? (Text | CtxValueType<string>) : T[K];
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
	/** @type { LifeCycle[] } コンポーネントに設置されたライフサイクルに関するスタック */
	#lifecycleStack = [];

	/** @type { DomUpdateController } DOMの更新のためのコントローラ */
	#domUpdateController = new DomUpdateController();
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
			if (val.label) {
				val.label.update(val.caller);
			}
			// 未定義の場合は同期的に即時評価
			else {
				val.caller();
			}
		}
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { Function } caller 状態の参照先
	 * @param { StateNode } node 更新対象のノード
	 */
	updateStateDom(caller, node) {
		this.#domUpdateController.update(caller, node);
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
	 * @param { CtxChildType<'div'> } nodeList 対象のノード
	 * @return { GenStateNode[] }
	 */
	normalizeCtxChild(nodeList) {
		const result = [];
		nodeList.forEach(e => {
			// 子にテキストの状態が渡された場合は変更を監視する
			if (e instanceof IState) {
				result.push(new GenStateTextNode(this, e));
			}
			else if (typeof e === 'string') {
				result.push(new GenStateTextNode(this, e));
			}
			else if (e instanceof Text) {
				result.push(new GenStateTextNode(this, e.data));
			}
			else {
				result.push(e);
			}
		});
		return result;
	};

	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { K } tag HTMLタグ
	 * @param { K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K> } props プロパティ
	 * @param { CtxChildType<K> } children 子要素
	 * @returns { K extends string ? GenStateDomNode<K> : GenStateComponent<K> }
	 */
	/**
	 * @template { string | ComponentType<K> } K
	 * @overload
	 * @param { K } tag HTMLタグ
	 * @param { CtxChildType<K> } props 子要素
	 * @param { [] } children 略
	 * @returns { K extends string ? GenStateDomNode<K> : GenStateComponent<K> }
	 */
	/**
	 * DOMノード/コンポーネントの生成
	 * @template { string | ComponentType<K> } K
	 * @param { K } tag HTMLタグ
	 * @param { (K extends string ? CtxDomPropTypes<CreatedElementType<K>> : CtxCompPropTypes<K>) | CtxChildType<K> } props プロパティ
	 * @param { CtxChildType<K> | undefined } children 子要素
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
	 * ノードを選択するノードの生成
	 * @template T
	 * @param { {} } props chooseについてのプロパティ(現在はなし)
	 * @param { T } val 表示対象を切り替える基準となる変数
	 * @param { StateChooseNodeChildType<T> } children valからDOMノードを選択するオブジェクト
	 * @returns { StateChooseNode<T> }
	 */
	choose(props, val, children) {
		return new GenStateChooseNode(this, props, val, children);
	}

	/**
	 * コンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 */
	buildComponent(component, props, children) {
		/** @type { LifeCycle } */
		const lifecycle = {};
		this.#lifecycleStack.push(lifecycle);
		const compResult = component(this, props, children);
		this.#lifecycleStack.pop();
		return { compResult, lifecycle };
	}

	/**
	 * ライフサイクルの設定
	 * @param { Exclude<LifeCycle[key], undefined>[number] } callback ライフサイクルで呼びだすコールバック
	 * @param { keyof LifeCycle } key 設定対象のライフサイクルを示すキー
	 */
	#onLifeCycle(callback, key) {
		if (this.#lifecycleStack.length === 0) {
			throw new Error('This function should not be called except to initialize a component.');
		}
		const comp = this.#lifecycleStack[this.#lifecycleStack.length - 1];
		comp[key] = comp[key] || [];
		comp[key].push(callback);
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
	const trigger = ctx2.useState(-1);
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

export { GenStateNode, GenStateTextNode, Context, watch };
