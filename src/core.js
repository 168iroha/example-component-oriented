/**
 * @typedef {{
 * 		label?: ICallerLabel | undefined;
 * 		caller: ()=> unknown;
 * }} CallerType 状態変数における呼び出し元についての型
 */

/**
 * CallerTypeに対するラベルのインターフェース
 * @interface
 */
class ICallerLabel {
	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) { throw new Error('not implemented.'); }

	/**
	 * 蓄積した更新を処理する
	 */
	proc() { throw new Error('not implemented.'); }
}

/**
 * DOM更新のためのCallerTypeに対するラベルの型
 * @template { ComponentType<K> } K
 * @implements { ICallerLabel }
 */
class DomUpdateLabel {
	/** @type { StateComponent<K> } 更新対象となるコンポーネント */
	#component;
	/** @type { Set<CallerType['caller']> } DOM更新のためのcallerの集合 */
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
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) {
		// Context経由でDomUpdateControllerのメソッドを呼び出す
		this.#domUpdateTaskSet.add(caller);
		this.#component.ctx.update(this);
	}

	/**
	 * 蓄積した更新を処理する
	 */
	proc() {
		const taskSet = this.#domUpdateTaskSet;
		this.#domUpdateTaskSet = new Set();

		// DOM更新の前後でupdateライフサイクルフックを発火しつつタスクを実行する
		this.#component.onBeforeUpdate();
		for (const task of taskSet) {
			// DOM更新は同期的に行われるべきのため非同期関数の場合は考慮しない
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
 * コンポーネント上での状態の更新に対するラベルの型
 * @template { ComponentType<K> } K
 * @implements { ICallerLabel }
 */
class ComponentLabel {
	/** @type { StateComponent<K> } 更新対象となるコンポーネント */
	#component;

	/**
	 * コンストラクタ
	 * @param { StateComponent<K> } component 更新対象とみることができるコンポーネント
	 */
	constructor(component) {
		this.#component = component;
	}

	/**
	 * 状態の更新の蓄積を行う
	 * @param { CallerType['caller'] } caller 状態の参照先
	 */
	update(caller) {
		createWrapperFunction(caller, this.#component)();
	}

	/**
	 * 蓄積した更新を処理する
	 */
	proc() {}
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
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) { throw new Error('not implemented.'); }

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	observe(ctx, label = undefined) { throw new Error('not implemented.'); }

	/**
	 * 状態変数が属するコンテキストの取得
	 * @returns { StateContext | undefined }
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
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		return { state: this };
	}

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	observe(ctx, label = undefined) {
		return { state: this };
	}
}

/**
 * 状態変数
 * @template T
 * @extends { IState<T> }
 */
class State extends IState {
	/** @type { StateContext } 状態変数の扱っているコンテキスト */
	#ctx;
	/** @type { T } 状態変数の本体 */
	#value;
	/** @type { Set<CallerType> } 呼び出し元のハンドラのリスト */
	#callerList = new Set();
	/** @type { ((val: State<T>) => boolean) | undefined | boolean } 状態変数の参照が存在しだしたタイミングに1度のみ呼びだされるイベントのハンドラ */
	#onreference = undefined;

	/**
	 * コンストラクタ
	 * @param { StateContext } ctx 状態変数を扱っているコンテキスト
	 * @param { T } value 状態変数の初期値
	 */
	constructor(ctx, value) {
		super();
		this.#ctx = ctx;
		this.#value = value;
	}

	get value() {
		// 呼び出し元が有効なら追加する
		const current = this.#ctx.current;
		if (current && !this.#callerList.has(current.caller)) {
			this.#ctx.notify(this);
			this.#callerList.add(current.caller);
		}
		return this.#value;
	}

	set value(value) {
		if (value !== this.#value) {
			this.#value = value;
			this.#ctx.update(this.#callerList);
		}
	}

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		const dest = new State(ctx, undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest, label) };
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
	 * thisを観測するデータの作成
	 * @overload
	 * @param { StateContext } prop 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	/**
	 * propの観測(onreferenceの連鎖的な追跡も実施する)
	 * @overload
	 * @param { CtxValueType<T> | () => T } prop 観測対象の変数
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { caller: CallerType; states: State<unknown>[] } | undefined } 呼び出し元情報
	 */
	/**
	 * propの観測(onreferenceの連鎖的な追跡も実施する)/thisを観測するデータの作成
	 * @param { CtxValueType<T> | (() => T) | StateContext } prop 観測対象の変数/生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 */
	observe(prop, label = undefined) {
		if (prop instanceof StateContext) {
			/** @type { State<T> } */
			const state = new State(prop, undefined);
			return { state, caller: state.observe(this, label) };
		}
		if (prop instanceof State || prop instanceof Computed || prop instanceof Function) {
			// onreferenceが発火しないように無効化
			const caller = this.ctx.noreference(() => this.ctx.unidirectional(prop, this, label));
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

			return caller;
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
	 * @param { StateContext } ctx 状態変数を扱っているコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @param { () => T } f 算出プロパティを計算する関数
	 */
	constructor(ctx, f, label = undefined) {
		super();
		this.#state = new State(ctx, undefined);
		this.#state.observe(f, label);
	}

	get value() { return this.#state.value; }

	/**
	 * 単方向データの作成
	 * @param { StateContext } ctx 生成する単方向データが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	unidirectional(ctx, label = undefined) {
		const dest = new State(ctx, undefined);
		return { state: dest, caller: this.ctx.unidirectional(this, dest, label) };
	}

	/**
	 * thisを観測するデータの作成
	 * @param { StateContext } ctx 生成するデータが属するコンテキスト
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { state: IState<T>; caller?: { caller: CallerType; states: State<unknown>[] }} } 呼び出し元情報
	 */
	observe(ctx, label = undefined) {
		/** @type { State<T> } */
		const state = new State(ctx, undefined);
		return { state, caller: state.observe(this, label) };
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
 * @template { (ctx: Context, props: CompPropTypes<K> | undefined, children: (GenStateNode | GenStateNodeSet)[] | undefined) => (GenStateNode | { node: GenStateNode; exposeStates?: Record<string, unknown> }) } K
 * @typedef { (...args: Parameters<K>) => ReturnType<K> } ComponentType コンポーネントの型
 */

/**
 * @template { ComponentType<K> } K
 * @typedef { (...args: Parameters<K>) => Promise<ReturnType<K>> } AsyncComponentType 非同期コンポーネントの型
 */

/**
 * @template { (props: CompPropTypes<K> | undefined, children: unknown) => (GenStateNode | GenStateNodeSet) } K
 * @typedef { ((...args: Parameters<K>) => ReturnType<K>) & { early: true } } PseudoComponentType 擬似コンポーネントの型
 */

/**
 * @template { (a: unknown, b?: unknown, c?: unknown[]) => unknown } T
 * @typedef { undefined extends Parameters<T>[2] ? [] : Parameters<T>[2] } CompChildrenType コンポーネントの子要素の型
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
 * @typedef {{
 * 		ctx?: State<Context>;
 * 		node?: State<StateNode>;
 * }} ReferrablePropsInStateNode StateNodeで参照可能な要素
 */

/**
 * @typedef {{
 * 		ctx?: State<Context>;
 * 		set?: State<StateNodeSet>;
 * }} ReferrablePropsInStateNodeSet StateNodeSetで参照可能な要素
 */

/**
 * 状態を持ったノード
 */
class StateNode {
	/** @protected @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト(これの破棄により親との関連付けが破棄される) */
	callerList;

	/**
	 * コンストラクタ
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(callerList = []) {
		this.callerList = callerList;
	}

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
		this.element?.remove();
		this.callerList = [];
	}

	/**
	 * ノードの取り外し
	 */
	detach() {
		this.element?.remove();
	}
}

/**
 * StateNodeを生成するためのノード
 */
class GenStateNode {
	/** @protected @type { ((node: StateNode) => unknown)[] } buildCurrent時に同期的に生成したStateNodeを配信するためのコールバックのリスト */
	#deliverStateNodeCallback = [];
	/** @type { ReferrablePropsInStateNode | undefined } 参照する対象 */
	#referrableStates = undefined;

	/**
	 * ノードの参照を行う
	 * @param { ReferrablePropsInStateNode } props 観測する対象
	 */
	ref(props) {
		this.#referrableStates = props;
		return this;
	}

	/**
	 * buildCurrent時にStateNodeを取得するためのコールバックの指定
	 * @param { (node: StateNode) => unknown } callback StateNodeを取得するためのコールバック
	 */
	getStateNode(callback) {
		this.#deliverStateNodeCallback.push(callback);
		return this;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateNode }
	 */
	clone() { throw new Error('not implemented.'); }

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) { throw new Error('not implemented.'); }

	/**
	 * 自要素を構築する
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrent(ctx, target) {
		const ret = this.buildCurrentImpl(ctx, target);
		this.#deliverStateNodeCallback.forEach(callback => callback(ret.node));
		this.#deliverStateNodeCallback = [];
		if (this.#referrableStates) {
			// 参照の評価
			if (this.#referrableStates.node) {
				this.#referrableStates.node.value = ret.node;
			}
			if (this.#referrableStates.ctx) {
				// コンポーネントなら保持しているコンテキストを渡す
				this.#referrableStates.ctx.value = ret.node instanceof StateComponent ? ret.node.ctx : ctx;
			}
		}
		return ret;
	}

	/**
	 * 子孫要素を構築する
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	build(ctx = undefined) {
		const { calc, node } = this.#mountImpl(ctx ?? new Context());
		calc();
		return node;
	}

	/**
	 * コンポーネントに対してマウントを試みる
	 * @param { Context } ctx コンポーネントを構築するコンテキス
	 * @param { GenStateNode } gen コンポーネントを生成する対象
	 * @param { HTMLElement | undefined } element マウントに用いるDOMノード
	 * @returns 
	 */
	#mountComponent(ctx, gen, element) {
		/** @type { StateComponent | undefined } */
		let prevNode = undefined;
		while (gen instanceof GenStateComponent) {
			const { node, children } = gen.buildCurrent(ctx, element);
			if ((prevNode instanceof StateComponent) && !(prevNode instanceof StateAsyncComponent)) {
				prevNode.onMount();
			}
			// コンポーネントの子は1つのみかつ必ず存在する
			gen = children[0].node;
			ctx = children[0].ctx;
			prevNode = node;
		}
		// elementが与えられたならばこのタイミングでマウントされる
		return { ctx, ...gen.buildCurrent(ctx, element) };
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
		this.getStateNode(node => resuleNode = node);

		// コンポーネントの下でノードが構築されるかの判定
		const rootComponent = ctx.component;
		if (!(rootComponent || (this instanceof GenStateComponent))) {
			throw new Error('It must be built under the Component.');
		}

		const calc = ctx.state.lazy(() => {
			const ret = this.#mountComponent(ctx, this, target);

			/** @type { { ctx: Context, node: StateNode; children: { node: GenStateNode; ctx: Context }[]; element: HTMLElement | Text | undefined }[] } コンポーネントについての幅優先探索に関するキュー */
			const queueComponent = [{ ...ret, element: target }];
			
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
					const { children, element } = queueNode.shift();
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
						const { node: gen, ctx: childCtx } = children[i];
						const childNode = cnt < childNodes.length ? childNodes[cnt++] : undefined;
						// ノードの比較を実施(genはundefinedにはならない)
						if (gen instanceof GenStateComponent) {
							if (useChildNodes && !childNode && !(gen instanceof GenStateAsyncComponent)) {
								throw new Error('The number of nodes is insufficient.');
							}
							// 子要素をコンポーネントを生成するノードで置き換え
							children[i] = gen;
						}
						else {
							if (gen instanceof GenStateTextNode || gen instanceof GenStatePlaceholderNode) {
								const { node } = gen.buildCurrent(childCtx);
								// 子要素をStateNodeで置き換え
								children[i] = { node, children: [], element: node.element };
								// テキストノードもしくはplaceholderであれば挿入して補完する
								if (useChildNodes) {
									element.insertBefore(node.element, childNode);
									++cnt;
								}
							}
							else {
								if (useChildNodes && !childNode) {
									throw new Error('The number of nodes is insufficient.');
								}
								const { node, children: _children } = gen.buildCurrent(childCtx, childNode);
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
					const parent = node.element;
					let childNode = element?.firstChild;
					for (let i = 0; i < children.length; ++i) {
						const child = children[i];
						let node = undefined;
						// GenStateComponentの場合はカレントノードを構築する
						if (child instanceof GenStateComponent) {
							const ret = this.#mountComponent(ctx, child, childNode);
							node = ret.node;
							queueComponent.push({ ...ret, element: childNode });
						}
						else {
							node = child.node;
						}
						// elementに子要素が存在しない場合にのみ子を追加する
						if (!childNode) {
							parent.appendChild(node.element);
						}
						// GenStateComponentでない場合は次の探索のセットアップ
						if (!(child instanceof GenStateNode)) {
							queueNode.push(child);
						}
						childNode = childNode?.nextSibling;
					}
				}

				// コンポーネント配下のコンポーネントが構築完了したためonMountを発火
				const component = ctx.component;
				if ((component !== rootComponent) && !(component instanceof StateAsyncComponent)) {
					component.onMount();
				}
			}
		});
		return { calc, node: resuleNode };
	}

	/**
	 * DOMノードにマウントする
	 * @param { HTMLElement } target マウント対象のDOMノード
	 * @param { Context | undefined } ctx ノードを生成する場所
	 */
	mount(target, ctx = undefined) {
		this.#mountImpl(ctx ?? new Context(), target).calc();
	}

	/**
	 * 後からマウント可能なDOMノードを構築する
	 * @param { HTMLElement | undefined } target 書き込み対象のDOMノード
	 * @param { Context | undefined } ctx ノードを生成する場所
	 * @returns { HTMLElement }
	 */
	write(target, ctx = undefined) {
		// 変更の伝播を破棄する
		return this.#mountImpl(ctx ?? new Context(), target).node.element;
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
	 * @param { { node: GenStateNode; ctx: Context }[] } sibling 構築結果の兄弟要素を格納する配列
	 */
	constructor(ctx, nestedNodeSet, sibling) {
		for (const nestedNode of nestedNodeSet) {
			if (nestedNode instanceof GenStateNode) {
				// GenStateNodeの場合は後からノードをセットされるようにする
				this.nestedNodeSet.push(undefined);
				const i = this.nestedNodeSet.length - 1;
				nestedNode.getStateNode(node => this.nestedNodeSet[i] = node);
				sibling.push({ node: nestedNode, ctx });
			}
			else {
				// GenStateNodeSetの場合はそれを評価してノードをセットする
				const { set, sibling: sibling_ } = nestedNode.buildStateNodeSet(ctx);
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
			node.detach();
		}
	}
}

/**
 * ノードの集合を生成するためのノードの集合
 */
class GenStateNodeSet {
	/** @protected @type { (GenStateNode | GenStateNodeSet)[] } 管理しているネストを許容したノードの集合 */
	nestedNodeSet;
	/** @protected @type { ((node: StateNodeSet) => unknown)[] } buildCurrent時に同期的に生成したStateNodeを配信するためのコールバックのリスト */
	#deliverStateNodeSetCallback = [];
	/** @type { ReferrablePropsInStateNodeSet | undefined } 参照する対象 */
	#referrableStates = undefined;

	/**
	 * コンストラクタ
	 * @param { (GenStateNode | GenStateNodeSet)[] } nestedNodeSet ネストを許容したノードの集合
	 */
	constructor(nestedNodeSet) {
		this.nestedNodeSet= nestedNodeSet;
	}

	/**
	 * ノードの参照を行う
	 * @param { ReferrablePropsInStateNodeSet } props 観測する対象
	 */
	ref(props) {
		this.#referrableStates = props;
		return this;
	}

	/**
	 * buildStateNodeSet時にStateNodeSetを取得するためのコールバックの指定
	 * @param { (node: StateNodeSet) => unknown } callback StateNodeを取得するためのコールバック
	 */
	getStateNodeSet(callback) {
		this.#deliverStateNodeSetCallback.push(callback);
		return this;
	}

	/**
	 * 保持しているノードの取得と構築
	 * @protected
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; ctx: Context; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSetImpl(ctx) {
		/** @type { { node: GenStateNode; ctx: Context }[] } */
		const sibling = [];
		const set = new StateNodeSet(ctx, this.nestedNodeSet, sibling);
		return { set, ctx, sibling };
	}

	/**
	 * 保持しているノードの取得と構築
	 * @param { Context } ctx コンテキスト
	 * @returns { { set: StateNodeSet; ctx: Context; sibling: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildStateNodeSet(ctx) {
		const ret = this.buildStateNodeSetImpl(ctx);
		this.#deliverStateNodeSetCallback.forEach(callback => callback(ret.set));
		this.#deliverStateNodeSetCallback = [];
		if (this.#referrableStates) {
			// 参照の評価
			if (this.#referrableStates.set) {
				this.#referrableStates.set.value = ret.set;
			}
			if (this.#referrableStates.ctx) {
				this.#referrableStates.ctx.value = ret.ctx;
			}
		}
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
	 * @param { Text } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { Text | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element = undefined;
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
	 * @param { CtxValueType<string> } text テキスト
	 */
	constructor(text) {
		super();
		this.#text = text;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateTextNode }
	 */
	clone() {
		return new GenStateTextNode(this.#text);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) {
		const text = this.#text;
		const element = document.createTextNode('');
		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		// 子にテキストの状態が渡された場合は変更を監視する
		const caller = setParam(text, val => element.data = val, ctx.component.domUpdateLabel);
		if (caller && caller.states.length > 0) callerList.push(caller);

		return { node: new StateTextNode(element, callerList), children: [] };
	}
}

/**
 * placeholderを示すノード
 */
class StatePlaceholderNode extends StateNode {
	/** @type { Text } DOMノード */
	#element;

	/**
	 * コンストラクタ
	 * @param { Text } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { Text | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element = undefined;
	}
}

/**
 * StatePlaceholderNodeを生成するためのノード
 */
class GenStatePlaceholderNode extends GenStateNode {
	/**
	 * コンストラクタ
	 */
	constructor() {
		super();
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStatePlaceholderNode }
	 */
	clone() {
		return new GenStatePlaceholderNode();
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) {
		const element = document.createTextNode('');
		return { node: new StatePlaceholderNode(element), children: [] };
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
	 * @param { HTMLElement } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element = undefined;
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
	 * @param { HTMLElement } element DOMノード
	 */
	constructor(element) {
		super();
		this.#element = element;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateHTMLElement }
	 */
	clone() {
		return new GenStateHTMLElement(this.#element);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) {
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

		return { node: new StateHTMLElement(element), children: [] };
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
	 * @param { HTMLElement } element DOMノード
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(element, callerList) {
		super(callerList);
		this.#element = element;
	}

	/**
	 * DOMノードの取得
	 * @returns { HTMLElement | undefined }
	 */
	get element() { return this.#element; }

	/**
	 * ノードの削除
	 */
	remove() {
		super.remove();
		this.#element = undefined;
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
	 * @param { K } tag HTMLタグ
	 * @param { CtxDomPropTypes<CreatedElementType<K>> } props プロパティ
	 * @param { (GenStateNode | GenStateNodeSet)[] } children 子要素
	 */
	constructor(tag, props, children) {
		super();
		this.#tag = tag;
		this.#props = props;
		this.#children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateDomNode<K> }
	 */
	clone() {
		return new GenStateDomNode(this.#tag, this.#props, this.#children);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) {
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
		const domUpdateLabel = ctx.component.domUpdateLabel;

		// プロパティの設定
		for (const key in this.#props) {
			const val = this.#props[key];
			if (val !== undefined && val !== null && val !== false) {
				const caller = setParam(val, val => {
					// 属性とプロパティで動作に差異のある対象の設定
					const lowerTag = this.#tag.toLowerCase();
					// styleはオブジェクト型による設定を許容するため処理を特殊化
					if (key === 'style') {
						if (val !== undefined && val !== null && val !== false) {
							for (const styleKey in val) {
								const caller = setParam(
									val[styleKey],
									val => element.style.setProperty(styleKey, val ?? ''),
									domUpdateLabel
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
				}, domUpdateLabel);
				if (caller && caller.states.length > 0) callerList.push(caller);
			}
		}

		// 子要素の構築
		/** @type { { node: GenStateNode; ctx: Context }[] } */
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
			this.#observeImpl(ctx, this.#observableStates, element);
		}

		this.#genFlag = true;

		return { node: new StateDomNode(element, callerList), children };
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
	 * @param { Context } ctx ノードを生成する場所
	 * @param { ObservableStates<K> } props 観測する対象
	 * @param { HTMLElement } element 観測する対象をもつ要素
	 */
	#observeImpl(ctx, props, element) {
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
				const resizeObserver = new ResizeObserver(entries => setter(element));
				resizeObserver.observe(element);
			}, props, ['clientHeigth', 'clientWidth']);
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
	/** @type { Context } コンポーネントを示すコンテキスト */
	#ctx;
	/** @type { StateComponent<unknown> | undefined } 親コンポーネント */
	#parent = undefined;
	/** @protected @type { GenStateNode } nodeを生成するノード */
	genStateNode;
	/** @protected @type { StateNode | undefined } コンポーネントを代表するノード */
	node = undefined;
	/** @type { DomUpdateLabel<K> | undefined } DOM更新の際に用いるラベル */
	#domUpdateLabel = undefined;
	/** @type { ComponentLabel<K> | undefined } コンポーネント上での更新の際に用いるラベル */
	#componentLabel = undefined;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, parent, callerList) {
		super(callerList);
		this.#ctx = ctx;
		this.#parent = parent;
	}

	/**
	 * コンポーネントを示すコンテキストの取得
	 */
	get ctx() { return this.#ctx; }

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
	 * DOM更新の際に用いるラベル
	 */
	get domUpdateLabel() { return this.#domUpdateLabel || (this.#domUpdateLabel = new DomUpdateLabel(this)); }

	/**
	 * コンポーネント上での更新の際に用いるラベル
	 */
	get componentLabel() { return this.#componentLabel || (this.#componentLabel = new ComponentLabel(this)); }

	/**
	 * コンポーネントを構築する
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return { GenStateNode }
	 */
	build(component, props, children, observableStates) {

		// ノードの生成
		try {
			this.genStateNode = this.#ctx.buildComponent(component, props, children, observableStates);
		}
		catch (e) {
			// 状態変数の関連付けを破棄してから例外をリスロー
			this.remove();
			throw e;
		}

		return this.genStateNode.getStateNode(node => this.node = node);
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
		if (this.#ctx.lifecycle.onMount) {
			this.#ctx.state.update(this.#ctx.lifecycle.onMount);
		}
	}

	onUnmount() {
		if (this.#ctx.lifecycle.onUnmount) {
			this.#ctx.state.update(this.#ctx.lifecycle.onUnmount);
		}
	}

	onBeforeUpdate() {
		if (this.#ctx.lifecycle.onBeforeUpdate) {
			this.#ctx.state.update(this.#ctx.lifecycle.onBeforeUpdate);
		}
	}

	onAfterUpdate() {
		if (this.#ctx.lifecycle.onAfterUpdate) {
			this.#ctx.state.update(this.#ctx.lifecycle.onAfterUpdate);
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
		if (this.#ctx.lifecycle.onErrorCaptured) {
			prop = false;
			// 遅延評価せず即時に評価する
			for (const callback of this.#ctx.lifecycle.onErrorCaptured) {
				const val = callback(error, component);
				if (val !== false) {
					prop = true;
				}
			}
			handledTimes += this.#ctx.lifecycle.onErrorCaptured.length;
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
	/** @protected @type { Function } コンポーネントを示す関数 */
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
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 */
	constructor(component, props, children) {
		super();
		this.component = component;
		this.props = props;
		this.children = children;
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateComponent<K> }
	 */
	clone() {
		return new GenStateComponent(this.component, this.props, this.children);
	}

	/**
	 * StateComponentの生成
	 * @param { Context } ctx コンポーネントが属することになるコンテキスト
	 * @param { StateComponent | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	generateStateComponent(ctx, parent, callerList) {
		return new StateComponent(ctx, parent, callerList);
	}

	/**
	 * 自要素を構築する
	 * @protected
	 * @param { Context } ctx ノードを生成する場所
	 * @param { HTMLElement | Text | undefined } target マウント対象のDOMノード
	 * @returns { { node: StateNode; children: { node: GenStateNode; ctx: Context }[] } }
	 */
	buildCurrentImpl(ctx, target) {
		// 観測を行う同一ノードの2回以上の生成は禁止
		if (this.#genFlag && this.observableStates) {
			throw new Error('The buildCurrent in GenStateComponent must not be called more than twice.');
		}

		/** @type { { caller: CallerType; states: State<unknown>[] }[] } 呼び出し元のリスト */
		const callerList = [];

		/** @type { CompPropTypes<K> } コンポーネントに渡すプロパティ */
		const compProps = {};
		// プロパティは観測を行うような単方向データに変換して渡すようにする
		for (const key in this.props) {
			const { state, caller } = this.props[key].observe(ctx.state);
			if (caller && caller.states.length > 0) callerList.push(caller);
			compProps[key] = state;
		}

		/** 生成するコンポーネントが属するコンテキストとそのコンポーネント */
		const node = ctx.generateContextForComponent(_ctx => this.generateStateComponent(_ctx, ctx.component, callerList)).component;

		// コンポーネントを構築して返す
		const gen = node.build(this.component, compProps, this.children, this.observableStates);
		this.#genFlag = true;

		return { node, children: [{ node: gen, ctx: node.ctx }] };
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
 * 非同期コンポーネント
 * @template { ComponentType<K> } K
 */
class StateAsyncComponent extends StateComponent {
	/** @type { Promise } */
	#finished;

	/**
	 * コンストラクタ
	 * @template { ComponentType<K2> } K2
	 * @param { Context } ctx コンポーネントを扱っているコンテキスト
	 * @param { StateComponent<K2> | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */
	constructor(ctx, parent, callerList) {
		super(ctx, parent, callerList);
		this.#finished = Promise.reject(() => new Error('Not yet initialized.'));
		this.#finished.catch(() => {});
	}

	/**
	 * 非同期コンポーネントの生成に関する終了状態のPromiseの取得
	 */
	get finished() {
		return this.#finished;
	}

	/**
	 * コンポーネントを構築する
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @return {{ gen: GenStateNode; children: GenStateNode[] }}
	 */
	build(component, props, children, observableStates) {

		// コンポーネントの構築を行う関数
		const buildAsyncComponent = async () => {
			try {
				this.genStateNode = await this.ctx.buildAsyncComponent(component, props, children, observableStates);
			}
			catch (e) {
				// 状態変数の関連付けを破棄してから例外をリスロー
				super.remove();
				throw e;
			}

			// 葉まで構築して手動でonMountを発火
			const prevNode = this.node;
			this.node = this.genStateNode.build(this.ctx);
			prevNode.element.replaceWith(this.node.element);
			this.onMount();
		};

		// コンポーネントの構築はバックグラウンドで実行
		this.#finished = this.ctx.capture(buildAsyncComponent);

		// 初期表示はplaceholder固定
		return (new GenStatePlaceholderNode()).getStateNode(node => this.node = node);
	}
}

/**
 * StateAsyncComponentを生成するためのノード
 * @template { ComponentType<K> } K
 */
class GenStateAsyncComponent extends GenStateComponent {

	/**
	 * コンストラクタ
	 * @param { AsyncComponentType<K> } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { CompChildrenType<K> } children 子要素
	 */
	constructor(component, props, children) {
		super(component, props, children);
	}

	/**
	 * 別物のStateNodeを生成しても問題のないGetStateNodeを生成
	 * @returns { GenStateAsyncComponent<K> }
	 */
	clone() {
		return new GenStateAsyncComponent(this.component, this.props, this.children);
	}

	/**
	 * StateComponentの生成
	 * @param { Context } ctx コンポーネントが属することになるコンテキスト
	 * @param { StateComponent | undefined } parent 親コンポーネント
	 * @param { { caller: CallerType; states: State<unknown>[] }[] } callerList 呼び出し元のリスト
	 */	
	generateStateComponent(ctx, parent, callerList) {
		return new StateAsyncComponent(ctx, parent, callerList);
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
 * SuspenseContext内部で管理しているローカルコンテキストのインターフェース
 * @interface
 */
class ILocalSuspenseContext {
	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(ctx, callback, cancellable) { throw new Error('not implemented.'); }
}

/**
 * Suspenseに関するコンテキスト
 */
class SuspenseContext {
	/** @type { ILocalSuspenseContext[] } 現在のSuspenseの状態のスタック */
	#stack;

	/**
	 * コンストラクタ
	 * @param { ILocalSuspenseContext | undefined } localSuspenseCtx コンテキストが示すSuspenseに関するローカルコンテキスト
	 */
	constructor(localSuspenseCtx = undefined) {
		this.#stack = localSuspenseCtx ? [localSuspenseCtx] : [];
	}

	/**
	 * ローカルコンテキストの取得
	 */
	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1]; }

	/**
	 * コンテキストの切り替え
	 * @param { () => unknown } callback コンテキストの切り替えが行われるコールバック
	 * @param { ILocalSuspenseContext } localSuspenseCtx callback実行中のみ利用するローカルコンテキスト
	 */
	switch(callback, localSuspenseCtx) {
		this.#stack.push(localSuspenseCtx);
		callback();
		this.#stack.pop();
	}

	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { Context } ctx 非同期関数が発行されたコンテキスト
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(ctx, callback, cancellable = true) {
		await new Promise(resolve => {
			const f = async () => {
				const current = this.current;
				if (current) {
					await current.capture(ctx, callback, cancellable);
				}
				else {
					await callback();
				}
				resolve();
			};
			// 標準で遅延実行する
			ctx.state.update([{ caller: f }]);
		});
	}
}

/**
 * Stateのためのコンテキスト
 */
class StateContext {
	/** @type { { caller: CallerType; states: State<unknown>[] }[] } 状態変数とその呼び出し元を記録するスタック */
	#stack = [];
	/** @type { Map<CallerType['label'], Set<CallerType['caller']>>[] } 遅延評価対象の呼び出し元の集合についてのスタック */
	#lazyUpdateStack = [];
	/** @type { boolean } onreferenceを発火するかのフラグ */
	#noreference = [false];

	/**
	 * 現在実行中の関数の情報を取得する
	 */
	get current() { return this.#stack.length === 0 ? undefined : this.#stack[this.#stack.length - 1]; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は基本的に禁止)
	 * @param { CallerType } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: CallerType; states: State<unknown>[] } }
	 */
	call(caller) {
		this.#stack.push({ caller, states: [] });
		caller.caller();
		return this.#stack.pop();
	}

	/**
	 * 状態の更新の通知を行う
	 * @param { Iterable<CallerType> } itr 状態の参照先のハンドラ
	 */
	update(itr) {
		// 状態の遅延評価を行う場合は遅延評価を行う対象の集合に記憶する
		if (this.#lazyUpdateStack.length > 0) {
			const map = this.#lazyUpdateStack[this.#lazyUpdateStack.length - 1];
			for (const val of itr) {
				let set = map.get(val.label);
				if (!set) {
					set = new Set();
					map.set(val.label, set);
				}
				set.add(val.caller);
			}
			return;
		}

		for (const val of itr) {
			if (val.label) {
				val.label.update(val.caller);
			}
			// ラベルが未定義の場合は同期的に即時評価
			else {
				val.caller();
			}
		}
	}

	/**
	 * 状態の更新の通知を行う
	 * @param { Iterable<CallerType['caller']> } itr 状態の参照先のハンドラ
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 */
	update2(itr, label) {
		// 状態の遅延評価を行う場合は遅延評価を行う対象の集合に記憶する
		if (this.#lazyUpdateStack.length > 0) {
			const map = this.#lazyUpdateStack[this.#lazyUpdateStack.length - 1];
			let set = map.get(label);
			if (!set) {
				set = new Set();
				map.set(label, set);
			}
			for (const val of itr) {
				set.add(val);
			}
			return;
		}

		if (label) {
			for (const val of itr) {
				label.update(val);
			}
		}
		else {
			// ラベルが未定義の場合は同期的に即時評価
			for (const val of itr) {
				val();
			}
		}
	}

	/**
	 * callback内での状態変数の変更の伝播を遅延させるハンドラを生成する
	 * @param { () => unknown } callback 状態変数の変更操作を含む関数
	 * @returns { () => void } 状態変数の変更の伝播を行う関数
	 */
	lazy(callback) {
		/** @type { Map<CallerType['label'], Set<CallerType['caller']>> } */
		const map = new Map();
		this.#lazyUpdateStack.push(map);
		callback();
		this.#lazyUpdateStack.pop();
		return map.size === 0 ? () => {} : () => map.forEach((set, label) => this.update2(set, label));
	}

	/**
	 * 状態変数のキャプチャの通知
	 * @template T
	 * @param { State<T> } state 通知対象の状態変数
	 */
	notify(state) {
		if (this.#stack.length > 0) {
			if (!this.#noreference[0] && (state.onreference instanceof Function)) {
				// 参照追加に関するイベントの発火
				state.onreference(state);
			}
			this.#stack[this.#stack.length - 1].states.push(state);
		}
	}

	/**
	 * 一時的に参照なしで関数を実行する
	 * @template R
	 * @param { () => R } callback 参照なしの状態で実行する関数
	 */
	noreference(callback) {
		this.#noreference[0] = true;
		const ret = callback();
		this.#noreference[0] = false;
		return ret;
	}

	/**
	 * 単方向データの作成
	 * @template T
	 * @param { IState<T> | () => T } src 作成元のデータ
	 * @param { State<T> } dest 作成対象のデータ
	 * @param { CallerType['label'] } label 更新の振る舞いを決めるラベル
	 * @returns { { caller: CallerType; states: State<unknown>[] } } 呼び出し元情報
	 */
	unidirectional(src, dest, label = undefined) {
		const ctx = src instanceof Function ? this : src.ctx ?? this;
		let circuit = false;
		const callerType = {
			caller: src instanceof Function ?
			() => {
				// srcの変更で必ず発火させつつ
				// destの変更およびsrc = destな操作で発火および循環させない
				if (!circuit) {
					circuit = true;
					dest.value = src();
					circuit = false;
				}
			} :
			() => {
				if (!circuit) {
					circuit = true;
					dest.value = src.value;
					circuit = false;
				}
			}
			,label
		};
		return ctx.call(callerType);
	}
}

/**
 * コンポーネントのためのコンテキスト
 */
class Context {
	/** @type { LifeCycle } コンポーネントに設置されたライフサイクル */
	#lifecycle = {};
	/** @type { StateComponent<unknown> | undefined } コンテキストが属するコンポーネント */
	#component = undefined;
	/** @type { DomUpdateController } DOMの更新のためのコントローラ */
	#domUpdateController;
	/** @type { StateContext } Stateのコンテキスト */
	#stateCtx;
	/** @type { SuspenseContext } Suspenseのコンテキスト */
	#suspenseCtx;

	/**
	 * コンストラクタ
	 * @param { DomUpdateController | undefined } domUpdateController DOMの更新のためのコントローラ
	 * @param { StateContext | undefined } stateCtx Suspenseのコンテキスト
	 * @param { SuspenseContext | undefined } suspenseCtx Suspenseのコンテキスト
	 */
	constructor(domUpdateController = undefined, stateCtx = undefined, suspenseCtx = undefined) {
		this.#domUpdateController = domUpdateController ?? new DomUpdateController();
		this.#stateCtx = stateCtx ?? new StateContext();
		this.#suspenseCtx = suspenseCtx ?? new SuspenseContext();
	}

	/**
	 * コンポーネントが属するコンテキストを生成する
	 * @param { (ctx: Context) => StateComponent<unknown> } gen コンポーネントを示すノードを生成する関数
	 * @returns { Context }
	 */
	generateContextForComponent(gen) {
		const ctx = new Context(this.#domUpdateController, this.#stateCtx, this.#suspenseCtx);
		ctx.#component = gen(ctx);
		return ctx;
	}

	/**
	 * Suspenseが属するコンテキストを生成する
	 * @param { SuspenseContext } suspenseCtx 新たに生成するコンテキストがもつSuspenseのコンテキスト
	 * @returns { Context }
	 */
	generateContextForSuspense(suspenseCtx) {
		const ctx = new Context(this.#domUpdateController, this.#stateCtx, suspenseCtx);
		ctx.#lifecycle = this.#lifecycle;
		ctx.#component = this.#component;
		return ctx;
	}

	/**
	 * コンテキストを示すコンポーネントの取得
	 */
	get component() { return this.#component; }

	/**
	 * StateContextの取得
	 */
	get state() { return this.#stateCtx; }

	/**
	 * SuspenseContextの取得
	 */
	get suspense() { return this.#suspenseCtx; }

	/**
	 * このコンテキストで関数を実行する(状態変数の更新操作は基本的に禁止)
	 * @param { CallerType['caller'] | CallerType } caller 状態変数の呼び出し元となる関数
	 * @return { { caller: CallerType; states: State<unknown>[] } }
	 */
	call(caller) {
		return this.#stateCtx.call(caller instanceof Function ? { caller, label: this.#component?.componentLabel } : caller);
	}

	/**
	 * 非同期関数をキャプチャしてバックグラウンドで実行する
	 * @param { () => Promise<unknown> } callback キャプチャする非同期関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(callback, cancellable = true) {
		await this.#suspenseCtx.capture(this, callback, cancellable);
	}

	/**
	 * DOMノードの状態の更新の蓄積を行う
	 * @param { ICallerLabel } callerLabelSet 更新情報
	 */
	update(callerLabelSet) {
		this.#domUpdateController.update(callerLabelSet);
	}

	/**
	 * 自コンテキストで動作するコンポーネントを示す関数を実行するの実装部
	 * @template { ComponentType<K> } K
	 * @param { ReturnType<K> } compResult コンポーネントを示す関数の実行結果
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @returns { GenStateComponent }
	 */
	#buildComponentImpl(compResult, observableStates) {
		if (compResult instanceof GenStateNode) {
			return compResult;
		}
		else {
			// 観測の評価
			if (observableStates) {
				const exposeStates = compResult.exposeStates ?? {};
				for (const key in observableStates) {
					const state = observableStates[key];
					const exposeState = exposeStates[key];
					// 状態の観測の実施
					state.observe(exposeState);
				}
			}

			return compResult.node;
		}
	}

	/**
	 * 自コンテキストで動作するコンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { K } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @returns {{ getStateNode: GenStateNode; exposeStates: ComponentExposeStates<K> }}
	 */
	buildComponent(component, props, children, observableStates) {
		return this.#buildComponentImpl(component(this, props, children), observableStates);
	}

	/**
	 * 自コンテキストで動作する非同期コンポーネントを示す関数を実行する
	 * @template { ComponentType<K> } K
	 * @param { AsyncComponentType<K> } component コンポーネントを示す関数
	 * @param { CompPropTypes<K> } props プロパティ
	 * @param { GenStateNode[] } children 子要素
	 * @param { ObservableStates<K> | undefined } observableStates 観測する対象
	 * @returns { Promise<{ getStateNode: GenStateNode; exposeStates: ComponentExposeStates<K> }> }
	 */
	async buildAsyncComponent(component, props, children, observableStates) {
		return this.#buildComponentImpl(await component(this, props, children), observableStates);
	}

	/**
	 * ライフサイクルの取得(異なるコンテキスト間でインスタンスを一致させるためにsetterは提供しない)
	 */
	get lifecycle() { return this.#lifecycle; }

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
		this.#onLifeCycle({ caller: callback, label: this.#component?.componentLabel }, 'onMount');
	}

	/**
	 * onUnmount時のライフサイクルの設定
	 * @param { () => unknown } callback onUnmount時に呼びだすコールバック
	 */
	onUnmount(callback) {
		this.#onLifeCycle({ caller: callback, label: this.#component?.componentLabel }, 'onUnmount');
	}

	/**
	 * onBeforeUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onBeforeUpdate時に呼びだすコールバック
	 */
	onBeforeUpdate(callback) {
		this.#onLifeCycle({ caller: callback, label: this.#component?.componentLabel }, 'onBeforeUpdate');
	}

	/**
	 * onAfterUpdate時のライフサイクルの設定
	 * @param { () => unknown } callback onAfterUpdate時に呼びだすコールバック
	 */
	onAfterUpdate(callback) {
		this.#onLifeCycle({ caller: callback, label: this.#component?.componentLabel }, 'onAfterUpdate');
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
 * パラメータの設定
 * @template Val
 * @param { CtxValueType<Val> } val パラメータの値
 * @param { (val: Val) => unknown } setter パラメータの設定のルール
 * @param { CallerType['label'] } label setterに付加するラベル
 */
function setParam(val, setter, label = undefined) {
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
 * 状態変数の宣言
 * @template T
 * @param { Context | StateContext } ctx 状態変数が属するコンテキスト
 * @param { T } value 状態変数の初期値
 * @returns { State<T> }
 */
function useState(ctx, value) {
	return new State(ctx instanceof Context ? ctx.state : ctx, value);
}

/**
 * 算出プロパティの宣言
 * @template T
 * @param { Context | StateContext } ctx 状態変数が属するコンテキスト
 * @param { () => T } f 算出プロパティを計算する関数
 * @returns { Computed<T> }
 */
function useComputed(ctx, f) {
	return new Computed(ctx instanceof Context ? ctx.state : ctx, f);
}

/**
 * @template T
 * @overload
 * @param { Context } ctx ウォッチを行うコンテキスト
 * @param { IState<T> } state 監視を行う状態変数
 * @param { (prev: T, next: T) => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * @template T
 * @overload
 * @param { Context } ctx ウォッチを行うコンテキスト
 * @param { IState<unknown>[] } state 監視を行う状態変数のリスト
 * @param { () => unknown } f ウォッチャー
 * @returns { CallerType }
 */
/**
 * ウォッチャーの宣言
 * @template T
 * @param { Context | StateContext } ctx ウォッチを行うコンテキスト
 * @param { IState<unknown>[] | IState<T> } state 監視を行う状態変数
 * @param { (() => unknown) | ((prev: T, next: T) => unknown) } f ウォッチャー
 * @returns { CallerType | undefined }
 */
function watch(ctx, state, f) {
	const label = ctx instanceof Context ?  ctx.component?.componentLabel : undefined;

	if (state instanceof IState) {
		let prevState =  state.value;
		let nextState = state.value;

		/** @type { CallerType } */
		const caller =
		// コンポーネントが有効な場合はエラーハンドリングを実施
		{ caller: () => {
			prevState = nextState;
			nextState = state.value;
			return f(prevState, nextState);
		}, label };
		state.add(caller);
		return caller;
	}
	else {
		/** @type { CallerType } */
		const caller = { caller: f, label };
		state.forEach(s => s.add(caller));
		return caller;
	}
}

/**
 * ノードリストを正規化する
 * @template { string | ComponentType<K> } K
 * @param { CtxChildType<K> } nodeList 対象のノード
 * @returns { K extends string ? (GenStateNode | GenStateNodeSet)[] : CompChildrenType<K> }
 */
function normalizeCtxChild(nodeList) {
	return Array.isArray(nodeList) ? nodeList.map(e => {
		// 子にテキストの状態が渡された場合は変更を監視する
		if (e instanceof IState) {
			return new GenStateTextNode(e);
		}
		else if (typeof e === 'string') {
			return new GenStateTextNode(e);
		}
		else if (e instanceof Text) {
			return new GenStateTextNode(e.data);
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
function normalizeCtxProps(component, props) {
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
 * 擬似コンポーネントであることの判定
 * @template { ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @param { ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } f 
 * @returns { f is PseudoComponentType<K> }
 */
function isPseudoComponent(f) {
	return f.early === true;
}

/**
 * 非同期コンポーネントであることの判定
 * @template { ComponentType<K> | AsyncComponentType<K> } K
 * @param { ComponentType<K> | AsyncComponentType<K> } f 
 * @returns { f is AsyncComponentType<K> }
 */
function isAsyncComponent(f) {
	return f.constructor?.name === 'AsyncFunction';
}

/**
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @overload
 * @param { K } tag HTMLタグ
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxPropTypes<K> | undefined : CtxPropTypes<K> } props プロパティ
 * @param { RequiredCtxChildType<CtxChildType<K>> extends [] ? CtxChildType<K> | undefined : CtxChildType<K> } children 子要素
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
/**
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @overload
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? K : never } tag HTMLタグ
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? CtxChildType<K> : never } props 子要素
 * @param { RequiredCtxPropTypes<CtxPropTypes<K>> extends {} ? undefined : never } children 略
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
/**
 * DOMノード/コンポーネントの生成
 * @template { string | ComponentType<K> | AsyncComponentType<K> | PseudoComponentType<K> } K
 * @param { K } tag HTMLタグ
 * @param { CtxPropTypes<K> | CtxChildType<K> | undefined } props プロパティ
 * @param { CtxChildType<K> | undefined } children 子要素
 * @returns { K extends string ? GenStateDomNode<K> : (K extends PseudoComponentType<K> ? ReturnType<K> : GenStateComponent<K>) }
 */
function $(tag, props = undefined, children = undefined) {
	const isProps = props?.constructor?.name === 'Object';
	const _props = isProps ? props : {};
	const _children = normalizeCtxChild((!isProps ? props : children) ?? []);
	// HTMLタグによるDOMノードの生成(Web Componentsも含む)
	if (typeof tag === 'string') {
		return new GenStateDomNode(tag, _props, _children);
	}
	// コンポーネントによるDOMノード生成
	else {
		const compProps = normalizeCtxProps(tag, _props);

		if (isPseudoComponent(tag)) {
			return tag(compProps, _children);
		}
		else if (isAsyncComponent(tag)) {
			// 非同期コンポーネントの生成
			return new GenStateAsyncComponent(tag, compProps, _children);
		}
		else {
			// 同期コンポーネントの生成
			return new GenStateComponent(tag, compProps, _children);
		}
	}
}

/**
 * テキスト要素の構成
 * @param { TemplateStringsArray } strs タグ付きテンプレートの文字列部
 * @param  { ...(CtxValueType<string | number>) } values タグ付きテンプレートの変数
 * @return { string | Computed<string> }
 */
function t(strs, ...values) {
	// テンプレートに状態が含まれるかの判定
	let useStateFlag = false;
	let ctx = undefined;
	for (const value of values) {
		if (value instanceof State || value instanceof Computed) {
			useStateFlag = true;
			ctx = value.ctx;
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
			else {
				result += `${value}`;
			}
		});
		return result + strs[strs.length - 1];
	};
	return useStateFlag ? new Computed(ctx, f) : f();
}

/**
 * HTMLElementを示すStateNodeの生成
 * @param { HTMLElement } element StateNodeの生成対象
 */
function html(element) {
	return new GenStateHTMLElement(element);
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
	StatePlaceholderNode,
	StateNodeSet,
	StateComponent,
	StateAsyncComponent,
	GenStateNode,
	GenStateNodeSet,
	GenStateTextNode,
	GenStatePlaceholderNode,
	GenStateComponent,
	ILocalSuspenseContext,
	SuspenseContext,
	StateContext,
	Context,
	useState,
	useComputed,
	watch,
	normalizeCtxChild,
	normalizeCtxProps,
	$,
	t,
	html
};
